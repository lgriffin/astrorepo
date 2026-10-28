/**
 * What your filters catch (specs/042-learning, L5): the emission lines a narrowband or dual-band
 * filter passes, with their wavelengths and the atoms that make them, and what a broadband filter
 * does instead. Filters are recognised by the names capture software writes in FILTER.
 */

/** One emission line. */
export interface EmissionLine {
  id: 'ha' | 'hb' | 'oiii' | 'sii' | 'nii'
  /** "Hydrogen alpha (Hα)" */
  name: string
  /** The line's wavelength in nanometres (the stronger line of a pair). */
  nm: number
  /** Where it comes from, in one phrase. */
  origin: string
  /** The colour it looks to the eye. */
  colour: string
  concept: string
  sources: string[]
}

export const EMISSION_LINES: Readonly<Record<EmissionLine['id'], EmissionLine>> = {
  ha: { id: 'ha', name: 'Hydrogen alpha (Hα)', nm: 656.3, origin: 'hydrogen whose electron drops from the third level to the second', colour: 'deep red', concept: 'h-alpha', sources: ['wiki-h-alpha', 'wiki-balmer'] },
  hb: { id: 'hb', name: 'Hydrogen beta (Hβ)', nm: 486.1, origin: 'hydrogen whose electron drops from the fourth level to the second', colour: 'blue-green', concept: 'h-alpha', sources: ['wiki-balmer'] },
  oiii: { id: 'oiii', name: 'Oxygen III (O III)', nm: 500.7, origin: 'oxygen missing two electrons, in hot, very thin gas', colour: 'teal', concept: 'oiii', sources: ['wiki-oiii'] },
  sii: { id: 'sii', name: 'Sulphur II (S II)', nm: 671.6, origin: 'sulphur missing one electron, often at the edges of nebulae and in shock fronts', colour: 'deep red, just past Hα', concept: 'sii', sources: ['wiki-forbidden', 'wiki-emission-nebula'] },
  nii: { id: 'nii', name: 'Nitrogen II (N II)', nm: 658.4, origin: 'nitrogen missing one electron', colour: 'deep red, beside Hα', concept: 'emission-lines', sources: ['wiki-forbidden', 'wiki-emission-nebula'] }
}

export type FilterKind = 'narrowband' | 'dual-band' | 'luminance' | 'colour' | 'uv-ir-cut' | 'light-pollution' | 'unknown'

/** What one filter does to the light. */
export interface FilterLight {
  /** The filter as the frames name it. */
  filter: string
  kind: FilterKind
  /** The emission lines it passes, for a narrowband or dual-band filter. */
  lines: EmissionLine[]
  /** What it passes, in one sentence. */
  passes: string
  concept: string | null
}

const BROADBAND: Record<'L' | 'R' | 'G' | 'B', string> = {
  L: 'All visible light, roughly 400 to 700 nm: the luminance that carries most of the detail.',
  R: 'Red light, roughly 600 to 700 nm, which includes the hydrogen-alpha line.',
  G: 'Green light, roughly 500 to 600 nm, which includes the O III line.',
  B: 'Blue light, roughly 400 to 500 nm, where hot young stars and reflection nebulae shine most.'
}

/** A filter name squeezed to letters and digits, upper case: "H-alpha 7nm" → "HALPHA7NM". */
const squeeze = (name: string): string => name.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Narrowband names, squeezed, matched at the start (so "Ha7nm" and "OIII 6.5nm" are found). */
const NARROW: [RegExp, EmissionLine['id']][] = [
  [/^(HA|HALPHA)(\d|NM|$)/, 'ha'],
  [/^(HB|HBETA)(\d|NM|$)/, 'hb'],
  [/^(OIII|O3)(\d|NM|$)/, 'oiii'],
  [/^(SII|S2)(\d|NM|$)/, 'sii'],
  [/^(NII|N2)(\d|NM|$)/, 'nii']
]

/** Dual-band filters by the names of common makes, squeezed; all pass Hα and O III. */
const DUAL = /^(DUAL|DUALBAND|DB|LEXTREME|LENHANCE|LULTIMATE|ALPT|NBZ|DUONB|HAOIII|HAO3|OIIIHA|ENHANCE)/

/** What a filter named this does to the light (LRN-018). */
export function filterLight(filter: string): FilterLight {
  const s = squeeze(filter)
  for (const [pattern, id] of NARROW) {
    if (pattern.test(s)) {
      const line = EMISSION_LINES[id]
      return { filter, kind: 'narrowband', lines: [line], passes: `Only ${line.name} at ${line.nm} nm, from ${line.origin}.`, concept: line.concept }
    }
  }
  if (DUAL.test(s)) {
    const lines = [EMISSION_LINES.ha, EMISSION_LINES.oiii]
    return { filter, kind: 'dual-band', lines, passes: 'Two narrow windows, hydrogen alpha at 656.3 nm and O III at 500.7 nm, blocking most light pollution and moonlight between them.', concept: 'emission-lines' }
  }
  if (/^(IRCUT|UVIR|UVIRCUT|IRUV)/.test(s)) {
    return { filter, kind: 'uv-ir-cut', lines: [], passes: 'All visible light, blocking the ultraviolet and infrared that would blur star images and upset colour.', concept: null }
  }
  if (/^(LP|LPS|LPR|CLS|LIGHTPOLLUTION|UHC)/.test(s)) {
    return { filter, kind: 'light-pollution', lines: [], passes: 'Most visible light, cutting the bands where street lights shine; it helps less with modern white LEDs.', concept: 'emission-lines' }
  }
  if (/^(L|LUM|LUMINANCE|CLEAR|C)$/.test(s)) return { filter, kind: 'luminance', lines: [], passes: BROADBAND.L, concept: null }
  if (/^(R|RED)$/.test(s)) return { filter, kind: 'colour', lines: [], passes: BROADBAND.R, concept: null }
  if (/^(G|GREEN)$/.test(s)) return { filter, kind: 'colour', lines: [], passes: BROADBAND.G, concept: null }
  if (/^(B|BLUE)$/.test(s)) return { filter, kind: 'colour', lines: [], passes: BROADBAND.B, concept: null }
  return { filter, kind: 'unknown', lines: [], passes: '', concept: null }
}

/** The filters a target was shot through, each explained once, unknown names left out. */
export function filtersLight(filters: readonly string[]): FilterLight[] {
  const seen = new Set<string>()
  const out: FilterLight[] = []
  for (const f of filters) {
    const key = squeeze(f)
    if (seen.has(key)) continue
    seen.add(key)
    const light = filterLight(f)
    if (light.kind !== 'unknown') out.push(light)
  }
  return out
}

