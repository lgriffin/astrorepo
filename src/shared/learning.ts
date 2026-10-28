/**
 * Learning while you observe (specs/042-learning): how much the app explains, and what a "Why?"
 * shows at each level. Shared with the renderer, which may not reach the core (HEX-002); the
 * knowledge base itself is in packages/domain/src/learning.ts and comes over `learning:library`.
 */

/** Off hides every explanation; short gives the one-line answer; deep (the default) adds the paragraph and the formula. */
export type LearningLevel = 'off' | 'short' | 'deep'

export const LEARNING_LEVELS: readonly LearningLevel[] = ['off', 'short', 'deep']

/** The setting that holds the level. */
export const LEARNING_SETTING_KEY = 'learning_level'

/** A saved level, or 'deep' when nothing (or something unreadable) is saved (LRN-004; Leigh chose deep, 28 October 2026). */
export function parseLearningLevel(raw: string | null | undefined): LearningLevel {
  const wanted = (raw ?? '').trim().toLowerCase()
  return (LEARNING_LEVELS as readonly string[]).includes(wanted) ? (wanted as LearningLevel) : 'deep'
}

/** What one concept shows at a level: nothing when off, the paragraph and formula only when deep. */
export function conceptAtLevel<T extends { short: string; detail: string; formula: string | null }>(
  concept: T,
  level: LearningLevel
): { short: string; detail: string | null; formula: string | null } | null {
  if (level === 'off') return null
  return level === 'deep' ? { short: concept.short, detail: concept.detail, formula: concept.formula } : { short: concept.short, detail: null, formula: null }
}

/** The full Moon's mean width on the sky, in arcminutes (about 31′). */
export const FULL_MOON_ARCMIN = 31

/**
 * An angular size told against the full Moon (LRN-006): "about 6 full Moons across", "about a
 * third of the full Moon". Null for a size that is unknown or not positive.
 */
export function sizeAgainstMoon(arcmin: number | null | undefined): string | null {
  if (arcmin == null || !Number.isFinite(arcmin) || arcmin <= 0) return null
  const moons = arcmin / FULL_MOON_ARCMIN
  if (moons >= 1.5) return `about ${Math.round(moons)} full Moons across`
  if (moons >= 0.75) return 'about as wide as the full Moon'
  const fraction = Math.round(FULL_MOON_ARCMIN / arcmin)
  if (fraction <= 2) return 'about half the width of the full Moon'
  return fraction > 100 ? 'far smaller than the full Moon' : `about 1/${fraction} of the full Moon’s width`
}

/**
 * Warnings that must show at every learning level, even before the knowledge base has loaded or if
 * it never does (LRN-007). The same words as the core's primers; a test keeps the two in step.
 */
export const SAFETY_CAUTIONS: Readonly<Record<string, string>> = {
  solar_object:
    'Never point a telescope, camera or finder at the Sun without a certified solar filter over the front. It can blind you instantly and destroy a camera.'
}

/** The warning for a kind of object, or null. */
export function safetyCaution(kind: string | null | undefined): string | null {
  return kind && Object.hasOwn(SAFETY_CAUTIONS, kind) ? SAFETY_CAUTIONS[kind] : null
}

/**
 * Keeps saves of a setting in the order they were made (LRN-004): each waits for the one before,
 * so a slower earlier save can never land after a later one.
 */
export function makeSaveQueue(save: (value: string) => Promise<void>): (value: string) => Promise<boolean> {
  let last: Promise<unknown> = Promise.resolve()
  return value => {
    const next = last.then(() => save(value)).then(() => true, () => false)
    last = next
    return next
  }
}

/** The most header lines `learning:fits` takes, above the FITS parser's 7,200 cards. */
export const HEADER_LINES_MAX = 8000
/** The longest header value `learning:fits` takes; a number never comes near it. */
export const HEADER_VALUE_MAX = 200

/**
 * The header lines worth explaining (L3): COMMENT, HISTORY and blank cards left out, values cut to
 * HEADER_VALUE_MAX (joined CONTINUE strings can run long) and at most HEADER_LINES_MAX lines, so a
 * long header is still explained rather than refused.
 */
export function headerLinesForLearning(rows: readonly { keyword: string; value: string | null }[]): { keyword: string; value: string | null }[] {
  const lines: { keyword: string; value: string | null }[] = []
  for (const r of rows) {
    const keyword = r.keyword.trim()
    if (keyword === '' || keyword === 'COMMENT' || keyword === 'HISTORY') continue
    lines.push({ keyword: keyword.slice(0, 80), value: r.value == null ? null : r.value.slice(0, HEADER_VALUE_MAX) })
    if (lines.length === HEADER_LINES_MAX) break
  }
  return lines
}


/** Where each idea shows up in your own data, for the Learn page's "See it" link (LRN-024). */
export const CONCEPT_PLACES: Readonly<Record<string, { to: string; label: string }>> = {
  'light-year': { to: '/targets', label: 'The physics card on any target' },
  lookback: { to: '/images', label: 'Back in time, in the gallery' },
  'angular-size': { to: '/targets', label: 'The physics card on any target' },
  'apparent-magnitude': { to: '/targets', label: 'The physics card on any target' },
  'surface-brightness': { to: '/targets', label: 'The physics card on any target' },
  'emission-lines': { to: '/targets', label: 'What your filters catch, on a target’s Stack and process tab' },
  'h-alpha': { to: '/targets', label: 'What your filters catch, on a target’s Stack and process tab' },
  oiii: { to: '/targets', label: 'What your filters catch, on a target’s Stack and process tab' },
  sii: { to: '/targets', label: 'What your filters catch, on a target’s Stack and process tab' },
  'hubble-palette': { to: '/targets', label: 'What your filters catch, on a target’s Stack and process tab' },
  'star-colour': { to: '/targets', label: 'The physics card on any target' },
  scattering: { to: '/targets', label: 'The physics card on any target' },
  'dust-extinction': { to: '/targets', label: 'The physics card on any target' },
  'stellar-evolution': { to: '/targets', label: 'The physics card on any target' },
  nucleosynthesis: { to: '/targets', label: 'The physics card on any target' },
  'celestial-sphere': { to: '/mosaics', label: 'Any mosaic’s grid' },
  'tangent-plane': { to: '/mosaics', label: 'Any mosaic’s grid' },
  'position-angle': { to: '/mosaics', label: 'Any mosaic’s grid' },
  seasons: { to: '/sky-planner', label: 'The seasons in the Sky planner' },
  twilight: { to: '/dashboard', label: 'Tonight, on Home' },
  'moon-phase': { to: '/dashboard', label: 'Tonight, on Home' },
  moonlight: { to: '/dashboard', label: 'Tonight, on Home' },
  airmass: { to: '/dashboard', label: 'Tonight, on Home' },
  seeing: { to: '/insights', label: 'Seeing over time, in Insights' },
  'solar-system-motion': { to: '/targets', label: 'The physics card on a planet, comet or asteroid' },
  'messier-catalogue': { to: '/messier', label: 'The Messier mosaic' },
  'fits-header': { to: '/fits-analyzer', label: 'Any file in FITS files' },
  bayer: { to: '/fits-analyzer', label: 'Any file in FITS files' },
  'image-scale': { to: '/fits-analyzer', label: 'Your setup, on any file in FITS files' },
  sampling: { to: '/fits-analyzer', label: 'Your setup, on any file in FITS files' },
  wcs: { to: '/fits-analyzer', label: 'A plate-solved file in FITS files' },
  noise: { to: '/fits-analyzer', label: 'Any file in FITS files' },
  'dark-current': { to: '/calibration', label: 'Your darks, in Calibration' },
  stacking: { to: '/stacking', label: 'Your stacks' },
  calibration: { to: '/calibration', label: 'Your calibration frames' }
}

/** Where the trail of opened ideas is kept, in this browser only (LRN-025). */
export const TRAIL_KEY = 'astrorepo.learning.trail'

/** The most ideas the trail remembers. */
export const TRAIL_MAX = 30

/** A saved trail, or an empty one when nothing (or something unreadable) is saved. */
export function parseTrail(raw: string | null | undefined): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string'))].slice(0, TRAIL_MAX) : []
  } catch {
    return []
  }
}

/** The trail after opening an idea: that idea first, each idea once, the oldest dropped past the limit. No counts, no score. */
export function withOpened(trail: readonly string[], id: string): string[] {
  return [id, ...trail.filter(t => t !== id)].slice(0, TRAIL_MAX)
}
