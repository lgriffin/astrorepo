/**
 * Learning while you observe (specs/042-learning): how much the app explains, and what a "Why?"
 * shows at each level. Shared with the renderer, which may not reach the core (HEX-002); the
 * knowledge base itself is in packages/domain/src/learning.ts and comes over `learning:library`.
 */

/** Off hides every explanation; short gives the one-line answer; deep adds the paragraph and the formula. */
export type LearningLevel = 'off' | 'short' | 'deep'

export const LEARNING_LEVELS: readonly LearningLevel[] = ['off', 'short', 'deep']

/** The setting that holds the level. */
export const LEARNING_SETTING_KEY = 'learning_level'

/** A saved level, or 'short' when nothing (or something unreadable) is saved (LRN-004). */
export function parseLearningLevel(raw: string | null | undefined): LearningLevel {
  const wanted = (raw ?? '').trim().toLowerCase()
  return (LEARNING_LEVELS as readonly string[]).includes(wanted) ? (wanted as LearningLevel) : 'short'
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
