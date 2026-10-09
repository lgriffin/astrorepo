import type { GalleryImage, Read, ShownImage, TargetPalettes } from '@astro/application'
import {
  formatDec,
  formatRa,
  PALETTES,
  paletteChannels,
  SOLVER_LABEL,
  type ChannelName,
  type ChannelStats,
  type ImageInspection,
  type ImagePreview,
  type PaletteChannel,
  type PaletteId,
  type PaletteSpec
} from '@astro/domain'
import type { ChannelStatsView, GalleryImageView, InspectionView, PalettePreviewView, PalettesView, PreviewView } from '@shared/types'

const CHANNEL_LABEL: Record<ChannelName, string> = { L: 'Luminance', R: 'Red', G: 'Green', B: 'Blue' }

const KIND: Record<ImageInspection['kind'], string> = {
  mono: 'A mono image',
  bayer: "A colour sensor's raw frame, read channel by channel from its Bayer pattern",
  colour: 'A colour image'
}

/** A pixel value as people read it: whole numbers for camera units, a few digits for 0 to 1 data. */
export function formatValue(v: number): string {
  const a = Math.abs(v)
  if (a >= 100) return Math.round(v).toLocaleString('en-GB')
  if (a >= 1) return v.toFixed(2)
  if (a === 0) return '0'
  return v.toPrecision(3)
}

/** A share of pixels as a percentage. */
export function formatShare(share: number | null): string {
  if (share === null) return 'unknown'
  if (share === 0) return 'none'
  if (share < 0.0001) return 'under 0.01%'
  return `${(share * 100).toFixed(share < 0.01 ? 2 : 1)}%`
}

/** Clipping above this share is worth a sentence. */
const CLIP_WARNING = 0.001

function channelView(c: ChannelStats): ChannelStatsView {
  return {
    channel: c.channel,
    label: CHANNEL_LABEL[c.channel],
    median: formatValue(c.median),
    noise: formatValue(c.noise),
    saturated: formatShare(c.saturatedShare),
    black: formatShare(c.blackShare),
    histogram: { min: formatValue(c.histogram.min), max: formatValue(c.histogram.max), counts: c.histogram.counts }
  }
}

const which = (c: ChannelStats, colour: boolean) => (colour ? `${CHANNEL_LABEL[c.channel].toLowerCase()} pixels` : 'pixels')

/** The inspector for one file (INS-001, INS-002, INS-003). */
export function toInspectionView(result: Read<{ inspection: ImageInspection }>): InspectionView {
  if (!result.ok) {
    return { error: `The file could not be read: ${result.error} Check the file opens in Siril, or scan the folder again if it moved.`, summary: null, channels: [], star: null, starNote: null, warnings: [] }
  }
  const i = result.inspection
  const colour = i.channels.length > 1
  const warnings: string[] = []
  for (const c of i.channels) {
    if (c.saturatedShare !== null && c.saturatedShare > CLIP_WARNING) {
      warnings.push(`${formatShare(c.saturatedShare)} of the ${which(c, colour)} are saturated, so the brightest stars or nebula there have lost detail.`)
    }
    if (c.blackShare > CLIP_WARNING) warnings.push(`${formatShare(c.blackShare)} of the ${which(c, colour)} are clipped to black, so the faintest sky there has lost detail.`)
  }
  return {
    error: null,
    summary: `${KIND[i.kind]}, ${i.width} × ${i.height}. Figures from ${i.sampled.toLocaleString('en-GB')} pixels${colour ? ' per channel' : ''} spread over the image.`,
    channels: i.channels.map(channelView),
    star: i.star
      ? {
          fwhm: `${i.star.fwhm.toFixed(2)} px`,
          peak: formatValue(i.star.peak),
          position: `${Math.round(i.star.x)}, ${Math.round(i.star.y)}`,
          profile: i.star.profile
        }
      : null,
    starNote: i.star ? null : 'No star stands out from the sky without saturating, so there is no star profile.',
    warnings
  }
}

const base64 = (data: Uint8Array) => Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64')

const round1 = (v: number) => Math.round(v * 10) / 10

/** A preview with its grid and labels when the image is solved, by its header or a stored plate solve (INS-007, INS-009 to INS-012). */
export function toPreviewView(result: Read<ShownImage>): PreviewView {
  if (!result.ok) {
    return { error: `The image could not be read: ${result.error}`, width: 0, height: 0, channels: 1, pixelsBase64: '', sourceSize: null, overlay: null, fieldText: null }
  }
  const p: ImagePreview = result.preview
  const f = result.field
  return {
    error: null,
    width: p.width,
    height: p.height,
    channels: p.channels,
    pixelsBase64: base64(p.data),
    sourceSize: `${p.sourceWidth} × ${p.sourceHeight}`,
    overlay: result.overlay
      ? {
          lines: result.overlay.grid.map(l => ({ kind: l.kind, label: l.label, points: l.points.map(pt => [round1(pt.x), round1(pt.y)] as [number, number]) })),
          objects: result.overlay.objects.map(o => ({
            label: o.name ? `${o.designation} ${o.name}` : o.designation,
            x: round1(o.x),
            y: round1(o.y),
            radius: o.radiusPx === null ? null : round1(o.radiusPx)
          }))
        }
      : null,
    fieldText: f
      ? `Centred on ${formatRa(f.raDeg)}, ${formatDec(f.decDeg)} at ${f.scaleArcsec.toFixed(2)}″ per pixel, north turned ${Math.round(((f.rotationDeg % 360) + 360) % 360)}°${f.flipped ? ', mirrored' : ''}.${result.fieldSource && result.fieldSource !== 'header' ? ` From its plate solve by ${SOLVER_LABEL[result.fieldSource]}.` : ''}`
      : null
  }
}

/** A target's images to pick from for comparing. */
export function toGalleryImagesView(images: GalleryImage[]): GalleryImageView[] {
  return images.map(i => {
    const date = i.modifiedAt ? `, ${i.modifiedAt.toISOString().slice(0, 10)}` : ''
    const what = i.kind === 'master' ? `${i.filter ? `${i.filter} ` : ''}master` : 'finished'
    return { path: i.path, kind: i.kind, label: `${i.name} (${what}${date})` }
  })
}

const LIST = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

const CHANNEL_NAME: Record<PaletteChannel, string> = { Ha: 'Ha', OIII: 'OIII', SII: 'SII', R: 'red', G: 'green', B: 'blue', L: 'luminance' }

/** "SII as red, Ha as green, OIII as blue." */
export function paletteMapping(p: PaletteSpec): string {
  const parts = [`${CHANNEL_NAME[p.red]} as red`, `${CHANNEL_NAME[p.green]} as green`, `${CHANNEL_NAME[p.blue]} as blue`]
  if (p.luminance) parts.unshift(`${CHANNEL_NAME[p.luminance]} for brightness`)
  return `${parts.join(', ')}.`
}

/** The chosen palette as a hint beside the Siril_Scripts command (INS-006). */
export function paletteHint(id: PaletteId): string {
  return `Palette chosen for this target: ${id}, with ${paletteMapping(PALETTES[id]).replace(/\.$/, '')}. Siril_Scripts takes one stack, so combine the channels in this order before you process it.`
}

/** The palettes a target's filters allow, and what stands in the way of the others (INS-004, INS-005). */
export function toPalettesView(p: TargetPalettes): PalettesView {
  const options = p.options.map(o => {
    const name = (cs: PaletteChannel[]) => LIST(cs.map(c => CHANNEL_NAME[c]))
    const note = o.missing.length
      ? `Needs ${name(o.missing)}, which this target has not been captured with.`
      : o.unstacked.length
        ? `Stack the ${name(o.unstacked)} lights to preview it.`
        : null
    return { id: o.id, possible: o.possible, mapping: paletteMapping(PALETTES[o.id]), note, canPreview: o.possible && o.unstacked.length === 0 }
  })
  return {
    options,
    chosen: p.chosen,
    message: options.some(o => o.possible)
      ? null
      : 'No palette yet: none of this target’s lights or stacks are through Ha, OIII, SII, red, green, blue or luminance filters, or from a colour camera.'
  }
}

/** Each channel of a palette as a grey preview, for the window to combine (INS-005). */
export function toPalettePreviewView(result: Read<{ palette: PaletteSpec; channels: Partial<Record<PaletteChannel, ImagePreview>> }>, id: PaletteId): PalettePreviewView {
  const spec = PALETTES[id]
  const blank = { red: spec.red, green: spec.green, blue: spec.blue, luminance: spec.luminance }
  if (!result.ok) return { error: `A stack could not be read for the preview: ${result.error}`, ...blank, channels: {} }
  const channels: PalettePreviewView['channels'] = {}
  for (const c of paletteChannels(id)) {
    const p = result.channels[c]
    if (p) channels[c] = { width: p.width, height: p.height, pixelsBase64: base64(p.data) }
  }
  return { error: null, ...blank, channels }
}
