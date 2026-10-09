import { describe, expect, it } from 'vitest'
import {
  applyStretch,
  autoStretch,
  bayerChannels,
  brightestStar,
  ceilingOf,
  channelStats,
  downsample,
  histogram,
  inspectImage,
  mtf,
  PREVIEW_MAX_WIDTH,
  previewImage,
  sampleChannels,
  STRETCH_BACKGROUND,
  type RasterImage
} from '@astro/domain'

function prng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** A 16-bit frame: background 1000 with noise of about 10, and round stars of the given peak and sigma. */
function frame(width: number, height: number, stars: { x: number; y: number; peak: number; sigma: number }[], options: Partial<RasterImage> = {}): RasterImage {
  const rand = prng(7)
  const data = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 1000 + (rand() + rand() + rand() - 1.5) * 20
      for (const s of stars) v += s.peak * Math.exp(-((x - s.x) ** 2 + (y - s.y) ** 2) / (2 * s.sigma * s.sigma))
      data[y * width + x] = Math.min(65535, v)
    }
  }
  return { width, height, planes: [data], bayer: null, saturation: 65535, black: 0, bottomUp: false, ...options }
}

describe('Histogram and channel statistics', () => {
  it('[INS-001] Given values, When binned, Then each falls in its bin and values beyond the range go to the end bins', () => {
    const h = histogram([0, 0.1, 0.5, 0.99, 1, 2, -1, NaN], { min: 0, max: 1 }, 4)
    expect(h.counts).toEqual([3, 0, 1, 3])
    expect(histogram([5, 5], { min: 5, max: 5 }, 2).counts).toEqual([2, 0])
  })

  it('[INS-001] Given a channel with clipped pixels, When measured, Then its median, MAD noise and clipped shares come back', () => {
    const values = [0, 0, 10, 11, 12, 13, 14, 65535, 65535, 12]
    const s = channelStats('L', values, { saturation: 65535, black: 0 })
    expect(s.median).toBe(12)
    expect(s.noise).toBeCloseTo(1.4826 * 2, 6)
    expect(s.saturatedShare).toBeCloseTo(0.2, 9)
    expect(s.blackShare).toBeCloseTo(0.2, 9)
    expect(s.histogram).toMatchObject({ min: 0, max: 65535 })
    expect(s.histogram.counts.reduce((a, b) => a + b, 0)).toBe(10)
  })

  it('[INS-001] Given floating-point data, When the ceiling is unknown, Then 0 to 1 data saturates at 1 and wider data says unknown', () => {
    expect(ceilingOf(null, 0.9)).toBe(1)
    expect(ceilingOf(null, 4000)).toBeNull()
    expect(ceilingOf(4095, 10)).toBe(4095)
    expect(channelStats('R', [0.1, 1, 0.2], { saturation: null, black: 0 }).saturatedShare).toBeCloseTo(1 / 3, 9)
    expect(channelStats('R', [10, 4000], { saturation: null, black: 0 }).saturatedShare).toBeNull()
    expect(channelStats('R', [], { saturation: 1, black: 0 })).toMatchObject({ median: 0, saturatedShare: 0, blackShare: 0 })
  })

  it('[INS-001] Given a raw colour frame, When sampled, Then each pixel goes to its channel by the Bayer pattern', () => {
    const data = new Float32Array([1, 2, 1, 2, 3, 4, 3, 4])
    const raw: RasterImage = { width: 4, height: 2, planes: [data], bayer: 'RGGB', saturation: 255, black: 0, bottomUp: false }
    const { kind, channels } = sampleChannels(raw)
    expect(kind).toBe('bayer')
    expect(channels.get('R')).toEqual([1, 1])
    expect(channels.get('G')).toEqual([2, 3, 2, 3])
    expect(channels.get('B')).toEqual([4, 4])
    expect(bayerChannels('gbrg')).toEqual(['G', 'B', 'R', 'G'])
    expect(bayerChannels('RGBX')).toBeNull()
    expect(sampleChannels({ ...raw, bayer: 'NONE' }).kind).toBe('mono')
  })

  it('[INS-001] Given a colour image or a mono one, When sampled, Then it has red, green and blue or luminance, no more than asked', () => {
    const plane = new Float32Array(100).fill(1)
    expect([...sampleChannels({ width: 10, height: 10, planes: [plane, plane, plane], bayer: null, saturation: 1, black: 0, bottomUp: true }).channels.keys()]).toEqual(['R', 'G', 'B'])
    const mono = sampleChannels({ width: 10, height: 10, planes: [plane], bayer: null, saturation: 1, black: 0, bottomUp: true }, 10)
    expect(mono.kind).toBe('mono')
    expect(mono.channels.get('L')).toHaveLength(10)
  })
})

describe('The brightest unsaturated star', () => {
  it('[INS-002] Given a saturated star and fainter ones, When inspected, Then the profile is of the brightest that did not saturate, FWHM near the truth', () => {
    const image = frame(120, 100, [
      { x: 30, y: 30, peak: 80000, sigma: 2 },
      { x: 80, y: 60, peak: 20000, sigma: 1.5 },
      { x: 60, y: 20, peak: 5000, sigma: 1.5 }
    ])
    const star = brightestStar(image, 'mono')!
    expect(star.x).toBeCloseTo(80.5, 0)
    expect(star.y).toBeCloseTo(60.5, 0)
    expect(star.fwhm).toBeCloseTo(1.5 * 2.3548, 0)
    expect(star.peak).toBeGreaterThan(15000)
    expect(star.background).toBeCloseTo(1000, -1)
    expect(star.profile[0]).toBeGreaterThan(star.profile[3])
  })

  it('[INS-002] Given a bottom-up image, When a star is found, Then its position is given from the top as displayed', () => {
    const star = brightestStar(frame(100, 80, [{ x: 40, y: 20, peak: 9000, sigma: 1.5 }], { bottomUp: true }), 'mono')!
    expect(star.y).toBeCloseTo(80 - 20.5, 0)
  })

  it('[INS-002] Given a raw colour frame, When a star is found, Then it is measured binned and reported in the frame’s own pixels and units', () => {
    const base = frame(160, 120, [{ x: 81, y: 61, peak: 8000, sigma: 3 }])
    const star = brightestStar({ ...base, bayer: 'RGGB' }, 'bayer')!
    expect(star.x).toBeCloseTo(81.5, 0)
    expect(star.fwhm).toBeCloseTo(3 * 2.3548, 0)
    expect(star.background).toBeCloseTo(1000, -1)
  })

  it('[INS-002] Given a colour image, When a star is found, Then its channels are averaged first', () => {
    const base = frame(100, 80, [{ x: 50, y: 40, peak: 6000, sigma: 1.5 }])
    const star = brightestStar({ ...base, planes: [base.planes[0], base.planes[0], base.planes[0]] }, 'colour')!
    expect(star.peak).toBeGreaterThan(4000)
  })

  it('[INS-002] Given a colour image whose star is clipped in red only, When inspected, Then it counts as saturated though the average is not', () => {
    const clipped = frame(120, 100, [{ x: 30, y: 30, peak: 90000, sigma: 2 }, { x: 80, y: 60, peak: 5000, sigma: 1.5 }])
    const rest = frame(120, 100, [{ x: 80, y: 60, peak: 5000, sigma: 1.5 }])
    const star = brightestStar({ ...clipped, planes: [clipped.planes[0], rest.planes[0], rest.planes[0]] }, 'colour')!
    expect(star.x).toBeCloseTo(80.5, 0)
    expect(star.y).toBeCloseTo(60.5, 0)
  })

  it('[INS-002] Given a raw colour frame whose star clips one pixel of a cell, When inspected, Then it counts as saturated though the binned cell is not', () => {
    const base = frame(160, 120, [{ x: 81, y: 61, peak: 70000, sigma: 1 }, { x: 41, y: 41, peak: 6000, sigma: 3 }])
    const raw = base.planes[0]
    // The bright star is clipped at one pixel; its 2×2 cell summed stays well under four times the ceiling.
    expect(raw[61 * 160 + 81]).toBe(65535)
    expect(raw[60 * 160 + 80] + raw[60 * 160 + 81] + raw[61 * 160 + 80] + raw[61 * 160 + 81]).toBeLessThan(0.98 * 65535 * 4)
    const star = brightestStar({ ...base, bayer: 'RGGB' }, 'bayer')!
    expect(star.x).toBeCloseTo(41.5, 0)
  })

  it('[INS-002] Given only sky, or only saturated stars, When inspected, Then there is no star profile', () => {
    expect(brightestStar({ ...frame(60, 60, []), planes: [new Float32Array(3600).fill(5)] }, 'mono')).toBeNull()
    expect(brightestStar(frame(80, 80, [{ x: 40, y: 40, peak: 90000, sigma: 2 }]), 'mono')).toBeNull()
  })

  it('[INS-001] Given colour channels over different ranges, When inspected, Then every histogram spans one range so their bins line up', () => {
    const n = 100
    const red = new Float32Array(n).map((_, i) => i)
    const blue = new Float32Array(n).map((_, i) => 1000 + i * 10)
    const result = inspectImage({ width: 10, height: 10, planes: [red, red, blue], bayer: null, saturation: 65535, black: 0, bottomUp: false })
    expect(result.channels.map(c => [c.histogram.min, c.histogram.max])).toEqual([[0, 1990], [0, 1990], [0, 1990]])
    // Red's largest value and blue's smallest fall in the bins of those values on the shared axis.
    const bin = Math.floor((99 / 1990) * 256)
    expect(result.channels[0].histogram.counts[bin]).toBeGreaterThan(0)
    expect(result.channels[2].histogram.counts.findIndex(c => c > 0)).toBe(Math.floor((1000 / 1990) * 256))
    expect(channelStats('L', [5, 6], { saturation: null, black: 0 }, { min: 0, max: 10 }).histogram).toMatchObject({ min: 0, max: 10 })
  })

  it('[INS-001] Given an image, When inspected, Then statistics, kind, size and star come together', () => {
    const result = inspectImage(frame(100, 80, [{ x: 50, y: 40, peak: 9000, sigma: 1.5 }]))
    expect(result).toMatchObject({ width: 100, height: 80, kind: 'mono', sampled: 8000 })
    expect(result.channels[0].median).toBeCloseTo(1000, -1)
    expect(result.channels[0].noise).toBeGreaterThan(5)
    expect(result.star).not.toBeNull()
  })
})

describe('Previews', () => {
  it('[INS-007] Given the midtones transfer, When applied, Then it keeps the ends and maps the balance to one half', () => {
    expect(mtf(0.3, 0)).toBe(0)
    expect(mtf(0.3, 1)).toBe(1)
    expect(mtf(0.3, 0.3)).toBeCloseTo(0.5, 9)
  })

  it('[INS-007] Given a dark linear sky, When auto-stretched, Then its median lands at a quarter grey', () => {
    const rand = prng(3)
    const values = Array.from({ length: 5000 }, () => 1000 + (rand() - 0.5) * 40)
    const s = autoStretch(values, { low: 0, high: 65535 })
    expect(s.shadows).toBeGreaterThan(0)
    expect(applyStretch(1000, s) / 255).toBeCloseTo(STRETCH_BACKGROUND, 1)
    expect(applyStretch(0, s)).toBe(0)
    expect(applyStretch(65535, s)).toBe(255)
  })

  it('[INS-007] Given flat values, When auto-stretched, Then nothing breaks', () => {
    const s = autoStretch([0, 0, 0], { low: 0, high: 0 })
    expect(applyStretch(0, s)).toBe(0)
    expect(autoStretch([0.5, 0.5], { low: 0, high: 1 }).shadows).toBe(0)
  })

  it('[INS-007] Given a plane, When downsampled, Then each block is averaged and a bottom-up image is turned the right way up', () => {
    const plane = new Float32Array([1, 3, 10, 10, 1, 3, 10, NaN, 5, 5, 7, 7, 5, 5, 7, 7])
    expect([...downsample(plane, 4, 4, 2, false).data]).toEqual([2, 10, 5, 7])
    expect([...downsample(plane, 4, 4, 2, true).data]).toEqual([5, 7, 2, 10])
  })

  it('[NFR-019] Given a wide image, When previewed, Then the preview is no wider than the limit, whatever is asked, and says its scale', () => {
    const wide = frame(2100, 30, [])
    const p = previewImage(wide, { maxWidth: 5000 })
    expect(p.width).toBeLessThanOrEqual(PREVIEW_MAX_WIDTH)
    expect(p.data).toHaveLength(p.width * p.height)
    expect(p.scale).toBeCloseTo(1 / 3, 9)
    expect(p).toMatchObject({ channels: 1, sourceWidth: 2100, sourceHeight: 30 })
  })

  it('[INS-007] Given a raw colour frame, When previewed in colour, Then it is three channels at half size or less', () => {
    const p = previewImage({ ...frame(40, 20, []), bayer: 'RGGB' }, { maxWidth: 1024 })
    expect(p).toMatchObject({ width: 20, height: 10, channels: 3, scale: 0.5 })
  })

  it('[INS-005] Given a colour image, When one channel is asked for, Then the preview is that channel in grey', () => {
    const w = 8
    const r = new Float32Array(w * w).fill(0.1)
    const g = new Float32Array(w * w).fill(0.5)
    const image: RasterImage = { width: w, height: w, planes: [r, g, g], bayer: null, saturation: 1, black: 0, bottomUp: false }
    for (const channel of ['red', 'green', 'blue', 'green-blue', 'luminance'] as const) {
      expect(previewImage(image, { channel }).channels).toBe(1)
    }
    expect(previewImage(image).channels).toBe(3)
  })
})
