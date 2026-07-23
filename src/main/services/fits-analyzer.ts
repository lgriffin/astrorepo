import { getSqlite } from '../db/connection'
import { parseFitsFile } from '../fits/parser'
import { detectStacking } from '../fits/stacking'
import { linkFitsFilesToTargets, normalizeCatalogName } from './fits-linker'
import { isAstronomicalName } from './astro-names'
import { advanceStage } from './workflow'
import { ulid } from 'ulid'
import fs from 'fs'
import path from 'path'
import type {
  FitsScan, FitsScanSummary, FitsFileSummary, FitsFileDetail,
  FitsHeaderRow, FitsScanAggregates, FitsTargetSummary, TargetObservationData,
  StackedFileDetail
} from '@shared/types'

const FITS_EXTENSIONS = new Set(['.fit', '.fits', '.fts'])

interface WalkedFile {
  filePath: string
  folderName: string | null
  sessionFolder: string | null
}

function walkFitsFiles(dir: string): WalkedFile[] {
  const results: WalkedFile[] = []
  const rootDir = path.resolve(dir)

  function walk(currentDir: string, targetFolder: string | null, sessionFolder: string | null, depth: number): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        if (depth === 0) {
          walk(fullPath, entry.name, null, 1)
        } else if (depth === 1) {
          walk(fullPath, targetFolder, entry.name, 2)
        } else {
          walk(fullPath, targetFolder, sessionFolder, depth + 1)
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (FITS_EXTENSIONS.has(ext)) {
          results.push({ filePath: fullPath, folderName: targetFolder, sessionFolder })
        }
      }
    }
  }

  walk(rootDir, null, null, 0)
  return results
}

function getHeaderString(headerMap: Map<string, { value: string | number | boolean | null }>, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = headerMap.get(key)?.value
    if (typeof val === 'string' && val.length > 0) return val
  }
  return null
}

function getHeaderNumber(headerMap: Map<string, { value: string | number | boolean | null }>, ...keys: string[]): number | null {
  for (const key of keys) {
    const val = headerMap.get(key)?.value
    if (typeof val === 'number') return val
  }
  return null
}

export function startFolderScan(folderPath: string): FitsScan {
  const sqlite = getSqlite()
  const now = new Date().toISOString()
  const scanId = ulid()

  sqlite.prepare(
    `INSERT INTO fits_scans (id, folder_path, file_count, total_size_bytes, status, started_at, created_at)
     VALUES (?, ?, 0, 0, 'running', ?, ?)`
  ).run(scanId, folderPath, now, now)

  try {
    sqlite.prepare("DELETE FROM fits_files WHERE scan_id IN (SELECT id FROM fits_scans WHERE folder_path = ? AND id != ?)").run(folderPath, scanId)
    sqlite.prepare("DELETE FROM fits_scans WHERE folder_path = ? AND id != ?").run(folderPath, scanId)

    const fitsFiles = walkFitsFiles(folderPath)
    let totalSize = 0

    const insertFile = sqlite.prepare(
      `INSERT OR IGNORE INTO fits_files (
        id, scan_id, file_path, file_name, file_size_bytes, file_modified_at, folder_name, session_folder,
        object_name, telescope, instrument, observer, exposure_sec, date_obs, filter,
        gain, offset_val, ccd_temp, xpixsz, ypixsz, xbinning, ybinning,
        ra, dec, airmass, bitpix, naxis1, naxis2, bscale, bzero,
        image_type, software, is_stacked, ncombine, total_exposure, calstat,
        pixel_min, pixel_max, pixel_mean, pixel_stddev, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )`
    )

    const insertHeader = sqlite.prepare(
      `INSERT INTO fits_headers (id, file_id, keyword, value, comment, ordinal)
       VALUES (?, ?, ?, ?, ?, ?)`
    )

    const batchSize = 50
    for (let i = 0; i < fitsFiles.length; i += batchSize) {
      const batch = fitsFiles.slice(i, i + batchSize)
      const transaction = sqlite.transaction(() => {
        for (const { filePath, folderName, sessionFolder } of batch) {
          const fileId = ulid()
          const fileName = path.basename(filePath)
          let stat: fs.Stats
          try {
            stat = fs.statSync(filePath)
          } catch {
            continue
          }
          const fileSizeBytes = stat.size
          const fileModifiedAt = stat.mtime.toISOString()
          totalSize += fileSizeBytes

          const result = parseFitsFile(filePath)
          if (!result.isValid) continue

          const hm = result.headerMap
          const stacking = detectStacking(hm)

          const objectName = getHeaderString(hm, 'OBJECT') ?? folderName
          const ra = getHeaderString(hm, 'RA', 'OBJCTRA', 'CRVAL1')
          const dec = getHeaderString(hm, 'DEC', 'OBJCTDEC', 'CRVAL2')
          const software = getHeaderString(hm, 'SWCREATE', 'PROGRAM', 'SOFTWARE', 'CREATOR')

          const insertResult = insertFile.run(
            fileId, scanId, filePath, fileName, fileSizeBytes, fileModifiedAt, folderName, sessionFolder,
            objectName,
            getHeaderString(hm, 'TELESCOP'),
            getHeaderString(hm, 'INSTRUME'),
            getHeaderString(hm, 'OBSERVER'),
            getHeaderNumber(hm, 'EXPTIME', 'EXPOSURE'),
            getHeaderString(hm, 'DATE-OBS'),
            getHeaderString(hm, 'FILTER'),
            getHeaderNumber(hm, 'GAIN'),
            getHeaderNumber(hm, 'OFFSET'),
            getHeaderNumber(hm, 'CCD-TEMP', 'SET-TEMP'),
            getHeaderNumber(hm, 'XPIXSZ'),
            getHeaderNumber(hm, 'YPIXSZ'),
            getHeaderNumber(hm, 'XBINNING'),
            getHeaderNumber(hm, 'YBINNING'),
            ra, dec,
            getHeaderNumber(hm, 'AIRMASS'),
            getHeaderNumber(hm, 'BITPIX'),
            getHeaderNumber(hm, 'NAXIS1'),
            getHeaderNumber(hm, 'NAXIS2'),
            getHeaderNumber(hm, 'BSCALE'),
            getHeaderNumber(hm, 'BZERO'),
            getHeaderString(hm, 'IMAGETYP', 'FRAME'),
            software,
            stacking.isStacked ? 1 : 0,
            stacking.ncombine,
            stacking.totalExposure,
            stacking.calstat,
            result.imageStats?.min ?? null,
            result.imageStats?.max ?? null,
            result.imageStats?.mean ?? null,
            result.imageStats?.stddev ?? null,
            now
          )

          if (insertResult.changes === 0) continue

          for (let ordinal = 0; ordinal < result.headers.length; ordinal++) {
            const h = result.headers[ordinal]
            const valueStr = h.value === null ? null : String(h.value)
            insertHeader.run(ulid(), fileId, h.keyword, valueStr, h.comment, ordinal)
          }
        }
      })
      transaction()
    }

    const completedAt = new Date().toISOString()
    sqlite.prepare(
      `UPDATE fits_scans SET file_count = ?, total_size_bytes = ?, status = 'completed', completed_at = ? WHERE id = ?`
    ).run(fitsFiles.length, totalSize, completedAt, scanId)

    autoCreateTargetsFromScan(sqlite, scanId)
    linkFitsFilesToTargets(scanId)
    advanceLinkedTargets(sqlite, scanId)

    return getScanById(scanId)!
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    sqlite.prepare(
      `UPDATE fits_scans SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?`
    ).run(errorMsg, new Date().toISOString(), scanId)
    throw err
  }
}

export function getScanById(id: string): FitsScan | null {
  const sqlite = getSqlite()
  const row = sqlite.prepare('SELECT * FROM fits_scans WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return mapScanRow(row)
}

export function listScans(limit = 50, offset = 0): { scans: FitsScanSummary[]; total: number } {
  const sqlite = getSqlite()
  const total = (sqlite.prepare('SELECT COUNT(*) as cnt FROM fits_scans').get() as { cnt: number }).cnt
  const rows = sqlite.prepare(
    'SELECT id, folder_path, file_count, total_size_bytes, status, started_at FROM fits_scans ORDER BY started_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as Array<Record<string, unknown>>

  return {
    scans: rows.map(r => ({
      id: r.id as string,
      folderPath: r.folder_path as string,
      fileCount: r.file_count as number,
      totalSizeBytes: r.total_size_bytes as number,
      status: r.status as string,
      startedAt: r.started_at as string
    })),
    total
  }
}

export function deleteScan(id: string): boolean {
  const sqlite = getSqlite()
  const result = sqlite.prepare('DELETE FROM fits_scans WHERE id = ?').run(id)
  return result.changes > 0
}

export interface FileListOptions {
  limit?: number
  offset?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  filterObject?: string
  filterImageType?: string
  filterFilter?: string
  filterStacked?: boolean
  filterFolder?: string
}

export function listScanFiles(scanId: string, opts: FileListOptions = {}): { files: FitsFileSummary[]; total: number } {
  const sqlite = getSqlite()
  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0
  const sortBy = opts.sortBy ?? 'file_name'
  const sortDir = opts.sortDir === 'desc' ? 'DESC' : 'ASC'

  const allowedSorts = ['file_name', 'date_obs', 'exposure_sec', 'object_name', 'filter', 'file_size_bytes', 'folder_name', 'session_folder']
  const sortCol = allowedSorts.includes(sortBy) ? sortBy : 'file_name'

  let where = 'WHERE f.scan_id = ?'
  const params: unknown[] = [scanId]

  if (opts.filterObject) {
    where += ' AND f.object_name = ?'
    params.push(opts.filterObject)
  }
  if (opts.filterImageType) {
    where += ' AND f.image_type = ?'
    params.push(opts.filterImageType)
  }
  if (opts.filterFilter) {
    where += ' AND f.filter = ?'
    params.push(opts.filterFilter)
  }
  if (opts.filterStacked !== undefined) {
    where += ' AND f.is_stacked = ?'
    params.push(opts.filterStacked ? 1 : 0)
  }
  if (opts.filterFolder) {
    where += ' AND f.folder_name = ?'
    params.push(opts.filterFolder)
  }

  const total = (sqlite.prepare(`SELECT COUNT(*) as cnt FROM fits_files f ${where}`).get(...params) as { cnt: number }).cnt

  const rows = sqlite.prepare(
    `SELECT f.id, f.file_name, f.folder_name, f.session_folder, f.object_name, f.exposure_sec,
            f.date_obs, f.filter, f.image_type, f.is_stacked, f.file_size_bytes,
            f.target_id, t.canonical_name as target_name
     FROM fits_files f
     LEFT JOIN targets t ON f.target_id = t.id
     ${where} ORDER BY f.${sortCol} ${sortDir} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as Array<Record<string, unknown>>

  return {
    files: rows.map(r => ({
      id: r.id as string,
      fileName: r.file_name as string,
      folderName: r.folder_name as string | null,
      sessionFolder: r.session_folder as string | null,
      objectName: r.object_name as string | null,
      exposureSec: r.exposure_sec as number | null,
      dateObs: r.date_obs as string | null,
      filter: r.filter as string | null,
      imageType: r.image_type as string | null,
      isStacked: Boolean(r.is_stacked),
      fileSizeBytes: r.file_size_bytes as number,
      targetId: r.target_id as string | null,
      targetName: r.target_name as string | null
    })),
    total
  }
}

export function getFileDetail(fileId: string): FitsFileDetail | null {
  const sqlite = getSqlite()
  const row = sqlite.prepare('SELECT * FROM fits_files WHERE id = ?').get(fileId) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    id: row.id as string,
    scanId: row.scan_id as string,
    filePath: row.file_path as string,
    fileName: row.file_name as string,
    fileSizeBytes: row.file_size_bytes as number,
    fileModifiedAt: row.file_modified_at as string | null,
    folderName: row.folder_name as string | null,
    sessionFolder: row.session_folder as string | null,
    objectName: row.object_name as string | null,
    targetId: row.target_id as string | null,
    telescope: row.telescope as string | null,
    instrument: row.instrument as string | null,
    observer: row.observer as string | null,
    exposureSec: row.exposure_sec as number | null,
    dateObs: row.date_obs as string | null,
    filter: row.filter as string | null,
    gain: row.gain as number | null,
    offsetVal: row.offset_val as number | null,
    ccdTemp: row.ccd_temp as number | null,
    xpixsz: row.xpixsz as number | null,
    ypixsz: row.ypixsz as number | null,
    xbinning: row.xbinning as number | null,
    ybinning: row.ybinning as number | null,
    ra: row.ra as string | null,
    dec: row.dec as string | null,
    airmass: row.airmass as number | null,
    bitpix: row.bitpix as number | null,
    naxis1: row.naxis1 as number | null,
    naxis2: row.naxis2 as number | null,
    bscale: row.bscale as number | null,
    bzero: row.bzero as number | null,
    imageType: row.image_type as string | null,
    software: row.software as string | null,
    isStacked: Boolean(row.is_stacked),
    ncombine: row.ncombine as number | null,
    totalExposure: row.total_exposure as number | null,
    calstat: row.calstat as string | null,
    pixelMin: row.pixel_min as number | null,
    pixelMax: row.pixel_max as number | null,
    pixelMean: row.pixel_mean as number | null,
    pixelStddev: row.pixel_stddev as number | null,
    fwhmEstimate: row.fwhm_estimate as number | null,
    backgroundLevel: row.background_level as number | null,
    starCountEstimate: row.star_count_estimate as number | null,
    noiseLevel: row.noise_level as number | null,
    qualityScore: row.quality_score as number | null,
    qualityFlag: row.quality_flag as string | null,
    createdAt: row.created_at as string
  }
}

export function getFileHeaders(fileId: string): FitsHeaderRow[] {
  const sqlite = getSqlite()
  const rows = sqlite.prepare(
    'SELECT id, file_id, keyword, value, comment, ordinal FROM fits_headers WHERE file_id = ? ORDER BY ordinal'
  ).all(fileId) as Array<Record<string, unknown>>

  return rows.map(r => ({
    id: r.id as string,
    fileId: r.file_id as string,
    keyword: r.keyword as string,
    value: r.value as string | null,
    comment: r.comment as string | null,
    ordinal: r.ordinal as number
  }))
}

export function getScanAggregates(scanId: string): FitsScanAggregates {
  const sqlite = getSqlite()
  return computeAggregates(sqlite, 'WHERE scan_id = ?', [scanId])
}

export function getGlobalAggregates(): FitsScanAggregates {
  const sqlite = getSqlite()
  return computeAggregates(sqlite, '', [])
}

export function getTargetSummaries(scanId: string): FitsTargetSummary[] {
  const sqlite = getSqlite()

  const targets = sqlite.prepare(
    `SELECT DISTINCT f.target_id, t.canonical_name, f.folder_name
     FROM fits_files f
     LEFT JOIN targets t ON f.target_id = t.id
     WHERE f.scan_id = ? AND f.target_id IS NOT NULL
     ORDER BY t.canonical_name`
  ).all(scanId) as Array<{ target_id: string; canonical_name: string; folder_name: string }>

  const seen = new Set<string>()
  const deduped = targets.filter(t => {
    if (seen.has(t.target_id)) return false
    seen.add(t.target_id)
    return true
  })

  return deduped.map((t) => {
    const stats = sqlite.prepare(
      `SELECT
         COUNT(*) as total_files,
         COALESCE(SUM(file_size_bytes), 0) as total_size,
         COALESCE(SUM(exposure_sec), 0) as total_exposure,
         SUM(CASE WHEN is_stacked = 1 THEN 1 ELSE 0 END) as stacked_count,
         SUM(CASE WHEN is_stacked = 0 THEN 1 ELSE 0 END) as individual_count
       FROM fits_files WHERE scan_id = ? AND target_id = ?`
    ).get(scanId, t.target_id) as Record<string, number>

    const sessions = sqlite.prepare(
      `SELECT DISTINCT session_folder FROM fits_files WHERE scan_id = ? AND target_id = ? AND session_folder IS NOT NULL ORDER BY session_folder`
    ).all(scanId, t.target_id) as Array<{ session_folder: string }>

    const filters = sqlite.prepare(
      `SELECT DISTINCT filter FROM fits_files WHERE scan_id = ? AND target_id = ? AND filter IS NOT NULL`
    ).all(scanId, t.target_id) as Array<{ filter: string }>

    const imageTypes = sqlite.prepare(
      `SELECT DISTINCT image_type FROM fits_files WHERE scan_id = ? AND target_id = ? AND image_type IS NOT NULL`
    ).all(scanId, t.target_id) as Array<{ image_type: string }>

    const expByFilter = sqlite.prepare(
      `SELECT filter, COALESCE(SUM(exposure_sec), 0) as total FROM fits_files WHERE scan_id = ? AND target_id = ? AND filter IS NOT NULL GROUP BY filter`
    ).all(scanId, t.target_id) as Array<{ filter: string; total: number }>

    const filesBySession = sqlite.prepare(
      `SELECT session_folder, COUNT(*) as cnt FROM fits_files WHERE scan_id = ? AND target_id = ? AND session_folder IS NOT NULL GROUP BY session_folder`
    ).all(scanId, t.target_id) as Array<{ session_folder: string; cnt: number }>

    const exposureByFilter: Record<string, number> = {}
    for (const r of expByFilter) exposureByFilter[r.filter] = r.total

    const filesBySessionMap: Record<string, number> = {}
    for (const r of filesBySession) filesBySessionMap[r.session_folder] = r.cnt

    return {
      folderName: t.folder_name,
      targetId: t.target_id,
      targetName: t.canonical_name,
      totalFiles: stats.total_files,
      totalSizeBytes: stats.total_size,
      totalExposureSec: stats.total_exposure,
      sessions: sessions.map(s => s.session_folder),
      filters: filters.map(r => r.filter),
      imageTypes: imageTypes.map(r => r.image_type),
      stackedCount: stats.stacked_count,
      individualCount: stats.individual_count,
      exposureByFilter,
      filesBySession: filesBySessionMap
    }
  })
}

export function getTotalFitsFileCount(): number {
  const sqlite = getSqlite()
  const row = sqlite.prepare('SELECT COUNT(*) as cnt FROM fits_files').get() as { cnt: number }
  return row.cnt
}

function computeAggregates(sqlite: ReturnType<typeof getSqlite>, where: string, params: unknown[]): FitsScanAggregates {
  const basics = sqlite.prepare(
    `SELECT
       COUNT(*) as total_files,
       COALESCE(SUM(file_size_bytes), 0) as total_size,
       COALESCE(SUM(exposure_sec), 0) as total_exposure,
       AVG(exposure_sec) as avg_exposure,
       AVG(ccd_temp) as avg_ccd_temp,
       MIN(date_obs) as earliest,
       MAX(date_obs) as latest,
       SUM(CASE WHEN is_stacked = 1 THEN 1 ELSE 0 END) as stacked_count,
       SUM(CASE WHEN is_stacked = 0 THEN 1 ELSE 0 END) as individual_count
     FROM fits_files ${where}`
  ).get(...params) as Record<string, unknown>

  const objectWhere = where ? `${where} AND object_name IS NOT NULL` : 'WHERE object_name IS NOT NULL'
  const uniqueObjectRows = sqlite.prepare(
    `SELECT DISTINCT object_name FROM fits_files ${objectWhere}`
  ).all(...params) as Array<{ object_name: string }>

  const filterWhere = where ? `${where} AND filter IS NOT NULL` : 'WHERE filter IS NOT NULL'
  const uniqueFilterRows = sqlite.prepare(
    `SELECT DISTINCT filter FROM fits_files ${filterWhere}`
  ).all(...params) as Array<{ filter: string }>

  const telescopeWhere = where ? `${where} AND telescope IS NOT NULL` : 'WHERE telescope IS NOT NULL'
  const uniqueTelescopeRows = sqlite.prepare(
    `SELECT DISTINCT telescope FROM fits_files ${telescopeWhere}`
  ).all(...params) as Array<{ telescope: string }>

  const instrumentWhere = where ? `${where} AND instrument IS NOT NULL` : 'WHERE instrument IS NOT NULL'
  const uniqueInstrumentRows = sqlite.prepare(
    `SELECT DISTINCT instrument FROM fits_files ${instrumentWhere}`
  ).all(...params) as Array<{ instrument: string }>

  const folderWhere = where ? `${where} AND folder_name IS NOT NULL` : 'WHERE folder_name IS NOT NULL'
  const uniqueFolderRows = sqlite.prepare(
    `SELECT DISTINCT folder_name FROM fits_files ${folderWhere}`
  ).all(...params) as Array<{ folder_name: string }>

  const imageTypeWhere = where ? `${where} AND image_type IS NOT NULL` : 'WHERE image_type IS NOT NULL'
  const byImageType = sqlite.prepare(
    `SELECT image_type, COUNT(*) as cnt FROM fits_files ${imageTypeWhere} GROUP BY image_type`
  ).all(...params) as Array<{ image_type: string; cnt: number }>

  const byFilter = sqlite.prepare(
    `SELECT filter, COUNT(*) as cnt FROM fits_files ${filterWhere} GROUP BY filter`
  ).all(...params) as Array<{ filter: string; cnt: number }>

  const byObject = sqlite.prepare(
    `SELECT object_name, COUNT(*) as cnt FROM fits_files ${objectWhere} GROUP BY object_name`
  ).all(...params) as Array<{ object_name: string; cnt: number }>

  const byFolder = sqlite.prepare(
    `SELECT folder_name, COUNT(*) as cnt FROM fits_files ${folderWhere} GROUP BY folder_name`
  ).all(...params) as Array<{ folder_name: string; cnt: number }>

  const exposureByFilter = sqlite.prepare(
    `SELECT filter, COALESCE(SUM(exposure_sec), 0) as total FROM fits_files ${filterWhere} GROUP BY filter`
  ).all(...params) as Array<{ filter: string; total: number }>

  const sessionFolderWhere = where ? `${where} AND session_folder IS NOT NULL` : 'WHERE session_folder IS NOT NULL'
  const bySessionFolder = sqlite.prepare(
    `SELECT session_folder, COUNT(*) as cnt FROM fits_files ${sessionFolderWhere} GROUP BY session_folder`
  ).all(...params) as Array<{ session_folder: string; cnt: number }>

  const nightsPerObjectWhere = where
    ? `${where} AND object_name IS NOT NULL AND session_folder IS NOT NULL`
    : 'WHERE object_name IS NOT NULL AND session_folder IS NOT NULL'
  const nightsPerObjectRows = sqlite.prepare(
    `SELECT object_name, session_folder FROM fits_files ${nightsPerObjectWhere} GROUP BY object_name, session_folder`
  ).all(...params) as Array<{ object_name: string; session_folder: string }>

  const filesByImageType: Record<string, number> = {}
  for (const r of byImageType) filesByImageType[r.image_type] = r.cnt

  const filesByFilter: Record<string, number> = {}
  for (const r of byFilter) filesByFilter[r.filter] = r.cnt

  const filesByObject: Record<string, number> = {}
  for (const r of byObject) filesByObject[r.object_name] = r.cnt

  const filesByFolder: Record<string, number> = {}
  for (const r of byFolder) filesByFolder[r.folder_name] = r.cnt

  const filesBySessionFolder: Record<string, number> = {}
  for (const r of bySessionFolder) filesBySessionFolder[r.session_folder] = r.cnt

  const nightsPerObject: Record<string, string[]> = {}
  for (const r of nightsPerObjectRows) {
    if (!nightsPerObject[r.object_name]) nightsPerObject[r.object_name] = []
    nightsPerObject[r.object_name].push(r.session_folder)
  }

  const exposureByFilterMap: Record<string, number> = {}
  for (const r of exposureByFilter) exposureByFilterMap[r.filter] = r.total

  return {
    totalFiles: basics.total_files as number,
    totalSizeBytes: basics.total_size as number,
    totalExposureSec: basics.total_exposure as number,
    uniqueObjects: uniqueObjectRows.map(r => r.object_name),
    uniqueFilters: uniqueFilterRows.map(r => r.filter),
    uniqueTelescopes: uniqueTelescopeRows.map(r => r.telescope),
    uniqueInstruments: uniqueInstrumentRows.map(r => r.instrument),
    uniqueFolders: uniqueFolderRows.map(r => r.folder_name),
    dateRange: {
      earliest: basics.earliest as string | null,
      latest: basics.latest as string | null
    },
    filesByImageType,
    filesByFilter,
    filesByObject,
    filesByFolder,
    filesBySessionFolder,
    nightsPerObject,
    stackedCount: basics.stacked_count as number,
    individualCount: basics.individual_count as number,
    avgExposureSec: basics.avg_exposure as number ?? 0,
    avgCcdTemp: basics.avg_ccd_temp as number | null,
    exposureByFilter: exposureByFilterMap
  }
}


function autoCreateTargetsFromScan(sqlite: ReturnType<typeof getSqlite>, scanId: string): void {
  const objectRows = sqlite.prepare(
    'SELECT DISTINCT object_name FROM fits_files WHERE scan_id = ? AND object_name IS NOT NULL'
  ).all(scanId) as Array<{ object_name: string }>

  const folderRows = sqlite.prepare(
    'SELECT DISTINCT folder_name FROM fits_files WHERE scan_id = ? AND folder_name IS NOT NULL'
  ).all(scanId) as Array<{ folder_name: string }>

  const candidateNames = new Set<string>()
  for (const r of objectRows) {
    if (isAstronomicalName(r.object_name)) candidateNames.add(r.object_name)
  }
  for (const r of folderRows) {
    if (isAstronomicalName(r.folder_name)) candidateNames.add(r.folder_name)
  }

  const existingTargets = sqlite.prepare('SELECT canonical_name FROM targets').all() as Array<{ canonical_name: string }>
  const existingAliases = sqlite.prepare('SELECT alias FROM target_aliases').all() as Array<{ alias: string }>

  const knownNames = new Set<string>()
  for (const t of existingTargets) knownNames.add(normalizeCatalogName(t.canonical_name))
  for (const a of existingAliases) knownNames.add(normalizeCatalogName(a.alias))

  const now = new Date().toISOString()
  const insertTarget = sqlite.prepare(
    `INSERT OR IGNORE INTO targets (id, canonical_name, object_type, ra_hours, dec_degrees, magnitude,
     angular_size_arcmin, constellation, description, simbad_id, ned_id, workflow_stage, is_custom,
     folder_path, notes, created_at, updated_at)
     VALUES (?, ?, 'unknown', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'not_observed', 0, NULL, NULL, ?, ?)`
  )

  for (const name of candidateNames) {
    const normalized = normalizeCatalogName(name)
    if (!knownNames.has(normalized)) {
      insertTarget.run(ulid(), normalized, now, now)
      knownNames.add(normalized)
    }
  }
}

function buildObsFilter(targetId: string): { where: string; params: string[] } {
  const sqlite = getSqlite()

  const linked = sqlite.prepare(
    'SELECT COUNT(*) as cnt FROM fits_files WHERE target_id = ?'
  ).get(targetId) as { cnt: number }

  if (linked.cnt > 0) {
    return { where: 'target_id = ?', params: [targetId] }
  }

  const target = sqlite.prepare(
    'SELECT canonical_name FROM targets WHERE id = ?'
  ).get(targetId) as { canonical_name: string } | undefined
  if (!target) return { where: 'target_id = ?', params: [targetId] }

  const names = [target.canonical_name]
  const aliases = sqlite.prepare(
    'SELECT alias FROM target_aliases WHERE target_id = ?'
  ).all(targetId) as Array<{ alias: string }>
  for (const a of aliases) names.push(a.alias)

  const placeholders = names.map(() => '?').join(', ')
  return {
    where: `(folder_name IN (${placeholders}) OR object_name IN (${placeholders}))`,
    params: [...names, ...names]
  }
}

export function getTargetObservationData(targetId: string): TargetObservationData | null {
  const sqlite = getSqlite()
  const { where, params } = buildObsFilter(targetId)

  const stats = sqlite.prepare(
    `SELECT
       COUNT(*) as total_files,
       COALESCE(SUM(file_size_bytes), 0) as total_size,
       COALESCE(SUM(exposure_sec), 0) as total_exposure,
       SUM(CASE WHEN is_stacked = 1 THEN 1 ELSE 0 END) as stacked_count,
       SUM(CASE WHEN is_stacked = 0 THEN 1 ELSE 0 END) as individual_count,
       MIN(date_obs) as first_observed,
       MAX(date_obs) as last_observed
     FROM fits_files WHERE ${where}`
  ).get(...params) as Record<string, number | string | null>

  if (!stats || stats.total_files === 0) return null

  const sessions = sqlite.prepare(
    `SELECT DISTINCT session_folder FROM fits_files WHERE ${where} AND session_folder IS NOT NULL ORDER BY session_folder`
  ).all(...params) as Array<{ session_folder: string }>

  const filters = sqlite.prepare(
    `SELECT DISTINCT filter FROM fits_files WHERE ${where} AND filter IS NOT NULL`
  ).all(...params) as Array<{ filter: string }>

  const expByFilter = sqlite.prepare(
    `SELECT filter, COALESCE(SUM(exposure_sec), 0) as total FROM fits_files WHERE ${where} AND filter IS NOT NULL GROUP BY filter`
  ).all(...params) as Array<{ filter: string; total: number }>

  const filesBySession = sqlite.prepare(
    `SELECT session_folder, COUNT(*) as cnt FROM fits_files WHERE ${where} AND session_folder IS NOT NULL GROUP BY session_folder`
  ).all(...params) as Array<{ session_folder: string; cnt: number }>

  const imageTypeRows = sqlite.prepare(
    `SELECT COALESCE(image_type, 'unknown') as image_type, COUNT(*) as cnt FROM fits_files WHERE ${where} GROUP BY COALESCE(image_type, 'unknown')`
  ).all(...params) as Array<{ image_type: string; cnt: number }>

  const folderRows = sqlite.prepare(
    `SELECT COALESCE(session_folder, '(root)') as folder, COUNT(*) as cnt FROM fits_files WHERE ${where} GROUP BY COALESCE(session_folder, '(root)')`
  ).all(...params) as Array<{ folder: string; cnt: number }>

  const stackedRows = sqlite.prepare(
    `SELECT file_name, filter, total_exposure, ncombine, software, date_obs, file_size_bytes, session_folder
     FROM fits_files WHERE ${where} AND is_stacked = 1
     ORDER BY date_obs DESC`
  ).all(...params) as Array<{
    file_name: string; filter: string | null; total_exposure: number | null;
    ncombine: number | null; software: string | null; date_obs: string | null;
    file_size_bytes: number; session_folder: string | null
  }>

  const exposureByFilter: Record<string, number> = {}
  for (const r of expByFilter) exposureByFilter[r.filter] = r.total

  const filesBySessionMap: Record<string, number> = {}
  for (const r of filesBySession) filesBySessionMap[r.session_folder] = r.cnt

  const filesByImageType: Record<string, number> = {}
  for (const r of imageTypeRows) filesByImageType[r.image_type] = r.cnt

  const filesByFolder: Record<string, number> = {}
  for (const r of folderRows) filesByFolder[r.folder] = r.cnt

  const stackedDetails: StackedFileDetail[] = stackedRows.map(r => ({
    fileName: r.file_name,
    filter: r.filter,
    totalExposureSec: r.total_exposure,
    ncombine: r.ncombine,
    software: r.software,
    dateObs: r.date_obs,
    fileSizeBytes: r.file_size_bytes,
    sessionFolder: r.session_folder
  }))

  return {
    totalFiles: stats.total_files as number,
    totalExposureSec: stats.total_exposure as number,
    totalSizeBytes: stats.total_size as number,
    filters: filters.map(r => r.filter),
    sessions: sessions.map(s => s.session_folder),
    stackedCount: stats.stacked_count as number,
    individualCount: stats.individual_count as number,
    exposureByFilter,
    filesBySession: filesBySessionMap,
    filesByImageType,
    filesByFolder,
    stackedDetails,
    firstObserved: stats.first_observed as string | null,
    lastObserved: stats.last_observed as string | null
  }
}

function advanceLinkedTargets(sqlite: ReturnType<typeof getSqlite>, scanId: string): void {
  const linked = sqlite.prepare(
    `SELECT DISTINCT target_id FROM fits_files WHERE scan_id = ? AND target_id IS NOT NULL`
  ).all(scanId) as Array<{ target_id: string }>

  for (const row of linked) {
    const target = sqlite.prepare('SELECT workflow_stage FROM targets WHERE id = ?').get(row.target_id) as { workflow_stage: string } | undefined
    if (target && target.workflow_stage === 'not_observed') {
      advanceStage(row.target_id, 'raw_captured', 'Auto-advanced: FITS data linked')
    }
  }
}

export function computeFileStats(fileId: string): { min: number; max: number; mean: number; stddev: number } | null {
  const sqlite = getSqlite()
  const row = sqlite.prepare('SELECT file_path FROM fits_files WHERE id = ?').get(fileId) as { file_path: string } | undefined
  if (!row) return null

  const result = parseFitsFile(row.file_path, { computeStats: true })
  if (!result.isValid || !result.imageStats) return null

  sqlite.prepare(
    `UPDATE fits_files SET pixel_min = ?, pixel_max = ?, pixel_mean = ?, pixel_stddev = ? WHERE id = ?`
  ).run(result.imageStats.min, result.imageStats.max, result.imageStats.mean, result.imageStats.stddev, fileId)

  return result.imageStats
}

function mapScanRow(row: Record<string, unknown>): FitsScan {
  return {
    id: row.id as string,
    folderPath: row.folder_path as string,
    fileCount: row.file_count as number,
    totalSizeBytes: row.total_size_bytes as number,
    status: row.status as FitsScan['status'],
    errorMessage: row.error_message as string | null,
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | null,
    createdAt: row.created_at as string
  }
}
