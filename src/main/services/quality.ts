import { getSqlite } from '../db/connection'
import { parseFitsHeaders } from '../fits/parser'
import { estimateBackground, estimateNoise, estimateFwhm, estimateStarCount } from '../fits/quality'
import type { QualityMetrics, SessionQualityReport } from '@shared/types'

const BLOCK_SIZE = 2880
const RECORD_SIZE = 80

function computeHeaderBlockCount(headers: { headers: { keyword: string }[] }): number {
  const headerBytes = headers.headers.length * RECORD_SIZE + RECORD_SIZE // +1 for END
  return Math.ceil(headerBytes / BLOCK_SIZE)
}

function computeCompositeScore(
  fwhm: number | null,
  noise: number,
  starCount: number,
  background: number
): number {
  // Weighted scoring:
  // - Lower FWHM is better (tighter stars)
  // - Lower noise is better
  // - More stars is better (up to a point)
  // Each factor contributes to a 0-100 score

  let score = 50 // Start at baseline

  // FWHM contribution (0-30 points, lower is better)
  if (fwhm != null && fwhm > 0) {
    if (fwhm <= 2) score += 30
    else if (fwhm <= 3) score += 25
    else if (fwhm <= 4) score += 20
    else if (fwhm <= 5) score += 15
    else if (fwhm <= 7) score += 10
    else if (fwhm <= 10) score += 5
    // fwhm > 10: no bonus
  }

  // Noise contribution (0-20 points, lower relative noise is better)
  if (background > 0 && noise > 0) {
    const snr = background / noise
    if (snr >= 50) score += 20
    else if (snr >= 20) score += 15
    else if (snr >= 10) score += 10
    else if (snr >= 5) score += 5
  }

  // Star count contribution (0-20 points)
  if (starCount >= 200) score += 20
  else if (starCount >= 100) score += 15
  else if (starCount >= 50) score += 10
  else if (starCount >= 20) score += 5

  return Math.min(100, Math.max(0, score))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function stddev(values: number[], mean: number): number {
  if (values.length < 2) return 0
  const sumSq = values.reduce((s, v) => s + (v - mean) * (v - mean), 0)
  return Math.sqrt(sumSq / values.length)
}

export function analyzeFileQuality(fileId: string): QualityMetrics | null {
  const sqlite = getSqlite()

  const file = sqlite.prepare(
    'SELECT id, file_path, bitpix, naxis1, naxis2, bscale, bzero FROM fits_files WHERE id = ?'
  ).get(fileId) as {
    id: string
    file_path: string
    bitpix: number | null
    naxis1: number | null
    naxis2: number | null
    bscale: number | null
    bzero: number | null
  } | undefined

  if (!file || file.naxis1 == null || file.naxis2 == null || file.bitpix == null) {
    return null
  }

  const bitpix = file.bitpix
  const naxis1 = file.naxis1
  const naxis2 = file.naxis2
  const bscale = file.bscale ?? 1
  const bzero = file.bzero ?? 0

  let headerBlockCount: number
  try {
    const headers = parseFitsHeaders(file.file_path)
    headerBlockCount = computeHeaderBlockCount(headers)
  } catch {
    return null
  }

  let background: number
  let noise: number
  let fwhm: number | null
  let starCount: number

  try {
    background = estimateBackground(file.file_path, headerBlockCount, bitpix, naxis1, naxis2, bscale, bzero)
    noise = estimateNoise(file.file_path, headerBlockCount, bitpix, naxis1, naxis2, bscale, bzero)
    fwhm = estimateFwhm(file.file_path, headerBlockCount, bitpix, naxis1, naxis2, bscale, bzero, background, noise)
    starCount = estimateStarCount(file.file_path, headerBlockCount, bitpix, naxis1, naxis2, bscale, bzero, background, noise)
  } catch {
    return null
  }

  const qualityScore = computeCompositeScore(fwhm, noise, starCount, background)
  const qualityFlag = qualityScore >= 70 ? 'good' : qualityScore >= 40 ? 'warning' : 'reject'

  sqlite.prepare(`
    UPDATE fits_files SET
      fwhm_estimate = ?,
      background_level = ?,
      noise_level = ?,
      star_count_estimate = ?,
      quality_score = ?,
      quality_flag = ?
    WHERE id = ?
  `).run(
    fwhm,
    background,
    noise,
    starCount,
    qualityScore,
    qualityFlag,
    fileId
  )

  return {
    fileId,
    fwhmEstimate: fwhm,
    backgroundLevel: background,
    noiseLevel: noise,
    starCountEstimate: starCount,
    qualityScore,
    qualityFlag
  }
}

export function analyzeScanQuality(scanId: string): { analyzed: number; failed: number } {
  const sqlite = getSqlite()

  const files = sqlite.prepare(
    "SELECT id FROM fits_files WHERE scan_id = ? AND (image_type = 'Light Frame' OR image_type = 'light' OR image_type IS NULL)"
  ).all(scanId) as { id: string }[]

  let analyzed = 0
  let failed = 0

  for (const file of files) {
    const result = analyzeFileQuality(file.id)
    if (result) {
      analyzed++
    } else {
      failed++
    }
  }

  // Recompute quality flags relative to session medians
  if (analyzed > 0) {
    const metrics = sqlite.prepare(
      'SELECT id, fwhm_estimate, noise_level FROM fits_files WHERE scan_id = ? AND quality_score IS NOT NULL'
    ).all(scanId) as { id: string; fwhm_estimate: number | null; noise_level: number | null }[]

    const fwhmValues = metrics.map(m => m.fwhm_estimate).filter((v): v is number => v != null)
    const noiseValues = metrics.map(m => m.noise_level).filter((v): v is number => v != null)

    if (fwhmValues.length >= 3) {
      const medFwhm = median(fwhmValues)
      const sdFwhm = stddev(fwhmValues, medFwhm)
      const medNoise = median(noiseValues)
      const sdNoise = stddev(noiseValues, medNoise)

      for (const m of metrics) {
        let flag: 'good' | 'warning' | 'reject' = 'good'

        if (m.fwhm_estimate != null && sdFwhm > 0 && Math.abs(m.fwhm_estimate - medFwhm) > 2 * sdFwhm) {
          flag = m.fwhm_estimate > medFwhm ? 'reject' : 'good'
        }
        if (m.noise_level != null && sdNoise > 0 && Math.abs(m.noise_level - medNoise) > 2 * sdNoise) {
          if (m.noise_level > medNoise) {
            flag = flag === 'reject' ? 'reject' : 'warning'
          }
        }

        sqlite.prepare('UPDATE fits_files SET quality_flag = ? WHERE id = ?').run(flag, m.id)
      }
    }
  }

  return { analyzed, failed }
}

export function getQualityMetrics(fileId: string): QualityMetrics | null {
  const sqlite = getSqlite()

  const row = sqlite.prepare(
    'SELECT id, fwhm_estimate, background_level, noise_level, star_count_estimate, quality_score, quality_flag FROM fits_files WHERE id = ?'
  ).get(fileId) as {
    id: string
    fwhm_estimate: number | null
    background_level: number | null
    noise_level: number | null
    star_count_estimate: number | null
    quality_score: number | null
    quality_flag: string | null
  } | undefined

  if (!row) return null
  if (row.quality_score == null && row.fwhm_estimate == null && row.background_level == null) return null

  return {
    fileId: row.id,
    fwhmEstimate: row.fwhm_estimate,
    backgroundLevel: row.background_level,
    noiseLevel: row.noise_level,
    starCountEstimate: row.star_count_estimate,
    qualityScore: row.quality_score,
    qualityFlag: row.quality_flag as 'good' | 'warning' | 'reject' | null
  }
}

export function getSessionQualityReport(scanId: string, folderName: string): SessionQualityReport {
  const sqlite = getSqlite()

  const files = sqlite.prepare(
    `SELECT id, session_folder, fwhm_estimate, background_level, noise_level, star_count_estimate, quality_score, quality_flag
     FROM fits_files WHERE scan_id = ? AND folder_name = ?`
  ).all(scanId, folderName) as {
    id: string
    session_folder: string | null
    fwhm_estimate: number | null
    background_level: number | null
    noise_level: number | null
    star_count_estimate: number | null
    quality_score: number | null
    quality_flag: string | null
  }[]

  const fileMetrics: QualityMetrics[] = files.map(f => ({
    fileId: f.id,
    fwhmEstimate: f.fwhm_estimate,
    backgroundLevel: f.background_level,
    noiseLevel: f.noise_level,
    starCountEstimate: f.star_count_estimate,
    qualityScore: f.quality_score,
    qualityFlag: f.quality_flag as 'good' | 'warning' | 'reject' | null
  }))

  const analyzed = fileMetrics.filter(f => f.qualityScore != null)
  const fwhmValues = analyzed.map(f => f.fwhmEstimate).filter((v): v is number => v != null)
  const noiseValues = analyzed.map(f => f.noiseLevel).filter((v): v is number => v != null)
  const bgValues = analyzed.map(f => f.backgroundLevel).filter((v): v is number => v != null)
  const starValues = analyzed.map(f => f.starCountEstimate).filter((v): v is number => v != null)

  const medFwhm = fwhmValues.length > 0 ? median(fwhmValues) : null
  const medNoise = noiseValues.length > 0 ? median(noiseValues) : null
  const medBg = bgValues.length > 0 ? median(bgValues) : null
  const medStars = starValues.length > 0 ? median(starValues) : null

  // Count outliers (>2 sigma from median FWHM or noise)
  let outlierCount = 0
  if (fwhmValues.length >= 3 && medFwhm != null) {
    const sdFwhm = stddev(fwhmValues, medFwhm)
    const sdNoise = medNoise != null ? stddev(noiseValues, medNoise) : 0

    for (const f of analyzed) {
      const isFwhmOutlier = f.fwhmEstimate != null && sdFwhm > 0 && Math.abs(f.fwhmEstimate - medFwhm) > 2 * sdFwhm
      const isNoiseOutlier = f.noiseLevel != null && medNoise != null && sdNoise > 0 && Math.abs(f.noiseLevel - medNoise) > 2 * sdNoise
      if (isFwhmOutlier || isNoiseOutlier) {
        outlierCount++
      }
    }
  }

  // Determine session folder from first file
  const sessionFolder = files.length > 0 ? files[0].session_folder : null

  return {
    folderName,
    sessionFolder,
    totalFiles: files.length,
    analyzedFiles: analyzed.length,
    medianFwhm: medFwhm,
    medianNoise: medNoise,
    medianBackground: medBg,
    medianStarCount: medStars,
    outlierCount,
    files: fileMetrics
  }
}
