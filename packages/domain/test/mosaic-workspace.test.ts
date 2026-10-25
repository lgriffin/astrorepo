import { describe, expect, it } from 'vitest'
import {
  angularDistanceDeg,
  gridCsv,
  gridExportName,
  gridFromSolve,
  gridJson,
  gridProblems,
  layoutGrid,
  parseDec,
  parseRa,
  positionAngle,
  rectangleOnSky,
  sameGeometry,
  shiftGrid,
  toDrawing,
  type GridDefinition
} from '@astro/domain'

const grid = (over: Partial<GridDefinition> = {}): GridDefinition => ({
  centre: { raDeg: 10.6847, decDeg: 41.2688 },
  positionAngleDeg: 0,
  rows: 2,
  columns: 2,
  overlapX: 0.15,
  overlapY: 0.15,
  field: { widthDeg: 0.72, heightDeg: 1.28, source: 'manual', label: null },
  ...over
})

const sep = (a: { raDeg: number; decDeg: number }, b: { raDeg: number; decDeg: number }) => angularDistanceDeg(a.raDeg, a.decDeg, b.raDeg, b.decDeg)

describe('laying out a grid', () => {
  it('[MO-001] Given a 3 by 4 grid, When laid out, Then it has 12 panels R1C1 to R3C4 row by row, each with an ICRS footprint of four corners', () => {
    const panels = layoutGrid(grid({ rows: 3, columns: 4 }))
    expect(panels.map(p => p.id)).toEqual(['R1C1', 'R1C2', 'R1C3', 'R1C4', 'R2C1', 'R2C2', 'R2C3', 'R2C4', 'R3C1', 'R3C2', 'R3C3', 'R3C4'])
    expect(panels[5]).toMatchObject({ row: 2, column: 2 })
    for (const p of panels) {
      expect(p.footprint.frame).toBe('ICRS')
      expect(p.footprint.vertices).toHaveLength(4)
    }
  })

  it('[MO-001] Given one panel at RA 0° Dec 0° with a 2° square field and the up axis north, When laid out, Then its corners are where the tangent plane puts them, east on the left', () => {
    const [p] = layoutGrid(grid({ centre: { raDeg: 0, decDeg: 0 }, rows: 1, columns: 1, field: { widthDeg: 2, heightDeg: 2, source: 'manual', label: null } }))
    // A corner at ξ = η = tan 1° on the tangent plane, so each edge's middle is 1° from the centre: RA atan ξ, Dec atan(η / √(1 + ξ²)).
    const t = Math.tan(Math.PI / 180)
    const ra = (Math.atan(t) * 180) / Math.PI
    const dec = (Math.atan(t / Math.sqrt(1 + t * t)) * 180) / Math.PI
    const [tl, tr, br, bl] = p.footprint.vertices
    expect(tl.raDeg).toBeCloseTo(ra, 6)
    expect(tl.decDeg).toBeCloseTo(dec, 6)
    expect(tr.raDeg).toBeCloseTo(360 - ra, 6)
    expect(tr.decDeg).toBeCloseTo(dec, 6)
    expect(br.decDeg).toBeCloseTo(-dec, 6)
    expect(bl.raDeg).toBeCloseTo(ra, 6)
    expect(p.centre).toEqual({ raDeg: 0, decDeg: 0 })
    expect(p.positionAngleDeg).toBe(0)
  })

  it('[MO-001] Given two columns with 15% overlap, When laid out, Then the panel centres are one field less the overlap apart, R1C1 to the east', () => {
    const [a, b] = layoutGrid(grid({ rows: 1, columns: 2, centre: { raDeg: 180, decDeg: 0 } }))
    expect(sep(a.centre, b.centre)).toBeCloseTo(0.72 * 0.85, 4)
    expect(a.centre.raDeg).toBeGreaterThan(180)
    expect(b.centre.raDeg).toBeLessThan(180)
  })

  it('[MO-001] Given a grid turned to 90°, When laid out, Then its columns run north to south and each panel keeps the turn', () => {
    const [a, b] = layoutGrid(grid({ rows: 1, columns: 2, centre: { raDeg: 180, decDeg: 0 }, positionAngleDeg: 90 }))
    // Up points east, so right points north: column 1 is south of column 2.
    expect(a.centre.decDeg).toBeLessThan(b.centre.decDeg)
    expect(a.centre.raDeg).toBeCloseTo(180, 6)
    expect(a.positionAngleDeg).toBeCloseTo(90, 2)
  })

  it('[MO-003] Given a grid across RA 0°, When laid out, Then panels sit either side of 0° with RA in [0, 360) and the right spacing', () => {
    const panels = layoutGrid(grid({ rows: 1, columns: 3, centre: { raDeg: 359.9, decDeg: 10 } }))
    for (const p of panels) for (const v of [p.centre, ...p.footprint.vertices]) {
      expect(v.raDeg).toBeGreaterThanOrEqual(0)
      expect(v.raDeg).toBeLessThan(360)
    }
    expect(panels[0].centre.raDeg).toBeLessThan(1)
    expect(panels[2].centre.raDeg).toBeGreaterThan(359)
    expect(sep(panels[0].centre, panels[1].centre)).toBeCloseTo(0.72 * 0.85, 4)
  })

  it('[MO-003] Given a 3 by 3 grid on the celestial pole, When laid out, Then every panel is a valid footprint, neighbours are spaced alike and each says its own position angle', () => {
    const panels = layoutGrid(grid({ rows: 3, columns: 3, centre: { raDeg: 0, decDeg: 90 }, field: { widthDeg: 2, heightDeg: 2, source: 'manual', label: null } }))
    const step = 2 * 0.85
    expect(sep(panels[3].centre, panels[4].centre)).toBeCloseTo(step, 3)
    expect(sep(panels[1].centre, panels[4].centre)).toBeCloseTo(step, 3)
    for (const p of panels) {
      expect(p.footprint.vertices.every(v => Math.abs(v.decDeg) <= 90)).toBe(true)
      // Each side of a panel is its field wide, wherever it is.
      const [tl, tr] = p.footprint.vertices
      expect(sep(tl, tr)).toBeCloseTo(2, 2)
    }
    // At the pole the grid's up axis points a different way at each panel.
    expect(new Set(panels.map(p => Math.round(p.positionAngleDeg))).size).toBeGreaterThan(1)
  })

  it('[MO-003] Given a grid near the pole at high declination, When laid out, Then RA offsets are not constant: panels are spread by angle on the sky, not by degrees of RA', () => {
    const panels = layoutGrid(grid({ rows: 1, columns: 2, centre: { raDeg: 40, decDeg: 80 } }))
    expect(sep(panels[0].centre, panels[1].centre)).toBeCloseTo(0.72 * 0.85, 4)
    // Six tenths of a degree on the sky at Dec 80° is about 3.5° of RA.
    expect(Math.abs(panels[0].centre.raDeg - panels[1].centre.raDeg)).toBeGreaterThan(3)
  })
})

describe('checking a grid', () => {
  it('[MO-015] Given a grid with no rows, an overlap of 70%, Dec 95° and no field, When checked, Then each problem is named and nothing is laid out', () => {
    const problems = gridProblems(grid({ rows: 0, overlapX: 0.7, centre: { raDeg: 10, decDeg: 95 }, field: { widthDeg: 0, heightDeg: 1, source: 'manual', label: null } }))
    expect(problems).toEqual([
      'The centre declination must be between -90° and +90°.',
      'Rows must be a whole number from 1 to 12.',
      'The overlap across must be from 0% to 60%.',
      "Each panel's field must be more than 0° and at most 30° on a side."
    ])
  })

  it('[MO-015] Given a grid wider than one tangent plane draws faithfully, When checked, Then it is refused with its size', () => {
    expect(gridProblems(grid({ columns: 12, field: { widthDeg: 10, heightDeg: 10, source: 'manual', label: null } }))).toEqual([
      'The grid would cover 103.5° by 18.5°; keep it within 60° on a side.'
    ])
    expect(gridProblems(grid({ rows: 1.5, columns: 13, positionAngleDeg: Number.NaN, centre: { raDeg: Number.NaN, decDeg: 0 } }))).toEqual([
      'The centre needs a right ascension.',
      'The position angle must be a number of degrees.',
      'Rows must be a whole number from 1 to 12.',
      'Columns must be a whole number from 1 to 12.'
    ])
    expect(gridProblems(grid())).toEqual([])
  })
})

describe('revising a grid', () => {
  it('[MO-002] Given the same grid typed again, or turned a whole turn, When compared, Then it lays out the same panels; a turn of 5° or one more row does not', () => {
    expect(sameGeometry(grid(), grid({ positionAngleDeg: 360 }))).toBe(true)
    expect(sameGeometry(grid({ centre: { raDeg: 360, decDeg: 41.2688 } }), grid({ centre: { raDeg: 0, decDeg: 41.2688 } }))).toBe(true)
    expect(sameGeometry(grid(), grid({ positionAngleDeg: 5 }))).toBe(false)
    expect(sameGeometry(grid(), grid({ rows: 3 }))).toBe(false)
    expect(sameGeometry(grid(), grid({ overlapY: 0.2 }))).toBe(false)
    expect(sameGeometry(grid(), grid({ field: { widthDeg: 0.8, heightDeg: 1.28, source: 'manual', label: null } }))).toBe(false)
    // Where the field came from is part of the plan: the same size from Equipment is a new revision.
    expect(sameGeometry(grid(), grid({ field: { widthDeg: 0.72, heightDeg: 1.28, source: 'equipment', label: 'Seestar S50' } }))).toBe(false)
    expect(sameGeometry(grid({ field: { widthDeg: 0.72, heightDeg: 1.28, source: 'equipment', label: 'a' } }), grid({ field: { widthDeg: 0.72, heightDeg: 1.28, source: 'equipment', label: 'b' } }))).toBe(false)
  })

  it('[MO-001] Given the widest field allowed, 30° square, When laid out, Then each edge is 30° long through the middle, not shrunk by the projection', () => {
    const [p] = layoutGrid(grid({ centre: { raDeg: 90, decDeg: 20 }, rows: 1, columns: 1, field: { widthDeg: 30, heightDeg: 30, source: 'manual', label: null } }))
    const [tl, tr, br, bl] = p.footprint.vertices
    const mid = (a: { raDeg: number; decDeg: number }, b: { raDeg: number; decDeg: number }) => {
      const v = [a, b].map(q => [Math.cos(q.decDeg * Math.PI / 180) * Math.cos(q.raDeg * Math.PI / 180), Math.cos(q.decDeg * Math.PI / 180) * Math.sin(q.raDeg * Math.PI / 180), Math.sin(q.decDeg * Math.PI / 180)])
      const s = [0, 1, 2].map(i => v[0][i] + v[1][i])
      return { raDeg: (Math.atan2(s[1], s[0]) * 180) / Math.PI, decDeg: (Math.atan2(s[2], Math.hypot(s[0], s[1])) * 180) / Math.PI }
    }
    expect(angularDistanceDeg(mid(tl, tr).raDeg, mid(tl, tr).decDeg, mid(bl, br).raDeg, mid(bl, br).decDeg)).toBeCloseTo(30, 4)
    expect(angularDistanceDeg(mid(tl, bl).raDeg, mid(tl, bl).decDeg, mid(tr, br).raDeg, mid(tr, br).decDeg)).toBeCloseTo(30, 4)
  })

  it('[MO-002] Given a grid dragged half a panel to its right, When shifted, Then its centre moves west by that angle and the panels follow', () => {
    const before = grid({ centre: { raDeg: 180, decDeg: 0 } })
    const after = shiftGrid(before, 0.36, 0)
    expect(after.centre.raDeg).toBeCloseTo(180 - Math.atan(0.36 * Math.PI / 180) * (180 / Math.PI), 6)
    expect(after.centre.decDeg).toBeCloseTo(0, 6)
    const up = shiftGrid(before, 0, 1)
    expect(up.centre.decDeg).toBeCloseTo(Math.atan(Math.PI / 180) * (180 / Math.PI), 6)
    expect(shiftGrid(before, 0, 0).centre).toEqual(before.centre)
  })
})

describe('drawing', () => {
  it('[MO-001] Given a position east and north of the centre, When drawn, Then it is up and to the left (the sky as seen), and the far side of the sky is not drawn', () => {
    const p = toDrawing({ raDeg: 180, decDeg: 0 }, { raDeg: 181, decDeg: 1 })
    expect(p?.x).toBeLessThan(0)
    expect(p?.y).toBeGreaterThan(0)
    expect(toDrawing({ raDeg: 0, decDeg: 0 }, { raDeg: 180, decDeg: 0 })).toBeNull()
  })

  it('[MO-001] Given two positions, When the position angle between them is read, Then north is 0° and east is 90°', () => {
    expect(positionAngle({ raDeg: 10, decDeg: 0 }, { raDeg: 10, decDeg: 1 })).toBeCloseTo(0, 6)
    expect(positionAngle({ raDeg: 10, decDeg: 0 }, { raDeg: 11, decDeg: 0 })).toBeCloseTo(90, 6)
    const r = rectangleOnSky({ raDeg: 10, decDeg: 0 }, 2, 1, 0)
    expect(sep(r.vertices[0], r.vertices[1])).toBeCloseTo(2, 3)
  })
})

describe('typed coordinates', () => {
  it('[MO-014] Given right ascension typed in hours or degrees, When read, Then it comes back in degrees', () => {
    expect(parseRa('05h35m17.3s')).toBeCloseTo(83.82208, 5)
    expect(parseRa('05:35:17.3')).toBeCloseTo(83.82208, 5)
    expect(parseRa('5 35 17.3')).toBeCloseTo(83.82208, 5)
    expect(parseRa('00:42')).toBeCloseTo(10.5, 9)
    expect(parseRa('5.5h')).toBeCloseTo(82.5, 9)
    expect(parseRa('83.82')).toBe(83.82)
    expect(parseRa('83.82°')).toBe(83.82)
    expect(parseRa(' 10.68 deg ')).toBe(10.68)
  })

  it('[MO-014] Given declination typed as dd:mm:ss, with degree marks or in degrees, When read, Then it comes back signed, south included', () => {
    expect(parseDec('+41:16:09')).toBeCloseTo(41.26917, 5)
    expect(parseDec('-05°23\'28"')).toBeCloseTo(-5.39111, 5)
    expect(parseDec('-0 30 00')).toBe(-0.5)
    expect(parseDec('41 16')).toBeCloseTo(41.26667, 5)
    expect(parseDec('-5.39')).toBe(-5.39)
    expect(parseDec('90')).toBe(90)
  })

  it('[MO-014] Given coordinates out of range or not coordinates at all, When read, Then they are refused rather than guessed', () => {
    for (const bad of ['', '-5h', '24h', '24:00:00', '12:60:00', '12:30:60', '360', '1e3', 'abc', '5.5:30:00', '12:30.5:10']) expect(parseRa(bad)).toBeNull()
    for (const bad of ['', '91', '-90:00:01', '+41:60:00', 'north', '1e2', '41:16.5:2']) expect(parseDec(bad)).toBeNull()
    expect(Object.is(parseDec('-0'), -0)).toBe(false)
  })

  it("[MO-014] Given units of the other coordinate, out of order, or mixed with colons, When read, Then they are refused", () => {
    for (const bad of ['05d35m17s', '05°35\'17"', '05m35h17s', '05h35s17m', '05h35:17', '05:35:17s', '5.', '05h35m17s9']) expect(parseRa(bad)).toBeNull()
    for (const bad of ['41h16m09s', '41m16d09s', "41°16:09", '41:16:09"']) expect(parseDec(bad)).toBeNull()
    expect(parseRa('05h 35m 17s')).toBeCloseTo(83.82083, 5)
    expect(parseDec('41d16m09s')).toBeCloseTo(41.26917, 5)
    expect(parseDec("-05° 23' 28\"")).toBeCloseTo(-5.39111, 5)
  })
})

describe('from a solved file', () => {
  it("[MO-001] Given a solved field turned 10° by the solver's CROTA2, When a grid is started from it, Then its centre and field match and its up axis is at -10°", () => {
    const from = gridFromSolve({ raDeg: 10.68, decDeg: 41.27, rotationDeg: 10, scaleArcsec: 2.4, widthPx: 1080, heightPx: 1920 }, 'Light_001.fit')
    expect(from).toEqual({ centre: { raDeg: 10.68, decDeg: 41.27 }, positionAngleDeg: -10, field: { widthDeg: 0.72, heightDeg: 1.28, source: 'solve', label: 'Light_001.fit' } })
  })
})

describe('export', () => {
  const panels = layoutGrid(grid({ positionAngleDeg: 20 }))
  const input = { name: 'M 31, "the big one"', revision: 3, grid: grid({ positionAngleDeg: 20 }), panels }

  it("[MO-012] Given a revision, When exported as CSV, Then each panel's id, ICRS centre, position angle, rotation, field, corners and the revision are there", () => {
    const lines = gridCsv(input).trimEnd().split('\n')
    expect(lines[0]).toBe('plan,revision,frame,panel,row,column,ra,dec,ra_deg,dec_deg,position_angle_deg,rotation_deg,width_deg,height_deg,corner1_ra_deg,corner1_dec_deg,corner2_ra_deg,corner2_dec_deg,corner3_ra_deg,corner3_dec_deg,corner4_ra_deg,corner4_dec_deg')
    expect(lines).toHaveLength(5)
    const cells = lines[1].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    expect(cells.slice(0, 6)).toEqual(['"M 31, ""the big one"""', '3', 'ICRS', 'R1C1', '1', '1'])
    expect(cells[6]).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    expect(Number(cells[10])).toBeCloseTo(panels[0].positionAngleDeg, 2)
    expect(Number(cells[11])).toBeCloseTo(-panels[0].positionAngleDeg, 2)
    expect(cells.slice(12, 14)).toEqual(['0.7200', '1.2800'])
    expect(Number(cells[14])).toBeCloseTo(panels[0].footprint.vertices[0].raDeg, 6)
    expect(cells).toHaveLength(22)
  })

  it('[MO-012] Given a revision, When exported as JSON, Then it reads back with the frame, units, grid and every panel', () => {
    const json = JSON.parse(gridJson(input))
    expect(json).toMatchObject({ plan: input.name, revision: 3, frame: 'ICRS', grid: { rows: 2, columns: 2, positionAngleDeg: 20 } })
    expect(json.units.positionAngle).toMatch(/east of north/)
    expect(json.panels.map((p: { id: string }) => p.id)).toEqual(['R1C1', 'R1C2', 'R2C1', 'R2C2'])
    expect(json.panels[0].footprint).toEqual(panels[0].footprint.vertices)
    expect(json.panels[0].rotationDeg).toBeCloseTo(-panels[0].positionAngleDeg, 6)
  })

  it('[MO-012] Given a plan name with spaces and marks, When an export is named, Then the name is safe with the revision', () => {
    expect(gridExportName('M 31 / North', 2, 'csv')).toBe('M_31_North-r2.csv')
    expect(gridExportName('***', 1, 'json')).toBe('mosaic-r1.json')
  })
})
