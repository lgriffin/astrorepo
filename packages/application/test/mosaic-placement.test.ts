import { describe, expect, it } from 'vitest'
import { capturesFrom, captureLabel, makeAssignCapture, makeCreateWorkspace, makePlaceCaptures, makePreviewRevisionChanges, makeSaveWorkspaceRevision } from '@astro/application'
import { layoutGrid } from '@astro/domain'
import {
  FixedClock,
  gridDefinition,
  InMemoryMosaicAssignmentStore,
  InMemoryMosaicStore,
  InMemoryMosaicWorkspaceStore,
  InMemorySolveStore,
  skyFile,
  solvedField
} from '@astro/testkit'

/** A 1 by 2 grid of Seestar fields at RA 180°, Dec 0°, and a store of lights and solves around it. */
async function rig(targetId: string | null = 'ngc1') {
  const workspaces = new InMemoryMosaicWorkspaceStore()
  const assignments = new InMemoryMosaicAssignmentStore()
  const solves = new InMemorySolveStore()
  const mosaics = new InMemoryMosaicStore()
  const clock = new FixedClock(new Date('2026-10-25T20:00:00Z'))
  const grid = gridDefinition({ centre: { raDeg: 180, decDeg: 0 }, rows: 1, columns: 2 })
  const made = await makeCreateWorkspace({ store: workspaces, clock })({ name: 'Test', targetId, grid })
  if (!made.ok) throw new Error('no workspace')
  const panels = layoutGrid(grid)
  const deps = { workspaces, assignments, solves, mosaics }
  const solve = (path: string, raDeg: number, decDeg: number, over = {}) => solves.save({ path, field: solvedField(raDeg, decDeg, over), source: 'astap', solvedAt: clock.now(), error: null })
  return { ...deps, clock, id: made.workspace.id, grid, panels, solve, place: makePlaceCaptures(deps) }
}

/** The ids of ngc1's lights on 2026-10-01 in a folder. */
const lights = (folder: string) => `lights:ngc1|2026-10-01|${folder}`
const N1 = lights('D:/a/n1')
const N2 = lights('D:/a/n2')

describe('captures', () => {
  it('[MO-004] Given a night of lights in one folder solved once and a master, When read as captures, Then the lights are one capture placed by their solve and the master another', async () => {
    const solves = new InMemorySolveStore()
    const lights = [1, 2, 3].map(n => skyFile({ path: `D:/a/n1/L_00${n}.fit`, targetId: 'ngc1', filter: n === 3 ? 'Ha' : 'L', exposureSec: 30, fileId: `f${n}` }))
    const master = skyFile({ path: 'D:/a/master.fit', targetId: 'ngc1', kind: 'master', capturedAt: null })
    solves.add(...lights, master)
    await solves.save({ path: 'D:/a/n1/L_002.fit', field: solvedField(180, 0), source: 'astap', solvedAt: new Date(), error: null })
    await solves.save({ path: 'D:/a/master.fit', field: null, source: 'astap', solvedAt: new Date(), error: 'ASTAP found no solution.' })
    const captures = capturesFrom(await solves.files(), await solves.solves())
    expect(captures).toHaveLength(2)
    const group = captures.find(c => c.kind === 'lights')
    expect(group).toMatchObject({ id: N1, anchorPath: 'D:/a/n1/L_002.fit', fileId: 'f2', filters: ['Ha', 'L'], exposures: [30, 30, 30], night: '2026-10-01' })
    expect(group?.paths).toHaveLength(3)
    expect(captures.find(c => c.kind === 'master')).toMatchObject({ field: null, solveError: 'ASTAP found no solution.', night: null })
    expect(captureLabel(group as never)).toBe('3 lights, 2026-10-01, a/n1')
    expect(captureLabel(captures[1].kind === 'master' ? captures[1] : captures[0])).toBe('master master.fit')
  })
})

describe('placing captures on a workspace', () => {
  it("[MO-004, MO-007] Given a light solved inside R1C2, When the workspace's captures are placed, Then it is on R1C2 at its solved footprint, accepted", async () => {
    const r = await rig()
    r.solves.add(skyFile({ path: 'D:/a/n1/L.fit', targetId: 'other' }))
    await r.solve('D:/a/n1/L.fit', r.panels[1].centre.raDeg, r.panels[1].centre.decDeg)
    const result = await r.place(r.id)
    expect(result?.placed).toHaveLength(1)
    const [p] = result?.placed ?? []
    expect(p.assignment).toEqual({ panelId: 'R1C2', source: 'computed', state: 'accepted', note: null })
    expect(p.outline).toHaveLength(4)
    // R1C2 is the western panel, drawn right of the centre: x grows to the west.
    expect(p.outline.reduce((s, v) => s + v.x, 0) / 4).toBeCloseTo(0.306, 3)
  })

  it('[MO-005] Given a light between both panels, When placed, Then both intersections are kept, one is primary, and it is marked for review', async () => {
    const r = await rig()
    r.solves.add(skyFile({ path: 'D:/a/n1/L.fit', targetId: 'ngc1' }))
    await r.solve('D:/a/n1/L.fit', 180, 0)
    const [p] = (await r.place(r.id))?.placed ?? []
    expect(p.placement.intersections.map(i => i.panelId).sort()).toEqual(['R1C1', 'R1C2'])
    expect(p.assignment.state).toBe('needs-review')
    expect(p.assignment.panelId).toBe(p.placement.primary)
    expect(p.assignment.note).toMatch(/% of it falls in R1C[12] and \d+% in R1C[12]: check which panel it belongs to\./)
  })

  it("[MO-006] Given the workspace target's lights with no solve and a failed master, When placed, Then they are not placed on any panel but listed as unsolved", async () => {
    const r = await rig()
    r.solves.add(skyFile({ path: 'D:/a/n1/L.fit', targetId: 'ngc1' }), skyFile({ path: 'D:/a/m.fit', targetId: 'ngc1', kind: 'master' }), skyFile({ path: 'D:/z/L.fit', targetId: 'zzz' }))
    await r.solves.save({ path: 'D:/a/m.fit', field: null, source: 'siril', solvedAt: r.clock.now(), error: 'Siril could not solve it.' })
    const result = await r.place(r.id)
    expect(result?.placed).toEqual([])
    expect(result?.unsolved.map(c => [c.id, c.solveError])).toEqual([['D:/a/m.fit', 'Siril could not solve it.'], [N1, null]])
  })

  it("[MO-004] Given the workspace target's light solved far from the grid and another target's far light, When placed, Then the first is outside the grid and the second not listed", async () => {
    const r = await rig()
    r.solves.add(skyFile({ path: 'D:/a/n1/L.fit', targetId: 'ngc1' }), skyFile({ path: 'D:/z/n1/L.fit', targetId: 'zzz' }))
    await r.solve('D:/a/n1/L.fit', 10, 40)
    await r.solve('D:/z/n1/L.fit', 20, 40)
    const result = await r.place(r.id)
    expect(result?.outside.map(p => p.capture.id)).toEqual([N1])
    expect(result?.placed).toEqual([])
  })

  it("[MO-006] Given a workspace started from a target with another target linked as its panel, When placed, Then that target's unsolved lights are listed too", async () => {
    const r = await rig('m31')
    await r.mosaics.linkPanels('m31', ['m31-p2'])
    r.solves.add(skyFile({ path: 'D:/p2/n1/L.fit', targetId: 'm31-p2' }))
    const result = await r.place(r.id)
    expect(result?.targetIds).toEqual(['m31', 'm31-p2'])
    expect(result?.unsolved.map(c => c.targetId)).toEqual(['m31-p2'])
  })

  it('[MO-009] Given a light put by hand on R1C1 though it lies in R1C2, When placed, Then the override counts and is flagged as a conflict; clearing it restores the computed panel', async () => {
    const r = await rig()
    r.solves.add(skyFile({ path: 'D:/a/n1/L.fit', targetId: 'ngc1' }))
    await r.solve('D:/a/n1/L.fit', r.panels[1].centre.raDeg - 0.3, 0)
    const assign = makeAssignCapture({ ...r, clock: r.clock })
    expect(await assign(r.id, N1, { action: 'assign', panelId: 'R1C1', reason: 'the scope log says so' })).toEqual({ ok: true })
    const [p] = (await r.place(r.id))?.placed ?? []
    expect(p.assignment).toMatchObject({ panelId: 'R1C1', source: 'user-override', state: 'conflict' })
    // The computed footprint and intersections are kept beside the override.
    expect(p.placement.primary).toBe('R1C2')
    await assign(r.id, N1, { action: 'clear' })
    expect((await r.place(r.id))?.placed[0].assignment).toMatchObject({ panelId: 'R1C2', source: 'computed' })
  })

  it('[MO-009] Given a panel the latest revision does not have, or no workspace, When assigned, Then it is refused and nothing is stored', async () => {
    const r = await rig()
    const assign = makeAssignCapture({ ...r, clock: r.clock })
    expect(await assign(r.id, 'x', { action: 'assign', panelId: 'R5C5' })).toEqual({ ok: false, reason: 'Revision 1 has no panel R5C5.' })
    expect(await assign('nope', 'x', { action: 'exclude' })).toEqual({ ok: false, reason: 'That mosaic no longer exists.' })
    expect(await r.assignments.overrides(r.id, 1)).toEqual([])
  })

  it('[MO-009] Given a light left out, When placed, Then it is excluded with the reason and still shown', async () => {
    const r = await rig()
    r.solves.add(skyFile({ path: 'D:/a/n1/L.fit', targetId: 'ngc1' }))
    await r.solve('D:/a/n1/L.fit', r.panels[0].centre.raDeg, 0)
    await makeAssignCapture({ ...r, clock: r.clock })(r.id, N1, { action: 'exclude', reason: ' clouds ' })
    const [p] = (await r.place(r.id))?.placed ?? []
    expect(p.assignment).toEqual({ panelId: null, source: 'user-override', state: 'excluded', note: 'Left out: clouds' })
  })

  it('[MO-013] Given an override on a file the index no longer lists, When placed, Then it is kept as missing with where it last pointed', async () => {
    const r = await rig()
    await r.solve('D:/gone/L.fit', r.panels[0].centre.raDeg, 0)
    await makeAssignCapture({ ...r, clock: r.clock })(r.id, lights('D:/gone'), { action: 'assign', panelId: 'R1C1' })
    const result = await r.place(r.id)
    expect(result?.missing).toHaveLength(1)
    expect(result?.missing[0]).toMatchObject({ captureId: lights('D:/gone'), label: 'lights of ngc1 from D:/gone, 2026-10-01', lastField: { raDeg: r.panels[0].centre.raDeg } })
    expect(result?.placed).toEqual([])
  })

  it('[MO-010] Given a grid about to move by a panel and a half, When the change is previewed, Then the captures that would change panel are listed, overrides flagged, and nothing is saved', async () => {
    const r = await rig()
    r.solves.add(skyFile({ path: 'D:/a/n1/L.fit', targetId: 'ngc1' }), skyFile({ path: 'D:/a/n2/L.fit', targetId: 'ngc1' }))
    await r.solve('D:/a/n1/L.fit', r.panels[0].centre.raDeg, 0)
    await r.solve('D:/a/n2/L.fit', r.panels[1].centre.raDeg, 0)
    await makeAssignCapture({ ...r, clock: r.clock })(r.id, N2, { action: 'assign', panelId: 'R1C2' })
    // One and a half panels east: R1C2 takes R1C1's place and nothing covers the old R1C2.
    const step = r.grid.field.widthDeg * (1 - r.grid.overlapX)
    const moved = { ...r.grid, centre: { raDeg: 180 + 1.5 * step, decDeg: 0 } }
    const changes = await makePreviewRevisionChanges(r)(r.id, moved)
    expect(changes?.map(c => [c.captureId, c.from, c.to, c.overridden, c.overridePanel])).toEqual([
      [N1, 'R1C1', 'R1C2', false, null],
      [N2, 'R1C2', null, true, 'R1C2']
    ])
    expect((await r.workspaces.revisions(r.id)).map(v => v.revision)).toEqual([1])
    expect(await makePreviewRevisionChanges(r)('nope', moved)).toBeNull()
    expect(await makePreviewRevisionChanges(r)(r.id, { ...moved, rows: 0 })).toEqual([])
  })

  it('[MO-010] Given a capture put on a panel at revision 1, When revision 2 is saved, Then the override stays and is shown for review; revision 1 still places it as before', async () => {
    const r = await rig()
    r.solves.add(skyFile({ path: 'D:/a/n1/L.fit', targetId: 'ngc1' }))
    await r.solve('D:/a/n1/L.fit', r.panels[0].centre.raDeg, 0)
    await makeAssignCapture({ ...r, clock: r.clock })(r.id, N1, { action: 'assign', panelId: 'R1C1' })
    await makeSaveWorkspaceRevision({ store: r.workspaces, clock: r.clock })(r.id, { ...r.grid, positionAngleDeg: 5 })
    expect((await r.place(r.id))?.placed[0].assignment).toMatchObject({ panelId: 'R1C1', state: 'needs-review' })
    expect((await r.place(r.id, 1))?.placed[0].assignment).toMatchObject({ panelId: 'R1C1', state: 'accepted' })
    expect(await r.place(r.id, 9)).toBeNull()
    expect(await r.place('nope')).toBeNull()
  })

  it('[MO-010] Given a capture of the target outside the grid, When the grid is moved over it, Then it is listed as coming onto a panel', async () => {
    const r = await rig()
    r.solves.add(skyFile({ path: 'D:/a/n1/L.fit', targetId: 'ngc1' }))
    await r.solve('D:/a/n1/L.fit', 182, 0)
    expect((await r.place(r.id))?.outside.map(p => p.capture.id)).toEqual([N1])
    const changes = await makePreviewRevisionChanges(r)(r.id, { ...r.grid, centre: { raDeg: 182, decDeg: 0 } })
    expect(changes?.map(c => [c.captureId, c.from, c.to !== null])).toEqual([[N1, null, true]])
  })

  it('[MO-009] Given lights put on a panel by hand, When another of their files is solved later, Then the hand placement stays with them', async () => {
    const r = await rig()
    r.solves.add(skyFile({ path: 'D:/a/n1/L_1.fit', targetId: 'ngc1' }), skyFile({ path: 'D:/a/n1/L_2.fit', targetId: 'ngc1' }))
    await r.solve('D:/a/n1/L_2.fit', r.panels[0].centre.raDeg, 0)
    const assign = makeAssignCapture({ ...r, clock: r.clock })
    await assign(r.id, N1, { action: 'assign', panelId: 'R1C2', reason: 'log' })
    await r.solve('D:/a/n1/L_1.fit', r.panels[0].centre.raDeg, 0)
    const result = await r.place(r.id)
    expect(result?.placed.map(p => [p.capture.id, p.capture.anchorPath, p.assignment.panelId, p.assignment.source])).toEqual([[N1, 'D:/a/n1/L_1.fit', 'R1C2', 'user-override']])
    expect(result?.missing).toEqual([])
  })

  it('[MO-009, MO-010] Given a hand placement changed and then cleared on revision 2, When revision 1 is opened, Then it still shows the placement made there', async () => {
    const r = await rig()
    r.solves.add(skyFile({ path: 'D:/a/n1/L.fit', targetId: 'ngc1' }))
    await r.solve('D:/a/n1/L.fit', r.panels[0].centre.raDeg, 0)
    const assign = makeAssignCapture({ ...r, clock: r.clock })
    await assign(r.id, N1, { action: 'assign', panelId: 'R1C2', reason: 'first look' })
    await makeSaveWorkspaceRevision({ store: r.workspaces, clock: r.clock })(r.id, { ...r.grid, positionAngleDeg: 3 })
    await assign(r.id, N1, { action: 'exclude', reason: 'trailed' })
    expect((await r.place(r.id))?.placed[0].assignment).toMatchObject({ panelId: null, state: 'excluded' })
    expect((await r.place(r.id, 1))?.placed[0].assignment).toMatchObject({ panelId: 'R1C2', source: 'user-override', state: 'accepted' })
    await assign(r.id, N1, { action: 'clear' })
    expect((await r.place(r.id))?.placed[0].assignment).toMatchObject({ panelId: 'R1C1', source: 'computed' })
    expect((await r.place(r.id, 1))?.placed[0].override?.reason).toBe('first look')
  })
})

describe('captures, the finer points', () => {
  it('[MO-006] Given lights whose one tried solve failed and none solved, When read as captures, Then the tried file stands for them with its error', () => {
    const files = ['D:/a/n1/L_3.fit', 'D:/a/n1/L_1.fit', 'D:/a/n1/L_2.fit'].map(path => skyFile({ path, targetId: 'ngc1', filter: path.endsWith('2.fit') ? '  ' : ' L ' }))
    const [c] = capturesFrom(files, [{ path: 'D:/a/n1/L_2.fit', field: null, source: 'astap', solvedAt: new Date(0), error: 'Too few stars.' }])
    expect(c).toMatchObject({ id: N1, anchorPath: 'D:/a/n1/L_2.fit', field: null, solveError: 'Too few stars.', filters: ['L'] })
    expect(c.paths).toEqual(['D:/a/n1/L_1.fit', 'D:/a/n1/L_2.fit', 'D:/a/n1/L_3.fit'])
    // With nothing tried, the first file in path order stands for them.
    expect(capturesFrom(files, [])[0]).toMatchObject({ anchorPath: 'D:/a/n1/L_1.fit', solveError: null })
  })

  it('[MO-004] Given captures from two nights, When read, Then the earlier night comes first whatever their names', () => {
    const late = skyFile({ path: 'D:/a/aaa/L.fit', targetId: 'ngc1', capturedAt: new Date('2026-10-05T22:00:00Z') })
    const early = skyFile({ path: 'D:/a/zzz/L.fit', targetId: 'ngc1', capturedAt: new Date('2026-10-01T22:00:00Z') })
    expect(capturesFrom([late, early], []).map(c => c.night)).toEqual(['2026-10-01', '2026-10-05'])
  })

  it('[MO-006] Given a mosaic started from no target, When placed, Then no target is listed and nobody\'s unsolved lights are claimed', async () => {
    const r = await rig(null)
    r.solves.add(skyFile({ path: 'D:/a/n1/L.fit', targetId: 'ngc1' }))
    const result = await r.place(r.id)
    expect(result?.targetIds).toEqual([])
    expect(result?.unsolved).toEqual([])
  })

  it('[MO-009] Given a capture outside the grid put on a panel by hand, When placed, Then it is shown on that panel as a conflict, not in the outside tray', async () => {
    const r = await rig()
    r.solves.add(skyFile({ path: 'D:/a/n1/L.fit', targetId: 'ngc1' }))
    await r.solve('D:/a/n1/L.fit', 10, 40)
    await makeAssignCapture({ ...r, clock: r.clock })(r.id, N1, { action: 'assign', panelId: 'R1C1' })
    const result = await r.place(r.id)
    expect(result?.outside).toEqual([])
    expect(result?.placed.map(p => [p.capture.id, p.assignment.state])).toEqual([[N1, 'conflict']])
    // Another target's far capture left out by hand is still shown, so the choice can be undone.
    r.solves.add(skyFile({ path: 'D:/z/n1/L.fit', targetId: 'zzz' }))
    await r.solve('D:/z/n1/L.fit', 20, 40)
    await makeAssignCapture({ ...r, clock: r.clock })(r.id, 'lights:zzz|2026-10-01|D:/z/n1', { action: 'exclude' })
    expect((await r.place(r.id))?.outside.map(p => p.capture.id)).toEqual(['lights:zzz|2026-10-01|D:/z/n1'])
  })
})
