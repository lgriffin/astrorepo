/**
 * Palette suggestions (spec 025): which colour combinations a target's filters allow, in the way
 * SyQon's Narrowband Palette Simulator lays them out. HOO needs Ha and OIII; SHO and HSO need SII
 * as well; RGB needs red, green and blue (or a colour camera's broadband stack); LRGB adds
 * luminance. A colour camera behind a dual-band filter gives Ha in its red pixels and OIII in its
 * green and blue ones.
 */

import type { PreviewChannel } from './inspector'

export type PaletteChannel = 'Ha' | 'OIII' | 'SII' | 'R' | 'G' | 'B' | 'L'

export const PALETTE_IDS = ['HOO', 'SHO', 'HSO', 'RGB', 'LRGB'] as const
export type PaletteId = (typeof PALETTE_IDS)[number]

export interface PaletteSpec {
  id: PaletteId
  /** The channel shown as red, green and blue. */
  red: PaletteChannel
  green: PaletteChannel
  blue: PaletteChannel
  /** A channel that sets the brightness of the colour (LRGB's luminance). */
  luminance: PaletteChannel | null
}

export const PALETTES: Record<PaletteId, PaletteSpec> = {
  HOO: { id: 'HOO', red: 'Ha', green: 'OIII', blue: 'OIII', luminance: null },
  SHO: { id: 'SHO', red: 'SII', green: 'Ha', blue: 'OIII', luminance: null },
  HSO: { id: 'HSO', red: 'Ha', green: 'SII', blue: 'OIII', luminance: null },
  RGB: { id: 'RGB', red: 'R', green: 'G', blue: 'B', luminance: null },
  LRGB: { id: 'LRGB', red: 'R', green: 'G', blue: 'B', luminance: 'L' }
}

/** Every channel a palette uses, each once, in the order red, green, blue, luminance. */
export function paletteChannels(id: PaletteId): PaletteChannel[] {
  const p = PALETTES[id]
  return [...new Set([p.red, p.green, p.blue, ...(p.luminance ? [p.luminance] : [])])]
}

/** Dual-band filters made for colour cameras, which pass Ha and OIII together. */
const DUAL_BAND = /(l[\s-]?e?xtreme|l[\s-]?enhance|l[\s-]?ultimate|alp[\s-]?t|duo|dual|nbz|ha[\s/+-]?o(iii|3)|tri[\s-]?band|quad[\s-]?band|^lp$)/i
const SII = /(^|[^a-z])s[\s-]?(ii|2)($|[^a-z])/i
const OIII = /(^|[^a-z])o[\s-]?(iii|3)($|[^a-z])/i
const HA = /(^|[^a-z])h[\s-]?(a|alpha)($|[^a-z])|^h$/i

/**
 * The channels a filter gives and where each lies in a frame or stack taken through it. A narrowband
 * or a red, green, blue or luminance filter gives its own channel as the whole image; a colour
 * camera with no filter, or a broadband one, gives red, green and blue; behind a dual-band filter
 * it gives Ha (red pixels) and OIII (green and blue).
 */
export function filterChannels(filter: string | null, colour: boolean | null): { channel: PaletteChannel; from: PreviewChannel }[] {
  const name = (filter ?? '').trim()
  const whole: PreviewChannel = 'luminance'
  if (DUAL_BAND.test(name) || (HA.test(name) && OIII.test(name))) {
    return colour === false ? [] : [{ channel: 'Ha', from: 'red' }, { channel: 'OIII', from: 'green-blue' }]
  }
  if (SII.test(name)) return [{ channel: 'SII', from: whole }]
  if (OIII.test(name)) return [{ channel: 'OIII', from: whole }]
  if (HA.test(name)) return [{ channel: 'Ha', from: whole }]
  if (/^(r|red)$/i.test(name)) return [{ channel: 'R', from: whole }]
  if (/^(g|green)$/i.test(name)) return [{ channel: 'G', from: whole }]
  if (/^(b|blue)$/i.test(name)) return [{ channel: 'B', from: whole }]
  if (/^(l|lum|luminance|clear|c)$/i.test(name)) return [{ channel: 'L', from: whole }]
  // No filter, or a broadband one (UV/IR cut, light pollution): colour cameras give all three.
  if (colour === true) return [{ channel: 'R', from: 'red' }, { channel: 'G', from: 'green' }, { channel: 'B', from: 'blue' }]
  // A mono camera with no filter named is shooting luminance.
  if (colour === false && name === '') return [{ channel: 'L', from: 'luminance' }]
  return []
}

/** A stacked image a palette can take a channel from. */
export interface PaletteMaster {
  path: string
  filter: string | null
  /** Three channels; null when unknown. */
  colour: boolean | null
}

/** Integration the target has through a filter, with or without a stack yet. */
export interface FilterIntegration {
  filter: string | null
  colour: boolean | null
  seconds: number
}

export interface ChannelSource {
  channel: PaletteChannel
  /** The newest master giving the channel, and which part of it; null when there is only integration. */
  master: { path: string; from: PreviewChannel } | null
  seconds: number
}

/** Where each channel comes from: the first master that gives it (masters come newest first) and the integration behind it. */
export function channelSources(masters: PaletteMaster[], integration: FilterIntegration[]): ChannelSource[] {
  const out = new Map<PaletteChannel, ChannelSource>()
  const entry = (channel: PaletteChannel) => out.get(channel) ?? out.set(channel, { channel, master: null, seconds: 0 }).get(channel)!
  for (const m of masters) {
    for (const c of filterChannels(m.filter, m.colour)) {
      const e = entry(c.channel)
      e.master ??= { path: m.path, from: c.from }
    }
  }
  for (const i of integration) for (const c of filterChannels(i.filter, i.colour)) entry(c.channel).seconds += i.seconds
  return [...out.values()]
}

export interface PaletteOption {
  id: PaletteId
  /** Every channel has a master or integration. */
  possible: boolean
  /** Channels with nothing captured yet. */
  missing: PaletteChannel[]
  /** Channels captured but not yet stacked, so the preview cannot show them. */
  unstacked: PaletteChannel[]
  /** Where each channel's preview comes from, when every channel has a master. */
  sources: Partial<Record<PaletteChannel, { path: string; from: PreviewChannel }>>
}

/** Each palette, whether the target's filters allow it, and what its preview would be drawn from. */
export function possiblePalettes(sources: ChannelSource[]): PaletteOption[] {
  const by = new Map(sources.map(s => [s.channel, s]))
  return PALETTE_IDS.map(id => {
    const needs = paletteChannels(id)
    const missing = needs.filter(c => !by.get(c)?.master && !((by.get(c)?.seconds ?? 0) > 0))
    const unstacked = needs.filter(c => !missing.includes(c) && !by.get(c)?.master)
    const sourcesOf: PaletteOption['sources'] = {}
    if (missing.length === 0 && unstacked.length === 0) for (const c of needs) sourcesOf[c] = by.get(c)!.master!
    return { id, possible: missing.length === 0, missing, unstacked, sources: sourcesOf }
  })
}

/** Whether a palette the user picks is one the target's filters allow. */
export function isPalettePossible(id: string, options: PaletteOption[]): id is PaletteId {
  return options.some(o => o.id === id && o.possible)
}
