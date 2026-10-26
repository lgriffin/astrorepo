import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { countOnce, coverageMap, layoutGrid, rectangleOnSky, type CountInput } from '@astro/domain'
import { propertyParams } from './arbitraries'

/** A small grid anywhere short of the poles, and footprints scattered over it. */
const scenes = fc.record({
  raDeg: fc.double({ min: 0, max: 359.999, noNaN: true }),
  decDeg: fc.double({ min: -80, max: 80, noNaN: true }),
  rows: fc.integer({ min: 1, max: 3 }),
  columns: fc.integer({ min: 1, max: 3 }),
  pa: fc.double({ min: -180, max: 180, noNaN: true }),
  shots: fc.array(
    fc.record({ dx: fc.double({ min: -1.5, max: 1.5, noNaN: true }), dy: fc.double({ min: -1.5, max: 1.5, noNaN: true }), size: fc.double({ min: 0.2, max: 1.5, noNaN: true }), seconds: fc.integer({ min: 1, max: 3600 }) }),
    { maxLength: 5 }
  )
})

type Scene = { raDeg: number; decDeg: number; rows: number; columns: number; pa: number; shots: { dx: number; dy: number; size: number; seconds: number }[] }

const build = (s: Scene) => {
  const centre = { raDeg: s.raDeg, decDeg: s.decDeg }
  const panels = layoutGrid({ centre, positionAngleDeg: s.pa, rows: s.rows, columns: s.columns, overlapX: 0.1, overlapY: 0.1, field: { widthDeg: 1, heightDeg: 1, source: 'manual', label: null } })
  const sources = s.shots.map((shot, i) => ({
    id: `s${i}`,
    footprint: rectangleOnSky({ raDeg: (((s.raDeg + shot.dx / Math.cos((s.decDeg * Math.PI) / 180)) % 360) + 360) % 360, decDeg: Math.max(-89, Math.min(89, s.decDeg + shot.dy)) }, shot.size, shot.size, s.pa),
    exposures: [{ filter: 'Ha', seconds: shot.seconds }]
  }))
  return { centre, panels, sources }
}

describe('properties of mosaic coverage', () => {
  it('[MO-018] Given any captures over a grid, When coverage is worked out, Then each panel is covered between 0 and 1, and adding a capture never lowers it or the depth', () => {
    fc.assert(
      fc.property(scenes, s => {
        const { centre, panels, sources } = build(s)
        const before = coverageMap(centre, panels, sources.slice(0, -1), { cellsPerPanel: 6 })
        const after = coverageMap(centre, panels, sources, { cellsPerPanel: 6 })
        after.panels.forEach((p, i) => {
          expect(p.fraction).toBeGreaterThanOrEqual(0)
          expect(p.fraction).toBeLessThanOrEqual(1)
          expect(p.fraction).toBeGreaterThanOrEqual(before.panels[i].fraction)
          expect(p.deepestSec).toBeGreaterThanOrEqual(before.panels[i].deepestSec)
          expect(p.gaps.reduce((t, g) => t + g.fraction, 0)).toBeLessThanOrEqual(1 - p.fraction + 1e-3)
        })
      }),
      propertyParams()
    )
  })

  it('[MO-011] Given any captures, When the same frames are indexed again in another folder, Then the exposure counted does not change', () => {
    const frames = fc.array(fc.record({ name: fc.constantFrom('a', 'b', 'c', 'd'), seconds: fc.integer({ min: 1, max: 600 }), rejected: fc.boolean() }), { minLength: 1, maxLength: 6 })
    fc.assert(
      fc.property(frames, list => {
        const unique = [...new Map(list.map(f => [f.name, f])).values()]
        const capture = (folder: string): CountInput => ({
          id: folder,
          kind: 'lights',
          panelId: 'R1C1',
          frames: unique.map(f => ({ path: `${folder}/${f.name}.fit`, filter: 'Ha', seconds: f.seconds, hash: f.name, rejected: f.rejected }))
        })
        const total = (counted: ReturnType<typeof countOnce>) => counted.flatMap(c => c.exposures).reduce((t, e) => t + e.seconds, 0)
        const once = total(countOnce([capture('/a')]))
        expect(total(countOnce([capture('/a'), capture('/b')]))).toBe(once)
        expect(once).toBe(unique.filter(f => !f.rejected).reduce((t, f) => t + f.seconds, 0))
      }),
      propertyParams()
    )
  })
})
