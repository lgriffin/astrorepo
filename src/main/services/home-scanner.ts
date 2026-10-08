import fs from 'fs'
import path from 'path'
import { getSqlite } from '../db/connection'
import { normalizeCatalogName } from './fits-linker'
import { isAstronomicalName } from './astro-names'
import { startFolderScan } from './fits-analyzer'
import { ScanPacer, ScanCancelled } from './scan-pacer'
import { advanceStage } from './workflow'
import { syncTargetsToCollections } from './collection'
import { ulid } from 'ulid'
import type {
  HomeFolderTarget, HomeScanResult, HomeScanProgress, HomeScanPhaseProgress,
  TargetHomeData, TargetSubfolderDetail, TargetFolderBreakdown
} from '@shared/types'

const FITS_EXTENSIONS = new Set(['.fit', '.fits', '.fts'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff'])
const TIF_EXTENSIONS = new Set(['.tif', '.tiff'])

const STAGE_ORDER: Record<string, number> = {
  not_observed: 0,
  raw_captured: 1,
  calibrated: 2,
  registered: 3,
  integrated: 4,
  processing: 5,
  edited: 6,
  published: 7,
  printed: 8,
  archived: 9
}

interface TargetLookup {
  id: string
  canonical_name: string
  workflow_stage: string
}

interface FolderDiscovery {
  folderName: string
  normalizedName: string
  folderPath: string
  targetId: string | null
  subfolders: TargetSubfolderDetail[]
  totalFiles: number
  totalSizeBytes: number
}

interface TargetAccumulator {
  targetName: string
  targetId: string | null
  rawDiscovery: FolderDiscovery | null
  stackedDiscovery: FolderDiscovery | null
  tifDiscovery: FolderDiscovery | null
  imagesDiscovery: FolderDiscovery | null
}

function makePhases(): HomeScanPhaseProgress[] {
  return [
    { name: 'raw', status: 'pending', foldersFound: 0 },
    { name: 'stacked', status: 'pending', foldersFound: 0 },
    { name: 'tif', status: 'pending', foldersFound: 0 },
    { name: 'images', status: 'pending', foldersFound: 0 },
  ]
}

let scanState: HomeScanProgress = {
  status: 'idle',
  phases: makePhases(),
  currentPhaseIndex: 0,
  totalTargetsFound: 0,
  files: null,
  result: null,
  error: null
}

/** Set while a scan runs; aborting it cancels the scan at its next checkpoint (ING-014). */
let scanAbort: AbortController | null = null

function buildTargetLookup(): Map<string, TargetLookup> {
  const sqlite = getSqlite()
  const targets = sqlite.prepare('SELECT id, canonical_name, workflow_stage FROM targets').all() as TargetLookup[]
  const aliases = sqlite.prepare('SELECT target_id, alias FROM target_aliases').all() as Array<{ target_id: string; alias: string }>

  const lookup = new Map<string, TargetLookup>()
  for (const t of targets) {
    lookup.set(normalizeCatalogName(t.canonical_name), t)
  }
  for (const a of aliases) {
    const target = targets.find(t => t.id === a.target_id)
    if (target) {
      lookup.set(normalizeCatalogName(a.alias), target)
    }
  }
  return lookup
}

function matchFolderToTarget(
  folderName: string,
  targetLookup: Map<string, TargetLookup>
): TargetLookup | undefined {
  const normalized = normalizeCatalogName(folderName)
  const exact = targetLookup.get(normalized)
  if (exact) return exact

  for (const [key, target] of targetLookup) {
    if (normalized.startsWith(key) && normalized.length > key.length) {
      const rest = normalized[key.length]
      if (rest === ' ' || rest === '_' || rest === '-') return target
    }
  }
  return undefined
}

/** Lists a folder a batch at a time, resting at the pacer's checkpoints. Unreadable folders are empty. */
async function listDir(dir: string, pacer: ScanPacer): Promise<fs.Dirent[]> {
  const entries: fs.Dirent[] = []
  let handle: fs.Dir
  try {
    handle = await fs.promises.opendir(dir)
  } catch {
    return entries
  }
  try {
    for await (const entry of handle) {
      entries.push(entry)
      await pacer.checkpoint()
    }
  } catch (err) {
    if (err instanceof ScanCancelled) throw err
  } finally {
    await handle.close().catch(() => undefined)
  }
  return entries
}

async function sizeOf(file: string): Promise<number> {
  try {
    return (await fs.promises.stat(file)).size
  } catch {
    return 0
  }
}

async function collectSubfolderDetail(dir: string, extensions: Set<string>, pacer: ScanPacer): Promise<TargetSubfolderDetail[]> {
  const subfolders: TargetSubfolderDetail[] = []
  const entries = await listDir(dir, pacer)

  let rootFileCount = 0
  let rootSizeBytes = 0
  for (const entry of entries) {
    if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
      rootFileCount++
      rootSizeBytes += await sizeOf(path.join(dir, entry.name))
      await pacer.checkpoint()
    }
  }
  if (rootFileCount > 0) {
    subfolders.push({ name: null, path: dir, fileCount: rootFileCount, totalSizeBytes: rootSizeBytes })
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const subPath = path.join(dir, entry.name)
    let count = 0
    let sizeBytes = 0
    const pending = [subPath]
    while (pending.length > 0) {
      const d = pending.pop()!
      for (const e of await listDir(d, pacer)) {
        const full = path.join(d, e.name)
        if (e.isDirectory()) {
          pending.push(full)
        } else if (e.isFile() && extensions.has(path.extname(e.name).toLowerCase())) {
          count++
          sizeBytes += await sizeOf(full)
          await pacer.checkpoint()
        }
      }
    }
    if (count > 0) {
      subfolders.push({ name: entry.name, path: subPath, fileCount: count, totalSizeBytes: sizeBytes })
    }
  }

  return subfolders
}

async function discoverTargetFolders(
  dir: string,
  extensions: Set<string>,
  targetLookup: Map<string, TargetLookup>,
  pacer: ScanPacer
): Promise<FolderDiscovery[]> {
  const discoveries: FolderDiscovery[] = []

  for (const entry of await listDir(dir, pacer)) {
    if (!entry.isDirectory()) continue
    const folderName = entry.name
    const normalized = normalizeCatalogName(folderName)

    const matchedTarget = matchFolderToTarget(folderName, targetLookup)
    const isAstro = isAstronomicalName(folderName)

    if (!matchedTarget && !isAstro) continue

    const folderPath = path.join(dir, folderName)
    const subfolders = await collectSubfolderDetail(folderPath, extensions, pacer)
    const totalFiles = subfolders.reduce((s, f) => s + f.fileCount, 0)
    const totalSizeBytes = subfolders.reduce((s, f) => s + f.totalSizeBytes, 0)

    if (totalFiles === 0) continue

    discoveries.push({
      folderName,
      normalizedName: normalized,
      folderPath,
      targetId: matchedTarget?.id ?? null,
      subfolders,
      totalFiles,
      totalSizeBytes
    })
  }

  return discoveries
}

async function findFirstImage(dir: string, pacer: ScanPacer): Promise<string | null> {
  const entries = await listDir(dir, pacer)
  for (const entry of entries) {
    if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      return path.join(dir, entry.name)
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = await findFirstImage(path.join(dir, entry.name), pacer)
      if (found) return found
    }
  }
  return null
}

function suggestStage(raw: number, stacked: number, tif: number, images: number): string {
  if (images > 0) return 'edited'
  if (tif > 0) return 'processing'
  if (stacked > 0) return 'integrated'
  return 'raw_captured'
}

function persistTargetSubfolders(
  targetId: string,
  folderType: 'raw' | 'stacked' | 'tif' | 'images',
  subfolders: TargetSubfolderDetail[]
): void {
  const sqlite = getSqlite()
  sqlite.prepare('DELETE FROM target_home_folders WHERE target_id = ? AND folder_type = ?').run(targetId, folderType)
  const insert = sqlite.prepare(`
    INSERT INTO target_home_folders (id, target_id, folder_type, subfolder_name, subfolder_path, file_count, total_size_bytes, scanned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `)
  for (const sf of subfolders) {
    insert.run(ulid(), targetId, folderType, sf.name, sf.path, sf.fileCount, sf.totalSizeBytes)
  }
}

function persistTargetHomeData(
  targetId: string,
  rawFiles: number, stackedFiles: number, tifFiles: number, imageFiles: number,
  rawPath: string | null, stackedPath: string | null, tifPath: string | null, imagesPath: string | null,
  suggested: string
): void {
  const sqlite = getSqlite()
  sqlite.prepare(`
    INSERT INTO target_home_data (target_id, raw_files, stacked_files, tif_files, image_files, raw_path, stacked_path, tif_path, images_path, suggested_stage, scanned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(target_id) DO UPDATE SET
      raw_files = excluded.raw_files,
      stacked_files = excluded.stacked_files,
      tif_files = excluded.tif_files,
      image_files = excluded.image_files,
      raw_path = excluded.raw_path,
      stacked_path = excluded.stacked_path,
      tif_path = excluded.tif_path,
      images_path = excluded.images_path,
      suggested_stage = excluded.suggested_stage,
      scanned_at = excluded.scanned_at
  `).run(targetId, rawFiles, stackedFiles, tifFiles, imageFiles, rawPath, stackedPath, tifPath, imagesPath, suggested)
}

/**
 * Starts a scan of the home folder in the background and returns at once. The scan is paced so
 * the app and the PC stay usable however large the library is (NFR-013), reports live counts
 * (ING-007), and can be cancelled (ING-014). `pacer` overrides the pacing, for tests.
 */
export function startHomeScan(homePath: string, pacer?: (signal: AbortSignal) => ScanPacer): { started: boolean; reason?: string } {
  if (scanState.status === 'scanning' || scanState.status === 'cancelling') {
    return { started: false, reason: 'Scan already in progress' }
  }

  scanState = {
    status: 'scanning',
    phases: makePhases(),
    currentPhaseIndex: 0,
    totalTargetsFound: 0,
    files: null,
    result: null,
    error: null
  }
  const abort = new AbortController()
  scanAbort = abort

  void runHomeScan(homePath, abort.signal, pacer?.(abort.signal) ?? new ScanPacer(abort.signal))
    .then(result => {
      scanState.status = 'done'
      scanState.result = result
    })
    .catch(err => {
      if (err instanceof ScanCancelled || abort.signal.aborted) {
        scanState.status = 'cancelled'
      } else {
        scanState.status = 'error'
        scanState.error = err instanceof Error ? err.message : String(err)
      }
    })
    .finally(() => {
      if (scanAbort === abort) scanAbort = null
    })

  return { started: true }
}

/**
 * Stops the running scan at its next checkpoint (ING-014). FITS files read so far stay indexed,
 * so the next scan reads only what this one did not reach (ING-008).
 */
export function cancelHomeScan(): { cancelled: boolean } {
  if (!scanAbort || scanState.status !== 'scanning') return { cancelled: false }
  scanState.status = 'cancelling'
  scanAbort.abort()
  return { cancelled: true }
}

async function runHomeScan(homePath: string, signal: AbortSignal, pacer: ScanPacer): Promise<HomeScanResult> {
  const targetMap = new Map<string, TargetAccumulator>()

  function getOrCreateAccum(normalizedName: string, folderName: string, targetId: string | null): TargetAccumulator {
    let acc = targetMap.get(normalizedName)
    if (!acc) {
      acc = {
        targetName: folderName,
        targetId,
        rawDiscovery: null,
        stackedDiscovery: null,
        tifDiscovery: null,
        imagesDiscovery: null
      }
      targetMap.set(normalizedName, acc)
    }
    if (targetId && !acc.targetId) acc.targetId = targetId
    return acc
  }

  function mergeDiscoveries(
    discoveries: FolderDiscovery[],
    targetLookup: Map<string, TargetLookup>,
    field: 'rawDiscovery' | 'stackedDiscovery' | 'tifDiscovery' | 'imagesDiscovery'
  ): void {
    for (const d of discoveries) {
      const refreshed = matchFolderToTarget(d.folderName, targetLookup)
      if (refreshed) d.targetId = refreshed.id
      const acc = getOrCreateAccum(d.normalizedName, d.folderName, d.targetId)
      acc[field] = d
    }
  }

  const phases: { dir: string; extensions: Set<string>; field: 'rawDiscovery' | 'stackedDiscovery' | 'tifDiscovery' | 'imagesDiscovery'; fits: boolean }[] = [
    { dir: path.join(homePath, 'raw'), extensions: FITS_EXTENSIONS, field: 'rawDiscovery', fits: true },
    { dir: path.join(homePath, 'stacked'), extensions: FITS_EXTENSIONS, field: 'stackedDiscovery', fits: true },
    { dir: path.join(homePath, 'tif'), extensions: TIF_EXTENSIONS, field: 'tifDiscovery', fits: false },
    { dir: path.join(homePath, 'images'), extensions: IMAGE_EXTENSIONS, field: 'imagesDiscovery', fits: false },
  ]

  let targetLookup = buildTargetLookup()
  for (let i = 0; i < phases.length; i++) {
    const { dir, extensions, field, fits } = phases[i]
    const phase = scanState.phases[i]
    scanState.currentPhaseIndex = i
    phase.status = 'discovering'
    const discoveries = await discoverTargetFolders(dir, extensions, targetLookup, pacer)
    phase.foldersFound = discoveries.length

    if (fits && fs.existsSync(dir)) {
      phase.status = 'scanning_fits'
      scanState.files = null
      // A failed FITS scan fails the home scan: finishing as done would hide files never indexed.
      await startFolderScan(dir, { signal, pacer, onProgress: counts => { scanState.files = counts } })
      targetLookup = buildTargetLookup()
    }

    mergeDiscoveries(discoveries, targetLookup, field)
    phase.status = 'complete'
    await pacer.checkpoint()
  }

  return finalizeResults(homePath, targetMap, pacer)
}

async function finalizeResults(homePath: string, targetMap: Map<string, TargetAccumulator>, pacer: ScanPacer): Promise<HomeScanResult> {
  const sqlite = getSqlite()
  const result: HomeScanResult = {
    homePath,
    targets: [],
    rawScanned: scanState.phases[0].foldersFound > 0,
    created: 0,
    advanced: 0
  }

  // Final lookup rebuild to pick up all targets created by FITS scans
  const finalLookup = buildTargetLookup()

  // Resolve any accumulators still missing a targetId
  for (const [normalizedName, acc] of targetMap) {
    await pacer.checkpoint()
    if (acc.targetId) continue
    const matched = finalLookup.get(normalizedName)
    if (matched) {
      acc.targetId = matched.id
    } else if (isAstronomicalName(acc.targetName)) {
      const id = ulid()
      const now = new Date().toISOString()
      sqlite.prepare(`
        INSERT OR IGNORE INTO targets (id, canonical_name, object_type, workflow_stage, is_custom, created_at, updated_at)
        VALUES (?, ?, 'unknown', 'not_observed', 0, ?, ?)
      `).run(id, normalizeCatalogName(acc.targetName), now, now)
      const created = sqlite.prepare('SELECT id, canonical_name, workflow_stage FROM targets WHERE canonical_name = ?').get(normalizeCatalogName(acc.targetName)) as TargetLookup | undefined
      if (created) {
        acc.targetId = created.id
        result.created++
      }
    }
  }

  scanState.totalTargetsFound = targetMap.size

  for (const [, acc] of targetMap) {
    await pacer.checkpoint()
    if (!acc.targetId) continue

    const target = sqlite.prepare('SELECT id, canonical_name, workflow_stage FROM targets WHERE id = ?').get(acc.targetId) as TargetLookup | undefined
    if (!target) continue

    const rawFiles = acc.rawDiscovery?.totalFiles ?? 0
    const stackedFiles = acc.stackedDiscovery?.totalFiles ?? 0
    const tifFiles = acc.tifDiscovery?.totalFiles ?? 0
    const imageFiles = acc.imagesDiscovery?.totalFiles ?? 0
    const suggested = suggestStage(rawFiles, stackedFiles, tifFiles, imageFiles)

    const rawPath = acc.rawDiscovery?.folderPath ?? null
    const stackedPath = acc.stackedDiscovery?.folderPath ?? null
    const tifPath = acc.tifDiscovery?.folderPath ?? null
    const imagesPath = acc.imagesDiscovery?.folderPath ?? null

    let thumbnailPath: string | null = null
    if (imagesPath) thumbnailPath = await findFirstImage(imagesPath, pacer)
    if (!thumbnailPath && tifPath) thumbnailPath = await findFirstImage(tifPath, pacer)

    persistTargetHomeData(
      target.id, rawFiles, stackedFiles, tifFiles, imageFiles,
      rawPath, stackedPath, tifPath, imagesPath, suggested
    )

    if (acc.rawDiscovery) persistTargetSubfolders(target.id, 'raw', acc.rawDiscovery.subfolders)
    if (acc.stackedDiscovery) persistTargetSubfolders(target.id, 'stacked', acc.stackedDiscovery.subfolders)
    if (acc.tifDiscovery) persistTargetSubfolders(target.id, 'tif', acc.tifDiscovery.subfolders)
    if (acc.imagesDiscovery) persistTargetSubfolders(target.id, 'images', acc.imagesDiscovery.subfolders)

    if (rawPath) {
      sqlite.prepare('UPDATE targets SET folder_path = ? WHERE id = ?').run(rawPath, target.id)
    }

    if (thumbnailPath) {
      sqlite.prepare('UPDATE targets SET thumbnail_path = ? WHERE id = ?').run(thumbnailPath, target.id)
    }

    const currentOrder = STAGE_ORDER[target.workflow_stage] ?? 0
    const suggestedOrder = STAGE_ORDER[suggested] ?? 0
    if (suggestedOrder > currentOrder) {
      advanceStage(target.id, suggested, 'Auto-advanced by home folder scan')
      result.advanced++
    }

    const entry: HomeFolderTarget = {
      targetName: target.canonical_name,
      targetId: target.id,
      rawFiles,
      stackedFiles,
      tifFiles,
      imageFiles,
      rawSubfolders: acc.rawDiscovery?.subfolders ?? [],
      stackedSubfolders: acc.stackedDiscovery?.subfolders ?? [],
      tifSubfolders: acc.tifDiscovery?.subfolders ?? [],
      imageSubfolders: acc.imagesDiscovery?.subfolders ?? [],
      rawPath,
      stackedPath,
      tifPath,
      imagesPath,
      currentStage: target.workflow_stage,
      suggestedStage: suggested,
      thumbnailPath
    }
    result.targets.push(entry)
  }

  const processedTargetIds = result.targets.map(t => t.targetId).filter((id): id is string => !!id)
  syncTargetsToCollections(processedTargetIds)

  sqlite.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_library_scan', datetime('now'))").run()
  // Which folder the scan was of, so a new home folder reads as not yet scanned.
  sqlite.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_library_scan_folder', ?)").run(homePath)

  return result
}

export function getHomeScanProgress(): HomeScanProgress {
  return { ...scanState, phases: scanState.phases.map(p => ({ ...p })), files: scanState.files && { ...scanState.files } }
}

interface HomeDataRow {
  target_id: string
  raw_files: number
  stacked_files: number
  tif_files: number
  image_files: number
  raw_path: string | null
  stacked_path: string | null
  tif_path: string | null
  images_path: string | null
  suggested_stage: string
  scanned_at: string
}

export function getTargetHomeData(targetId: string): TargetHomeData | null {
  const sqlite = getSqlite()
  let row = sqlite.prepare('SELECT * FROM target_home_data WHERE target_id = ?').get(targetId) as HomeDataRow | undefined

  // Fallback: match by normalized canonical name across all home data targets
  if (!row) {
    const target = sqlite.prepare('SELECT canonical_name FROM targets WHERE id = ?').get(targetId) as { canonical_name: string } | undefined
    if (target) {
      const normalized = normalizeCatalogName(target.canonical_name)
      const allHomeTargets = sqlite.prepare(`
        SELECT thd.*, t.canonical_name as cn FROM target_home_data thd
        JOIN targets t ON t.id = thd.target_id
      `).all() as Array<HomeDataRow & { cn: string }>
      const match = allHomeTargets.find(r => normalizeCatalogName(r.cn) === normalized)
      if (match) row = match
    }
  }

  if (!row) return null

  const homeTargetId = row.target_id
  const folderRows = sqlite.prepare(
    'SELECT folder_type, subfolder_name, subfolder_path, file_count, total_size_bytes FROM target_home_folders WHERE target_id = ? ORDER BY folder_type, subfolder_name'
  ).all(homeTargetId) as Array<{
    folder_type: string
    subfolder_name: string | null
    subfolder_path: string
    file_count: number
    total_size_bytes: number
  }>

  const breakdownMap = new Map<string, TargetFolderBreakdown>()
  const pathByType: Record<string, string | null> = {
    raw: row.raw_path,
    stacked: row.stacked_path,
    tif: row.tif_path,
    images: row.images_path
  }

  for (const fr of folderRows) {
    let bd = breakdownMap.get(fr.folder_type)
    if (!bd) {
      bd = {
        folderType: fr.folder_type as TargetFolderBreakdown['folderType'],
        folderPath: pathByType[fr.folder_type] ?? '',
        totalFiles: 0,
        totalSizeBytes: 0,
        subfolders: []
      }
      breakdownMap.set(fr.folder_type, bd)
    }
    bd.subfolders.push({
      name: fr.subfolder_name,
      path: fr.subfolder_path,
      fileCount: fr.file_count,
      totalSizeBytes: fr.total_size_bytes
    })
    bd.totalFiles += fr.file_count
    bd.totalSizeBytes += fr.total_size_bytes
  }

  return {
    targetId: row.target_id,
    rawFiles: row.raw_files,
    stackedFiles: row.stacked_files,
    tifFiles: row.tif_files,
    imageFiles: row.image_files,
    rawPath: row.raw_path,
    stackedPath: row.stacked_path,
    tifPath: row.tif_path,
    imagesPath: row.images_path,
    suggestedStage: row.suggested_stage,
    scannedAt: row.scanned_at,
    folderBreakdowns: Array.from(breakdownMap.values())
  }
}

function collectImages(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const images: string[] = []
  function walk(d: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        images.push(full)
      }
    }
  }
  walk(dir)
  return images
}

export function getTargetImages(targetId: string): Array<{ path: string; data: string; mime: string }> {
  const sqlite = getSqlite()
  const homeData = sqlite.prepare('SELECT tif_path, images_path FROM target_home_data WHERE target_id = ?').get(targetId) as {
    tif_path: string | null; images_path: string | null
  } | undefined
  if (!homeData) return []

  const allPaths: string[] = []
  if (homeData.tif_path) allPaths.push(...collectImages(homeData.tif_path))
  if (homeData.images_path) allPaths.push(...collectImages(homeData.images_path))

  return allPaths.slice(0, 20).map(p => {
    try {
      const buf = fs.readFileSync(p)
      const ext = path.extname(p).toLowerCase()
      const mime = ext === '.png' ? 'image/png' : ext === '.tif' || ext === '.tiff' ? 'image/tiff' : 'image/jpeg'
      return { path: p, data: buf.toString('base64'), mime }
    } catch {
      return null
    }
  }).filter((x): x is { path: string; data: string; mime: string } => x !== null)
}
