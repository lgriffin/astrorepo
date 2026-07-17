import fs from 'fs'
import path from 'path'
import { getSqlite } from '../db/connection'
import { normalizeCatalogName } from './fits-linker'
import { startFolderScan } from './fits-analyzer'
import { advanceStage } from './workflow'
import { getSetting } from './settings'
import type { HomeFolderTarget, HomeScanResult, HomeScanProgress, TargetHomeData } from '@shared/types'

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

let scanState: HomeScanProgress = {
  status: 'idle',
  phase: '',
  currentTarget: null,
  targetsFound: 0,
  targetsProcessed: 0,
  totalTargets: 0,
  result: null,
  error: null
}

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

function findTargetFolders(
  dir: string,
  targetLookup: Map<string, TargetLookup>,
  matchedTargets: Map<string, { targetId: string; folderPath: string }>
): void {
  if (!fs.existsSync(dir)) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const target = matchFolderToTarget(entry.name, targetLookup)
    if (target) {
      matchedTargets.set(target.id, { targetId: target.id, folderPath: path.join(dir, entry.name) })
    } else {
      findTargetFolders(path.join(dir, entry.name), targetLookup, matchedTargets)
    }
  }
}

function countFiles(dir: string, extensions: Set<string>): number {
  if (!fs.existsSync(dir)) return 0
  let count = 0
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
      } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        count++
      }
    }
  }
  walk(dir)
  return count
}

function findFirstImage(dir: string): string | null {
  if (!fs.existsSync(dir)) return null
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      return path.join(dir, entry.name)
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findFirstImage(path.join(dir, entry.name))
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

function processTarget(
  targetId: string,
  rawTargets: Map<string, { targetId: string; folderPath: string }>,
  stackedTargets: Map<string, { targetId: string; folderPath: string }>,
  tifTargets: Map<string, { targetId: string; folderPath: string }>,
  imageTargets: Map<string, { targetId: string; folderPath: string }>,
  result: HomeScanResult
): void {
  const sqlite = getSqlite()
  const target = sqlite.prepare('SELECT id, canonical_name, workflow_stage FROM targets WHERE id = ?').get(targetId) as TargetLookup | undefined
  if (!target) return

  scanState.currentTarget = target.canonical_name

  const rawInfo = rawTargets.get(targetId)
  const stackedInfo = stackedTargets.get(targetId)
  const tifInfo = tifTargets.get(targetId)
  const imageInfo = imageTargets.get(targetId)

  const rawFiles = rawInfo ? countFiles(rawInfo.folderPath, FITS_EXTENSIONS) : 0
  const stackedFiles = stackedInfo ? countFiles(stackedInfo.folderPath, FITS_EXTENSIONS) : 0
  const tifFiles = tifInfo ? countFiles(tifInfo.folderPath, TIF_EXTENSIONS) : 0
  const imageFiles = imageInfo ? countFiles(imageInfo.folderPath, IMAGE_EXTENSIONS) : 0
  const suggested = suggestStage(rawFiles, stackedFiles, tifFiles, imageFiles)

  let thumbnailPath: string | null = null
  if (imageInfo) {
    thumbnailPath = findFirstImage(imageInfo.folderPath)
  }

  const entry: HomeFolderTarget = {
    targetName: target.canonical_name,
    targetId: target.id,
    rawFiles,
    stackedFiles,
    tifFiles,
    imageFiles,
    currentStage: target.workflow_stage,
    suggestedStage: suggested,
    thumbnailPath,
    rawPath: rawInfo?.folderPath ?? null
  }
  result.targets.push(entry)

  persistTargetHomeData(
    target.id, rawFiles, stackedFiles, tifFiles, imageFiles,
    rawInfo?.folderPath ?? null,
    stackedInfo?.folderPath ?? null,
    tifInfo?.folderPath ?? null,
    imageInfo?.folderPath ?? null,
    suggested
  )

  if (rawInfo) {
    sqlite.prepare('UPDATE targets SET folder_path = ? WHERE id = ?').run(rawInfo.folderPath, target.id)
  }

  const currentOrder = STAGE_ORDER[target.workflow_stage] ?? 0
  const suggestedOrder = STAGE_ORDER[suggested] ?? 0
  if (suggestedOrder > currentOrder) {
    advanceStage(target.id, suggested, 'Auto-advanced by home folder scan')
    result.advanced++
  }

  if (thumbnailPath) {
    sqlite.prepare('UPDATE targets SET thumbnail_path = ? WHERE id = ?').run(thumbnailPath, target.id)
  }

  scanState.targetsProcessed++
}

export function startHomeScan(homePath: string): { started: boolean; reason?: string } {
  if (scanState.status === 'scanning') {
    return { started: false, reason: 'Scan already in progress' }
  }

  scanState = {
    status: 'scanning',
    phase: 'Building target lookup',
    currentTarget: null,
    targetsFound: 0,
    targetsProcessed: 0,
    totalTargets: 0,
    result: null,
    error: null
  }

  setImmediate(() => {
    try {
      const targetLookup = buildTargetLookup()
      const result: HomeScanResult = {
        homePath,
        targets: [],
        rawScanned: false,
        created: 0,
        advanced: 0
      }

      const rawDir = path.join(homePath, 'raw')
      const stackedDir = path.join(homePath, 'stacked')
      const tifDir = path.join(homePath, 'tif')
      const imagesDir = path.join(homePath, 'images')

      scanState.phase = 'Scanning raw folder'
      const rawTargets = new Map<string, { targetId: string; folderPath: string }>()
      findTargetFolders(rawDir, targetLookup, rawTargets)

      scanState.phase = 'Scanning stacked folder'
      const stackedTargets = new Map<string, { targetId: string; folderPath: string }>()
      findTargetFolders(stackedDir, targetLookup, stackedTargets)

      scanState.phase = 'Scanning tif folder'
      const tifTargets = new Map<string, { targetId: string; folderPath: string }>()
      findTargetFolders(tifDir, targetLookup, tifTargets)

      scanState.phase = 'Scanning images folder'
      const imageTargets = new Map<string, { targetId: string; folderPath: string }>()
      findTargetFolders(imagesDir, targetLookup, imageTargets)

      const allTargetIds = [...new Set([
        ...rawTargets.keys(),
        ...stackedTargets.keys(),
        ...tifTargets.keys(),
        ...imageTargets.keys()
      ])]

      scanState.targetsFound = allTargetIds.length
      scanState.totalTargets = allTargetIds.length
      scanState.phase = 'Processing targets'

      const processChunked = (ids: string[], idx: number): void => {
        const batchEnd = Math.min(idx + 3, ids.length)
        for (let i = idx; i < batchEnd; i++) {
          processTarget(ids[i], rawTargets, stackedTargets, tifTargets, imageTargets, result)
        }

        if (batchEnd < ids.length) {
          setImmediate(() => processChunked(ids, batchEnd))
        } else {
          scanState.phase = 'Ingesting FITS metadata'
          if (fs.existsSync(rawDir)) {
            try {
              startFolderScan(rawDir)
              result.rawScanned = true
            } catch {
              // scan may fail if no FITS files found
            }
          }

          scanState.status = 'done'
          scanState.phase = 'Complete'
          scanState.result = result
        }
      }

      if (allTargetIds.length > 0) {
        processChunked(allTargetIds, 0)
      } else {
        scanState.status = 'done'
        scanState.phase = 'Complete'
        scanState.result = result
      }
    } catch (err) {
      scanState.status = 'error'
      scanState.error = err instanceof Error ? err.message : String(err)
    }
  })

  return { started: true }
}

export function getHomeScanProgress(): HomeScanProgress {
  return { ...scanState }
}

export function getTargetHomeData(targetId: string): TargetHomeData | null {
  const sqlite = getSqlite()
  const row = sqlite.prepare('SELECT * FROM target_home_data WHERE target_id = ?').get(targetId) as {
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
  } | undefined

  if (!row) return null

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
    scannedAt: row.scanned_at
  }
}

export function scanHomeFolder(homePath: string): HomeScanResult {
  const targetLookup = buildTargetLookup()
  const result: HomeScanResult = {
    homePath,
    targets: [],
    rawScanned: false,
    created: 0,
    advanced: 0
  }

  const rawDir = path.join(homePath, 'raw')
  const stackedDir = path.join(homePath, 'stacked')
  const tifDir = path.join(homePath, 'tif')
  const imagesDir = path.join(homePath, 'images')

  const rawTargets = new Map<string, { targetId: string; folderPath: string }>()
  const stackedTargets = new Map<string, { targetId: string; folderPath: string }>()
  const tifTargets = new Map<string, { targetId: string; folderPath: string }>()
  const imageTargets = new Map<string, { targetId: string; folderPath: string }>()

  findTargetFolders(rawDir, targetLookup, rawTargets)
  findTargetFolders(stackedDir, targetLookup, stackedTargets)
  findTargetFolders(tifDir, targetLookup, tifTargets)
  findTargetFolders(imagesDir, targetLookup, imageTargets)

  const allTargetIds = new Set([
    ...rawTargets.keys(),
    ...stackedTargets.keys(),
    ...tifTargets.keys(),
    ...imageTargets.keys()
  ])

  for (const targetId of allTargetIds) {
    processTarget(targetId, rawTargets, stackedTargets, tifTargets, imageTargets, result)
  }

  if (fs.existsSync(rawDir)) {
    try {
      startFolderScan(rawDir)
      result.rawScanned = true
    } catch {
      // scan may fail if no FITS files found
    }
  }

  return result
}

export function getHomeStatus(): HomeScanResult | null {
  const homePath = getSetting('home_folder_path')
  if (!homePath) return null
  return scanHomeFolder(homePath)
}

export function prepForSiril(targetFolderPath: string): { moved: number; created: string[]; skipped: boolean } {
  const created: string[] = []

  const lightsDir = path.join(targetFolderPath, 'lights')
  if (fs.existsSync(lightsDir)) {
    return { moved: 0, created: [], skipped: true }
  }

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(targetFolderPath, { withFileTypes: true })
  } catch {
    return { moved: 0, created, skipped: false }
  }

  const fitsFiles = entries.filter(e =>
    e.isFile() && FITS_EXTENSIONS.has(path.extname(e.name).toLowerCase())
  )

  const darksDir = path.join(targetFolderPath, 'darks')
  const biasesDir = path.join(targetFolderPath, 'biases')
  const flatsDir = path.join(targetFolderPath, 'flats')

  for (const dir of [lightsDir, darksDir, biasesDir, flatsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      created.push(path.basename(dir))
    }
  }

  for (const file of fitsFiles) {
    const src = path.join(targetFolderPath, file.name)
    const dest = path.join(lightsDir, file.name)
    fs.renameSync(src, dest)
  }

  return { moved: fitsFiles.length, created, skipped: false }
}
