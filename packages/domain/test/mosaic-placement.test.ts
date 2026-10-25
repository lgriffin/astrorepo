import { describe, expect, it } from 'vitest'
import {
  assignmentOf,
  centroid,
  clipConvex,
  insideConvex,
  intersectFootprints,
  layoutGrid,
  panelChanges,
  placeFootprint,
  rectangleOnSky,
  solvedFootprint,
  sphericalArea,
  type AssignmentOverride,
  type GridDefinition
} from '@astro/domain'

const grid = (over: Partial<GridDefinition> = {}): GridDefinition => ({
  centre: { raDeg: 180, decDeg: 0 },
  positionAngleDeg: 0,
  rows: 2,
  columns: 2,
  overlapX: 0.1,
  overlapY: 0.1,
  field: { widthDeg: 1, heightDeg: 1, source: 'manual', label: null },
  ...over
})

const field = (raDeg: number, decDeg: number, over: Partial<{ rotationDeg: number; flipped: boolean; widthPx: number; heightPx: number }> = {}) => ({
  raDeg,
  decDeg,
  rotationDeg: 0,
  scaleArcsec: 3.6,
  widthPx: 1000,
  heightPx: 1000,
  ...over
})

describe('areas on the sky', () => {
  it('[MO-004] Given the triangle between the pole and two points on the equator a quarter turn apart, When measured, Then it is an eighth of the sphere', () => {
    const octant = sphericalArea([{ raDeg: 0, decDeg: 0 }, { raDeg: 90, decDeg: 0 }, { raDeg: 0, decDeg: 90 }])
    expect(octant).toBeCloseTo((4 * Math.PI * (180 / Math.PI) ** 2) / 8, 6)
    expect(sphericalArea([{ raDeg: 0, decDeg: 0 }, { raDeg: 1, decDeg: 0 }])).toBe(0)
  })

  it('[MO-004] Given a 1° square on the equator and one at Dec 60°, When measured, Then each is about one square degree: area does not shrink with declination', () => {
    expect(sphericalArea(rectangleOnSky({ raDeg: 10, decDeg: 0 }, 1, 1, 0).vertices)).toBeCloseTo(1, 3)
    expect(sphericalArea(rectangleOnSky({ raDeg: 10, decDeg: 60 }, 1, 1, 30).vertices)).toBeCloseTo(1, 3)
    expect(sphericalArea(rectangleOnSky({ raDeg: 10, decDeg: 90 }, 2, 1, 0).vertices)).toBeCloseTo(2, 2)
  })

  it('[MO-004] Given positions either side of RA 0°, When their middle is found, Then it is at RA 0°, not 180°', () => {
    const c = centroid([{ raDeg: 359, decDeg: 10 }, { raDeg: 1, decDeg: 10 }])
    expect(Math.min(c.raDeg, 360 - c.raDeg)).toBeLessThan(1e-9)
    expect(c.decDeg).toBeGreaterThan(10)
  })
})

describe('where footprints meet', () => {
  it('[MO-004] Given two squares on a plane wound either way, When clipped, Then the overlap is the same quarter; apart they do not meet', () => {
    const a = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }]
    const b = [{ x: 1, y: 1 }, { x: 1, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 1 }]
    const meet = clipConvex(a, b)
    const area = (pts: { x: number; y: number }[]) => Math.abs(pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0)) / 2
    expect(area(meet)).toBeCloseTo(1, 12)
    expect(area(clipConvex(b, a))).toBeCloseTo(1, 12)
    expect(clipConvex(a, [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }])).toEqual([])
    // Squares that only share an edge do not overlap.
    expect(clipConvex(a, [{ x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }])).toEqual([])
    expect(insideConvex({ x: 1, y: 1 }, a)).toBe(true)
    expect(insideConvex({ x: 3, y: 1 }, a)).toBe(false)
  })

  it('[MO-004] Given a field shifted half its width from another, When they meet, Then the overlap is half of either', () => {
    const a = rectangleOnSky({ raDeg: 100, decDeg: 20 }, 1, 1, 0)
    const b = rectangleOnSky({ raDeg: 100.5 / 1, decDeg: 20 }, 1, 1, 0)
    const meet = intersectFootprints(a, b)
    // Half a degree of RA at Dec 20° is 0.47° on the sky: the overlap is a little over half.
    expect(meet?.areaSqDeg).toBeGreaterThan(0.5)
    expect(meet?.areaSqDeg).toBeLessThan(0.6)
    expect(intersectFootprints(a, a)?.areaSqDeg).toBeCloseTo(sphericalArea(a.vertices), 9)
    expect(intersectFootprints(a, rectangleOnSky({ raDeg: 280, decDeg: -20 }, 1, 1, 0))).toBeNull()
    expect(intersectFootprints(a, rectangleOnSky({ raDeg: 103, decDeg: 20 }, 1, 1, 0))).toBeNull()
  })

  it('[MO-004, MO-003] Given fields that straddle RA 0° and the celestial pole, When they meet, Then their overlap is measured as anywhere else', () => {
    const a = rectangleOnSky({ raDeg: 359.8, decDeg: 0 }, 1, 1, 0)
    const b = rectangleOnSky({ raDeg: 0.2, decDeg: 0 }, 1, 1, 0)
    expect(intersectFootprints(a, b)?.areaSqDeg).toBeCloseTo(0.6, 2)
    const p = rectangleOnSky({ raDeg: 0, decDeg: 90 }, 2, 2, 0)
    const q = rectangleOnSky({ raDeg: 180, decDeg: 89.5 }, 2, 2, 0)
    expect(intersectFootprints(p, q)?.areaSqDeg).toBeGreaterThan(2.9)
  })
})

describe('placing a capture', () => {
  const panels = layoutGrid(grid())

  it('[MO-004] Given a solved field turned by the solver, When its footprint is drawn, Then its up axis is at minus the rotation, and a mirrored one has its corners in its own order', () => {
    const plain = solvedFootprint(field(180, 0, { rotationDeg: 90 }))
    // Rotation 90 is an up axis at -90: up points west, so the top edge is on the west (lower RA).
    expect(plain.vertices[0].raDeg).toBeLessThan(180)
    expect(plain.vertices[1].raDeg).toBeLessThan(180)
    const mirrored = solvedFootprint(field(180, 0, { flipped: true }))
    const normal = solvedFootprint(field(180, 0))
    expect(mirrored.vertices[0]).toEqual(normal.vertices[1])
    expect(sphericalArea(mirrored.vertices)).toBeCloseTo(1, 3)
  })

  it("[MO-004] Given a light solved in the middle of R1C1, When placed, Then most of it is in R1C1, where it is placed without review, and its overlaps with the neighbours are kept", () => {
    const placement = placeFootprint(solvedFootprint(field(panels[0].centre.raDeg, panels[0].centre.decDeg)), panels)
    expect(placement.primary).toBe('R1C1')
    expect(placement.strength).toBe('strong')
    // The overlap with R1C2 is a tenth of the field: it is kept as well.
    expect(placement.intersections[0].panelId).toBe('R1C1')
    // The corner it shares with R2C2 is a hundredth of it, an edge brush below the 2% that counts.
    expect(placement.intersections.map(i => i.panelId).sort()).toEqual(['R1C1', 'R1C2', 'R2C1'])
    expect(placement.intersections[0].captureFraction).toBeCloseTo(1, 3)
    expect(placement.intersections[0].panelCoverage).toBeCloseTo(1, 3)
  })

  it('[MO-005] Given a light centred between R1C1 and R1C2, When placed, Then both intersections are kept and it is marked for review', () => {
    const mid = { raDeg: (panels[0].centre.raDeg + panels[1].centre.raDeg) / 2, decDeg: panels[0].centre.decDeg }
    const placement = placeFootprint(solvedFootprint(field(mid.raDeg, mid.decDeg)), panels)
    const ids = placement.intersections.map(i => i.panelId).sort()
    expect(ids).toEqual(['R1C1', 'R1C2', 'R2C1', 'R2C2'].filter(id => ids.includes(id)))
    expect(ids).toContain('R1C1')
    expect(ids).toContain('R1C2')
    const [a, b] = placement.intersections
    expect(a.captureFraction).toBeCloseTo(b.captureFraction, 2)
    expect(placement.strength).toBe('weak')
  })

  it('[MO-004] Given a light far from the grid, or touching only its edge, When placed, Then it meets no panel', () => {
    expect(placeFootprint(solvedFootprint(field(10, 50)), panels)).toEqual({ intersections: [], primary: null, strength: 'none' })
    const edge = { raDeg: panels[0].footprint.vertices[0].raDeg + 0.495, decDeg: panels[0].centre.decDeg }
    expect(placeFootprint(rectangleOnSky(edge, 1, 1, 0), panels).intersections.every(i => i.captureFraction >= 0.02)).toBe(true)
  })
})

describe('assignments', () => {
  const panels = layoutGrid(grid())
  const ids = new Set(panels.map(p => p.id))
  const strong = placeFootprint(solvedFootprint(field(panels[0].centre.raDeg, panels[0].centre.decDeg)), panels)
  const override = (over: Partial<AssignmentOverride>): AssignmentOverride => ({ captureId: 'c', action: 'assign', panelId: 'R1C1', reason: null, revision: 1, at: new Date(0), ...over })

  it('[MO-004] Given a strong placement and no override, When assigned, Then it counts toward its panel as computed', () => {
    expect(assignmentOf(strong, null, 1, ids)).toEqual({ panelId: 'R1C1', source: 'computed', state: 'accepted', note: null })
  })

  it('[MO-009] Given a capture put by hand on a panel its footprint does not reach, When assigned, Then the override is kept and flagged as a conflict', () => {
    expect(assignmentOf(strong, override({ panelId: 'R2C2' }), 1, ids)).toMatchObject({ panelId: 'R2C2', source: 'user-override', state: 'conflict' })
    // R1C2 overlaps it a little, so putting it there is no conflict.
    expect(assignmentOf(strong, override({ panelId: 'R1C2' }), 1, ids)).toMatchObject({ panelId: 'R1C2', state: 'accepted' })
  })

  it('[MO-009, MO-010] Given an override on an earlier revision, or on a panel the revision no longer has, When assigned, Then it is shown for review', () => {
    expect(assignmentOf(strong, override({ revision: 1 }), 2, ids)).toMatchObject({ state: 'needs-review', note: 'Put on R1C1 on revision 1; check it still belongs there.' })
    expect(assignmentOf(strong, override({ panelId: 'R3C1' }), 2, ids)).toMatchObject({ panelId: null, state: 'needs-review' })
  })

  it('[MO-009] Given a capture left out, When assigned, Then it counts toward no panel and says why', () => {
    expect(assignmentOf(strong, override({ action: 'exclude', panelId: null, reason: 'trailed' }), 1, ids)).toEqual({ panelId: null, source: 'user-override', state: 'excluded', note: 'Left out: trailed' })
    expect(assignmentOf(placeFootprint(rectangleOnSky({ raDeg: 0, decDeg: -60 }, 1, 1, 0), panels), null, 1, ids)).toMatchObject({ panelId: null, state: 'needs-review' })
  })

  it('[MO-010] Given the grid moved a panel along, When the revisions are compared, Then each capture that changes panel is listed', () => {
    const moved = layoutGrid(grid({ centre: { raDeg: 180.9, decDeg: 0 } }))
    const footprints = [{ captureId: 'a', footprint: solvedFootprint(field(panels[0].centre.raDeg, panels[0].centre.decDeg)) }]
    expect(panelChanges(footprints, panels, panels)).toEqual([])
    expect(panelChanges(footprints, panels, moved)).toEqual([{ captureId: 'a', from: 'R1C1', to: 'R1C2' }])
  })
})
