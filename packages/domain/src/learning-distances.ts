/**
 * Your object in numbers (specs/042-learning, L2): how far a Messier object is, how big it really
 * is, and how long its light has been travelling, worked out from the catalogue's angular size and
 * a published distance. Distances are kept as the range the source gives, in thousands of light
 * years, because many are uncertain; the middle of the range is what the page leads with.
 */

/** One object's distance as published: a range in thousands of light years, marked when only approximate. */
export interface DistanceRange {
  lowKly: number
  highKly: number
  approx?: boolean
}

/**
 * The Messier objects' distances, as listed in Wikipedia's "Messier object" table (read 28 October
 * 2026, source id wiki-messier-object). M24, M58 and M73 are given there only approximately.
 */
export const MESSIER_DISTANCES: Readonly<Record<string, DistanceRange>> = {
  M1: { lowKly: 4.9, highKly: 8.1 },
  M2: { lowKly: 33, highKly: 33 },
  M3: { lowKly: 33.9, highKly: 33.9 },
  M4: { lowKly: 7.2, highKly: 7.2 },
  M5: { lowKly: 24.5, highKly: 24.5 },
  M6: { lowKly: 1.6, highKly: 1.6 },
  M7: { lowKly: 0.65, highKly: 1.31 },
  M8: { lowKly: 4.1, highKly: 4.1 },
  M9: { lowKly: 25.8, highKly: 25.8 },
  M10: { lowKly: 14.3, highKly: 14.3 },
  M11: { lowKly: 6.2, highKly: 6.2 },
  M12: { lowKly: 15.7, highKly: 15.7 },
  M13: { lowKly: 22.2, highKly: 22.2 },
  M14: { lowKly: 30.3, highKly: 30.3 },
  M15: { lowKly: 33, highKly: 33 },
  M16: { lowKly: 7, highKly: 7 },
  M17: { lowKly: 5, highKly: 6 },
  M18: { lowKly: 4.9, highKly: 4.9 },
  M19: { lowKly: 28.7, highKly: 28.7 },
  M20: { lowKly: 5.2, highKly: 5.2 },
  M21: { lowKly: 4.25, highKly: 4.25 },
  M22: { lowKly: 9.6, highKly: 11.6 },
  M23: { lowKly: 2.15, highKly: 2.15 },
  M24: { lowKly: 10, highKly: 10, approx: true },
  M25: { lowKly: 2, highKly: 2 },
  M26: { lowKly: 5, highKly: 5 },
  M27: { lowKly: 1.148, highKly: 1.52 },
  M28: { lowKly: 17.9, highKly: 17.9 },
  M29: { lowKly: 7.2, highKly: 7.2 },
  M30: { lowKly: 27.8, highKly: 31 },
  M31: { lowKly: 2430, highKly: 2650 },
  M32: { lowKly: 2410, highKly: 2570 },
  M33: { lowKly: 2380, highKly: 3070 },
  M34: { lowKly: 1.5, highKly: 1.5 },
  M35: { lowKly: 2.8, highKly: 2.8 },
  M36: { lowKly: 4.1, highKly: 4.1 },
  M37: { lowKly: 4.511, highKly: 4.511 },
  M38: { lowKly: 4.2, highKly: 4.2 },
  M39: { lowKly: 0.8244, highKly: 0.8244 },
  M40: { lowKly: 0.51, highKly: 0.51 },
  M41: { lowKly: 2.3, highKly: 2.3 },
  M42: { lowKly: 1.324, highKly: 1.364 },
  M43: { lowKly: 1.3, highKly: 1.3 },
  M44: { lowKly: 0.577, highKly: 0.577 },
  M45: { lowKly: 0.39, highKly: 0.46 },
  M46: { lowKly: 5.4, highKly: 5.4 },
  M47: { lowKly: 1.6, highKly: 1.6 },
  M48: { lowKly: 1.5, highKly: 1.5 },
  M49: { lowKly: 53600, highKly: 58200 },
  M50: { lowKly: 3.2, highKly: 3.2 },
  M51: { lowKly: 19000, highKly: 27000 },
  M52: { lowKly: 5, highKly: 5 },
  M53: { lowKly: 58, highKly: 58 },
  M54: { lowKly: 87.4, highKly: 87.4 },
  M55: { lowKly: 17.6, highKly: 17.6 },
  M56: { lowKly: 32.9, highKly: 32.9 },
  M57: { lowKly: 1.6, highKly: 3.8 },
  M58: { lowKly: 63000, highKly: 63000, approx: true },
  M59: { lowKly: 55000, highKly: 65000 },
  M60: { lowKly: 51000, highKly: 59000 },
  M61: { lowKly: 50200, highKly: 54800 },
  M62: { lowKly: 22.2, highKly: 22.2 },
  M63: { lowKly: 37000, highKly: 37000 },
  M64: { lowKly: 22000, highKly: 26000 },
  M65: { lowKly: 41000, highKly: 42000 },
  M66: { lowKly: 31000, highKly: 41000 },
  M67: { lowKly: 2.61, highKly: 2.93 },
  M68: { lowKly: 33.6, highKly: 33.6 },
  M69: { lowKly: 29.7, highKly: 29.7 },
  M70: { lowKly: 29.4, highKly: 29.4 },
  M71: { lowKly: 13, highKly: 13 },
  M72: { lowKly: 53.4, highKly: 55.74 },
  M73: { lowKly: 2.5, highKly: 2.5, approx: true },
  M74: { lowKly: 24000, highKly: 36000 },
  M75: { lowKly: 67.5, highKly: 67.5 },
  M76: { lowKly: 2.5, highKly: 2.5 },
  M77: { lowKly: 47000, highKly: 47000 },
  M78: { lowKly: 1.6, highKly: 1.6 },
  M79: { lowKly: 41, highKly: 41 },
  M80: { lowKly: 32.6, highKly: 32.6 },
  M81: { lowKly: 11400, highKly: 12200 },
  M82: { lowKly: 10700, highKly: 12300 },
  M83: { lowKly: 14700, highKly: 14700 },
  M84: { lowKly: 57000, highKly: 63000 },
  M85: { lowKly: 56000, highKly: 64000 },
  M86: { lowKly: 49000, highKly: 55000 },
  M87: { lowKly: 51870, highKly: 55130 },
  M88: { lowKly: 39000, highKly: 56000 },
  M89: { lowKly: 47000, highKly: 53000 },
  M90: { lowKly: 55900, highKly: 61500 },
  M91: { lowKly: 47000, highKly: 79000 },
  M92: { lowKly: 26.7, highKly: 26.7 },
  M93: { lowKly: 3.6, highKly: 3.6 },
  M94: { lowKly: 14700, highKly: 17300 },
  M95: { lowKly: 31200, highKly: 34000 },
  M96: { lowKly: 28000, highKly: 34000 },
  M97: { lowKly: 2.03, highKly: 2.03 },
  M98: { lowKly: 44400, highKly: 44400 },
  M99: { lowKly: 44700, highKly: 55700 },
  M100: { lowKly: 55000, highKly: 55000 },
  M101: { lowKly: 19100, highKly: 22400 },
  M102: { lowKly: 50000, highKly: 50000 },
  M103: { lowKly: 10, highKly: 10 },
  M104: { lowKly: 28700, highKly: 30900 },
  M105: { lowKly: 30400, highKly: 33600 },
  M106: { lowKly: 22200, highKly: 25200 },
  M107: { lowKly: 20.9, highKly: 20.9 },
  M108: { lowKly: 46000, highKly: 46000 },
  M109: { lowKly: 59500, highKly: 107500 },
  M110: { lowKly: 2600, highKly: 2780 },
}

/** The source every distance above comes from. */
export const DISTANCE_SOURCE = 'wiki-messier-object'

/** An event in the past to set a travel time against, with where the date comes from. */
export interface Milestone {
  /** How long ago, in years. */
  yearsAgo: number
  /** What had not happened yet when light older than this set out. */
  event: string
  source: string
}

/** Oldest first; dates are the round figures the sources give. */
export const MILESTONES: readonly Milestone[] = [
  { yearsAgo: 66_000_000, event: 'the dinosaurs died out', source: 'wiki-kpg-extinction' },
  { yearsAgo: 2_600_000, event: 'the first stone tools were made', source: 'wiki-oldowan' },
  { yearsAgo: 300_000, event: 'our species, Homo sapiens, appeared', source: 'wiki-homo-sapiens' },
  { yearsAgo: 12_000, event: 'farming began', source: 'wiki-neolithic-revolution' },
  { yearsAgo: 5_200, event: 'writing was invented', source: 'wiki-history-of-writing' }
]

/** A target's catalogue names reduced to a key: "M 31", "m31" and "M31" are all M31. */
export function designationKey(name: string): string {
  return name.replace(/\s+/g, '').toUpperCase()
}

/** The first of a target's names that has a published distance, with that distance. */
export function distanceFor(names: readonly string[]): { designation: string; range: DistanceRange } | null {
  for (const name of names) {
    const key = designationKey(name)
    if (Object.hasOwn(MESSIER_DISTANCES, key)) return { designation: key, range: MESSIER_DISTANCES[key] }
  }
  return null
}

/** Arcminutes in one radian: true size = distance × arcminutes ÷ this. */
export const ARCMIN_PER_RADIAN = (180 * 60) / Math.PI

/** The true width of something this many arcminutes across at this distance, in the same unit as the distance. */
export function trueSize(distance: number, arcmin: number): number {
  return (distance * arcmin) / ARCMIN_PER_RADIAN
}

/**
 * When light that has travelled this many years set out (LRN-010): a calendar year while that is
 * within the last 5,200 years, otherwise the earliest milestone it is older than.
 */
export function lookback(travelYears: number, thisYear: number): { text: string; source: string | null } {
  const left = Math.round(thisYear - travelYears)
  const older = MILESTONES.filter(m => travelYears >= m.yearsAgo)
  if (older.length === 0) {
    const year = left > 0 ? `around the year ${left}` : `around ${1 - left} BC`
    return { text: `It set out ${year}.`, source: null }
  }
  // Oldest first, so the first milestone the light is older than is the most striking one.
  const m = older[0]
  return { text: `It set out before ${m.event}, which was about ${m.yearsAgo.toLocaleString('en-GB')} years ago.`, source: m.source }
}

/** What the page shows about one object in numbers. */
export interface ObjectNumbers {
  designation: string
  /** Light years: the middle of the range, and its ends. */
  distanceLy: number
  lowLy: number
  highLy: number
  approx: boolean
  /** Years the light has been on its way: the same number as the distance in light years. */
  travelYears: number
  /** True width in light years, when the catalogue gives an angular size. */
  sizeLy: number | null
  lookback: { text: string; source: string | null }
  sources: string[]
}

/** An object's distance, true size and light-travel time, or null when no published distance is held for it. */
export function objectNumbers(input: { names: readonly string[]; angularSizeArcmin: number | null; thisYear: number }): ObjectNumbers | null {
  const found = distanceFor(input.names)
  if (!found) return null
  const lowLy = found.range.lowKly * 1000
  const highLy = found.range.highKly * 1000
  const distanceLy = (lowLy + highLy) / 2
  const size = input.angularSizeArcmin != null && input.angularSizeArcmin > 0 ? trueSize(distanceLy, input.angularSizeArcmin) : null
  const back = lookback(distanceLy, input.thisYear)
  return {
    designation: found.designation,
    distanceLy,
    lowLy,
    highLy,
    approx: found.range.approx === true,
    travelYears: distanceLy,
    sizeLy: size,
    lookback: back,
    sources: back.source ? [DISTANCE_SOURCE, back.source] : [DISTANCE_SOURCE]
  }
}

/**
 * A count of light years in words, to two significant figures: "1,300", "25,000", "2.5 million".
 */
export function lightYearsText(ly: number): string {
  const round2 = (n: number): number => Number(n.toPrecision(2))
  if (ly >= 1e9) return `${round2(ly / 1e9)} billion`
  if (ly >= 1e6) return `${round2(ly / 1e6)} million`
  return round2(ly).toLocaleString('en-GB')
}
