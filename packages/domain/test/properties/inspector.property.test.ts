import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { applyStretch, autoStretch, channelStats, downsample, histogram, mtf } from '@astro/domain'
import { propertyParams } from './arbitraries'

/** Pixel values as images hold them, with the odd NaN or infinity a float file can carry. */
const pixels = fc.array(fc.oneof({ weight: 20, arbitrary: fc.double({ min: -1e6, max: 1e6, noNaN: true }) }, { weight: 1, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity) }), { maxLength: 300 })
const range = fc.tuple(fc.double({ min: -1e6, max: 1e6, noNaN: true }), fc.double({ min: 0, max: 1e6, noNaN: true })).map(([min, span]) => ({ min, max: min + span }))
const unit = fc.double({ min: 0, max: 1, noNaN: true })
const midtone = fc.double({ min: 0.001, max: 0.999, noNaN: true })

describe('histograms', () => {
  it('[INS-001, FUZ-006] Given any values and range, When binned, Then there are as many bins as asked and the counts add up to the finite values', () => {
    fc.assert(
      fc.property(pixels, range, fc.integer({ min: 1, max: 512 }), (values, r, bins) => {
        const h = histogram(values, r, bins)
        expect(h.counts).toHaveLength(bins)
        expect(h.counts.every(c => Number.isInteger(c) && c >= 0)).toBe(true)
        expect(h.counts.reduce((a, b) => a + b, 0)).toBe(values.filter(Number.isFinite).length)
        expect(h).toMatchObject({ min: r.min, max: r.max })
      }),
      propertyParams()
    )
  })

  it('[INS-001, FUZ-006] Given values and a range anywhere in a double\'s span, When binned, Then no finite value is lost', () => {
    const anyFinite = fc.oneof(fc.double({ noNaN: true, noDefaultInfinity: true }), fc.constantFrom(Number.MAX_VALUE, -Number.MAX_VALUE, 1e308, -1e308, 0))
    fc.assert(
      fc.property(fc.array(anyFinite, { maxLength: 20 }), anyFinite, anyFinite, (values, a, b) => {
        const h = histogram(values, { min: Math.min(a, b), max: Math.max(a, b) }, 16)
        expect(h.counts.reduce((x, y) => x + y, 0)).toBe(values.length)
      }),
      propertyParams()
    )
  })

  it('[INS-001, FUZ-006] Given values in a range, When binned, Then a larger value never lands in an earlier bin', () => {
    fc.assert(
      fc.property(range, unit, unit, (r, a, b) => {
        const [lo, hi] = [Math.min(a, b), Math.max(a, b)].map(t => r.min + t * (r.max - r.min))
        const bin = (v: number) => histogram([v], r, 64).counts.findIndex(c => c === 1)
        expect(bin(hi)).toBeGreaterThanOrEqual(bin(lo))
      }),
      propertyParams()
    )
  })

  it('[INS-001, FUZ-006] Given any channel, When its statistics are taken, Then the shares are fractions, the noise is not negative and the median lies within the values', () => {
    fc.assert(
      fc.property(pixels, fc.option(fc.double({ min: -1e6, max: 1e6, noNaN: true }), { nil: null }), fc.double({ min: -1e6, max: 1e6, noNaN: true }), (values, saturation, black) => {
        const s = channelStats('L', values, { saturation, black })
        const finite = values.filter(Number.isFinite)
        expect(s.blackShare).toBeGreaterThanOrEqual(0)
        expect(s.blackShare).toBeLessThanOrEqual(1)
        if (s.saturatedShare !== null) expect(s.saturatedShare >= 0 && s.saturatedShare <= 1).toBe(true)
        expect(s.noise).toBeGreaterThanOrEqual(0)
        if (finite.length > 0) {
          expect(s.median).toBeGreaterThanOrEqual(Math.min(...finite))
          expect(s.median).toBeLessThanOrEqual(Math.max(...finite))
        }
      }),
      propertyParams()
    )
  })
})

describe('the midtones transfer function', () => {
  it('[INS-005, FUZ-006] Given any midtones balance, When applied, Then 0 stays 0, 1 stays 1, the balance maps to one half and the output stays within 0 to 1', () => {
    fc.assert(
      fc.property(midtone, unit, (m, x) => {
        expect(mtf(m, 0)).toBe(0)
        expect(mtf(m, 1)).toBe(1)
        expect(mtf(m, m)).toBeCloseTo(0.5, 9)
        const y = mtf(m, x)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(1 + 1e-12)
      }),
      propertyParams()
    )
  })

  it('[INS-005, FUZ-006] Given any midtones balance, When applied to two values, Then the brighter stays at least as bright', () => {
    fc.assert(
      fc.property(midtone, unit, unit, (m, a, b) => {
        expect(mtf(m, Math.max(a, b))).toBeGreaterThanOrEqual(mtf(m, Math.min(a, b)) - 1e-12)
      }),
      propertyParams()
    )
  })
})

describe('the auto-stretch', () => {
  const stretchRange = fc.tuple(fc.double({ min: -1000, max: 1000, noNaN: true }), fc.double({ min: 1e-3, max: 1e5, noNaN: true })).map(([low, span]) => ({ low, high: low + span }))

  it('[INS-005, FUZ-006] Given any values, When auto-stretched, Then the shadows clip below one and the midtones balance lies in 0 to 1', () => {
    fc.assert(
      fc.property(pixels, stretchRange, (values, r) => {
        const s = autoStretch(values, r)
        expect(s.shadows).toBeGreaterThanOrEqual(0)
        expect(s.shadows).toBeLessThan(1)
        expect(s.midtones).toBeGreaterThanOrEqual(0)
        expect(s.midtones).toBeLessThanOrEqual(1)
        expect(s).toMatchObject({ low: r.low, high: r.high })
      }),
      propertyParams()
    )
  })

  it('[INS-005, INS-007, FUZ-006] Given a stretch, When values go through it, Then each comes out a whole number from 0 to 255 and a brighter value never comes out darker', () => {
    fc.assert(
      fc.property(pixels, stretchRange, fc.double({ min: -2000, max: 2e5, noNaN: true }), fc.double({ min: -2000, max: 2e5, noNaN: true }), (values, r, a, b) => {
        const s = autoStretch(values, r)
        const [lo, hi] = [applyStretch(Math.min(a, b), s), applyStretch(Math.max(a, b), s)]
        for (const v of [lo, hi]) {
          expect(Number.isInteger(v)).toBe(true)
          expect(v >= 0 && v <= 255).toBe(true)
        }
        expect(hi).toBeGreaterThanOrEqual(lo)
      }),
      propertyParams()
    )
  })
})

describe('downsampling a preview', () => {
  it('[INS-005, FUZ-006] Given any plane and factor, When downsampled, Then the preview is the plane\'s size over the factor, at least one pixel, and each pixel lies within the values it averages', () => {
    const plane = fc.record({ width: fc.integer({ min: 1, max: 24 }), height: fc.integer({ min: 1, max: 24 }) }).chain(({ width, height }) =>
      fc.record({ width: fc.constant(width), height: fc.constant(height), data: fc.array(fc.double({ min: -1e4, max: 1e4, noNaN: true }), { minLength: width * height, maxLength: width * height }) })
    )
    fc.assert(
      fc.property(plane, fc.integer({ min: 1, max: 30 }), fc.boolean(), (p, factor, bottomUp) => {
        const out = downsample(Float32Array.from(p.data), p.width, p.height, factor, bottomUp)
        expect(out.width).toBe(Math.max(1, Math.floor(p.width / factor)))
        expect(out.height).toBe(Math.max(1, Math.floor(p.height / factor)))
        expect(out.data).toHaveLength(out.width * out.height)
        const f32 = Float32Array.from(p.data)
        const [min, max] = [Math.min(...f32), Math.max(...f32)]
        for (const v of out.data) expect(v >= min - 1e-3 && v <= max + 1e-3).toBe(true)
      }),
      propertyParams()
    )
  })
})
