import fs from 'fs'
import path from 'path'
import { getSqlite } from '../db/connection'
import { normalizeCatalogName } from './fits-linker'
import { startFolderScan } from './fits-analyzer'
import { advanceStage } from './workflow'
import { getSetting } from './settings'
import type { HomeFolderTarget, HomeScanResult } from '@shared/types'

const FITS_EXTENSIONS = new Set(['.fit', '.fits', '.fts'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff'])
const TIF_EXTENSIONS = new Set(['.tif', '.tiff'])

const STAGE_ORDER: Record<string, number> = {
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

  const sqlite = getSqlite()

  for (const targetId of allTargetIds) {
    const target = sqlite.prepare('SELECT id, canonical_name, workflow_stage FROM targets WHERE id = ?').get(targetId) as TargetLookup | undefined
    if (!target) continue

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

    const currentOrder = STAGE_ORDER[target.workflow_stage] ?? 0
    const suggestedOrder = STAGE_ORDER[suggested] ?? 0
    if (suggestedOrder > currentOrder) {
      advanceStage(target.id, suggested, 'Auto-advanced by home folder scan')
      result.advanced++
    }

    if (thumbnailPath) {
      sqlite.prepare('UPDATE targets SET thumbnail_path = ? WHERE id = ?').run(thumbnailPath, target.id)
    }
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
