import { describe, expect, it } from 'vitest'
import {
  editGrid,
  makeArchiveWorkspace,
  makeCreateWorkspace,
  makeDescribeWorkspace,
  makeExportWorkspace,
  makeListWorkspaces,
  makePlanMosaic,
  makeSaveWorkspaceRevision,
  makeWorkspaceFromTarget,
  previewGrid
} from '@astro/application'
import { layoutGrid } from '@astro/domain'
import {
  FakeEphemeris,
  FixedClock,
  gridDefinition,
  InMemoryMosaicStore,
  InMemoryMosaicWorkspaceStore,
  InMemoryPlanningSettings,
  InMemorySolveStore
} from '@astro/testkit'

const london = { latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 20 }

function rig() {
  const store = new InMemoryMosaicWorkspaceStore()
  const clock = new FixedClock(new Date('2026-10-25T20:00:00Z'))
  const settings = new InMemoryPlanningSettings()
  const ephemeris = new FakeEphemeris()
  return { store, clock, settings, ephemeris }
}

describe('previewing a grid', () => {
  it('[MO-001] Given a 2 by 2 grid, When previewed, Then each panel comes with its coordinates as text and its outline on a drawing about the centre', () => {
    const preview = previewGrid(gridDefinition())
    if (!preview.ok) throw new Error('expected a preview')
    expect(preview.panels.map(p => p.panel.id)).toEqual(['R1C1', 'R1C2', 'R2C1', 'R2C2'])
    expect(preview.panels[0].ra).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    expect(preview.panels[0].dec).toMatch(/^\+41:/)
    // R1C1 is top left: east (drawn left, x < 0) and north (y > 0) of the centre.
    const xs = preview.panels[0].outline.map(p => p.x)
    const ys = preview.panels[0].outline.map(p => p.y)
    expect(Math.min(...xs)).toBeLessThan(-0.6)
    expect(Math.max(...ys)).toBeGreaterThan(1.1)
    expect(preview.extent.widthDeg).toBeCloseTo(0.72 + 0.72 * 0.85, 9)
  })

  it('[MO-015] Given a grid with a problem, When previewed, Then the problems come back and no panels', () => {
    expect(previewGrid(gridDefinition({ rows: 0 }))).toMatchObject({ ok: false, problems: ['Rows must be a whole number from 1 to 12.'] })
  })

  it('[MO-002] Given a drag of the grid, When edited, Then the centre moves and the panels are laid out again from it', () => {
    const moved = editGrid({ grid: gridDefinition(), shift: { rightDeg: 0, upDeg: 0.5 } })
    if (!moved.ok) throw new Error('expected a preview')
    expect(moved.grid.centre.decDeg).toBeCloseTo(41.7688, 3)
    expect(moved.panels[0].panel.centre.decDeg).toBeGreaterThan(layoutGrid(gridDefinition())[0].centre.decDeg)
    expect(editGrid({ grid: gridDefinition() }).grid).toEqual(gridDefinition())
  })
})

describe('creating and revising a workspace', () => {
  it('[MO-001] Given a name and a grid, When a workspace is created, Then revision 1 is kept with its panels laid out', async () => {
    const r = rig()
    const made = await makeCreateWorkspace(r)({ name: '  Cygnus North America  ', targetId: 'ngc7000', grid: gridDefinition({ rows: 3, columns: 4 }) })
    if (!made.ok) throw new Error('expected a workspace')
    expect(made.workspace).toMatchObject({ name: 'Cygnus North America', targetId: 'ngc7000', latestRevision: 1, createdAt: r.clock.now() })
    const first = await r.store.revision(made.workspace.id, 1)
    expect(first?.panels).toHaveLength(12)
    expect(first?.panels).toEqual(layoutGrid(gridDefinition({ rows: 3, columns: 4 })))
  })

  it('[MO-015] Given no name or a grid with a problem, When a workspace is created, Then it is refused with every reason and nothing is stored', async () => {
    const r = rig()
    const made = await makeCreateWorkspace(r)({ name: ' ', grid: gridDefinition({ overlapY: 0.9 }) })
    expect(made).toEqual({ ok: false, problems: ['The mosaic needs a name.', 'The overlap down must be from 0% to 60%.'] })
    expect(await r.store.list()).toEqual([])
  })

  it('[MO-002, MO-010] Given a saved workspace, When the grid is turned and saved, Then revision 2 is added and revision 1 is kept as it was', async () => {
    const r = rig()
    const made = await makeCreateWorkspace(r)({ name: 'M 31', grid: gridDefinition() })
    if (!made.ok) throw new Error('expected a workspace')
    r.clock.advance(3600_000)
    const save = makeSaveWorkspaceRevision(r)
    expect(await save(made.workspace.id, gridDefinition({ positionAngleDeg: 30 }), 'turned for the new rotator')).toEqual({ status: 'saved', revision: 2 })
    const [one, two] = await r.store.revisions(made.workspace.id)
    expect(one.grid.positionAngleDeg).toBe(0)
    expect(one.panels).toEqual(layoutGrid(gridDefinition()))
    expect(two).toMatchObject({ revision: 2, note: 'turned for the new rotator', savedAt: r.clock.now() })
    expect(two.panels[0].positionAngleDeg).toBeCloseTo(30, 0)
  })

  it('[MO-002] Given the same grid saved again, When saved, Then no revision is added', async () => {
    const r = rig()
    const made = await makeCreateWorkspace(r)({ name: 'M 31', grid: gridDefinition() })
    if (!made.ok) throw new Error('expected a workspace')
    expect(await makeSaveWorkspaceRevision(r)(made.workspace.id, gridDefinition({ positionAngleDeg: 360 }))).toEqual({ status: 'unchanged', revision: 1 })
    expect(await r.store.revisions(made.workspace.id)).toHaveLength(1)
  })

  it('[MO-015] Given an unknown workspace or a grid with a problem, When saved, Then it is refused and no revision is added', async () => {
    const r = rig()
    const made = await makeCreateWorkspace(r)({ name: 'M 31', grid: gridDefinition() })
    if (!made.ok) throw new Error('expected a workspace')
    const save = makeSaveWorkspaceRevision(r)
    expect(await save('nope', gridDefinition())).toEqual({ status: 'no-workspace' })
    expect(await save(made.workspace.id, gridDefinition({ columns: 20 }))).toEqual({ status: 'invalid', problems: ['Columns must be a whole number from 1 to 12.'] })
    expect(await r.store.revisions(made.workspace.id)).toHaveLength(1)
  })

  it('[MO-015] Given another save landing first, When saved, Then this one is refused as stale and only the other revision is kept', async () => {
    const r = rig()
    const made = await makeCreateWorkspace(r)({ name: 'M 31', grid: gridDefinition() })
    if (!made.ok) throw new Error('expected a workspace')
    const save = makeSaveWorkspaceRevision(r)
    // The other save reads revision 1 too and writes revision 2 while this one is between reading and writing.
    const add = r.store.addRevision.bind(r.store)
    r.store.addRevision = async revision => {
      r.store.addRevision = add
      await save(made.workspace.id, gridDefinition({ positionAngleDeg: 10 }))
      return add(revision)
    }
    expect(await save(made.workspace.id, gridDefinition({ positionAngleDeg: 20 }))).toEqual({ status: 'stale', revision: 2 })
    expect((await r.store.revisions(made.workspace.id)).map(v => v.grid.positionAngleDeg)).toEqual([0, 10])
    // A store failing for another reason still fails loudly.
    r.store.addRevision = async () => {
      throw new Error('disk full')
    }
    await expect(save(made.workspace.id, gridDefinition({ positionAngleDeg: 30 }))).rejects.toThrow('disk full')
  })
})

describe('describing a workspace', () => {
  it('[MO-016] Given a site, When a workspace is described, Then each panel says how many of the coming nights it clears the altitude limit', async () => {
    const r = rig()
    r.settings.setSite(london)
    const made = await makeCreateWorkspace(r)({ name: 'M 31', grid: gridDefinition() })
    if (!made.ok) throw new Error('expected a workspace')
    const view = await makeDescribeWorkspace(r, 10)(made.workspace.id)
    expect(view?.outlook?.nightsLookedAt).toBe(10)
    expect(view?.outlook?.panels.map(p => p.panelId)).toEqual(['R1C1', 'R1C2', 'R2C1', 'R2C2'])
    for (const p of view?.outlook?.panels ?? []) {
      expect(p.clearNights).toBe(10)
      expect(p.firstClear).toBe('2026-10-25')
    }
  })

  it('[MO-016] Given a far southern grid from London, When described, Then its panels clear no night', async () => {
    const r = rig()
    r.settings.setSite(london)
    const made = await makeCreateWorkspace(r)({ name: 'LMC', grid: gridDefinition({ centre: { raDeg: 80.9, decDeg: -69.75 } }) })
    if (!made.ok) throw new Error('expected a workspace')
    const view = await makeDescribeWorkspace(r, 5)(made.workspace.id)
    expect(view?.outlook?.panels.every(p => p.clearNights === 0 && p.firstClear === null)).toBe(true)
  })

  it('[MO-010] Given two revisions, When an earlier one is asked for, Then it is drawn from the panels it was saved with, and every revision is listed', async () => {
    const r = rig()
    const made = await makeCreateWorkspace(r)({ name: 'M 31', grid: gridDefinition() })
    if (!made.ok) throw new Error('expected a workspace')
    await makeSaveWorkspaceRevision(r)(made.workspace.id, gridDefinition({ rows: 3 }), 'one more row')
    const describe = makeDescribeWorkspace(r)
    const latest = await describe(made.workspace.id)
    expect(latest?.revision.revision).toBe(2)
    expect(latest?.drawing.panels).toHaveLength(6)
    const first = await describe(made.workspace.id, 1)
    expect(first?.drawing.panels).toHaveLength(4)
    expect(first?.revisions.map(v => [v.revision, v.rows, v.note])).toEqual([[1, 2, null], [2, 3, 'one more row']])
    expect(first?.outlook).toBeNull()
    expect(await describe(made.workspace.id, 7)).toBeNull()
    expect(await describe('nope')).toBeNull()
  })

  it('[MO-001] Given workspaces, When listed and one archived, Then each comes with its grid size and the archived one says so', async () => {
    const r = rig()
    const a = await makeCreateWorkspace(r)({ name: 'A', grid: gridDefinition({ rows: 3, columns: 4 }) })
    if (!a.ok) throw new Error('expected a workspace')
    expect(await makeArchiveWorkspace(r)(a.workspace.id, true)).toBe(true)
    expect(await makeArchiveWorkspace(r)('nope', true)).toBe(false)
    expect((await makeListWorkspaces(r)()).map(w => [w.name, w.rows, w.columns, w.panels, w.status])).toEqual([['A', 3, 4, 12, 'archived']])
  })
})

describe('exporting', () => {
  it('[MO-012] Given a workspace at revision 2, When exported, Then the CSV is the latest revision and the JSON can be any revision', async () => {
    const r = rig()
    const made = await makeCreateWorkspace(r)({ name: 'Veil complex', grid: gridDefinition() })
    if (!made.ok) throw new Error('expected a workspace')
    await makeSaveWorkspaceRevision(r)(made.workspace.id, gridDefinition({ columns: 3 }))
    const exportIt = makeExportWorkspace(r)
    const csv = await exportIt(made.workspace.id, 'csv')
    expect(csv?.fileName).toBe('Veil_complex-r2.csv')
    expect(csv?.text.trimEnd().split('\n')).toHaveLength(7)
    const json = await exportIt(made.workspace.id, 'json', 1)
    expect(JSON.parse(json?.text ?? '{}')).toMatchObject({ revision: 1, frame: 'ICRS' })
    expect(await exportIt(made.workspace.id, 'json', 9)).toBeNull()
    expect(await exportIt('nope', 'csv')).toBeNull()
  })
})

describe("from the Sky planner's plan", () => {
  const planner = () => {
    const mosaics = new InMemoryMosaicStore()
      .addTarget({ id: 'm31', name: 'M 31', raHours: 10.6847 / 15, decDeg: 41.2688, sizeArcmin: 178, goalSec: 6 * 3600 })
      .addTarget({ id: 'm42', name: 'M 42' })
    const r = rig()
    return { r, mosaics, planMosaic: makePlanMosaic({ store: new InMemorySolveStore(), mosaics, settings: r.settings, ephemeris: r.ephemeris, clock: r.clock }) }
  }

  it("[MO-017] Given M 31's saved plan on the Sky planner, When opened as a workspace, Then the workspace has the same grid, turn and overlap, centred on M 31", async () => {
    const { r, mosaics, planMosaic } = planner()
    await mosaics.savePlan({ targetId: 'm31', field: { widthDeg: 0.72, heightDeg: 1.28 }, rotationDeg: 20, overlap: 0.2, savedAt: r.clock.now() })
    const made = await makeWorkspaceFromTarget({ ...r, planMosaic })('m31')
    if (!made.ok) throw new Error('expected a workspace')
    const first = await r.store.revision(made.workspace.id, 1)
    expect(made.workspace).toMatchObject({ name: 'M 31 mosaic', targetId: 'm31' })
    expect(first?.grid).toMatchObject({ centre: { raDeg: 10.6847, decDeg: 41.2688 }, positionAngleDeg: 20, overlapX: 0.2, overlapY: 0.2, field: { source: 'target-plan' } })
    expect((first?.grid.rows ?? 0) * (first?.grid.columns ?? 0)).toBeGreaterThan(1)
    expect(first?.note).toBe('Opened from the Sky planner')
  })

  it('[MO-017] Given a target with no position, or none at all, When opened as a workspace, Then it is refused with the reason and nothing is made', async () => {
    const { r, planMosaic } = planner()
    const open = makeWorkspaceFromTarget({ ...r, planMosaic })
    expect(await open('m42')).toEqual({ ok: false, problems: ['The target has no catalogue position to centre a mosaic on.'] })
    expect(await open('nope')).toEqual({ ok: false, problems: ['That target is not in the catalogue.'] })
    expect(await open('m31')).toEqual({ ok: false, problems: ['No field of view is known: pick a scope and camera on the Sky planner, or plate solve its lights.'] })
    expect(await r.store.list()).toEqual([])
  })
})
