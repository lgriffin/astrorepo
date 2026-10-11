import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  MOSAIC_MIN_OVERLAP,
  angularDistanceDeg,
  formatDecDms,
  formatRaHms,
  normaliseAngle,
  offsetPosition,
  planMosaic,
  projectPosition
} from '@astro/domain'
import { propertyParams } from './arbitraries'

const angle = fc.double({ min: -1e6, max: 1e6, noNaN: true })
const ra = fc.double({ min: 0, max: 359.999, noNaN: true })
const dec = fc.double({ min: -89.9, max: 89.9, noNaN: true })
/** A small offset on the tangent plane, as mosaic tiles and image corners are. */
const offset = fc.double({ min: -10, max: 10, noNaN: true })

describe('angles', () => {
  it('[SKY-006, FUZ-006] Given any angle, When normalised, Then it lies in (-180, 180], differs by whole turns and normalising again changes nothing', () => {
    fc.assert(
      fc.property(angle, a => {
        const n = normaliseAngle(a)
        expect(n).toBeGreaterThan(-180)
        expect(n).toBeLessThanOrEqual(180)
        const turns = (a - n) / 360
        expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-6)
        expect(normaliseAngle(n)).toBe(n)
      }),
      propertyParams()
    )
  })

  it('[SKY-005, FUZ-006] Given any two positions, When their separation is measured, Then it lies in [0, 180], is the same either way round and is zero from a position to itself', () => {
    fc.assert(
      fc.property(ra, dec, ra, dec, (r1, d1, r2, d2) => {
        const d = angularDistanceDeg(r1, d1, r2, d2)
        expect(d).toBeGreaterThanOrEqual(0)
        expect(d).toBeLessThanOrEqual(180)
        expect(d).toBeCloseTo(angularDistanceDeg(r2, d2, r1, d1), 9)
        expect(angularDistanceDeg(r1, d1, r1, d1)).toBeLessThan(1e-4)
      }),
      propertyParams()
    )
  })

  it('[SKY-005, FUZ-006] Given three positions, When separations are measured, Then going through the third is never shorter', () => {
    fc.assert(
      fc.property(ra, dec, ra, dec, ra, dec, (r1, d1, r2, d2, r3, d3) => {
        expect(angularDistanceDeg(r1, d1, r3, d3)).toBeLessThanOrEqual(angularDistanceDeg(r1, d1, r2, d2) + angularDistanceDeg(r2, d2, r3, d3) + 1e-6)
      }),
      propertyParams()
    )
  })

  it('[SKY-009, FUZ-006] Given any position, When written as sexagesimal and read back, Then it is within half an arc second of where it was', () => {
    const read = (text: string) => {
      const [a, b, c] = text.replace(/^[+-]/, '').split(':').map(Number)
      return (text.startsWith('-') ? -1 : 1) * (a + b / 60 + c / 3600)
    }
    fc.assert(
      fc.property(ra, dec, (r, d) => {
        const back = read(formatRaHms(r)) * 15
        expect(Math.min(Math.abs(back - r), 360 - Math.abs(back - r)) * 3600).toBeLessThanOrEqual(0.5 * 15 + 1e-6)
        expect(Math.abs(read(formatDecDms(d)) - d) * 3600).toBeLessThanOrEqual(0.5 + 1e-6)
        expect(formatRaHms(r)).toMatch(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/)
      }),
      propertyParams()
    )
  })
})

describe('the tangent plane', () => {
  it('[SKY-007, FUZ-006] Given a centre and a small offset, When the offset is put on the sky and projected back, Then it comes back where it was', () => {
    fc.assert(
      fc.property(ra, fc.double({ min: -80, max: 80, noNaN: true }), offset, offset, (r, d, xi, eta) => {
        const at = offsetPosition({ raDeg: r, decDeg: d }, xi, eta)
        expect(at.raDeg).toBeGreaterThanOrEqual(0)
        expect(at.raDeg).toBeLessThan(360)
        expect(Math.abs(at.decDeg)).toBeLessThanOrEqual(90)
        const back = projectPosition({ raDeg: r, decDeg: d }, at)!
        expect(back.xi).toBeCloseTo(xi, 4)
        expect(back.eta).toBeCloseTo(eta, 4)
      }),
      propertyParams()
    )
  })
})

describe('mosaic plans', () => {
  const request = fc.record({
    centre: fc.record({ raDeg: ra, decDeg: fc.double({ min: -70, max: 70, noNaN: true }) }),
    targetWidthArcmin: fc.double({ min: 1, max: 600, noNaN: true }),
    targetHeightArcmin: fc.double({ min: 1, max: 600, noNaN: true }),
    field: fc.record({ widthDeg: fc.double({ min: 0.2, max: 5, noNaN: true }), heightDeg: fc.double({ min: 0.2, max: 5, noNaN: true }) }),
    rotationDeg: fc.double({ min: -360, max: 360, noNaN: true }),
    overlap: fc.double({ min: -1, max: 1, noNaN: true })
  })

  it('[SKY-007, FUZ-006] Given any target and field, When a mosaic is planned, Then the overlap is at least 15% and at most half, and the panels together cover the target', () => {
    fc.assert(
      fc.property(request, req => {
        const plan = planMosaic(req)
        expect(plan.overlap).toBeGreaterThanOrEqual(MOSAIC_MIN_OVERLAP)
        expect(plan.overlap).toBeLessThanOrEqual(0.5)
        const t = (normaliseAngle(req.rotationDeg) * Math.PI) / 180
        const [w, h] = [req.targetWidthArcmin / 60, req.targetHeightArcmin / 60]
        // The target's extent along the panels' turned axes, as the plan measures it; the cover is rounded to 0.001°.
        expect(plan.coverWidthDeg).toBeGreaterThanOrEqual(w * Math.abs(Math.cos(t)) + h * Math.abs(Math.sin(t)) - 0.0006)
        expect(plan.coverHeightDeg).toBeGreaterThanOrEqual(w * Math.abs(Math.sin(t)) + h * Math.abs(Math.cos(t)) - 0.0006)
      }),
      propertyParams()
    )
  })

  it('[SKY-007, FUZ-006] Given any mosaic, When its tiles are listed, Then there is one per row and column, numbered from 1 row by row, and one tile means the target fits one field', () => {
    fc.assert(
      fc.property(request, req => {
        const plan = planMosaic(req)
        expect(plan.tiles.length).toBe(plan.rows * plan.columns)
        plan.tiles.forEach((tile, i) => {
          expect(tile.index).toBe(i + 1)
          expect(tile.row).toBe(Math.floor(i / plan.columns) + 1)
          expect(tile.column).toBe((i % plan.columns) + 1)
        })
        expect(plan.fitsOneField).toBe(plan.tiles.length === 1)
      }),
      propertyParams()
    )
  })

  it('[SKY-007, FUZ-006] Given any mosaic, When its tiles are laid on the target\'s tangent plane, Then neighbours sit one field less the overlap apart, so each pair shares at least 15% of a field', () => {
    fc.assert(
      fc.property(request, req => {
        const plan = planMosaic(req)
        const step = { x: req.field.widthDeg * (1 - plan.overlap), y: req.field.heightDeg * (1 - plan.overlap) }
        const at = (row: number, column: number) => projectPosition(req.centre, plan.tiles[(row - 1) * plan.columns + column - 1])!
        const apart = (a: { xi: number; eta: number }, b: { xi: number; eta: number }) => Math.hypot(a.xi - b.xi, a.eta - b.eta)
        for (let r = 1; r <= plan.rows; r++) {
          for (let c = 1; c <= plan.columns; c++) {
            if (c < plan.columns) expect(apart(at(r, c), at(r, c + 1))).toBeCloseTo(step.x, 4)
            if (r < plan.rows) expect(apart(at(r, c), at(r + 1, c))).toBeCloseTo(step.y, 4)
          }
        }
      }),
      propertyParams()
    )
  })
})
