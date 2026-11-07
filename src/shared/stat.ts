/**
 * How a total reads on a tile (specs/046-everyday-ux, U3). A zero is a fact, not a warning: it is
 * drawn muted, never in the accent colour, so an empty library does not look like a red alert.
 */

/** Whether a tile's value says nothing yet: 0, 0.0, 0s, 0 h and the like. */
export function isZeroStat(value: string | number): boolean {
  if (typeof value === 'number') return value === 0
  return /^\s*0+(?:[.,]0+)?\s*[a-z]*\s*$/i.test(value)
}

/** The tone a tile's value is drawn in (EUX-009). */
export function statTone(value: string | number, accent = false): 'muted' | 'accent' | 'plain' {
  if (isZeroStat(value)) return 'muted'
  return accent ? 'accent' : 'plain'
}
