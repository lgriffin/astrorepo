/**
 * Why tonight looks like this (specs/042-learning, L4): how far the Sun sinks below your horizon
 * tonight, worked out from your latitude and the date, and so how dark the night can get. The Sun's
 * declination comes from the usual cosine approximation, good to about a degree, which the
 * Wikipedia article "Position of the Sun" gives.
 */

/** The tilt of Earth's axis, in degrees. */
export const AXIAL_TILT_DEG = 23.44

/** How far below the horizon the Sun must be for each stage of twilight to end, in degrees. */
export const TWILIGHT_DEPTHS = { civil: 6, nautical: 12, astronomical: 18 } as const

export type NightDarkness = 'full' | 'nautical' | 'civil' | 'none'

const DAY_MS = 86_400_000

/** The day of the year, 1 for 1 January, from a "YYYY-MM-DD" date. */
export function dayOfYear(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / DAY_MS) + 1
}

/** The Sun's declination on a day of the year, in degrees: −23.44° × cos(360° ÷ 365 × (day + 10)). */
export function solarDeclination(day: number): number {
  return -AXIAL_TILT_DEG * Math.cos(((2 * Math.PI) / 365) * (day + 10))
}

/**
 * How far below the horizon the Sun is at its lowest, around local midnight, in degrees: 90° less
 * the gap between the latitude and the Sun's declination with its sign flipped. Negative when the
 * Sun stays up all night (the midnight sun).
 */
export function lowestSunDepth(latitudeDeg: number, day: number): number {
  return 90 - Math.abs(latitudeDeg + solarDeclination(day))
}

/** How dark a night gets when the Sun sinks this far below the horizon. */
export function darknessAt(depthDeg: number): NightDarkness {
  if (depthDeg >= TWILIGHT_DEPTHS.astronomical) return 'full'
  if (depthDeg >= TWILIGHT_DEPTHS.nautical) return 'nautical'
  if (depthDeg >= TWILIGHT_DEPTHS.civil) return 'civil'
  return 'none'
}

/** True for a real calendar date written "YYYY-MM-DD" (no 31 February). */
export function isCalendarDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

/**
 * How dark the forward plan, with its full ephemeris, found tonight: fully dark, nautical only, or
 * short of nautical darkness (no dark window).
 */
export type PlannedDarkness = 'full' | 'nautical' | 'short'

/** The depths each planned darkness allows: [at least, below]. */
const PLANNED_BAND: Record<PlannedDarkness, [number, number]> = {
  full: [TWILIGHT_DEPTHS.astronomical, Infinity],
  nautical: [TWILIGHT_DEPTHS.nautical, TWILIGHT_DEPTHS.astronomical],
  short: [-Infinity, TWILIGHT_DEPTHS.nautical]
}

/** "2026-10-28" moved on by some days. */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10)
}

/** What tonight's darkness is, and why (LRN-015, LRN-016). */
export interface TonightSky {
  latitudeDeg: number
  night: string
  /** How far below the horizon the Sun gets at its lowest tonight, in degrees. */
  lowestSunDeg: number
  darkness: NightDarkness
  /** For a night short of full darkness, the first night within a year that has it again. */
  fullDarkReturns: string | null
  /** For a fully dark night, the first night within a year that is not, when there is one. */
  fullDarkEnds: string | null
}

/**
 * Tonight's darkness at a latitude, and when that changes (searching up to a year ahead). When the
 * forward plan has already judged tonight with its fuller Sun model, its judgement wins: the
 * approximate depth is held inside that band, so the page never says two things about one night.
 */
export function tonightSky(latitudeDeg: number, night: string, planned?: PlannedDarkness): TonightSky {
  const depth = (date: string): number => lowestSunDepth(latitudeDeg, dayOfYear(date))
  const band = planned ? PLANNED_BAND[planned] : null
  const lowest = band ? Math.min(Math.max(depth(night), band[0]), band[1] - 0.1) : depth(night)
  const darkness = darknessAt(lowest)
  const full = darkness === 'full'
  let change: string | null = null
  for (let i = 1; i <= 366 && change === null; i++) {
    const date = addDays(night, i)
    if ((depth(date) >= TWILIGHT_DEPTHS.astronomical) !== full) change = date
  }
  return {
    latitudeDeg,
    night,
    lowestSunDeg: lowest,
    darkness,
    fullDarkReturns: full ? null : change,
    fullDarkEnds: full ? change : null
  }
}
