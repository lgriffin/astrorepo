import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { intersectFootprints, layoutGrid, placeFootprint, rectangleOnSky, solvedFootprint, sphericalArea } from '@astro/domain'
import { propertyParams } from './arbitraries'

/** Fields anywhere on the sky, turned any way, a few arcminutes to several degrees on a side. */
const fields = fc.record({
  raDeg: fc.double({ min: 0, max: 359.999, noNaN: true }),
  decDeg: fc.double({ min: -89.9, max: 89.9, noNaN: true }),
  width: fc.double({ min: 0.05, max: 6, noNaN: true }),
  height: fc.double({ min: 0.05, max: 6, noNaN: true }),
  pa: fc.double({ min: -360, max: 360, noNaN: true })
})
/** A second field near the first, so they often overlap. */
const pairs = fields.chain(a =>
  fc.record({ dx: fc.double({ min: -4, max: 4, noNaN: true }), dy: fc.double({ min: -4, max: 4, noNaN: true }), b: fields }).map(({ dx, dy, b }) => ({
    a,
    b: { ...b, raDeg: (((a.raDeg + dx) % 360) + 360) % 360, decDeg: Math.max(-89.9, Math.min(89.9, a.decDeg + dy)) }
  }))
)
const poly = (f: { raDeg: number; decDeg: number; width: number; height: number; pa: number }) => rectangleOnSky({ raDeg: f.raDeg, decDeg: f.decDeg }, f.width, f.height, f.pa)

describe('properties of footprint overlaps', () => {
  it('[MO-004] Given any two footprints, When they meet, Then the overlap is no bigger than the smaller of them and the same either way round', () => {
    fc.assert(
      fc.property(pairs, ({ a, b }) => {
        const [pa, pb] = [poly(a), poly(b)]
        const ab = intersectFootprints(pa, pb)?.areaSqDeg ?? 0
        const ba = intersectFootprints(pb, pa)?.areaSqDeg ?? 0
        const smaller = Math.min(sphericalArea(pa.vertices), sphericalArea(pb.vertices))
        expect(ab).toBeGreaterThanOrEqual(0)
        expect(ab).toBeLessThanOrEqual(smaller * (1 + 1e-6) + 1e-9)
        expect(Math.abs(ab - ba)).toBeLessThanOrEqual(1e-6 * Math.max(1, smaller))
      }),
      propertyParams()
    )
  })

  it('[MO-004] Given any footprint, When it meets itself, Then the overlap is all of it', () => {
    fc.assert(
      fc.property(fields, f => {
        const p = poly(f)
        expect(intersectFootprints(p, p)?.areaSqDeg ?? 0).toBeCloseTo(sphericalArea(p.vertices), 6)
      }),
      propertyParams()
    )
  })

  it('[MO-005] Given any solved field and grid, When placed, Then every share is from 2% to 100%, sorted, and the primary panel is the first', () => {
    fc.assert(
      fc.property(fields, fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), fc.boolean(), (g, dx, dy, flipped) => {
        const grid = { centre: { raDeg: g.raDeg, decDeg: Math.max(-80, Math.min(80, g.decDeg)) }, positionAngleDeg: g.pa, rows: 3, columns: 3, overlapX: 0.15, overlapY: 0.15, field: { widthDeg: 1, heightDeg: 1, source: 'manual' as const, label: null } }
        const panels = layoutGrid(grid)
        const field = { raDeg: (((grid.centre.raDeg + dx) % 360) + 360) % 360, decDeg: grid.centre.decDeg + dy, rotationDeg: g.pa, scaleArcsec: 3.6, widthPx: 1000, heightPx: 800, flipped }
        const placement = placeFootprint(solvedFootprint(field), panels)
        const shares = placement.intersections.map(i => i.captureFraction)
        for (const i of placement.intersections) {
          expect(i.captureFraction).toBeGreaterThanOrEqual(0.02)
          expect(i.captureFraction).toBeLessThanOrEqual(1)
          expect(i.panelCoverage).toBeGreaterThanOrEqual(0)
          expect(i.panelCoverage).toBeLessThanOrEqual(1)
        }
        expect([...shares].sort((x, y) => y - x)).toEqual(shares)
        expect(placement.primary).toBe(placement.intersections[0]?.panelId ?? null)
        expect(placement.strength === 'none').toBe(placement.intersections.length === 0)
      }),
      propertyParams()
    )
  })
})
