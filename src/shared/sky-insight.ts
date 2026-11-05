/**
 * Tonight's sky on Home and Your sky in Settings (specs/043-sky-insight). The renderer may not
 * import the domain (HEX-002), so the Bortle names are repeated here; a test keeps them equal.
 */

/** Settings keys for the user's sky quality, the same as the domain's SKY_QUALITY_KEYS. */
export const SKY_QUALITY_SETTING = { bortle: 'site_bortle', sqm: 'site_sqm' } as const

/** The Bortle classes as Wikipedia names them, darkest first (NSI-003). */
export const BORTLE_NAMES: readonly string[] = [
  'Excellent dark-sky site',
  'Typical truly dark site',
  'Rural sky',
  'Rural/suburban transition',
  'Suburban sky',
  'Bright suburban sky',
  'Suburban/urban transition',
  'City sky',
  'Inner-city sky'
]

/** Where tonight's dark and the Moon sit on a noon-to-noon strip, as shares of its width (0 to 1). */
export interface NightStrip {
  /** Local noon the strip starts at. */
  from: Date
  dark: { left: number; width: number }
  /** Each stretch with the Moon up. */
  moon: { left: number; width: number }[]
}

/**
 * The strip from the local noon before dark to the noon after (NSI-001, NSI-002): the dark window,
 * and the stretches of it with the Moon up. Times outside the strip are clamped to its ends.
 */
export function nightStrip(darkStart: string, darkEnd: string, moon: readonly { start: string; end: string }[]): NightStrip {
  const start = new Date(darkStart)
  const from = new Date(start)
  from.setHours(12, 0, 0, 0)
  if (from.getTime() > start.getTime()) from.setDate(from.getDate() - 1)
  // The next local noon by the calendar: 23 or 25 hours on when the clocks change.
  const to = new Date(from)
  to.setDate(to.getDate() + 1)
  const length = to.getTime() - from.getTime()
  const at = (iso: string) => Math.min(1, Math.max(0, (Date.parse(iso) - from.getTime()) / length))
  const span = (a: string, b: string) => ({ left: at(a), width: Math.max(0, at(b) - at(a)) })
  return { from, dark: span(darkStart, darkEnd), moon: moon.map(m => span(m.start, m.end)) }
}

/** What the Settings field says is wrong with a Sky Quality Meter reading, or null when it reads (NSI-004). */
export function sqmProblem(text: string): string | null {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 16 && n <= 22.5 ? null : 'A reading is between 16 and 22.5 mag/arcsec².'
}
