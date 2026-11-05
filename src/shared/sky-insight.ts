/**
 * Tonight's sky on Home and Your sky in Settings (specs/043-sky-insight). The renderer may not
 * import the domain (HEX-002), so the Bortle names are repeated here; a test keeps them equal.
 */

/** Settings keys for the user's sky quality, the same as the domain's SKY_QUALITY_KEYS. */
export const SKY_QUALITY_SETTING = { bortle: 'site_bortle', sqm: 'site_sqm' } as const

/** The Bortle classes as Wikipedia names them, darkest first (SKY-003). */
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
  moon: { left: number; width: number } | null
}

const DAY_MS = 24 * 3600 * 1000

/**
 * The strip from the local noon before dark to the noon after (SKY-001, SKY-002): the dark window,
 * and the stretch of it with the Moon up. Times outside the strip are clamped to its ends.
 */
export function nightStrip(darkStart: string, darkEnd: string, moonFrom: string | null, moonTo: string | null): NightStrip {
  const start = new Date(darkStart)
  const from = new Date(start)
  from.setHours(12, 0, 0, 0)
  if (from.getTime() > start.getTime()) from.setDate(from.getDate() - 1)
  const at = (iso: string) => Math.min(1, Math.max(0, (Date.parse(iso) - from.getTime()) / DAY_MS))
  const span = (a: string, b: string) => ({ left: at(a), width: Math.max(0, at(b) - at(a)) })
  return { from, dark: span(darkStart, darkEnd), moon: moonFrom && moonTo ? span(moonFrom, moonTo) : null }
}

/** What the Settings field says is wrong with a Sky Quality Meter reading, or null when it reads (SKY-004). */
export function sqmProblem(text: string): string | null {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 16 && n <= 22.5 ? null : 'A reading is between 16 and 22.5 mag/arcsec².'
}
