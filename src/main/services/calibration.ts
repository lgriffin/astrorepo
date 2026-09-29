import { getSqlite } from '../db/connection'
import type { CalibrationGroup, CalibrationMatch, CalibrationCoverage } from '@shared/types'
import { normalizeImageType } from './image-type'
export { normalizeImageType }

export function getCalibrationLibrary(opts?: {
  type?: string
  gain?: number
  temp?: number
  binning?: string
}): CalibrationGroup[] {
  const sqlite = getSqlite()

  const calibRows = sqlite.prepare(
    `SELECT id, image_type, exposure_sec, filter, gain, ccd_temp, xbinning, ybinning, file_size_bytes, date_obs
     FROM fits_files
     WHERE image_type IS NOT NULL`
  ).all() as Array<Record<string, unknown>>

  const groups = new Map<string, CalibrationGroup>()

  for (const row of calibRows) {
    const normalized = normalizeImageType(row.image_type as string | null)
    if (normalized !== 'dark' && normalized !== 'flat' && normalized !== 'bias') continue

    if (opts?.type && normalized !== opts.type) continue

    const gain = row.gain as number | null
    if (opts?.gain !== undefined && gain !== opts.gain) continue

    const ccdTemp = row.ccd_temp as number | null
    if (opts?.temp !== undefined && ccdTemp !== null && Math.abs(ccdTemp - opts.temp) > 2) continue

    const xbin = row.xbinning as number | null
    const ybin = row.ybinning as number | null
    const binning = xbin != null && ybin != null ? `${xbin}x${ybin}` : null
    if (opts?.binning && binning !== opts.binning) continue

    let groupKey: string
    if (normalized === 'dark') {
      const roundedTemp = ccdTemp != null ? Math.round(ccdTemp) : null
      groupKey = `dark|${row.exposure_sec ?? 'null'}|${gain ?? 'null'}|${roundedTemp ?? 'null'}|${binning ?? 'null'}`
    } else if (normalized === 'flat') {
      groupKey = `flat|${row.filter ?? 'null'}|${gain ?? 'null'}|${binning ?? 'null'}`
    } else {
      groupKey = `bias|${gain ?? 'null'}|${binning ?? 'null'}`
    }

    const existing = groups.get(groupKey)
    const dateObs = row.date_obs as string | null
    const fileSize = row.file_size_bytes as number

    if (existing) {
      existing.fileCount++
      existing.totalSizeBytes += fileSize
      if (dateObs) {
        if (!existing.dateRange.earliest || dateObs < existing.dateRange.earliest) {
          existing.dateRange.earliest = dateObs
        }
        if (!existing.dateRange.latest || dateObs > existing.dateRange.latest) {
          existing.dateRange.latest = dateObs
        }
      }
    } else {
      const roundedTemp = ccdTemp != null ? Math.round(ccdTemp) : null
      groups.set(groupKey, {
        type: normalized,
        exposureSec: normalized === 'dark' ? (row.exposure_sec as number | null) : null,
        filter: normalized === 'flat' ? (row.filter as string | null) : null,
        gain,
        ccdTemp: normalized === 'dark' ? roundedTemp : null,
        binning,
        fileCount: 1,
        totalSizeBytes: fileSize,
        dateRange: { earliest: dateObs, latest: dateObs }
      })
    }
  }

  return Array.from(groups.values())
}

export function matchCalibrationToLights(scanId?: string): CalibrationCoverage {
  const sqlite = getSqlite()

  let lightWhere = 'WHERE image_type IS NOT NULL'
  const lightParams: unknown[] = []
  if (scanId) {
    lightWhere += ' AND scan_id = ?'
    lightParams.push(scanId)
  }

  const lightRows = sqlite.prepare(
    `SELECT id, exposure_sec, gain, ccd_temp, xbinning, ybinning, filter, image_type
     FROM fits_files ${lightWhere}`
  ).all(...lightParams) as Array<Record<string, unknown>>

  const lights = lightRows.filter(r => normalizeImageType(r.image_type as string | null) === 'light')

  if (lights.length === 0) {
    return {
      totalLights: 0,
      fullyCalibrated: 0,
      partiallyCalibrated: 0,
      uncalibrated: 0,
      darksCoverage: 0,
      flatsCoverage: 0,
      biasCoverage: 0
    }
  }

  const allCalib = sqlite.prepare(
    `SELECT image_type, exposure_sec, gain, ccd_temp, xbinning, ybinning, filter
     FROM fits_files WHERE image_type IS NOT NULL`
  ).all() as Array<Record<string, unknown>>

  const darks = allCalib.filter(r => normalizeImageType(r.image_type as string | null) === 'dark')
  const flats = allCalib.filter(r => normalizeImageType(r.image_type as string | null) === 'flat')
  const biases = allCalib.filter(r => normalizeImageType(r.image_type as string | null) === 'bias')

  let darksMatched = 0
  let flatsMatched = 0
  let biasMatched = 0
  let fullyCalibrated = 0
  let partiallyCalibrated = 0
  let uncalibrated = 0

  for (const light of lights) {
    const hasDark = darks.some(d =>
      d.exposure_sec === light.exposure_sec &&
      d.gain === light.gain &&
      d.xbinning === light.xbinning &&
      d.ybinning === light.ybinning &&
      d.ccd_temp != null && light.ccd_temp != null &&
      Math.abs((d.ccd_temp as number) - (light.ccd_temp as number)) <= 2.0
    )

    const hasFlat = flats.some(f =>
      f.filter === light.filter &&
      f.gain === light.gain &&
      f.xbinning === light.xbinning &&
      f.ybinning === light.ybinning
    )

    const hasBias = biases.some(b =>
      b.gain === light.gain &&
      b.xbinning === light.xbinning &&
      b.ybinning === light.ybinning
    )

    if (hasDark) darksMatched++
    if (hasFlat) flatsMatched++
    if (hasBias) biasMatched++

    const matchCount = (hasDark ? 1 : 0) + (hasFlat ? 1 : 0) + (hasBias ? 1 : 0)
    if (matchCount === 3) fullyCalibrated++
    else if (matchCount > 0) partiallyCalibrated++
    else uncalibrated++
  }

  const total = lights.length
  return {
    totalLights: total,
    fullyCalibrated,
    partiallyCalibrated,
    uncalibrated,
    darksCoverage: total > 0 ? Math.round((darksMatched / total) * 100) : 0,
    flatsCoverage: total > 0 ? Math.round((flatsMatched / total) * 100) : 0,
    biasCoverage: total > 0 ? Math.round((biasMatched / total) * 100) : 0
  }
}

export function getLightCalibrationStatus(fileId: string): {
  darks: CalibrationMatch
  flats: CalibrationMatch
  biases: CalibrationMatch
} {
  const sqlite = getSqlite()

  const lightRow = sqlite.prepare(
    'SELECT exposure_sec, gain, ccd_temp, xbinning, ybinning, filter FROM fits_files WHERE id = ?'
  ).get(fileId) as Record<string, unknown> | undefined

  const missing = (type: 'dark' | 'flat' | 'bias'): CalibrationMatch => ({
    type, status: 'missing', matchCount: 0
  })

  if (!lightRow) {
    return { darks: missing('dark'), flats: missing('flat'), biases: missing('bias') }
  }

  const darkCount = (sqlite.prepare(
    `SELECT COUNT(*) as cnt FROM fits_files
     WHERE (LOWER(image_type) LIKE '%dark%')
       AND exposure_sec = ?
       AND gain = ?
       AND xbinning = ?
       AND ybinning = ?
       AND ccd_temp IS NOT NULL
       AND ABS(ccd_temp - ?) <= 2.0`
  ).get(
    lightRow.exposure_sec,
    lightRow.gain,
    lightRow.xbinning,
    lightRow.ybinning,
    lightRow.ccd_temp
  ) as { cnt: number }).cnt

  const closeDarkCount = darkCount === 0 ? (sqlite.prepare(
    `SELECT COUNT(*) as cnt FROM fits_files
     WHERE (LOWER(image_type) LIKE '%dark%')
       AND exposure_sec = ?
       AND gain = ?
       AND xbinning = ?
       AND ybinning = ?
       AND ccd_temp IS NOT NULL
       AND ABS(ccd_temp - ?) <= 5.0`
  ).get(
    lightRow.exposure_sec,
    lightRow.gain,
    lightRow.xbinning,
    lightRow.ybinning,
    lightRow.ccd_temp
  ) as { cnt: number }).cnt : 0

  const flatCount = (sqlite.prepare(
    `SELECT COUNT(*) as cnt FROM fits_files
     WHERE (LOWER(image_type) LIKE '%flat%')
       AND filter = ?
       AND gain = ?
       AND xbinning = ?
       AND ybinning = ?`
  ).get(
    lightRow.filter,
    lightRow.gain,
    lightRow.xbinning,
    lightRow.ybinning
  ) as { cnt: number }).cnt

  const biasCount = (sqlite.prepare(
    `SELECT COUNT(*) as cnt FROM fits_files
     WHERE (LOWER(image_type) LIKE '%bias%' OR LOWER(image_type) LIKE '%offset%')
       AND gain = ?
       AND xbinning = ?
       AND ybinning = ?`
  ).get(
    lightRow.gain,
    lightRow.xbinning,
    lightRow.ybinning
  ) as { cnt: number }).cnt

  const darks: CalibrationMatch = darkCount > 0
    ? { type: 'dark', status: 'matched', matchCount: darkCount }
    : closeDarkCount > 0
      ? { type: 'dark', status: 'close', matchCount: closeDarkCount }
      : { type: 'dark', status: 'missing', matchCount: 0 }

  const flats: CalibrationMatch = flatCount > 0
    ? { type: 'flat', status: 'matched', matchCount: flatCount }
    : { type: 'flat', status: 'missing', matchCount: 0 }

  const biasesResult: CalibrationMatch = biasCount > 0
    ? { type: 'bias', status: 'matched', matchCount: biasCount }
    : { type: 'bias', status: 'missing', matchCount: 0 }

  return { darks, flats, biases: biasesResult }
}

export function getCalibrationSummary(): {
  totalDarks: number
  totalFlats: number
  totalBiases: number
  lightsCovered: number
  lightsUncovered: number
} {
  const sqlite = getSqlite()

  const allRows = sqlite.prepare(
    'SELECT image_type FROM fits_files WHERE image_type IS NOT NULL'
  ).all() as Array<{ image_type: string }>

  let totalDarks = 0
  let totalFlats = 0
  let totalBiases = 0

  for (const row of allRows) {
    const norm = normalizeImageType(row.image_type)
    if (norm === 'dark') totalDarks++
    else if (norm === 'flat') totalFlats++
    else if (norm === 'bias') totalBiases++
  }

  const coverage = matchCalibrationToLights()

  return {
    totalDarks,
    totalFlats,
    totalBiases,
    lightsCovered: coverage.fullyCalibrated + coverage.partiallyCalibrated,
    lightsUncovered: coverage.uncalibrated
  }
}
