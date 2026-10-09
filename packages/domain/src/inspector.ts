/**
 * The image inspector (spec 025): what one image's pixels say, the way SyQon's scientific image
 * inspector shows it. A histogram per channel, the median, the noise, how much is clipped at
 * either end, and the shape of the brightest star that did not saturate; and small auto-stretched
 * previews for comparing images and trying palettes. Pure rules over pixel arrays; reading the
 * file is an adapter's job, done off the main process.
 */

import { binBayer, findPeaks, measureStar, skyStatistics, type Plane } from './frame-grading'

/** An image as read from disk: one plane per channel, with what the file says about its range. */
export interface RasterImage {
  width: number
  height: number
  /** One plane per channel, each width × height, in the order the file stores rows. */
  planes: Float32Array[]
  /** The Bayer pattern of a colour sensor's raw frame (BAYERPAT), else null. */
  bayer: string | null
  /** The largest value a pixel can hold; null when the file does not say. */
  saturation: number | null
  /** The smallest value a pixel can hold (0 for unsigned and floating-point data). */
  black: number
  /** True when the first row stored is the bottom of the picture, as FITS stores it. */
  bottomUp: boolean
}

export type ChannelName = 'L' | 'R' | 'G' | 'B'

export interface Histogram {
  /** The value at the left edge of the first bin and the right edge of the last. */
  min: number
  max: number
  counts: number[]
}

export interface ChannelStats {
  channel: ChannelName
  histogram: Histogram
  median: number
  /** Noise as a standard deviation, from the median absolute deviation (1.4826 × MAD). */
  noise: number
  /** Share of pixels at the most the file can hold (0 to 1); null when the file does not say what that is. */
  saturatedShare: number | null
  /** Share of pixels at or below the least the file can hold (0 to 1). */
  blackShare: number
}

export interface StarProfile {
  /** Centre in the image's own pixels, from the top-left corner as displayed. */
  x: number
  y: number
  /** Full width at half maximum, in the image's own pixels. */
  fwhm: number
  /** Brightest pixel above the background, in the file's units. */
  peak: number
  background: number
  /** Mean value above the background at each whole-pixel distance from the centre, 0 outwards. */
  profile: number[]
}

export interface ImageInspection {
  width: number
  height: number
  /** How the channels were found: a mono frame, a colour sensor's raw frame, or a colour image. */
  kind: 'mono' | 'bayer' | 'colour'
  channels: ChannelStats[]
  /** Null when no star stood out without saturating. */
  star: StarProfile | null
  /** Pixels per channel the statistics were worked out from. */
  sampled: number
}

/** The most values per channel the statistics read; an even spread is as good as every pixel. */
export const INSPECT_SAMPLES = 1_000_000
export const HISTOGRAM_BINS = 256

/** Counts of the values in `bins` equal steps from min to max; values outside go to the end bins. */
export function histogram(values: ArrayLike<number>, range: { min: number; max: number }, bins = HISTOGRAM_BINS): Histogram {
  const counts = new Array<number>(bins).fill(0)
  const span = range.max - range.min
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (!Number.isFinite(v)) continue
    const b = span > 0 ? Math.floor(((v - range.min) / span) * bins) : 0
    counts[Math.max(0, Math.min(bins - 1, b))]++
  }
  return { min: range.min, max: range.max, counts }
}

function sortedFinite(values: ArrayLike<number>): Float64Array {
  const out = new Float64Array(values.length)
  let n = 0
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) out[n++] = values[i]
  return out.subarray(0, n).sort()
}

const medianOfSorted = (s: Float64Array) => (s.length === 0 ? 0 : s.length % 2 ? s[s.length >> 1] : (s[(s.length >> 1) - 1] + s[s.length >> 1]) / 2)

/**
 * The ceiling a pixel can reach: what the file says, else 1 for floating-point data that stays
 * within 0 to 1 (Siril's own range), else unknown.
 */
export function ceilingOf(saturation: number | null, max: number): number | null {
  if (saturation !== null) return saturation
  return max <= 1 ? 1 : null
}

/**
 * Median, MAD noise, clipping and histogram of one channel's sampled values. The histogram spans
 * `range` when given, so every channel of an image is binned on one axis; else the channel's own.
 */
export function channelStats(channel: ChannelName, values: ArrayLike<number>, limits: { saturation: number | null; black: number }, range?: { min: number; max: number }): ChannelStats {
  const sorted = sortedFinite(values)
  const n = sorted.length
  const median = medianOfSorted(sorted)
  const deviations = new Float64Array(n)
  for (let i = 0; i < n; i++) deviations[i] = Math.abs(sorted[i] - median)
  deviations.sort()
  const noise = 1.4826 * medianOfSorted(deviations)
  const min = n ? sorted[0] : 0
  const max = n ? sorted[n - 1] : 0
  const ceiling = ceilingOf(limits.saturation, max)
  // A thousandth of the range below the ceiling still counts: integer data rescaled by BSCALE rarely lands exactly on it.
  const satAt = ceiling === null ? null : ceiling - Math.abs(ceiling - limits.black) * 1e-3
  let saturated = 0
  let black = 0
  for (let i = 0; i < n; i++) {
    if (satAt !== null && sorted[i] >= satAt) saturated++
    if (sorted[i] <= limits.black) black++
  }
  return {
    channel,
    histogram: histogram(sorted, range ?? { min, max }),
    median,
    noise,
    saturatedShare: satAt === null ? null : n ? saturated / n : 0,
    blackShare: n ? black / n : 0
  }
}

/** Which channel each of a 2×2 Bayer cell's pixels belongs to, in stored order; null when the pattern is not one the app knows. */
export function bayerChannels(pattern: string): ChannelName[] | null {
  const p = pattern.trim().toUpperCase()
  if (!/^[RGB]{4}$/.test(p) || [...p].filter(c => c === 'G').length !== 2 || !p.includes('R') || !p.includes('B')) return null
  return [...p] as ChannelName[]
}

/** Up to `count` values of each channel, spread evenly over the image. */
export function sampleChannels(image: RasterImage, count = INSPECT_SAMPLES): { kind: ImageInspection['kind']; channels: Map<ChannelName, number[]> } {
  const { width, height, planes } = image
  const channels = new Map<ChannelName, number[]>()
  const cfa = image.bayer && planes.length === 1 ? bayerChannels(image.bayer) : null
  if (cfa) {
    for (const c of cfa) channels.set(c, [])
    const cellsX = Math.floor(width / 2)
    const cellsY = Math.floor(height / 2)
    // Whole cells keep each channel's share of the sample true to the sensor.
    const stride = Math.max(1, Math.floor(Math.sqrt((cellsX * cellsY * 4) / count)))
    const data = planes[0]
    for (let cy = 0; cy < cellsY; cy += stride) {
      for (let cx = 0; cx < cellsX; cx += stride) {
        for (let k = 0; k < 4; k++) {
          const x = 2 * cx + (k & 1)
          const y = 2 * cy + (k >> 1)
          channels.get(cfa[k])?.push(data[y * width + x])
        }
      }
    }
    return { kind: 'bayer', channels }
  }
  const names: ChannelName[] = planes.length >= 3 ? ['R', 'G', 'B'] : ['L']
  const step = Math.max(1, Math.floor((width * height) / count))
  names.forEach((name, p) => {
    const values: number[] = []
    for (let i = 0; i < width * height; i += step) values.push(planes[p][i])
    channels.set(name, values)
  })
  return { kind: names.length === 3 ? 'colour' : 'mono', channels }
}

/** Luminance to find stars on: a raw colour frame binned 2×2, a colour image averaged, a mono frame as it is. */
function starPlane(image: RasterImage, kind: ImageInspection['kind']): { plane: Plane; bin: number; per: number } {
  const plane: Plane = { width: image.width, height: image.height, data: image.planes[0] }
  if (kind === 'bayer') return { plane: binBayer(plane), bin: 2, per: 4 }
  if (kind === 'colour') {
    const data = new Float32Array(image.width * image.height)
    for (let p = 0; p < 3; p++) for (let i = 0; i < data.length; i++) data[i] += image.planes[p][i] / 3
    return { plane: { ...plane, data }, bin: 1, per: 1 }
  }
  return { plane, bin: 1, per: 1 }
}

/** Mean value above the background at each whole-pixel distance from a star's centre, out to `radius`. */
export function radialProfile(plane: Plane, cx: number, cy: number, background: number, radius: number): number[] {
  const sums = new Array<number>(radius + 1).fill(0)
  const counts = new Array<number>(radius + 1).fill(0)
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(plane.height - 1, Math.ceil(cy + radius)); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(plane.width - 1, Math.ceil(cx + radius)); x++) {
      const r = Math.round(Math.hypot(x - cx, y - cy))
      if (r > radius) continue
      sums[r] += plane.data[y * plane.width + x] - background
      counts[r]++
    }
  }
  return sums.map((s, r) => (counts[r] ? s / counts[r] : 0))
}

/**
 * The most any of the file's own pixels reaches around a peak on the star plane (a 3 × 3 block
 * there): every colour plane of a colour image, the raw 2×2 cells of a colour sensor's frame. A
 * star clipped in one channel or one pixel of a cell is saturated even when the average is not.
 */
function sourcePeak(image: RasterImage, kind: ImageInspection['kind'], px: number, py: number): number {
  const bin = kind === 'bayer' ? 2 : 1
  const planes = kind === 'colour' ? image.planes.slice(0, 3) : [image.planes[0]]
  const x0 = Math.max(0, (px - 1) * bin)
  const x1 = Math.min(image.width - 1, (px + 2) * bin - 1)
  const y0 = Math.max(0, (py - 1) * bin)
  const y1 = Math.min(image.height - 1, (py + 2) * bin - 1)
  let max = -Infinity
  for (const plane of planes) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) max = Math.max(max, plane[y * image.width + x])
  return max
}

/** Stars tried, brightest first, before the inspector says none stood out. */
const STAR_TRIES = 60
const STAR_RADIUS = 6

/**
 * The brightest star that did not saturate: its centre, FWHM, peak above the background and radial
 * profile, in the image's own pixels and units. A raw colour frame is binned first, as grading does.
 */
export function brightestStar(image: RasterImage, kind: ImageInspection['kind']): StarProfile | null {
  const { plane, bin, per } = starPlane(image, kind)
  const { background, noise } = skyStatistics(plane)
  if (!(noise > 0)) return null
  const peaks = findPeaks(plane, background + 5 * noise, STAR_RADIUS)
  let sourceMax = -Infinity
  const sources = kind === 'colour' ? image.planes.slice(0, 3) : [image.planes[0]]
  for (const data of sources) for (let i = 0; i < data.length; i += Math.max(1, Math.floor(data.length / 100_000))) sourceMax = Math.max(sourceMax, data[i])
  const ceiling = ceilingOf(image.saturation, sourceMax)
  // Judged on the file's own pixels: binning or averaging hides a star clipped in part.
  const satLimit = ceiling === null ? null : 0.98 * ceiling
  for (const p of peaks.slice(0, STAR_TRIES)) {
    if (satLimit !== null && sourcePeak(image, kind, p.x, p.y) >= satLimit) continue
    const shape = measureStar(plane, p.x, p.y, background, STAR_RADIUS)
    // Wider than the box is a nebula knot or a galaxy core, not a star.
    if (!shape || shape.fwhm >= STAR_RADIUS * 1.5) continue
    const x = (shape.x + 0.5) * bin
    const yStored = (shape.y + 0.5) * bin
    return {
      x,
      y: image.bottomUp ? image.height - yStored : yStored,
      fwhm: shape.fwhm * bin,
      peak: (p.value - background) / per,
      background: background / per,
      profile: radialProfile(plane, shape.x, shape.y, background, STAR_RADIUS).map(v => v / per)
    }
  }
  return null
}

/** Everything the inspector shows for one image. */
export function inspectImage(image: RasterImage, samples = INSPECT_SAMPLES): ImageInspection {
  const { kind, channels } = sampleChannels(image, samples)
  // One range for every channel, so the histograms drawn on one chart line up bin for bin.
  let min = Infinity
  let max = -Infinity
  for (const values of channels.values()) {
    for (const v of values) {
      if (!Number.isFinite(v)) continue
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  const range = min <= max ? { min, max } : undefined
  const stats = [...channels].map(([name, values]) => channelStats(name, values, { saturation: image.saturation, black: image.black }, range))
  return {
    width: image.width,
    height: image.height,
    kind,
    channels: stats,
    star: brightestStar(image, kind),
    sampled: Math.max(0, ...[...channels.values()].map(v => v.length))
  }
}

// ── Previews ────────────────────────────────────────────────────────────

/** Which part of the image a preview shows: all its colour, or one channel as grey. */
export type PreviewChannel = 'colour' | 'luminance' | 'red' | 'green' | 'blue' | 'green-blue'

export interface ImagePreview {
  width: number
  height: number
  /** 1 for grey, 3 for colour, interleaved row by row from the top. */
  channels: 1 | 3
  /** Stretched to 0 to 255. */
  data: Uint8Array
  /** Preview pixels per pixel of the image, for placing an overlay. */
  scale: number
  sourceWidth: number
  sourceHeight: number
}

/** The widest preview sent to the window: enough to judge an image, a small part of a full frame. */
export const PREVIEW_MAX_WIDTH = 1024

/** The image's display planes: a raw colour frame as half-size red, green and blue; else its own planes. */
function displayPlanes(image: RasterImage): { planes: Float32Array[]; width: number; height: number; bin: number } {
  const cfa = image.bayer && image.planes.length === 1 ? bayerChannels(image.bayer) : null
  if (!cfa) return { planes: image.planes.slice(0, image.planes.length >= 3 ? 3 : 1), width: image.width, height: image.height, bin: 1 }
  const width = Math.floor(image.width / 2)
  const height = Math.floor(image.height / 2)
  const out = [new Float32Array(width * height), new Float32Array(width * height), new Float32Array(width * height)]
  const src = image.planes[0]
  const slot: Record<ChannelName, number> = { R: 0, G: 1, B: 2, L: 1 }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      for (let k = 0; k < 4; k++) {
        const c = cfa[k]
        // The two greens of a cell are averaged.
        out[slot[c]][i] += src[(2 * y + (k >> 1)) * image.width + 2 * x + (k & 1)] * (c === 'G' ? 0.5 : 1)
      }
    }
  }
  return { planes: out, width, height, bin: 2 }
}

/** One channel picked from colour planes, or the average of several. */
function pick(planes: Float32Array[], channel: PreviewChannel): Float32Array[] {
  if (planes.length === 1 || channel === 'colour') return planes
  const mix = (idx: number[]) => {
    const out = new Float32Array(planes[0].length)
    for (const p of idx) for (let i = 0; i < out.length; i++) out[i] += planes[p][i] / idx.length
    return out
  }
  switch (channel) {
    case 'red':
      return [planes[0]]
    case 'green':
      return [planes[1]]
    case 'blue':
      return [planes[2]]
    case 'green-blue':
      return [mix([1, 2])]
    default:
      return [mix([0, 1, 2])]
  }
}

/** Averages each `factor` × `factor` block, flipping a bottom-up image so the preview's first row is the top. */
export function downsample(plane: Float32Array, width: number, height: number, factor: number, bottomUp: boolean): { data: Float32Array; width: number; height: number } {
  const w = Math.max(1, Math.floor(width / factor))
  const h = Math.max(1, Math.floor(height / factor))
  const out = new Float32Array(w * h)
  const f = Math.min(factor, width, height)
  for (let y = 0; y < h; y++) {
    const row = bottomUp ? h - 1 - y : y
    for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      for (let dy = 0; dy < f; dy++) {
        const sy = y * f + dy
        for (let dx = 0; dx < f; dx++) {
          const v = plane[sy * width + x * f + dx]
          if (Number.isFinite(v)) {
            sum += v
            n++
          }
        }
      }
      out[row * w + x] = n ? sum / n : 0
    }
  }
  return { data: out, width: w, height: h }
}

/** The midtones transfer function: maps `m` to one half, 0 to 0 and 1 to 1. */
export function mtf(m: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  return ((m - 1) * x) / ((2 * m - 1) * x - m)
}

export interface Stretch {
  /** Values at or below this (0 to 1 of the range) go black. */
  shadows: number
  /** The midtones balance applied after the shadows clip. */
  midtones: number
  /** The range the values were scaled from. */
  low: number
  high: number
}

/** Where the auto-stretch puts the sky background, as in PixInsight's and Siril's screen stretch. */
export const STRETCH_BACKGROUND = 0.25
/** How many MAD-sigmas below the median the shadows clip. */
export const STRETCH_SHADOWS_SIGMA = 2.8

/**
 * The auto-stretch every preview gets: the background lifted to a quarter grey and the shadows
 * clipped a little below it, from the channel's median and MAD. The same rule for every image, so
 * two previews compare like with like.
 */
export function autoStretch(values: ArrayLike<number>, range: { low: number; high: number }): Stretch {
  const span = range.high - range.low || 1
  const sorted = sortedFinite(values)
  const norm = (v: number) => Math.min(1, Math.max(0, (v - range.low) / span))
  const median = norm(medianOfSorted(sorted))
  const dev = new Float64Array(sorted.length)
  for (let i = 0; i < sorted.length; i++) dev[i] = Math.abs(norm(sorted[i]) - median)
  dev.sort()
  const madSigma = 1.4826 * medianOfSorted(dev)
  const shadows = madSigma > 0 ? Math.min(Math.max(0, median - STRETCH_SHADOWS_SIGMA * madSigma), Math.max(0, median - 1e-6)) : 0
  const lifted = shadows < 1 ? (median - shadows) / (1 - shadows) : 0
  const midtones = lifted > 0 ? mtf(STRETCH_BACKGROUND, lifted) : 0.5
  return { shadows, midtones, low: range.low, high: range.high }
}

/** One value through a stretch, to 0…255. */
export function applyStretch(v: number, s: Stretch): number {
  const x = (v - s.low) / (s.high - s.low || 1)
  const clipped = s.shadows < 1 ? (x - s.shadows) / (1 - s.shadows) : 0
  return Math.round(mtf(s.midtones, Math.min(1, Math.max(0, clipped))) * 255)
}

/**
 * A small auto-stretched preview of an image or one of its channels, at most `maxWidth` pixels
 * wide, its first row the top of the picture. Each channel is stretched on its own, so a colour
 * cast in the sky does not tint it.
 */
export function previewImage(image: RasterImage, options: { maxWidth?: number; channel?: PreviewChannel } = {}): ImagePreview {
  const maxWidth = Math.max(1, Math.min(PREVIEW_MAX_WIDTH, options.maxWidth ?? PREVIEW_MAX_WIDTH))
  const shown = displayPlanes(image)
  const planes = pick(shown.planes, options.channel ?? 'colour')
  const factor = Math.max(1, Math.ceil(shown.width / maxWidth))
  const small = planes.map(p => downsample(p, shown.width, shown.height, factor, image.bottomUp))
  const { width, height } = small[0]
  const channels = small.length === 3 ? 3 : 1
  const data = new Uint8Array(width * height * channels)
  small.slice(0, channels).forEach((plane, c) => {
    let max = -Infinity
    for (let i = 0; i < plane.data.length; i++) if (plane.data[i] > max) max = plane.data[i]
    const ceiling = ceilingOf(image.saturation, max)
    const stretch = autoStretch(plane.data, { low: image.black, high: ceiling ?? (max > image.black ? max : image.black + 1) })
    for (let i = 0; i < plane.data.length; i++) data[i * channels + c] = applyStretch(plane.data[i], stretch)
  })
  return { width, height, channels, data, scale: 1 / (factor * shown.bin), sourceWidth: image.width, sourceHeight: image.height }
}
