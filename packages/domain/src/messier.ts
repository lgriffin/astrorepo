import type { ProgressState } from './discovery'
import { DEFAULT_PLANNING_POLICY, type MonthSeason, type PlanningPolicy, type SeasonClosing } from './sky'

/**
 * The Messier mosaic (specs/032-messier-mosaic): all 110 objects as tiles, each with a picture of
 * the user's own image of it, what is still missing, and when each gap can be shot from the site.
 */

/** How many objects the Messier catalogue has. */
export const MESSIER_COUNT = 110

/** Tiles in one row of the mosaic: 110 objects make ten rows of eleven. */
export const MESSIER_COLUMNS = 11

/** The Messier number a designation names ("M31", "M 31", "m031"), or null for anything else or a number outside 1 to 110. */
export function messierNumber(designation: string): number | null {
  const match = /^\s*M\s*0*(\d{1,3})\s*$/i.exec(designation)
  if (!match) return null
  const n = Number(match[1])
  return n >= 1 && n <= MESSIER_COUNT ? n : null
}

/**
 * How far an object has come (MES-002): a finished image; a master or processed image but no
 * finished one; light subs but no stack; or nothing yet, which is a gap.
 */
export type MessierState = 'imaged' | 'stacked' | 'captured' | 'gap'

export const MESSIER_STATES: readonly MessierState[] = ['imaged', 'stacked', 'captured', 'gap']

/** The tile's state from the target's derived progress; null for a target the index knows nothing about. */
export function messierState(progress: ProgressState | null): MessierState {
  switch (progress) {
    case 'final':
      return 'imaged'
    case 'processed':
    case 'stacked':
      return 'stacked'
    case 'capturing':
    case 'enough-data':
      return 'captured'
    default:
      return 'gap'
  }
}

/** An image of an object the tile could show: a finished image from its images folder, or a stacked master. */
export interface PictureCandidate {
  path: string
  kind: 'finished' | 'master'
  /** Three channels, for a master; null when unknown or for a finished image. */
  colour: boolean | null
  modifiedAt: Date | null
}

export type PictureFormat = 'jpeg' | 'png' | 'tiff' | 'fits'

/** The format a file's name says it is, or null for one the mosaic does not draw. */
export function pictureFormat(path: string): PictureFormat | null {
  const ext = /\.([^.\\/]+)$/.exec(path)?.[1]?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg'
  if (ext === 'png') return 'png'
  if (ext === 'tif' || ext === 'tiff') return 'tiff'
  if (ext === 'fit' || ext === 'fits' || ext === 'fts') return 'fits'
  return null
}

/**
 * Where a candidate stands in the order the tile tries them (MES-003): finished JPEG and PNG
 * first (already stretched and coloured by the user's editor), then finished TIFF, then finished
 * FITS, then colour masters, then other masters. Null for a file the mosaic never draws.
 */
function rank(c: PictureCandidate): number | null {
  const format = pictureFormat(c.path)
  if (!format) return null
  if (c.kind === 'master') return format === 'fits' ? (c.colour ? 3 : 4) : null
  return format === 'jpeg' || format === 'png' ? 0 : format === 'tiff' ? 1 : 2
}

/** The candidates the tile tries, in order (MES-003): by format and kind, then newest first, then by path. */
export function orderPictures(candidates: PictureCandidate[]): PictureCandidate[] {
  const time = (c: PictureCandidate) => c.modifiedAt?.getTime() ?? 0
  return candidates
    .map(c => ({ c, r: rank(c) }))
    .filter((x): x is { c: PictureCandidate; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r || time(b.c) - time(a.c) || a.c.path.localeCompare(b.c.path))
    .map(x => x.c)
}

/**
 * When an object can be shot from the site (MES-005): up tonight; up tonight but kept out by a
 * bright moon; in season from a later month; or never high enough in the year ahead.
 */
export type MessierOutlook =
  | {
      kind: 'tonight'
      hours: number
      /** Closest the moon comes while the object is usable, in degrees; null when the moon is down. */
      moonSeparationDeg: number | null
      /** Days until its season closes, when that is within the planning window. */
      closesInDays: number | null
    }
  | { kind: 'moon'; hours: number }
  | {
      kind: 'later'
      /** The first month ahead (YYYY-MM) that offers the minimum usable hours per night. */
      fromMonth: string
      /** The month with the most usable hours per night. */
      bestMonth: string
    }
  | { kind: 'never' }

export interface OutlookInput {
  /** Tonight's usable hours, the moon's closest approach while usable, and whether a bright moon rules the object out; null without a dark window. */
  tonight: { hours: number; moonSeparationDeg: number | null; moonBlocks: boolean } | null
  closing: Pick<SeasonClosing, 'daysLeft'> | null
  /** The coming months, in order, starting with this one. */
  months: Pick<MonthSeason, 'month' | 'hoursPerNight'>[]
}

/** The object's outlook from tonight's sky, its closing season and its months ahead (MES-005). */
export function messierOutlook(input: OutlookInput, policy: PlanningPolicy = DEFAULT_PLANNING_POLICY): MessierOutlook {
  const t = input.tonight
  if (t && t.hours >= policy.minUsableHours) {
    if (t.moonBlocks) return { kind: 'moon', hours: t.hours }
    return { kind: 'tonight', hours: t.hours, moonSeparationDeg: t.moonSeparationDeg, closesInDays: input.closing?.daysLeft ?? null }
  }
  const from = input.months.find(m => m.hoursPerNight >= policy.minUsableHours)
  if (!from) return { kind: 'never' }
  const best = input.months.reduce((b, m) => (m.hoursPerNight > b.hoursPerNight ? m : b), from)
  return { kind: 'later', fromMonth: from.month, bestMonth: best.month }
}

/** Order of outlooks, soonest first: tonight, held back by the moon, later, never. */
const OUTLOOK_ORDER: Record<MessierOutlook['kind'], number> = { tonight: 0, moon: 1, later: 2, never: 3 }

/**
 * Which gap to shoot first: up tonight before the rest, closing seasons soonest first, then most
 * usable hours; then a moon-held object; then the earliest month in season; then by Messier number.
 * An unknown outlook (no site) sorts last.
 */
export function compareOutlooks(a: { number: number; outlook: MessierOutlook | null }, b: { number: number; outlook: MessierOutlook | null }): number {
  const order = (o: MessierOutlook | null) => (o ? OUTLOOK_ORDER[o.kind] : 4)
  const byKind = order(a.outlook) - order(b.outlook)
  if (byKind !== 0) return byKind
  const x = a.outlook
  const y = b.outlook
  if (x?.kind === 'tonight' && y?.kind === 'tonight') {
    // A season that closes beats one that does not; two that close, the sooner first.
    if (x.closesInDays !== y.closesInDays) {
      if (x.closesInDays === null) return 1
      if (y.closesInDays === null) return -1
      return x.closesInDays - y.closesInDays
    }
    if (y.hours !== x.hours) return y.hours - x.hours
  }
  if (x?.kind === 'moon' && y?.kind === 'moon' && y.hours !== x.hours) return y.hours - x.hours
  if (x?.kind === 'later' && y?.kind === 'later' && x.fromMonth !== y.fromMonth) return x.fromMonth.localeCompare(y.fromMonth)
  return a.number - b.number
}

export interface MessierSummary {
  total: number
  imaged: number
  stacked: number
  captured: number
  gaps: number
  /** Objects without a finished image that are up tonight. */
  missingUpTonight: number
}

/** The counts above the mosaic (MES-001). */
export function messierSummary(tiles: { state: MessierState; outlook: MessierOutlook | null }[]): MessierSummary {
  const count = (state: MessierState) => tiles.filter(t => t.state === state).length
  return {
    total: MESSIER_COUNT,
    imaged: count('imaged'),
    stacked: count('stacked'),
    captured: count('captured'),
    gaps: count('gap'),
    missingUpTonight: tiles.filter(t => t.state !== 'imaged' && t.outlook?.kind === 'tonight').length
  }
}

/** The mosaic's filters (MES-006). */
export type MessierFilter = 'all' | 'missing' | 'gaps' | 'tonight'

export const MESSIER_FILTERS: readonly MessierFilter[] = ['all', 'missing', 'gaps', 'tonight']

/** Whether a tile shows under a filter (MES-006). */
export function showsUnder(filter: MessierFilter, tile: { state: MessierState; outlook: MessierOutlook | null }): boolean {
  switch (filter) {
    case 'missing':
      return tile.state !== 'imaged'
    case 'gaps':
      return tile.state === 'gap'
    case 'tonight':
      return tile.state !== 'imaged' && tile.outlook?.kind === 'tonight'
    default:
      return true
  }
}

/** A Messier object with nothing captured yet that is up tonight, for Next actions (MES-008). */
export interface MessierGap {
  number: number
  designation: string
  targetId: string
  targetName: string
  usableHours: number
  moonSeparationDeg: number | null
  closesInDays: number | null
}

/** How many Messier gaps Next actions names (MES-008). */
export const MESSIER_GAPS_IN_NEXT_ACTIONS = 3

/**
 * The gaps worth shooting tonight (MES-008): objects with nothing captured that are up tonight
 * and not held back by the moon, in the order of `compareOutlooks`, at most `limit`.
 */
export function messierGapsTonight(
  tiles: { number: number; designation: string; targetId: string; targetName: string; state: MessierState; outlook: MessierOutlook | null }[],
  limit = MESSIER_GAPS_IN_NEXT_ACTIONS
): MessierGap[] {
  return tiles
    .filter(t => t.state === 'gap' && t.outlook?.kind === 'tonight')
    .sort(compareOutlooks)
    .slice(0, Math.max(0, limit))
    .map(t => {
      const o = t.outlook as Extract<MessierOutlook, { kind: 'tonight' }>
      return {
        number: t.number,
        designation: t.designation,
        targetId: t.targetId,
        targetName: t.targetName,
        usableHours: o.hours,
        moonSeparationDeg: o.moonSeparationDeg,
        closesInDays: o.closesInDays
      }
    })
}
