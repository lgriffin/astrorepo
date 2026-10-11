import { describe, expect, it } from 'vitest'
import {
  clipping,
  CLIP_WARNING_SHARE,
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
  radialProfile,
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
function frame(width: number, height: number, stars: { x: number; y: number; peak: number; sigma: number }[], options: Partial<RasterImage> = {}, cap = 65535): RasterImage {
  const rand = prng(7)
  const data = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 1000 + (rand() + rand() + rand() - 1.5) * 20
      for (const s of stars) v += s.peak * Math.exp(-((x - s.x) ** 2 + (y - s.y) ** 2) / (2 * s.sigma * s.sigma))
      data[y * width + x] = Math.min(cap, v)
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

describe('clipping worth a warning', () => {
  it('[INS-001] [HEX-013] Given channels clipped above, at and below a tenth of a percent, When judged, Then only the share above it is clipping worth a warning', () => {
    expect(clipping({ saturatedShare: 0.002, blackShare: 0.0005 })).toEqual({ saturated: true, black: false })
    expect(clipping({ saturatedShare: CLIP_WARNING_SHARE, blackShare: 0.01 })).toEqual({ saturated: false, black: true })
    expect(clipping({ saturatedShare: null, blackShare: 0 })).toEqual({ saturated: false, black: false })
  })
})

describe('a histogram across most of a double\'s range', () => {
  it('[INS-001, FUZ-006] Given a 64-bit image whose values span almost every double, When binned, Then every value is counted in a bin', () => {
    const h = histogram([1.7e308, -1.7e308, 0], { min: -1.7e308, max: 1.7e308 }, 4)
    expect(h.counts).toEqual([1, 0, 1, 1])
    expect(Object.keys(h.counts)).toEqual(['0', '1', '2', '3'])
  })
  it('[INS-001, FUZ-006] Given values as small as the smallest double, When binned, Then they land in the first and last bins', () => {
    expect(histogram([0, Number.MIN_VALUE], { min: 0, max: Number.MIN_VALUE }, 4).counts).toEqual([1, 0, 0, 1])
  })
})

const image = (planes: Float32Array[], width: number, height: number, over: Partial<RasterImage> = {}): RasterImage => ({
  width,
  height,
  planes,
  bayer: null,
  saturation: 1,
  black: 0,
  bottomUp: false,
  ...over
})

describe('Histogram and channel statistics at their edges', () => {
  it('[INS-001] Given values and no bin count, When binned, Then there are 256 bins and a range of no width puts every value in the first', () => {
    const h = histogram([0, 0.5, 1], { min: 0, max: 1 })
    expect(h.counts).toHaveLength(256)
    expect([h.counts[0], h.counts[128], h.counts[255]]).toEqual([1, 1, 1])
    expect(histogram([6, 4, Infinity], { min: 5, max: 5 }, 2).counts).toEqual([2, 0])
    expect(histogram([0.25, 0.5, 0.75], { min: 0, max: 1 }, 4).counts).toEqual([0, 1, 1, 1])
  })

  it('[INS-001] Given values with infinities and an even count, When measured, Then the infinities are ignored and the median is the mean of the middle two', () => {
    const s = channelStats('G', [Infinity, 4, 1, -Infinity, 3, 2, NaN], { saturation: 10, black: 1 })
    expect(s.median).toBe(2.5)
    expect(s.noise).toBeCloseTo(1.4826, 9)
    expect(s.blackShare).toBe(0.25)
    expect(s.saturatedShare).toBe(0)
    expect(s.histogram).toMatchObject({ min: 1, max: 4 })
    expect(s.channel).toBe('G')
    expect(channelStats('L', [1, 2, 3, 10], { saturation: 3, black: 0 }).median).toBe(2.5)
  })

  it('[INS-001] Given pixels a little under the ceiling, When measured, Then those within a thousandth of the range count as saturated and no lower', () => {
    expect(channelStats('L', [999, 998.9, 1000, 500], { saturation: 1000, black: 0 }).saturatedShare).toBe(0.5)
    expect(channelStats('L', [1000, 1001, 1500], { saturation: 2000, black: 1000 }).saturatedShare).toBe(0)
    expect(channelStats('L', [1999, 1998.9, 3000], { saturation: 2000, black: 1000 }).saturatedShare).toBeCloseTo(2 / 3, 9)
    // A black level above the ceiling still measures the margin by its size.
    expect(channelStats('L', [0, -0.5, -2], { saturation: 0, black: 1000 }).saturatedShare).toBeCloseTo(2 / 3, 9)
    expect(ceilingOf(null, 1)).toBe(1)
    expect(ceilingOf(null, 1.0001)).toBeNull()
    expect(ceilingOf(0, 5)).toBe(0)
  })

  it('[INS-001] Given Bayer patterns that are not a 2×2 cell of red, two greens and blue, When read, Then they are rejected', () => {
    expect(bayerChannels(' bggr ')).toEqual(['B', 'G', 'G', 'R'])
    for (const p of ['RRGB', 'RGGG', 'GGGB', 'RGGR', 'BGGB', 'RGGBX', 'XRGGB', 'RGB', 'GRBG ', 'RG GB', '']) {
      expect(bayerChannels(p)).toEqual(p.trim() === 'GRBG' ? ['G', 'R', 'B', 'G'] : null)
    }
  })

  it('[INS-001] Given a large raw colour frame and a sample size, When sampled, Then whole cells are taken at an even stride', () => {
    const data = new Float32Array(64).map((_, i) => i)
    const raw = image([data], 8, 8, { bayer: 'RGGB', saturation: 255 })
    const { channels } = sampleChannels(raw, 16)
    // 16 cells and 16 samples wanted: every second cell each way.
    expect(channels.get('R')).toEqual([0, 4, 32, 36])
    expect(channels.get('G')).toEqual([1, 8, 5, 12, 33, 40, 37, 44])
    expect(channels.get('B')).toEqual([9, 13, 41, 45])
    expect(sampleChannels(image([new Float32Array(15).map((_, i) => i)], 5, 3, { bayer: 'RGGB' })).channels.get('B')).toEqual([6, 8])
    expect(sampleChannels(image([data, data, data], 8, 8, { bayer: 'RGGB' })).kind).toBe('colour')
  })

  it('[INS-001] Given a mono or two-plane image and a sample size, When sampled, Then values are taken at an even step from the first plane', () => {
    const data = new Float32Array(100).map((_, i) => i)
    const values = sampleChannels(image([data], 10, 10), 30).channels.get('L')!
    expect(values).toHaveLength(34)
    expect(values.slice(0, 3)).toEqual([0, 3, 6])
    expect(values[33]).toBe(99)
    const two = sampleChannels(image([data, new Float32Array(100)], 10, 10), 200)
    expect(two.kind).toBe('mono')
    expect(two.channels.get('L')).toEqual([...data])
    const colour = sampleChannels(image([data, data.map(v => v + 1), data.map(v => v + 2)], 10, 10), 50)
    expect(colour.channels.get('B')!.slice(0, 2)).toEqual([2, 4])
  })

  it('[INS-001] Given an image with no finite pixel, When inspected, Then each channel has its own empty range and nothing breaks', () => {
    const result = inspectImage(image([new Float32Array(16).fill(NaN)], 4, 4))
    expect(result.channels[0]).toMatchObject({ median: 0, histogram: { min: 0, max: 0 } })
    expect(result.sampled).toBe(16)
    expect(result.star).toBeNull()
    expect(inspectImage(image([new Float32Array(16).fill(2)], 4, 4), 4).sampled).toBe(4)
  })
})

describe('The brightest unsaturated star in detail', () => {
  it('[INS-002] Given a mono star, When measured, Then its centre, FWHM, peak, background and seven-ring profile are in the frame\'s pixels and units', () => {
    const star = brightestStar(frame(100, 80, [{ x: 40, y: 30, peak: 9000, sigma: 1.5 }]), 'mono')!
    expect(star.x).toBeCloseTo(40.5, 1)
    expect(star.y).toBeCloseTo(30.5, 1)
    expect(star.fwhm).toBeCloseTo(3.565, 2)
    expect(star.peak).toBeCloseTo(8984.5, 0)
    expect(star.background).toBeCloseTo(1000.28, 1)
    expect(star.profile).toHaveLength(7)
    expect(star.profile[0]).toBe(star.peak)
    expect(star.profile[1]).toBeCloseTo(6488.7, 0)
  })

  it('[INS-002] Given a raw colour frame\'s star, When measured, Then its peak, background and profile are per pixel of the frame, not per binned cell', () => {
    const star = brightestStar({ ...frame(160, 120, [{ x: 81, y: 61, peak: 8000, sigma: 3 }]), bayer: 'RGGB' }, 'bayer')!
    expect(star.y).toBeCloseTo(61.5, 1)
    expect(star.fwhm).toBeCloseTo(7.19, 1)
    expect(star.peak).toBeCloseTo(7568, -1)
    expect(star.background).toBeCloseTo(1000, 0)
    expect(star.profile[0]).toBe(star.peak)
    expect(star.profile[2]).toBeCloseTo(3046, -1)
  })

  it('[INS-002] Given a colour image of three equal planes, When its star is measured, Then it matches the same frame measured as mono', () => {
    const base = frame(100, 80, [{ x: 40, y: 30, peak: 9000, sigma: 1.5 }])
    const mono = brightestStar(base, 'mono')!
    const colour = brightestStar({ ...base, planes: [base.planes[0], base.planes[0], base.planes[0]] }, 'colour')!
    expect(colour.x).toBeCloseTo(mono.x, 3)
    expect(colour.fwhm).toBeCloseTo(mono.fwhm, 3)
    expect(colour.peak).toBeCloseTo(mono.peak, 1)
    expect(colour.background).toBeCloseTo(mono.background, 2)
  })

  it('[INS-002] Given 59 or 60 saturated stars brighter than an unsaturated one, When inspected, Then the unsaturated one is found within 60 tries and not after', () => {
    const grid = (n: number) => {
      const stars = Array.from({ length: n }, (_, i) => ({ x: 10 + (i % 10) * 16, y: 10 + Math.floor(i / 10) * 16, peak: 90000 + i * 100, sigma: 1.2 }))
      return frame(180, 160, [...stars, { x: 90, y: 140, peak: 5000, sigma: 1.5 }], {}, Infinity)
    }
    expect(brightestStar(grid(59), 'mono')?.x).toBeCloseTo(90.5, 1)
    expect(brightestStar(grid(60), 'mono')).toBeNull()
  })

  it('[INS-002] Given a star just over and one just under 98% of the ceiling, When inspected, Then the one over is skipped as saturated and the one under is measured', () => {
    expect(brightestStar(frame(100, 80, [{ x: 30, y: 30, peak: 63300, sigma: 1.5 }, { x: 70, y: 50, peak: 5000, sigma: 1.5 }]), 'mono')?.x).toBeCloseTo(70.5, 1)
    expect(brightestStar(frame(100, 80, [{ x: 30, y: 30, peak: 62000, sigma: 1.5 }, { x: 70, y: 50, peak: 5000, sigma: 1.5 }]), 'mono')?.x).toBeCloseTo(30.5, 1)
  })

  it('[INS-002] Given a file of no stated ceiling, When inspected, Then 0 to 1 data saturates at 1 and wider data skips no star', () => {
    const base = frame(100, 80, [{ x: 30, y: 30, peak: 68000, sigma: 1.5 }, { x: 70, y: 50, peak: 5000, sigma: 1.5 }], { saturation: null }, Infinity)
    expect(brightestStar({ ...base, planes: [base.planes[0].map(v => v / 70000)] }, 'mono')?.x).toBeCloseTo(70.5, 1)
    expect(brightestStar({ ...base, planes: [base.planes[0].map(v => v / 60000)] }, 'mono')?.x).toBeCloseTo(30.5, 1)
    expect(brightestStar(base, 'mono')?.x).toBeCloseTo(30.5, 1)
  })
})

describe('Radial profiles', () => {
  it('[INS-002] Given a plane and a centre off the pixel grid, When the profile is taken, Then each ring is the mean above the background of the pixels nearest that distance', () => {
    const plane = { width: 5, height: 5, data: new Float32Array(25).map((_, i) => i) }
    expect(radialProfile(plane, 2.4, 2, 0, 1)).toEqual([12, 74 / 6])
    expect(radialProfile(plane, 2.6, 2, 0, 1)).toEqual([13, 76 / 6])
    expect(radialProfile({ ...plane, data: new Float32Array(25).map((_, i) => (i % 5) + 10 * Math.floor(i / 5)) }, 2, 2.4, 0, 1)).toEqual([22, 152 / 6])
    expect(radialProfile({ ...plane, data: new Float32Array(25).map((_, i) => (i % 5) + 10 * Math.floor(i / 5)) }, 2, 2.6, 0, 1)).toEqual([32, 172 / 6])
  })

  it('[INS-002] Given a centre at the corner or rings beyond the plane, When the profile is taken, Then only pixels inside count and empty rings are 0', () => {
    const plane = { width: 3, height: 3, data: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) }
    expect(radialProfile(plane, 0, 0, 1, 2)).toEqual([0, 8 / 3, 5])
    expect(radialProfile(plane, 2, 2, 1, 2)).toEqual([8, 16 / 3, 3])
    expect(radialProfile({ width: 1, height: 1, data: new Float32Array([7]) }, 0, 0, 2, 2)).toEqual([5, 0, 0])
  })
})

describe('Stretch and previews in detail', () => {
  it('[INS-007] Given the midtones transfer, When applied inside and beyond 0 to 1, Then values follow the curve and are held at the ends', () => {
    expect(mtf(0.25, 0.5)).toBeCloseTo(0.75, 12)
    expect(mtf(0.75, 0.3)).toBeCloseTo(0.125, 12)
    expect(mtf(0.25, -0.5)).toBe(0)
    expect(mtf(0.25, 2)).toBe(1)
  })

  it('[INS-007] Given spread, tight and flat values, When auto-stretched, Then the shadows and midtones follow the median and MAD rule exactly', () => {
    expect(autoStretch([0.1, 0.2, 0.3, 0.4, 0.5], { low: 0, high: 1 })).toEqual({ shadows: 0, midtones: expect.closeTo(0.5625, 12), low: 0, high: 1 })
    expect(autoStretch([10, 20, 30, 40, 50], { low: 0, high: 100 })).toEqual({ shadows: 0, midtones: expect.closeTo(0.5625, 12), low: 0, high: 100 })
    const tight = autoStretch([0.5, 0.51, 0.52, 0.53, 0.54], { low: 0, high: 1 })
    expect(tight.shadows).toBeCloseTo(0.52 - 2.8 * 1.4826 * 0.01, 9)
    expect(tight.midtones).toBeCloseTo(mtf(STRETCH_BACKGROUND, (0.52 - tight.shadows) / (1 - tight.shadows)), 12)
    expect(tight.midtones).toBeCloseTo(0.206005772, 8)
    // A spread far under a millionth: the shadows stop just under the median.
    const thin = autoStretch([0.5, 0.5 + 1e-8, 0.5 + 2e-8], { low: 0, high: 1 })
    expect(thin.shadows).toBeCloseTo(0.5 + 1e-8 - 1e-6, 12)
    expect(thin.midtones).toBeCloseTo(6e-6, 9)
    expect(autoStretch([0, 0, 0], { low: 0, high: 1 }).midtones).toBe(0.5)
    expect(autoStretch([2, 2, 2, 5], { low: 0, high: 1 })).toMatchObject({ shadows: 0, midtones: 1 })
    expect(autoStretch([NaN, 0.3, Infinity], { low: 0, high: 1 }).midtones).toBeCloseTo(mtf(0.25, 0.3), 12)
    expect(autoStretch([3, 4, 5], { low: 3, high: 3 }).shadows).toBe(0)
  })

  it('[INS-007] Given a stretch, When values go through it, Then the shadows clip and the curve is applied, with a range of no width taken as one', () => {
    expect(applyStretch(0.5, { shadows: 0.2, midtones: 0.25, low: 0, high: 1 })).toBe(164)
    expect(applyStretch(0.1, { shadows: 0.2, midtones: 0.25, low: 0, high: 1 })).toBe(0)
    expect(applyStretch(5.5, { shadows: 0, midtones: 0.5, low: 5, high: 5 })).toBe(128)
    expect(applyStretch(10, { shadows: 1, midtones: 0.5, low: 0, high: 10 })).toBe(0)
    expect(applyStretch(60, { shadows: 0, midtones: 0.5, low: 10, high: 110 })).toBe(128)
  })

  it('[INS-005] Given a colour image, When each channel is previewed, Then each is that channel, or the mean of its channels, stretched on its own', () => {
    const img = image([new Float32Array([0, 1]), new Float32Array([1, 0]), new Float32Array([0, 0.5])], 2, 1)
    const data = (channel?: 'colour' | 'red' | 'green' | 'blue' | 'green-blue' | 'luminance') => [...previewImage(img, channel ? { channel } : {}).data]
    expect(data()).toEqual([0, 255, 0, 255, 0, 128])
    expect(data('colour')).toEqual([0, 255, 0, 255, 0, 128])
    expect(data('red')).toEqual([0, 255])
    expect(data('green')).toEqual([255, 0])
    expect(data('blue')).toEqual([0, 128])
    expect(data('green-blue')).toEqual([91, 40])
    expect(data('luminance')).toEqual([46, 83])
    expect([...previewImage(image([new Float32Array([0, 1])], 2, 1), { channel: 'red' }).data]).toEqual([0, 255])
  })

  it('[INS-007] Given a mono image of no stated ceiling, When previewed, Then it is stretched up to its own brightest pixel', () => {
    expect([...previewImage(image([new Float32Array([0, 50, 100])], 3, 1, { saturation: null })).data]).toEqual([0, 64, 255])
    expect([...previewImage(image([new Float32Array([5, 5])], 2, 1, { saturation: null, black: 5 })).data]).toEqual([0, 0])
    expect([...previewImage(image([new Float32Array([0, 0.5, 1])], 3, 1, { saturation: null })).data]).toEqual([0, 64, 255])
  })

  it('[INS-007] Given a raw colour frame, When previewed, Then each cell gives red, the mean of its greens and blue', () => {
    const raw = image([new Float32Array([0, 0.2, 1, 0.6, 0.4, 1, 0.8, 0])], 4, 2, { bayer: 'RGGB' })
    expect([...previewImage(raw).data]).toEqual([0, 32, 255, 255, 112, 0])
    expect(previewImage({ ...raw, planes: [raw.planes[0], raw.planes[0]] }).channels).toBe(1)
  })

  it('[NFR-019] Given a preview asked narrower than one pixel or wider than the image, When made, Then it is at least one pixel and never upscaled', () => {
    expect(previewImage(image([new Float32Array([0, 1, 0, 1])], 4, 1), { maxWidth: 0 })).toMatchObject({ width: 1, height: 1, scale: 0.25 })
    expect(previewImage(image([new Float32Array([0, 1, 0, 1])], 4, 1), { maxWidth: 8 })).toMatchObject({ width: 4, height: 1, scale: 1 })
    expect(previewImage(image([new Float32Array([0, 1, 0, 1])], 4, 1), { maxWidth: 3 })).toMatchObject({ width: 2, height: 1, scale: 0.5 })
    expect(previewImage(image([new Float32Array([0, 1, 0, 1])], 4, 1), { maxWidth: 2 })).toMatchObject({ width: 2, scale: 0.5 })
  })

  it('[INS-007] Given a plane smaller than the block or with a block of no finite pixel, When downsampled, Then it is one pixel wide and the empty block is 0', () => {
    expect([...downsample(new Float32Array([4, 6]), 1, 2, 2, false).data]).toEqual([4])
    expect(downsample(new Float32Array([4, 6]), 1, 2, 2, false)).toMatchObject({ width: 1, height: 1 })
    expect([...downsample(new Float32Array([NaN, NaN, 1, 3]), 4, 1, 2, false).data]).toEqual([0, 0])
    expect([...downsample(new Float32Array([NaN, NaN, 1, 3, 2, 2, 5, 7]), 4, 2, 2, false).data]).toEqual([2, 4])
    expect([...downsample(new Float32Array([1, 2, 3, 4, 5, 6]), 2, 3, 1, true).data]).toEqual([5, 6, 3, 4, 1, 2])
  })

  it('[INS-001] Given a channel clipped exactly at the warning share at the black end, When judged, Then it is not worth a warning', () => {
    expect(clipping({ saturatedShare: 0, blackShare: CLIP_WARNING_SHARE })).toEqual({ saturated: false, black: false })
    expect(clipping({ saturatedShare: 0.0011, blackShare: 0.0011 })).toEqual({ saturated: true, black: true })
  })
})
