import { describe, expect, it } from 'vitest'
import {
  CELLS_PER_PANEL,
  COVERED_FRACTION,
  countOnce,
  coverageMap,
  filterKey,
  layoutGrid,
  MIN_GAP_FRACTION,
  NEXT_SESSION_CSV_COLUMNS,
  NO_FILTER,
  nextSession,
  nextSessionCsv,
  nextSessionExportName,
  nextSessionJson,
  panelProgress,
  projectPosition,
  rectangleOnSky,
  type CountedFrame,
  type CountInput,
  type GridDefinition,
  type PanelCoverage
} from '@astro/domain'

const grid = (over: Partial<GridDefinition> = {}): GridDefinition => ({
  centre: { raDeg: 180, decDeg: 0 },
  positionAngleDeg: 0,
  rows: 1,
  columns: 2,
  overlapX: 0.1,
  overlapY: 0.1,
  field: { widthDeg: 1, heightDeg: 1, source: 'manual', label: null },
  ...over
})

const frame = (path: string, over: Partial<CountedFrame> = {}): CountedFrame => ({ path, filter: 'Ha', seconds: 300, hash: null, rejected: false, ...over })
const lights = (id: string, panelId: string | null, frames: CountedFrame[]): CountInput => ({ id, kind: 'lights', panelId, frames })

describe('counting each frame once', () => {
  it('[MO-011] Given lights of two filters on a panel, When counted, Then each filter adds its own seconds and every frame counts', () => {
    const [c] = countOnce([lights('a', 'R1C1', [frame('/a/1.fit'), frame('/a/2.fit'), frame('/a/3.fit', { filter: 'OIII', seconds: 600 })])])
    expect(c).toEqual({
      id: 'a',
      panelId: 'R1C1',
      exposures: [
        { filter: 'Ha', seconds: 600 },
        { filter: 'OIII', seconds: 600 }
      ],
      counted: 3,
      rejected: 0,
      duplicates: 0,
      noExposure: 0,
      note: null,
      tally: [
        { filter: 'Ha', counted: 2, countedSec: 600, rejected: 0, rejectedSec: 0 },
        { filter: 'OIII', counted: 1, countedSec: 600, rejected: 0, rejectedSec: 0 }
      ]
    })
  })

  it('[AI-001] Given frames kept and rejected in two filters, When counted, Then each filter tallies counted and rejected frames and seconds apart', () => {
    const [c] = countOnce([
      lights('a', 'R1C1', [frame('/a/1.fit'), frame('/a/2.fit', { rejected: true }), frame('/a/3.fit', { filter: ' oiii ', rejected: true, seconds: null }), frame('/a/4.fit', { filter: null, rejected: true })])
    ])
    expect(c.tally).toEqual([
      { filter: 'Ha', counted: 1, countedSec: 300, rejected: 1, rejectedSec: 300 },
      { filter: 'No filter', counted: 0, countedSec: 0, rejected: 1, rejectedSec: 300 },
      { filter: 'oiii', counted: 0, countedSec: 0, rejected: 1, rejectedSec: 0 }
    ])
  })

  it('[MO-011, MO-020] Given frames grading rejected, When counted, Then they add nothing and the note says how many were rejected', () => {
    const [one] = countOnce([lights('a', 'R1C1', [frame('/a/1.fit', { rejected: true }), frame('/a/2.fit')])])
    expect(one.exposures).toEqual([{ filter: 'Ha', seconds: 300 }])
    expect(one).toMatchObject({ counted: 1, rejected: 1, note: '1 frame rejected by grading.' })
    const [two] = countOnce([lights('a', 'R1C1', [frame('/a/1.fit', { rejected: true }), frame('/a/2.fit', { rejected: true })])])
    expect(two).toMatchObject({ exposures: [], counted: 0, rejected: 2, note: '2 frames rejected by grading.' })
  })

  it('[MO-011] Given the same frame copied into two folders, When counted, Then only the first by path counts and the copy says where it is counted', () => {
    const [first, copy] = countOnce([
      lights('b', 'R1C2', [frame('/b/L1.fit', { hash: 'h1' }), frame('/b/L2.fit', { hash: 'h2' })]),
      lights('c', 'R1C1', [frame('/c/L1.fit', { hash: 'h1' }), frame('/c/L2.fit', { hash: 'h2' }), frame('/c/L3.fit', { hash: 'h3' })])
    ])
    expect(first).toMatchObject({ counted: 2, duplicates: 0, note: null })
    expect(copy).toMatchObject({ counted: 1, duplicates: 2, exposures: [{ filter: 'Ha', seconds: 300 }] })
    expect(copy.note).toBe('2 frames with the same content as L1.fit and others, counted there.')
    const [, single] = countOnce([lights('b', null, [frame('/b/x.fit', { hash: 'h' })]), lights('c', null, [frame('/c/x.fit', { hash: 'h' })])])
    expect(single.note).toBe('1 frame with the same content as x.fit, counted there.')
  })

  it('[MO-011] Given a rejected frame and its copy, When counted, Then the copy counts, since the rejected one does not', () => {
    const [a, b] = countOnce([lights('a', null, [frame('/a/x.fit', { hash: 'h', rejected: true })]), lights('b', null, [frame('/b/x.fit', { hash: 'h' })])])
    expect(a.counted).toBe(0)
    expect(b).toMatchObject({ counted: 1, duplicates: 0 })
  })

  it('[MO-011] Given a master over lights of its filter on the same panel, When counted, Then it adds no exposure there; a master of another filter or panel still counts', () => {
    const [, master, other, elsewhere, unplaced] = countOnce([
      lights('l', 'R1C1', [frame('/l/1.fit', { filter: 'ha ' })]),
      { id: '/m/ha.fit', kind: 'master', panelId: 'R1C1', frames: [frame('/m/ha.fit', { filter: 'Ha', seconds: 3600 })] },
      { id: '/m/o.fit', kind: 'master', panelId: 'R1C1', frames: [frame('/m/o.fit', { filter: 'OIII', seconds: 1800 })] },
      { id: '/m/ha2.fit', kind: 'master', panelId: 'R1C2', frames: [frame('/m/ha2.fit', { filter: 'Ha', seconds: 3600 })] },
      { id: '/m/ha3.fit', kind: 'master', panelId: null, frames: [frame('/m/ha3.fit', { filter: 'Ha', seconds: 3600 })] }
    ])
    expect(master).toMatchObject({ exposures: [], counted: 0, note: 'Its lights on R1C1 are counted instead, so it adds no exposure there.' })
    expect(other).toMatchObject({ exposures: [{ filter: 'OIII', seconds: 1800 }], counted: 1, note: null })
    // The first spelling met names the filter everywhere.
    expect(elsewhere.exposures).toEqual([{ filter: 'ha', seconds: 3600 }])
    expect(unplaced.counted).toBe(1)
  })

  it('[MO-011] Given lights not on any panel, When a master is counted on a panel, Then those lights do not stop it counting', () => {
    const [, master] = countOnce([lights('l', null, [frame('/l/1.fit')]), { id: '/m.fit', kind: 'master', panelId: 'R1C1', frames: [frame('/m.fit')] }])
    expect(master.counted).toBe(1)
  })

  it('[MO-020] Given frames with no exposure time or none at all, When counted, Then they add nothing and the note says so', () => {
    const [c] = countOnce([lights('a', 'R1C1', [frame('/a/1.fit', { seconds: null }), frame('/a/2.fit', { seconds: 0 }), frame('/a/3.fit', { seconds: -5 }), frame('/a/4.fit')])])
    expect(c).toMatchObject({ counted: 1, noExposure: 3, note: '3 frames with no exposure time.' })
    const [one] = countOnce([lights('a', 'R1C1', [frame('/a/1.fit', { seconds: null })])])
    expect(one.note).toBe('1 frame with no exposure time.')
  })

  it('[MO-011] Given frames with no filter and with spellings that differ in case and spaces, When counted, Then they are one filter each', () => {
    const [c] = countOnce([lights('a', 'R1C1', [frame('/a/1.fit', { filter: null }), frame('/a/2.fit', { filter: '  ' }), frame('/a/3.fit', { filter: ' OIII' }), frame('/a/4.fit', { filter: 'oiii' })])])
    expect(c.exposures).toEqual([
      { filter: NO_FILTER, seconds: 600 },
      { filter: 'OIII', seconds: 600 }
    ])
    expect(filterKey(' Ha ')).toBe('ha')
    expect(filterKey(null)).toBe('')
    expect(filterKey(undefined)).toBe('')
  })

  it('[MO-011, MO-020] Given several reasons on one capture, When counted, Then the note gives each in turn', () => {
    const [, c] = countOnce([
      lights('a', 'R1C1', [frame('/a/x.fit', { hash: 'h' })]),
      lights('b', 'R1C1', [frame('/b/1.fit', { rejected: true }), frame('/b/x.fit', { hash: 'h' }), frame('/b/3.fit', { seconds: null })])
    ])
    expect(c.note).toBe('1 frame rejected by grading. 1 frame with the same content as x.fit, counted there. 1 frame with no exposure time.')
  })
})

describe('coverage of the panels', () => {
  const g = grid()
  const panels = layoutGrid(g)

  it('[MO-018] Given a capture exactly over R1C1, When coverage is worked out, Then R1C1 is covered in full and R1C2 by the overlap only, the rest of it one gap', () => {
    const map = coverageMap(g.centre, panels, [{ id: 'a', footprint: panels[0].footprint, exposures: [{ filter: 'Ha', seconds: 600 }] }])
    const [left, right] = map.panels
    expect(left).toMatchObject({ panelId: 'R1C1', fraction: 1, covered: true, shallowestSec: 600, deepestSec: 600, gaps: [] })
    expect(left.areaSqDeg).toBeCloseTo(1, 2)
    expect(right.panelId).toBe('R1C2')
    expect(right.fraction).toBeGreaterThan(0.08)
    expect(right.fraction).toBeLessThan(0.14)
    expect(right.covered).toBe(false)
    expect(right.shallowestSec).toBe(0)
    expect(right.deepestSec).toBe(600)
    expect(right.gaps).toHaveLength(1)
    expect(right.gaps[0].where).toBe('most of the panel')
    expect(map.filters).toEqual(['Ha'])
    expect(map.cellDeg).toBeCloseTo(1 / CELLS_PER_PANEL, 3)
    const wide = coverageMap(g.centre, panels, [{ id: 'a', footprint: rectangleOnSky(panels[0].centre, 1.8, 1.2, 0), exposures: [] }])
    expect(wide.panels[1].gaps.map(gp => gp.where)).toEqual(['toward the west'])
  })

  it('[MO-018] Given a half-width capture in the middle of R1C2, When coverage is worked out, Then about half is covered with a gap either side, the larger first', () => {
    const half = rectangleOnSky(panels[1].centre, 0.5, 1.2, 0)
    const map = coverageMap(g.centre, panels, [{ id: 'b', footprint: half, exposures: [{ filter: 'OIII', seconds: 300 }] }])
    const right = map.panels[1]
    expect(right.fraction).toBeCloseTo(0.5, 1)
    expect(right.gaps.map(gp => gp.where).sort()).toEqual(['toward the east', 'toward the west'])
    expect(right.gaps[0].fraction).toBeCloseTo(0.25, 1)
    expect(right.gaps[0].areaSqDeg).toBeGreaterThanOrEqual(right.gaps[1].areaSqDeg)
    const west = right.gaps.find(gp => gp.where === 'toward the west')
    expect(west?.centre.raDeg).toBeLessThan(panels[1].centre.raDeg)
    const offset = coverageMap(g.centre, panels, [{ id: 'b', footprint: rectangleOnSky({ raDeg: panels[1].centre.raDeg - 0.1, decDeg: 0 }, 0.5, 1.2, 0), exposures: [] }])
    expect(offset.panels[1].gaps.map(gp => gp.where)).toEqual(['toward the east', 'toward the west'])
    expect(map.panels[0]).toMatchObject({ fraction: 0, covered: false, gaps: [{ where: 'the whole panel', fraction: 1 }] })
  })

  it('[MO-018] Given a capture over the middle of a panel only, When gaps are found, Then the ring around it is one gap, centred on the middle', () => {
    const one = grid({ columns: 1 })
    const [panel] = layoutGrid(one)
    const ring = coverageMap(one.centre, [panel], [{ id: 'a', footprint: rectangleOnSky(panel.centre, 0.8, 0.8, 0), exposures: [] }])
    expect(ring.panels[0].gaps).toHaveLength(1)
    expect(ring.panels[0].gaps[0].where).toBe('the middle')
    // Its centre is a point of the ring, outside the covered middle, so it is somewhere to point.
    const aim = projectPosition(panel.centre, ring.panels[0].gaps[0].centre)
    expect(Math.max(Math.abs(aim?.xi ?? 0), Math.abs(aim?.eta ?? 0))).toBeGreaterThan(0.4)
    expect(ring.panels[0].covered).toBe(false)
    // Sampled in 1/16° cells, so good to about a cell along each edge.
    expect(ring.panels[0].fraction).toBeCloseTo(0.6, 1)
  })

  it('[MO-018] Given two captures that overlap, When the heat map is made, Then the overlap holds both exposures and both captures, and nothing outside the panels is sampled', () => {
    const a = rectangleOnSky(panels[0].centre, 1, 1, 0)
    const b = rectangleOnSky(panels[1].centre, 1, 1, 0)
    const map = coverageMap(g.centre, panels, [
      { id: 'a', footprint: a, exposures: [{ filter: 'Ha', seconds: 600 }] },
      { id: 'b', footprint: b, exposures: [{ filter: 'OIII', seconds: 300 }, { filter: 'Ha', seconds: 100 }] }
    ])
    expect(map.filters).toEqual(['Ha', 'OIII'])
    const middle = map.cells.reduce((best, c) => (Math.abs(c.x) < Math.abs(best.x) ? c : best))
    expect(middle).toMatchObject({ seconds: 1000, byFilter: [700, 300], captures: 2 })
    const east = map.cells.reduce((best, c) => (c.x < best.x ? c : best))
    expect(east).toMatchObject({ seconds: 600, byFilter: [600, 0], captures: 1 })
    expect(map.panels.every(p => p.covered)).toBe(true)
    expect(map.panels[0].deepestSec).toBe(1000)
    // About 1.9 by 1 degrees of panels in 1/16° cells.
    expect(map.cells.length).toBeGreaterThan(450)
    expect(map.cells.length).toBeLessThan(510)
  })

  it('[MO-018] Given a large grid, When sampled, Then cells grow so no side has more than the most cells allowed', () => {
    const big = grid({ rows: 12, columns: 12, field: { widthDeg: 5, heightDeg: 5, source: 'manual', label: null } })
    const map = coverageMap(big.centre, layoutGrid(big), [], { maxCellsPerSide: 40 })
    const span = Math.max(...map.cells.map(c => c.x)) - Math.min(...map.cells.map(c => c.x))
    expect(span / map.cellDeg).toBeLessThanOrEqual(40)
    expect(map.panels.every(p => p.fraction === 0 && p.shallowestSec === 0 && p.deepestSec === 0)).toBe(true)
    const fine = coverageMap(g.centre, panels, [], { cellsPerPanel: 4 })
    expect(fine.cellDeg).toBeCloseTo(0.25, 2)
  })

  it('[MO-018] Given no panels, or a footprint on the far side of the sky, When worked out, Then nothing is covered and nothing fails', () => {
    expect(coverageMap(g.centre, [], [])).toEqual({ cellDeg: 0, filters: [], cells: [], panels: [] })
    const far = coverageMap(g.centre, panels, [{ id: 'x', footprint: rectangleOnSky({ raDeg: 0, decDeg: 0 }, 1, 1, 0), exposures: [{ filter: 'Ha', seconds: 1 }] }])
    expect(far.panels.every(p => p.fraction === 0)).toBe(true)
    const farPanel = coverageMap(g.centre, [{ ...panels[0], id: 'FAR', footprint: rectangleOnSky({ raDeg: 0, decDeg: 0 }, 1, 1, 0) }], [])
    expect(farPanel.panels).toEqual([{ panelId: 'FAR', fraction: 0, covered: false, areaSqDeg: 0, shallowestSec: 0, deepestSec: 0, gaps: [] }])
  })

  it('[MO-018] Given a capture that leaves a sliver under the smallest gap listed, When gaps are found, Then the sliver is covered enough not to be listed', () => {
    const almost = rectangleOnSky(panels[0].centre, 1, 0.995, 0)
    const map = coverageMap(g.centre, [panels[0]], [{ id: 'a', footprint: almost, exposures: [] }])
    expect(map.panels[0].gaps.every(gp => gp.fraction >= MIN_GAP_FRACTION)).toBe(true)
    expect(map.panels[0].covered).toBe(true)
  })

  it('[MO-018] Given gaps to the north, south and the corners, When described, Then each says which way it lies', () => {
    const one = grid({ columns: 1, centre: { raDeg: 90, decDeg: 30 } })
    const [panel] = layoutGrid(one)
    const north = coverageMap(one.centre, [panel], [{ id: 'a', footprint: rectangleOnSky({ raDeg: 90, decDeg: 29.8 }, 1.2, 0.7, 0), exposures: [] }])
    expect(north.panels[0].gaps[0].where).toBe('toward the north')
    const south = coverageMap(one.centre, [panel], [{ id: 'a', footprint: rectangleOnSky({ raDeg: 90, decDeg: 30.2 }, 1.2, 0.7, 0), exposures: [] }])
    expect(south.panels[0].gaps[0].where).toBe('toward the south')
  })

  it('[MO-018] Given the covered threshold, Then it is 95% of a panel', () => {
    expect(COVERED_FRACTION).toBe(0.95)
  })
})

const cov = (panelId: string, fraction: number, gaps: PanelCoverage['gaps'] = []): PanelCoverage => ({
  panelId,
  fraction,
  covered: fraction >= COVERED_FRACTION,
  areaSqDeg: 1,
  shallowestSec: 0,
  deepestSec: 0,
  gaps
})

describe('progress and the next session', () => {
  const counted = countOnce([
    lights('a', 'R1C1', [frame('/a/1.fit', { seconds: 3600 }), frame('/a/2.fit', { filter: 'OIII', seconds: 1800 })]),
    lights('b', 'R1C1', [frame('/b/1.fit', { filter: 'HA', seconds: 3600 })]),
    lights('c', 'R1C2', [frame('/c/1.fit', { filter: 'L', seconds: 600 })]),
    lights('d', 'R1C2', [frame('/d/1.fit', { rejected: true })])
  ])

  it('[MO-008] Given goals per filter, When progress is worked out, Then each panel counts only its own captures against the whole goal, filter by filter', () => {
    const [left, right] = panelProgress([cov('R1C1', 1), cov('R1C2', 0.4)], counted, [
      { filter: 'Ha ', seconds: 7200 },
      { filter: 'OIII', seconds: 3600 }
    ])
    expect(left).toMatchObject({ panelId: 'R1C1', state: 'covered', goalsMet: false, captures: 2 })
    expect(left.filters).toEqual([
      { filter: 'Ha', haveSec: 7200, goalSec: 7200, needSec: 0 },
      { filter: 'OIII', haveSec: 1800, goalSec: 3600, needSec: 1800 }
    ])
    expect(right).toMatchObject({ state: 'partly covered', goalsMet: false, captures: 1 })
    expect(right.filters).toEqual([
      { filter: 'Ha', haveSec: 0, goalSec: 7200, needSec: 7200 },
      { filter: 'L', haveSec: 600, goalSec: null, needSec: null },
      { filter: 'OIII', haveSec: 0, goalSec: 3600, needSec: 3600 }
    ])
  })

  it('[MO-008] Given a goal for frames with no filter, and goals whose names differ only in case, When progress is worked out, Then each meets its own exposure and the larger goal stands', () => {
    const none = countOnce([lights('n', 'R1C1', [frame('/n/1.fit', { filter: null, seconds: 3600 })])])
    const [p] = panelProgress([cov('R1C1', 1)], none, [{ filter: 'No Filter', seconds: 3600 }])
    expect(p.filters).toEqual([{ filter: 'No Filter', haveSec: 3600, goalSec: 3600, needSec: 0 }])
    expect(p.goalsMet).toBe(true)
    const [q] = panelProgress([cov('R1C1', 1)], counted, [{ filter: 'Ha', seconds: 3600 }, { filter: 'ha ', seconds: 10800 }, { filter: 'HA', seconds: 60 }])
    expect(q.filters.find(f => f.filter === 'Ha')).toEqual({ filter: 'Ha', haveSec: 7200, goalSec: 10800, needSec: 3600 })
  })

  it('[MO-008] Given no goal set, When progress is worked out, Then goals are neither met nor missed, and an empty panel is not started', () => {
    const [left, empty] = panelProgress([cov('R1C1', 1), cov('R1C9', 0)], counted, [])
    expect(left.goalsMet).toBeNull()
    expect(left.filters.map(f => f.filter)).toEqual(['Ha', 'OIII'])
    expect(empty).toMatchObject({ state: 'not started', goalsMet: null, captures: 0, filters: [] })
    const [met] = panelProgress([cov('R1C1', 1)], counted, [{ filter: 'ha', seconds: 60 }])
    expect(met.goalsMet).toBe(true)
  })

  it('[MO-021] Given panels at every stage, When the next session is planned, Then the least covered come first, covered ones short of a goal next, and finished ones are left out', () => {
    const panels = layoutGrid(grid({ columns: 4 }))
    const gap = { centre: { raDeg: 1, decDeg: 2 }, areaSqDeg: 0.2, fraction: 0.2, where: 'toward the west' }
    const progress = panelProgress([cov('R1C1', 1), cov('R1C2', 0.8, [gap]), cov('R1C3', 0), cov('R1C4', 1)], counted, [{ filter: 'Ha', seconds: 3600 }])
    const rows = nextSession(panels, progress)
    expect(rows.map(r => r.panel.id)).toEqual(['R1C3', 'R1C2', 'R1C4'])
    expect(rows[0]).toMatchObject({ aim: panels[2].centre, reason: 'not captured yet; Ha needs 1.0 h more' })
    expect(rows[1]).toMatchObject({ aim: gap.centre, reason: '80% covered, uncovered: toward the west; Ha needs 1.0 h more' })
    expect(rows[2]).toMatchObject({ aim: panels[3].centre, reason: 'Ha needs 1.0 h more' })
    expect(nextSession(panels, panelProgress([cov('R1C1', 1)], counted, []))).toEqual([])
    expect(nextSession(panels, [])).toEqual([])
  })

  it('[MO-021] Given a partly covered panel with no gap listed, and two equally covered panels, When planned, Then it aims at the centre, and the one needing more comes first', () => {
    const panels = layoutGrid(grid({ columns: 3 }))
    const rows = nextSession(panels, panelProgress([cov('R1C1', 0.5), cov('R1C2', 0.5), cov('R1C3', 0.5)], [], [{ filter: 'Ha', seconds: 3600 }]))
    expect(rows.map(r => r.panel.id)).toEqual(['R1C1', 'R1C2', 'R1C3'])
    expect(rows[0]).toMatchObject({ aim: panels[0].centre, reason: '50% covered, uncovered: slivers at its edges; Ha needs 1.0 h more' })
    const deeper = nextSession(panels.slice(0, 2), panelProgress([cov('R1C1', 0.5), cov('R1C2', 0.5)], countOnce([lights('a', 'R1C1', [frame('/a.fit', { seconds: 1800 })])]), [{ filter: 'Ha', seconds: 3600 }]))
    expect(deeper.map(r => r.panel.id)).toEqual(['R1C2', 'R1C1'])
  })

  it('[MO-021] Given the next session, When exported as CSV, Then there is a row per panel and filter it needs, with the aim in text and degrees and the turn both ways', () => {
    const panels = layoutGrid(grid({ positionAngleDeg: 30 }))
    const progress = panelProgress([cov('R1C1', 0.2), cov('R1C2', 1)], [], [{ filter: 'Ha', seconds: 3600 }, { filter: 'OIII', seconds: 1800 }])
    const csv = nextSessionCsv({ name: 'Veil, east', revision: 3, rows: nextSession(panels, progress) })
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe(NEXT_SESSION_CSV_COLUMNS.join(','))
    expect(lines).toHaveLength(5)
    const first = lines[1].split(',')
    expect(first.slice(0, 6)).toEqual(['"Veil', ' east"', '3', '1', 'R1C1', 'partly covered'].slice(0, 6))
    expect(lines[1]).toContain(',0.200,')
    expect(lines[1]).toContain(`,${panels[0].positionAngleDeg.toFixed(2)},`)
    expect(lines[1]).toContain(',Ha,0,3600,3600,')
    expect(lines[2]).toContain(',OIII,0,1800,1800,')
    expect(lines[3]).toContain(',R1C2,covered,1.000,')
    const noGoal = nextSessionCsv({ name: 'M', revision: 1, rows: nextSession(panels, panelProgress([cov('R1C1', 0)], [], [])) })
    expect(noGoal.trim().split('\n')[1].endsWith(',,,,,not captured yet')).toBe(true)
  })

  it('[MO-021] Given the next session, When exported as JSON, Then each panel says its order, aim, turn and what each filter still needs', () => {
    const panels = layoutGrid(grid({ positionAngleDeg: 30 }))
    const rows = nextSession(panels, panelProgress([cov('R1C1', 0), cov('R1C2', 1)], [], [{ filter: 'Ha', seconds: 3600 }]))
    const json = JSON.parse(nextSessionJson({ name: 'M 31', revision: 2, rows }))
    expect(json).toMatchObject({ plan: 'M 31', revision: 2, frame: 'ICRS', units: { exposure: 'seconds' } })
    expect(json.panels).toHaveLength(2)
    expect(json.panels[0]).toMatchObject({ order: 1, id: 'R1C1', state: 'not started', coverage: 0, filters: [{ filter: 'Ha', haveSec: 0, goalSec: 3600, needSec: 3600 }] })
    expect(json.panels[0].rotationDeg).toBeCloseTo(-panels[0].positionAngleDeg, 1)
    expect(json.panels[0].ra).toMatch(/^\d\d:\d\d:\d\d/)
    expect(nextSessionExportName('Veil / east', 3, 'csv')).toBe('Veil_east-r3-next.csv')
    expect(nextSessionExportName('///', 1, 'json')).toBe('mosaic-r1-next.json')
  })
})
