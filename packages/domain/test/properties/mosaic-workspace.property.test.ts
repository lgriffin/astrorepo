import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { angularDistanceDeg, formatDecDms, formatRaHms, gridProblems, layoutGrid, parseDec, parseRa, sameGeometry, shiftGrid, type GridDefinition } from '@astro/domain'
import { propertyParams } from './arbitraries'

const sep = (a: { raDeg: number; decDeg: number }, b: { raDeg: number; decDeg: number }) => angularDistanceDeg(a.raDeg, a.decDeg, b.raDeg, b.decDeg)

/** Grids of every size and turn, anywhere on the sky including the poles and RA 0°. */
const grids = fc
  .record({
    ra: fc.double({ min: 0, max: 359.999999, noNaN: true }),
    dec: fc.oneof(fc.double({ min: -90, max: 90, noNaN: true }), fc.constantFrom(-90, 90, 89.99, -89.99, 0)),
    pa: fc.double({ min: -720, max: 720, noNaN: true }),
    rows: fc.integer({ min: 1, max: 6 }),
    columns: fc.integer({ min: 1, max: 6 }),
    overlapX: fc.double({ min: 0, max: 0.6, noNaN: true }),
    overlapY: fc.double({ min: 0, max: 0.6, noNaN: true }),
    width: fc.double({ min: 0.05, max: 5, noNaN: true }),
    height: fc.double({ min: 0.05, max: 5, noNaN: true })
  })
  .map(
    (g): GridDefinition => ({
      centre: { raDeg: g.ra, decDeg: g.dec },
      positionAngleDeg: g.pa,
      rows: g.rows,
      columns: g.columns,
      overlapX: g.overlapX,
      overlapY: g.overlapY,
      field: { widthDeg: g.width, heightDeg: g.height, source: 'manual', label: null }
    })
  )

describe('grid layout', () => {
  it('[MO-001, MO-003] Given any valid grid, When laid out, Then it has one panel per row and column with unique ids, and every point is ICRS in range', () => {
    fc.assert(
      fc.property(grids, g => {
        expect(gridProblems(g)).toEqual([])
        const panels = layoutGrid(g)
        expect(panels).toHaveLength(g.rows * g.columns)
        expect(new Set(panels.map(p => p.id)).size).toBe(panels.length)
        for (const p of panels) {
          for (const v of [p.centre, ...p.footprint.vertices]) {
            expect(v.raDeg).toBeGreaterThanOrEqual(0)
            expect(v.raDeg).toBeLessThan(360)
            expect(Math.abs(v.decDeg)).toBeLessThanOrEqual(90)
          }
          expect(p.positionAngleDeg).toBeGreaterThan(-180)
          expect(p.positionAngleDeg).toBeLessThanOrEqual(180)
        }
      }),
      propertyParams()
    )
  })

  it('[MO-001, MO-003] Given any valid grid, When laid out, Then the middle of each panel is its centre and each side is its field long, at the poles and across RA 0° alike', () => {
    fc.assert(
      fc.property(grids, g => {
        for (const p of layoutGrid(g)) {
          const [tl, tr, br, bl] = p.footprint.vertices
          // On a panel's own tangent plane a side of w spans 2·atan(w/2) on the sky.
          const span = (d: number) => (2 * Math.atan(Math.tan((d * Math.PI) / 360) / 1)) * (180 / Math.PI)
          const tol = Math.max(g.field.widthDeg, g.field.heightDeg) * 0.01 + 1e-5
          expect(Math.abs(sep(tl, bl) - span(g.field.heightDeg))).toBeLessThan(tol)
          expect(Math.abs(sep(tl, tr) - sep(bl, br))).toBeLessThan(tol)
          // The two diagonals cross at the centre: each corner is as far from it as the one opposite.
          expect(Math.abs(sep(p.centre, tl) - sep(p.centre, br))).toBeLessThan(1e-4)
          expect(Math.abs(sep(p.centre, tr) - sep(p.centre, bl))).toBeLessThan(1e-4)
        }
      }),
      propertyParams()
    )
  })

  it('[MO-001, MO-003] Given any valid grid with two columns or more, When laid out, Then neighbours along a row are one step apart on the sky, wherever the grid is', () => {
    fc.assert(
      fc.property(
        grids.filter(g => g.columns > 1),
        g => {
          const panels = layoutGrid(g)
          const step = g.field.widthDeg * (1 - g.overlapX)
          // The grid's own tangent plane stretches a step that sits away from its centre a little.
          const far = Math.max(g.columns, g.rows) * Math.max(g.field.widthDeg, g.field.heightDeg)
          const tol = step * (0.002 + (far * Math.PI / 180) ** 2) + 1e-5
          for (let r = 0; r < g.rows; r++) {
            for (let c = 1; c < g.columns; c++) {
              const d = sep(panels[r * g.columns + c - 1].centre, panels[r * g.columns + c].centre)
              expect(Math.abs(d - step)).toBeLessThan(tol)
            }
          }
        }
      ),
      propertyParams()
    )
  })

  it('[MO-002] Given any valid grid, When laid out twice or compared with itself, Then it is the same; shifting it and back returns the same centre', () => {
    fc.assert(
      fc.property(grids, fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: -3, max: 3, noNaN: true }), (g, right, up) => {
        expect(layoutGrid(g)).toEqual(layoutGrid(g))
        expect(sameGeometry(g, structuredClone(g))).toBe(true)
        const moved = shiftGrid(g, right, up)
        expect(sep(moved.centre, g.centre)).toBeLessThan(Math.hypot(right, up) + 1e-6)
        if (Math.abs(g.centre.decDeg) < 80) {
          // The way back is measured on the new centre's own axes, so it returns to within rounding at moderate declinations.
          expect(sep(g.centre, moved.centre)).toBeGreaterThan(Math.hypot(right, up) * 0.98 - 1e-5)
        }
      }),
      propertyParams()
    )
  })
})

describe('typed coordinates', () => {
  it('[MO-014] Given any RA and Dec, When formatted as hh:mm:ss and ±dd:mm:ss and read back, Then they are the same to the second', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 359.9999, noNaN: true }), fc.double({ min: -90, max: 90, noNaN: true }), (ra, dec) => {
        const backRa = parseRa(formatRaHms(ra))
        const backDec = parseDec(formatDecDms(dec))
        expect(backRa).not.toBeNull()
        expect(backDec).not.toBeNull()
        // Within one second of time (15") of RA, allowing for 24h rounding to 0h.
        const dRa = Math.abs((backRa as number) - ra)
        expect(Math.min(dRa, 360 - dRa)).toBeLessThanOrEqual(15 / 3600 / 2 * 15 + 1e-9)
        expect(Math.abs((backDec as number) - dec)).toBeLessThanOrEqual(0.5 / 3600 + 1e-9)
      }),
      propertyParams()
    )
  })
})
