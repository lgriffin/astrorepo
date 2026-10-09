/**
 * Mono cameras behind a filter wheel (specs/026-other-rigs): one stack per filter, flats checked
 * per filter, and the filter to capture tonight. Siril's mono script stacks whatever is in its
 * folders, so each filter gets a work folder of its own holding its lights, its flats and the
 * shared darks and biases. Pure rules.
 */

import type { SirilFolder } from './ingest'
import { LUMINANCE, laggingFilter, type ChannelGap, type FilterTotal } from './stacking-advice'

export type FilterFamily = 'narrowband' | 'broadband'

const NARROWBAND = /^(h[\s-]?a(lpha)?|h[\s-]?alpha|oiii|o[\s-]?iii|o3|sii|s[\s-]?ii|s2|nii|n[\s-]?ii|h[\s-]?b(eta)?)$/i
const BROADBAND = /^(l|lum|luminance|clear|c|r|red|g|green|b|blue)$/i

/**
 * Whether a filter's name is a narrowband line or a broadband colour, with any bandwidth dropped
 * ("Ha 7nm" is Ha). Dual-band, light-pollution and IR-cut filters ("L-eXtreme", "LP", "IRCUT") are neither,
 * so a one-shot-colour scope's filter never starts filter planning.
 */
export function filterFamily(name: string | null | undefined): FilterFamily | null {
  const word = (name ?? '').replace(/\(.*?\)/g, '').replace(/[\s_-]*\d+(\.\d+)?\s*nm\s*$/i, '').trim()
  if (NARROWBAND.test(word)) return 'narrowband'
  if (BROADBAND.test(word)) return 'broadband'
  return null
}

/** Two FILTER values name the same filter: the same text, ignoring case and spaces at the ends. */
export function sameFilter(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a?.trim().toLowerCase()
  return !!x && x === b?.trim().toLowerCase()
}

/** A folder name for a filter that is safe on every disk: letters, digits, dashes and underscores. */
export function filterFolderName(filter: string): string {
  const safe = filter.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return safe || 'unnamed'
}

/** A short tag that stays the same for a filter's name, for telling apart names that make one folder name. */
function filterTag(filter: string): string {
  // FNV-1a over the name as filters are matched: case and the spaces at the ends do not count.
  let hash = 0x811c9dc5
  for (const ch of filter.trim().toLowerCase()) hash = Math.imul(hash ^ (ch.codePointAt(0) as number), 0x01000193) >>> 0
  return hash.toString(36).padStart(7, '0')
}

/**
 * The work folder of one filter's stack, inside the target's work folder, spelt as the work folder
 * is. `folderName` is the planned one (FilterStack.folderName), so two filters whose names make the
 * same folder name ("S II" and "S.II") never share a folder.
 */
export function filterWorkDir(workDir: string, folderName: string): string {
  const sep = workDir.includes('\\') && !workDir.includes('/') ? '\\' : '/'
  return `${workDir.replace(/[\\/]+$/, '')}${sep}filters${sep}${filterFolderName(folderName)}`
}

export interface FilterFrame {
  folder: SirilFolder
  filter: string | null
}

/** One filter's frames: its lights and flats, with every dark and bias, which a filter does not change. */
export function framesForFilter<T extends FilterFrame>(frames: T[], filter: string): T[] {
  return frames.filter(f => f.folder === 'darks' || f.folder === 'biases' || sameFilter(f.filter, filter))
}

export interface FilterStack {
  filter: string
  folderName: string
  lights: number
  flats: number
}

export interface FilterStackPlan {
  /** Filters in the order of their names, each with its lights and its own flats. */
  filters: FilterStack[]
  darks: number
  biases: number
  /** Lights with no FILTER, which no filter's stack takes. */
  unfilteredLights: number
  /** Flats with no FILTER, which no filter's stack takes. */
  unfilteredFlats: number
  /** Filters with lights and no flats of their own. */
  flatsMissing: string[]
}

/**
 * One stack per filter, when a mono camera's lights carry two filters or more; null otherwise, so
 * a one-filter or colour target keeps its single stack.
 */
export function planFilterStacks(frames: FilterFrame[]): FilterStackPlan | null {
  const byFilter = new Map<string, FilterStack>()
  let unfilteredLights = 0
  let unfilteredFlats = 0
  for (const f of frames.filter(f => f.folder === 'lights')) {
    const name = f.filter?.trim()
    if (!name) {
      unfilteredLights++
      continue
    }
    const key = name.toLowerCase()
    const entry = byFilter.get(key) ?? { filter: name, folderName: filterFolderName(name), lights: 0, flats: 0 }
    entry.lights++
    byFilter.set(key, entry)
  }
  if (byFilter.size < 2) return null
  for (const f of frames.filter(f => f.folder === 'flats')) {
    const entry = byFilter.get(f.filter?.trim().toLowerCase() ?? '')
    if (entry) entry.flats++
    else if (!f.filter?.trim()) unfilteredFlats++
  }
  const filters = [...byFilter.values()].sort((a, b) => a.filter.localeCompare(b.filter))
  // Folder names are matched without case, as Windows does; filters that would share one each get a tag.
  const shared = (f: FilterStack) => filters.filter(o => o.folderName.toLowerCase() === f.folderName.toLowerCase()).length > 1
  for (const f of filters.filter(shared)) f.folderName = `${f.folderName}_${filterTag(f.filter)}`
  return {
    filters,
    darks: frames.filter(f => f.folder === 'darks').length,
    biases: frames.filter(f => f.folder === 'biases').length,
    unfilteredLights,
    unfilteredFlats,
    flatsMissing: filters.filter(f => f.flats === 0).map(f => f.filter)
  }
}

export interface FilterSuggestion {
  filter: string
  family: FilterFamily
  /** The moon is bright tonight, so narrowband was wanted. */
  brightMoon: boolean
  /** The target has a filter of the family the moon calls for. */
  suitsMoon: boolean
  haveSec: number
  /** Set when the filter lags the others in its family (ADV-010). */
  lag: ChannelGap | null
}

/**
 * The filter to capture tonight on a target shot through a filter wheel: narrowband while the
 * moon is bright, broadband while it is dark, and within that the channel that lags (the channel
 * balance of spec 020), else the least captured. With no filter of the family the moon calls for,
 * the target's other filters are used. Null unless the target has two filters the app can name, so
 * a one-shot-colour scope's light-pollution filter never gets a suggestion.
 *
 * `totals` should include luminance (filterTotals with `withLuminance`): it is a broadband choice
 * on a dark night, though never a lagging channel.
 */
export function suggestFilter(totals: FilterTotal[], brightMoon: boolean): FilterSuggestion | null {
  const known = totals.flatMap(t => {
    const family = filterFamily(t.filter)
    return family ? [{ ...t, family }] : []
  })
  if (known.length < 2) return null
  const want: FilterFamily = brightMoon ? 'narrowband' : 'broadband'
  const wanted = known.filter(t => t.family === want)
  const candidates = wanted.length > 0 ? wanted : known
  const lag = laggingFilter(candidates.filter(t => !LUMINANCE.test(t.filter.trim())))
  const pick = lag
    ? candidates.find(t => t.filter === lag.filter)
    : [...candidates].sort((a, b) => a.sec - b.sec || a.filter.localeCompare(b.filter))[0]
  if (!pick) return null
  return { filter: pick.filter, family: pick.family, brightMoon, suitsMoon: wanted.length > 0, haveSec: pick.sec, lag }
}
