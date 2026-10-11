import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { DEFAULT_GRADE_LIMITS, gradeFrames, gradesCsv, rejectedPaths, type GradableLight, type GradeLimits } from '@astro/domain'
import { propertyParams } from './arbitraries'

const measurement = fc.record({
  fwhm: fc.option(fc.double({ min: 0.5, max: 20, noNaN: true }), { nil: null }),
  eccentricity: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
  starCount: fc.nat({ max: 3000 }),
  background: fc.double({ min: 0, max: 60000, noNaN: true }),
  noise: fc.double({ min: 0, max: 500, noNaN: true }),
  snr: fc.option(fc.double({ min: 0, max: 500, noNaN: true }), { nil: null })
})

const lights: fc.Arbitrary<GradableLight[]> = fc
  .array(
    fc.record({
      night: fc.integer({ min: 0, max: 3 }),
      hour: fc.integer({ min: 0, max: 23 }),
      dated: fc.boolean(),
      filter: fc.option(fc.constantFrom('Ha', 'OIII', 'L'), { nil: null }),
      measurement: fc.option(measurement, { nil: null }),
      measureError: fc.option(fc.constantFrom('unreadable', 'too large'), { nil: null }),
      override: fc.option(fc.constantFrom('keep', 'reject') as fc.Arbitrary<'keep' | 'reject'>, { nil: null }),
      overrideBy: fc.option(fc.constantFrom('frame', 'night') as fc.Arbitrary<'frame' | 'night'>, { nil: null })
    }),
    { maxLength: 30 }
  )
  .map(list =>
    list.map((l, i) => ({
      fileId: `f${i}`,
      path: `/lights/f${i}.fit`,
      capturedAt: l.dated ? new Date(Date.UTC(2026, 2, 1 + l.night, l.hour)) : null,
      filter: l.filter,
      measurement: l.measurement,
      measureError: l.measureError,
      override: l.override,
      overrideBy: l.overrideBy
    }))
  )

const limits: fc.Arbitrary<GradeLimits> = fc.record({
  maxEccentricity: fc.double({ min: 0.05, max: 1, noNaN: true }),
  maxFwhmRatio: fc.double({ min: 1, max: 10, noNaN: true }),
  minStarRatio: fc.double({ min: 0, max: 1, noNaN: true }),
  maxBackgroundRatio: fc.double({ min: 1, max: 100, noNaN: true }),
  maxFwhmPixels: fc.option(fc.double({ min: 0.5, max: 100, noNaN: true }), { nil: null })
})

describe('grading', () => {
  it('[GRD-003, GRD-011, FUZ-006] Given any lights and limits, When graded, Then each light gets one verdict in its own order, the counts add up and an unmeasured light is never rejected by the limits', () => {
    fc.assert(
      fc.property(lights, limits, (list, l) => {
        const report = gradeFrames(list, l)
        expect(report.grades.map(g => g.fileId)).toEqual(list.map(x => x.fileId))
        expect(report.kept + report.rejected + report.unmeasured).toBe(list.length)
        report.grades.forEach((g, i) => {
          if (list[i].measurement === null && list[i].override === null) expect(g.verdict).toBe('unmeasured')
          if (g.verdict === 'reject' && list[i].override === null) expect(g.reasons.length).toBeGreaterThan(0)
        })
        expect(report.nights.reduce((n, s) => n + s.frames, 0)).toBe(list.length)
      }),
      propertyParams()
    )
  })

  it('[GRD-005, FUZ-006] Given any lights, When one is kept or rejected by hand, Then that choice is its verdict whatever the limits say', () => {
    fc.assert(
      fc.property(lights, limits, (list, l) => {
        gradeFrames(list, l).grades.forEach((g, i) => {
          if (list[i].override) {
            expect(g.verdict).toBe(list[i].override)
            expect(g.overrideBy).toBe(list[i].overrideBy ?? 'frame')
          }
        })
      }),
      propertyParams()
    )
  })

  it('[GRD-003, GRD-010, FUZ-006] Given any lights, When the limits are tightened, Then every light rejected before is still rejected', () => {
    fc.assert(
      fc.property(lights, limits, fc.double({ min: 0, max: 1, noNaN: true }), (list, loose, t) => {
        const tight: GradeLimits = {
          maxEccentricity: Math.max(0.05, loose.maxEccentricity * (1 - t)),
          maxFwhmRatio: Math.max(1, loose.maxFwhmRatio * (1 - t)),
          minStarRatio: Math.min(1, loose.minStarRatio + t * (1 - loose.minStarRatio)),
          maxBackgroundRatio: Math.max(1, loose.maxBackgroundRatio * (1 - t)),
          maxFwhmPixels: loose.maxFwhmPixels === null ? null : Math.max(0.5, loose.maxFwhmPixels * (1 - t))
        }
        const before = rejectedPaths(gradeFrames(list, loose))
        const after = rejectedPaths(gradeFrames(list, tight))
        for (const p of before) expect(after.has(p)).toBe(true)
      }),
      propertyParams()
    )
  })

  it('[GRD-006, FUZ-006] Given any lights, When weighted, Then only kept lights with an SNR carry a weight, from 0 to 1, and the best is 1', () => {
    fc.assert(
      fc.property(lights, list => {
        const grades = gradeFrames(list, DEFAULT_GRADE_LIMITS).grades
        for (const g of grades) {
          if (g.weight === null) continue
          expect(g.verdict).toBe('keep')
          expect(g.weight).toBeGreaterThanOrEqual(0)
          expect(g.weight).toBeLessThanOrEqual(1)
        }
        if (grades.some(g => g.weight !== null && g.weight > 0)) expect(Math.max(...grades.map(g => g.weight ?? 0))).toBe(1)
      }),
      propertyParams()
    )
  })

  it('[GRD-008, FUZ-006] Given any lights, When the grades are exported, Then there is a header and one CRLF row per light, and the rejected paths are a subset of the lights', () => {
    fc.assert(
      fc.property(lights, list => {
        const report = gradeFrames(list, DEFAULT_GRADE_LIMITS)
        const rows = gradesCsv(report).split('\r\n')
        expect(rows.at(-1)).toBe('')
        expect(rows.length - 2).toBe(list.length)
        const paths = new Set(list.map(x => x.path))
        for (const p of rejectedPaths(report)) expect(paths.has(p)).toBe(true)
      }),
      propertyParams()
    )
  })
})
