/**
 * Frame grading: measure every light before it is stacked, grade it against limits the user sets,
 * and weight the ones kept. SyQon Studio's Fusion Stack measures FWHM, eccentricity, noise,
 * background, star count and weight before integrating; this is the same idea for a cockpit that
 * hands the stacking to Siril. Pure rules over pixel arrays; reading files is an adapter's job.
 */

import { observingNightOf } from './observing-night'

// ── Pixels ──────────────────────────────────────────────────────────────

/** One plane of pixel values, row by row. */
export interface Plane {
  width: number
  height: number
  data: Float32Array
}

/**
 * A colour sensor's raw frame as luminance: each 2×2 Bayer cell summed into one pixel, so the
 * pattern's alternating red, green and blue never looks like a field of tiny stars.
 */
export function binBayer(plane: Plane): Plane {
  const width = Math.floor(plane.width / 2)
  const height = Math.floor(plane.height / 2)
  const data = new Float32Array(width * height)
  const src = plane.data
  const w = plane.width
  for (let y = 0; y < height; y++) {
    const r0 = 2 * y * w
    const r1 = r0 + w
    for (let x = 0; x < width; x++) {
      const c = 2 * x
      data[y * width + x] = src[r0 + c] + src[r0 + c + 1] + src[r1 + c] + src[r1 + c + 1]
    }
  }
  return { width, height, data }
}

function medianOf(values: ArrayLike<number>): number {
  const sorted = Float64Array.from(values).sort()
  if (sorted.length === 0) return 0
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Up to `count` finite values spread evenly across the plane. */
function sample(plane: Plane, count: number): number[] {
  const step = Math.max(1, Math.floor(plane.data.length / count))
  const out: number[] = []
  for (let i = 0; i < plane.data.length; i += step) if (Number.isFinite(plane.data[i])) out.push(plane.data[i])
  return out
}

/**
 * Sky level and its noise: the median and the MAD scaled to a standard deviation, recomputed twice
 * without values more than 3σ away, so the stars themselves do not inflate the noise.
 */
export function skyStatistics(plane: Plane): { background: number; noise: number } {
  let values = sample(plane, 50_000)
  let background = 0
  let noise = 0
  for (let pass = 0; pass < 3; pass++) {
    background = medianOf(values)
    noise = 1.4826 * medianOf(values.map(v => Math.abs(v - background)))
    if (!(noise > 0)) break
    const low = background - 3 * noise
    const high = background + 3 * noise
    values = values.filter(v => v >= low && v <= high)
  }
  return { background, noise }
}

// ── Stars ───────────────────────────────────────────────────────────────

export interface StarShape {
  x: number
  y: number
  /** Background-subtracted flux inside the measuring box. */
  flux: number
  /** Full width at half maximum, in the plane's pixels, from the second moments. */
  fwhm: number
  /** 0 for a round star, towards 1 for a trailed one: sqrt(1 - minor²/major²). */
  eccentricity: number
}

export interface StarSearch {
  /** Detection threshold in noise sigmas above the background. */
  sigma: number
  /** Half-size of the box each star is measured in. */
  radius: number
  /** Stars measured for shape, brightest first. */
  maxStars: number
  /** Peaks at or above this value are saturated and not measured. Null when unknown. */
  saturation: number | null
}

export const DEFAULT_STAR_SEARCH: StarSearch = { sigma: 5, radius: 6, maxStars: 200, saturation: null }

/** FWHM of a Gaussian from its standard deviation. */
const SIGMA_TO_FWHM = 2 * Math.sqrt(2 * Math.LN2)

/** Shape of the star at a peak, from the intensity-weighted second moments in a box around it. */
export function measureStar(plane: Plane, px: number, py: number, background: number, radius: number): StarShape | null {
  const { width, height, data } = plane
  if (px < radius || py < radius || px >= width - radius || py >= height - radius) return null
  let sum = 0
  let sx = 0
  let sy = 0
  for (let y = py - radius; y <= py + radius; y++) {
    for (let x = px - radius; x <= px + radius; x++) {
      const v = data[y * width + x] - background
      if (v <= 0) continue
      sum += v
      sx += v * x
      sy += v * y
    }
  }
  if (sum <= 0) return null
  const cx = sx / sum
  const cy = sy / sum
  let xx = 0
  let yy = 0
  let xy = 0
  for (let y = py - radius; y <= py + radius; y++) {
    for (let x = px - radius; x <= px + radius; x++) {
      const v = data[y * width + x] - background
      if (v <= 0) continue
      const dx = x - cx
      const dy = y - cy
      xx += v * dx * dx
      yy += v * dy * dy
      xy += v * dx * dy
    }
  }
  xx /= sum
  yy /= sum
  xy /= sum
  // Eigenvalues of the covariance: the variances along the star's long and short axes.
  const mean = (xx + yy) / 2
  const spread = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy)
  const major = mean + spread
  const minor = Math.max(0, mean - spread)
  if (!(major > 0)) return null
  return {
    x: cx,
    y: cy,
    flux: sum,
    fwhm: SIGMA_TO_FWHM * Math.sqrt((major + minor) / 2),
    eccentricity: Math.sqrt(Math.max(0, 1 - minor / major))
  }
}

/** Local maxima above the threshold, brightest first. Each peak is the highest pixel within `radius`. */
export function findPeaks(plane: Plane, threshold: number, radius: number): { x: number; y: number; value: number }[] {
  const { width, height, data } = plane
  const peaks: { x: number; y: number; value: number }[] = []
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const v = data[y * width + x]
      if (!(v > threshold)) continue
      let highest = true
      for (let dy = -1; dy <= 1 && highest; dy++) {
        for (let dx = -1; dx <= 1 && highest; dx++) {
          if ((dx || dy) && data[(y + dy) * width + x + dx] >= v) highest = false
        }
      }
      if (highest) peaks.push({ x, y, value: v })
    }
  }
  peaks.sort((a, b) => b.value - a.value)
  // Keep the brightest peak of any cluster: a bright star's halo has small local maxima of its own.
  // A grid of cells one radius wide means each peak checks only its own and the eight next cells.
  const kept: { x: number; y: number; value: number }[] = []
  const cells = new Map<number, { x: number; y: number }[]>()
  const cols = Math.ceil(width / Math.max(1, radius)) + 1
  const cellOf = (x: number, y: number) => Math.floor(y / Math.max(1, radius)) * cols + Math.floor(x / Math.max(1, radius))
  const r2 = radius * radius
  for (const p of peaks) {
    const cx = Math.floor(p.x / Math.max(1, radius))
    const cy = Math.floor(p.y / Math.max(1, radius))
    let near = false
    for (let dy = -1; dy <= 1 && !near; dy++) {
      for (let dx = -1; dx <= 1 && !near; dx++) {
        for (const k of cells.get((cy + dy) * cols + cx + dx) ?? []) {
          if ((k.x - p.x) ** 2 + (k.y - p.y) ** 2 <= r2) {
            near = true
            break
          }
        }
      }
    }
    if (near) continue
    kept.push(p)
    const key = cellOf(p.x, p.y)
    cells.set(key, [...(cells.get(key) ?? []), p])
  }
  return kept
}

// ── A frame's measurement ───────────────────────────────────────────────

export interface FrameMeasurement {
  /** Median FWHM of the measured stars, in the frame's own pixels; null when too few stars. */
  fwhm: number | null
  /** Median eccentricity of the measured stars; null when too few stars. */
  eccentricity: number | null
  /** Stars detected above the threshold, in the frame's own pixels. */
  starCount: number
  background: number
  noise: number
  /** Median star flux over the noise in the star's box: how well the stars stand out. Null when too few stars. */
  snr: number | null
}

/** Fewer stars than this and FWHM, eccentricity and SNR are not reported: a handful of hot pixels or one star would decide them. */
export const MIN_STARS_FOR_SHAPE = 5

/**
 * Measures a frame. A binned plane is measured as it is and its FWHM scaled back to the frame's
 * own pixels, so grades read the same whether or not the sensor is colour.
 */
export function measureFrame(plane: Plane, options: { binned: boolean; search?: Partial<StarSearch> }): FrameMeasurement {
  const search = { ...DEFAULT_STAR_SEARCH, ...options.search }
  const scale = options.binned ? 2 : 1
  const { background, noise } = skyStatistics(plane)
  const none: FrameMeasurement = { fwhm: null, eccentricity: null, starCount: 0, background, noise, snr: null }
  if (!(noise > 0)) return none

  const peaks = findPeaks(plane, background + search.sigma * noise, search.radius)
  const shapes: StarShape[] = []
  for (const p of peaks) {
    if (shapes.length >= search.maxStars) break
    if (search.saturation !== null && p.value >= search.saturation) continue
    const s = measureStar(plane, p.x, p.y, background, search.radius)
    // A shape wider than the box is a nebula knot or a galaxy core, not a star.
    if (s && s.fwhm < search.radius * 1.5) shapes.push(s)
  }
  const box = (2 * search.radius + 1) ** 2
  const measured = shapes.length >= MIN_STARS_FOR_SHAPE
  return {
    fwhm: measured ? medianOf(shapes.map(s => s.fwhm)) * scale : null,
    eccentricity: measured ? medianOf(shapes.map(s => s.eccentricity)) : null,
    starCount: peaks.length,
    background,
    noise,
    snr: measured ? medianOf(shapes.map(s => s.flux)) / (noise * Math.sqrt(box)) : null
  }
}

// ── Grading ─────────────────────────────────────────────────────────────

export interface GradeLimits {
  /** Reject above this eccentricity (trailing, wind, a bumped mount). */
  maxEccentricity: number
  /** Reject when FWHM exceeds the night's median by this factor (seeing, focus drift, dew). */
  maxFwhmRatio: number
  /** Reject when the star count falls below this fraction of the night's median (cloud, haze). */
  minStarRatio: number
  /** Reject when the background exceeds the night's median by this factor (moon, dawn, light cloud). */
  maxBackgroundRatio: number
  /** Reject above this FWHM in pixels, whatever the night; null for no fixed limit. */
  maxFwhmPixels: number | null
}

export const DEFAULT_GRADE_LIMITS: GradeLimits = {
  maxEccentricity: 0.6,
  maxFwhmRatio: 1.5,
  minStarRatio: 0.5,
  maxBackgroundRatio: 1.5,
  maxFwhmPixels: null
}

export const GRADE_LIMIT_KEYS: Record<keyof GradeLimits, string> = {
  maxEccentricity: 'grade_max_eccentricity',
  maxFwhmRatio: 'grade_max_fwhm_ratio',
  minStarRatio: 'grade_min_star_ratio',
  maxBackgroundRatio: 'grade_max_background_ratio',
  maxFwhmPixels: 'grade_max_fwhm_pixels'
}

/** The saved limits, each falling back to its default when missing or out of range. */
export function parseGradeLimits(read: (key: string) => string | null): GradeLimits {
  const number = (key: string, min: number, max: number) => {
    const raw = read(key)
    const n = raw === null || raw.trim() === '' ? NaN : Number(raw)
    return Number.isFinite(n) && n >= min && n <= max ? n : null
  }
  return {
    maxEccentricity: number(GRADE_LIMIT_KEYS.maxEccentricity, 0.05, 1) ?? DEFAULT_GRADE_LIMITS.maxEccentricity,
    maxFwhmRatio: number(GRADE_LIMIT_KEYS.maxFwhmRatio, 1, 10) ?? DEFAULT_GRADE_LIMITS.maxFwhmRatio,
    minStarRatio: number(GRADE_LIMIT_KEYS.minStarRatio, 0, 1) ?? DEFAULT_GRADE_LIMITS.minStarRatio,
    maxBackgroundRatio: number(GRADE_LIMIT_KEYS.maxBackgroundRatio, 1, 100) ?? DEFAULT_GRADE_LIMITS.maxBackgroundRatio,
    maxFwhmPixels: number(GRADE_LIMIT_KEYS.maxFwhmPixels, 0.5, 100)
  }
}

export type GradeOverride = 'keep' | 'reject'
export type GradeVerdict = 'keep' | 'reject' | 'unmeasured'

export interface GradableLight {
  fileId: string
  path: string
  capturedAt: Date | null
  /** The filter, so a night's medians compare like with like. */
  filter: string | null
  measurement: FrameMeasurement | null
  /** Why the frame could not be measured, when it was tried and failed. */
  measureError: string | null
  override: GradeOverride | null
}

export interface FrameGrade {
  fileId: string
  path: string
  capturedAt: Date | null
  night: string | null
  filter: string | null
  measurement: FrameMeasurement | null
  verdict: GradeVerdict
  /** Each limit the frame failed, in the user's words; or why it is unmeasured, or that the user chose. */
  reasons: string[]
  override: GradeOverride | null
  /** SNR squared relative to the best kept frame (0 to 1); null for a frame not kept or without SNR. */
  weight: number | null
}

export interface NightSummary {
  night: string
  filter: string | null
  frames: number
  kept: number
  rejected: number
  medianFwhm: number | null
  medianStars: number | null
  medianBackground: number | null
}

export interface GradeReport {
  grades: FrameGrade[]
  nights: NightSummary[]
  kept: number
  rejected: number
  unmeasured: number
}

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places

function median(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null && Number.isFinite(v))
  return real.length > 0 ? medianOf(real) : null
}

const groupKey = (night: string | null, filter: string | null) => `${night ?? ''}\u0000${filter ?? ''}`

/**
 * Grades every light. FWHM, star count and background are judged against the median of the
 * frame's own night and filter, so a soft night or a narrowband filter does not reject everything;
 * eccentricity and the optional fixed FWHM are absolute. A user's keep or reject wins over the
 * limits. A frame that could not be measured is kept: the app never drops data it has not judged.
 */
export function gradeFrames(lights: GradableLight[], limits: GradeLimits): GradeReport {
  const night = (l: GradableLight) => (l.capturedAt ? observingNightOf(l.capturedAt) : null)
  const groups = new Map<string, GradableLight[]>()
  for (const l of lights) {
    const key = groupKey(night(l), l.filter)
    groups.set(key, [...(groups.get(key) ?? []), l])
  }
  const medians = new Map<string, { fwhm: number | null; stars: number | null; background: number | null }>()
  for (const [key, group] of groups) {
    const measured = group.map(l => l.measurement).filter((m): m is FrameMeasurement => m !== null)
    medians.set(key, {
      fwhm: median(measured.map(m => m.fwhm)),
      stars: median(measured.map(m => m.starCount)),
      background: median(measured.map(m => m.background))
    })
  }

  const grades: FrameGrade[] = lights.map(l => {
    const base = { fileId: l.fileId, path: l.path, capturedAt: l.capturedAt, night: night(l), filter: l.filter, measurement: l.measurement, override: l.override, weight: null }
    const m = l.measurement
    const failed: string[] = []
    if (m) {
      const med = medians.get(groupKey(base.night, l.filter)) ?? { fwhm: null, stars: null, background: null }
      if (m.eccentricity !== null && m.eccentricity > limits.maxEccentricity) {
        failed.push(`Eccentricity ${round(m.eccentricity)} is above the limit of ${limits.maxEccentricity} (stars are trailed).`)
      }
      if (m.fwhm !== null && limits.maxFwhmPixels !== null && m.fwhm > limits.maxFwhmPixels) {
        failed.push(`FWHM ${round(m.fwhm, 1)} px is above the fixed limit of ${limits.maxFwhmPixels} px.`)
      }
      if (m.fwhm !== null && med.fwhm !== null && m.fwhm > med.fwhm * limits.maxFwhmRatio) {
        failed.push(`FWHM ${round(m.fwhm, 1)} px is more than ${limits.maxFwhmRatio}× the night's median of ${round(med.fwhm, 1)} px.`)
      }
      if (med.stars !== null && med.stars > 0 && m.starCount < med.stars * limits.minStarRatio) {
        failed.push(`${m.starCount} stars is under ${round(limits.minStarRatio * 100, 0)}% of the night's median of ${Math.round(med.stars)} (cloud or haze).`)
      }
      if (med.background !== null && med.background > 0 && m.background > med.background * limits.maxBackgroundRatio) {
        failed.push(`Background is more than ${limits.maxBackgroundRatio}× the night's median (moon, dawn or cloud).`)
      }
    }
    if (l.override) {
      const reasons = [l.override === 'keep' ? 'Kept by hand.' : 'Rejected by hand.', ...failed]
      return { ...base, verdict: l.override, reasons }
    }
    if (!m) return { ...base, verdict: 'unmeasured', reasons: [l.measureError ? `Not measured: ${l.measureError}` : 'Not measured yet.'] }
    return { ...base, verdict: failed.length > 0 ? 'reject' : 'keep', reasons: failed }
  })

  const bestSnr = Math.max(0, ...grades.filter(g => g.verdict === 'keep' && g.measurement?.snr).map(g => g.measurement?.snr ?? 0))
  for (const g of grades) {
    const snr = g.measurement?.snr ?? null
    if (g.verdict === 'keep' && snr !== null && bestSnr > 0) g.weight = round((snr / bestSnr) ** 2, 3)
  }

  const nights: NightSummary[] = [...groups.entries()]
    .map(([key, group]) => {
      const ids = new Set(group.map(l => l.fileId))
      const mine = grades.filter(g => ids.has(g.fileId))
      const med = medians.get(key) ?? { fwhm: null, stars: null, background: null }
      return {
        night: mine[0].night ?? 'Unknown date',
        filter: mine[0].filter,
        frames: mine.length,
        kept: mine.filter(g => g.verdict !== 'reject').length,
        rejected: mine.filter(g => g.verdict === 'reject').length,
        medianFwhm: med.fwhm,
        medianStars: med.stars,
        medianBackground: med.background
      }
    })
    .sort((a, b) => a.night.localeCompare(b.night) || (a.filter ?? '').localeCompare(b.filter ?? ''))

  return {
    grades,
    nights,
    kept: grades.filter(g => g.verdict === 'keep').length,
    rejected: grades.filter(g => g.verdict === 'reject').length,
    unmeasured: grades.filter(g => g.verdict === 'unmeasured').length
  }
}

/** Paths of the frames to leave out of a stack. Unmeasured frames stay in. */
export function rejectedPaths(report: GradeReport): Set<string> {
  return new Set(report.grades.filter(g => g.verdict === 'reject').map(g => g.path))
}

/** A night's frames in capture order, for its FWHM and star-count trend. */
export function nightTrend(report: GradeReport, night: string, filter: string | null): FrameGrade[] {
  return report.grades
    .filter(g => g.night === night && g.filter === filter)
    .sort((a, b) => (a.capturedAt?.getTime() ?? 0) - (b.capturedAt?.getTime() ?? 0))
}

// ── Export ──────────────────────────────────────────────────────────────

const csvCell = (value: string | number | null) => {
  if (value === null) return ''
  const text = String(value)
  // A leading =, +, - or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(text) && typeof value === 'string' ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export const GRADE_CSV_COLUMNS = [
  'file', 'night', 'filter', 'captured_at', 'verdict', 'override', 'fwhm_px', 'eccentricity', 'stars', 'background', 'noise', 'snr', 'weight', 'reasons'
] as const

/** One row per light with every measurement, the verdict and its reasons. */
export function gradesCsv(report: GradeReport): string {
  const rows = report.grades.map(g => {
    const m = g.measurement
    return [
      g.path, g.night, g.filter, g.capturedAt?.toISOString() ?? null, g.verdict, g.override,
      m?.fwhm === null || m === null ? null : round(m.fwhm, 3),
      m?.eccentricity === null || m === null ? null : round(m.eccentricity, 3),
      m ? m.starCount : null,
      m ? round(m.background, 3) : null,
      m ? round(m.noise, 3) : null,
      m?.snr === null || m === null ? null : round(m.snr, 2),
      g.weight,
      g.reasons.join(' ')
    ].map(csvCell).join(',')
  })
  return [GRADE_CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n'
}
