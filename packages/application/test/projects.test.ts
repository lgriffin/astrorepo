import { describe, expect, it } from 'vitest'
import {
  evidenceOf,
  makeAddNewSourceMembers,
  makeAddProjectTargets,
  makeCreateProject,
  makeCreateWorkspace,
  makeDescribeCoverage,
  makeDescribeProject,
  makeExportProjectManifest,
  makeListProjects,
  localDate,
  makeFrameGrading,
  makeListProjectSources,
  makeRemoveProjectTarget,
  makeSetCompletionRule,
  makeUpdateProject,
  type ProjectDefinition
} from '@astro/application'
import { DEFAULT_RULES, layoutGrid, type CompletionRule, type LightSub, type TargetFrames } from '@astro/domain'
import {
  FakeFrameMeasurer,
  FixedClock,
  FixedGradeLimits,
  gridDefinition,
  InMemoryFileHashStore,
  InMemoryFrameCatalogue,
  InMemoryFrameGradeStore,
  InMemoryIntegrationGoalSource,
  InMemoryMosaicAssignmentStore,
  InMemoryMosaicStore,
  InMemoryMosaicWorkspaceStore,
  InMemoryProjectSources,
  InMemoryProjectStore,
  InMemorySolveStore,
  skyFile,
  solvedField
} from '@astro/testkit'

const H = 3600
const sub = (filter: string | null, exposureSec: number, rejected = false): LightSub => ({ exposureSec, capturedAt: new Date('2026-10-01T22:00:00Z'), filter, scope: 'Seestar S50', rejected })
const target = (targetId: string, targetName: string, over: Partial<TargetFrames> = {}): TargetFrames => ({
  targetId,
  targetName,
  subs: [],
  stacks: [],
  goalSec: null,
  filterGoals: [],
  processedCount: 0,
  finalCount: 0,
  ...over
})

/** Projects over in-memory stores, a Messier catalogue, a collection and a 1 by 2 mosaic of NGC 6960. */
async function rig() {
  const store = new InMemoryProjectStore()
  const names = new Map([
    ['m1', 'M 1'],
    ['m31', 'M 31'],
    ['m42', 'M 42'],
    ['m45', 'M 45'],
    ['ngc6960', 'NGC 6960']
  ])
  const catalogue = { id: 'messier', name: 'Messier', targetIds: ['m1', 'm31', 'm42'] }
  const collection = { id: 'fav', name: 'Favourites', targetIds: ['m31', 'm45'] }
  const sources = new InMemoryProjectSources(names, [catalogue], [collection])
  const frames = new InMemoryFrameCatalogue()
  const clock = new FixedClock(new Date('2026-10-26T20:00:00Z'))
  const workspaces = new InMemoryMosaicWorkspaceStore()
  const solves = new InMemorySolveStore()
  const goals = new InMemoryIntegrationGoalSource([{ targetId: 'ngc6960', filter: 'Ha', seconds: H }])
  const coverageDeps = {
    workspaces,
    assignments: new InMemoryMosaicAssignmentStore(),
    solves,
    mosaics: new InMemoryMosaicStore(),
    selection: { rejected: async () => new Set<string>() },
    hashes: new InMemoryFileHashStore(),
    goals
  }
  const grid = gridDefinition({ centre: { raDeg: 180, decDeg: 0 }, rows: 1, columns: 2 })
  const veil = await makeCreateWorkspace({ store: workspaces, clock })({ name: 'Veil', targetId: 'ngc6960', grid })
  const empty = await makeCreateWorkspace({ store: workspaces, clock })({ name: 'Somewhere', targetId: null, grid })
  if (!veil.ok || !empty.ok) throw new Error('no workspace')
  const deps = { store, sources, frames, workspaces, coverage: makeDescribeCoverage(coverageDeps), clock }
  /** A night of 300 s Ha lights solved on a panel of the mosaic. */
  const shoot = async (panel: number, count: number) => {
    const at = layoutGrid(grid)[panel].centre
    const folder = `D:/veil/p${panel}`
    solves.add(...Array.from({ length: count }, (_, i) => skyFile({ path: `${folder}/L${i}.fit`, targetId: 'ngc6960', filter: 'Ha', exposureSec: 300, modifiedAt: '2026-10-01T23:00:00.000Z' })))
    await solves.save({ path: `${folder}/L0.fit`, field: solvedField(at.raDeg, at.decDeg), source: 'astap', solvedAt: clock.now(), error: null })
  }
  const create = makeCreateProject(deps)
  const make = async (definition: ProjectDefinition) => {
    const made = await create(definition)
    if (!made.ok) throw new Error(made.problems.join(' '))
    return made.project
  }
  return {
    ...deps,
    veil: veil.workspace,
    empty: empty.workspace,
    shoot,
    create,
    make,
    describe: makeDescribeProject(deps),
    list: makeListProjects(deps),
    add: makeAddProjectTargets(deps),
    remove: makeRemoveProjectTarget(deps),
    setRule: makeSetCompletionRule(deps),
    update: makeUpdateProject(deps),
    addNew: makeAddNewSourceMembers(deps),
    exportManifest: makeExportProjectManifest(deps),
    listSources: makeListProjectSources(deps),
    collection
  }
}

describe('creating projects', () => {
  it('[AP-004] Given a catalogue, When a catalogue campaign is made, Then its targets come in order, linked to the catalogue, with the kind\'s rule', async () => {
    const r = await rig()
    const p = await r.make({ name: '  Messier marathon ', kind: 'catalogue', catalogueId: 'messier' })
    expect(p).toMatchObject({ name: 'Messier marathon', kind: 'catalogue', status: 'active', rule: DEFAULT_RULES.catalogue, catalogueId: 'messier', collectionId: null, workspaceId: null, window: null })
    expect(p.targetIds).toEqual(['m1', 'm31', 'm42'])
    expect(p.createdAt).toEqual(r.clock.now())
  })

  it('[AP-004] Given a collection, When a personal collection is made from it with a target added by hand, Then both come in, each once', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Mine', kind: 'custom', collectionId: 'fav', targetIds: ['m1', 'm31'] })
    expect(p).toMatchObject({ collectionId: 'fav', targetIds: ['m31', 'm45', 'm1'] })
    expect((await r.make({ name: 'Hand picked', kind: 'custom', targetIds: ['m42'] })).targetIds).toEqual(['m42'])
  })

  it('[AP-004] Given a collection that no longer exists, When a project is made from it, Then it is refused in words; an empty one is fine', async () => {
    const r = await rig()
    expect(await r.create({ name: 'Mine', kind: 'custom', collectionId: 'gone' })).toEqual({ ok: false, problems: ['That collection no longer exists.'] })
    r.collection.targetIds.length = 0
    expect(await r.create({ name: 'Mine', kind: 'custom', collectionId: 'fav' })).toMatchObject({ ok: true, project: { collectionId: 'fav', targetIds: [] } })
  })

  it('[AP-004, AP-009] Given a window, When a seasonal campaign is made, Then it keeps the window; other kinds keep none', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Winter', kind: 'seasonal', window: { start: '2026-11-01', end: '2027-02-28' }, targetIds: ['m42', 'm45'] })
    expect(p.window).toEqual({ start: '2026-11-01', end: '2027-02-28' })
    expect((await r.make({ name: 'Deep', kind: 'target-depth', targetIds: ['m31'], window: { start: '2026-11-01', end: '2027-02-28' } })).window).toBeNull()
  })

  it('[AP-004] Given a mosaic, When a mosaic campaign is made, Then it follows the workspace and its target', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Veil', kind: 'mosaic', workspaceId: r.veil.id, targetIds: ['m31'] })
    expect(p).toMatchObject({ workspaceId: r.veil.id, targetIds: ['ngc6960'], rule: DEFAULT_RULES.mosaic })
    expect((await r.make({ name: 'No target', kind: 'mosaic', workspaceId: r.empty.id })).targetIds).toEqual([])
  })

  it('[AP-006] Given incomplete definitions, When made, Then each is refused with what is missing and nothing is kept', async () => {
    const r = await rig()
    const refused = async (d: ProjectDefinition) => {
      const result = await r.create(d)
      return result.ok ? [] : result.problems
    }
    expect(await refused({ name: ' ', kind: 'custom', targetIds: ['m1'] })).toEqual(['The project needs a name.'])
    expect(await refused({ name: 'A', kind: 'catalogue' })).toEqual(['Choose the catalogue to work through.'])
    expect(await refused({ name: 'A', kind: 'catalogue', catalogueId: 'nope' })).toEqual(['That catalogue has no targets.'])
    expect(await refused({ name: 'A', kind: 'seasonal' })).toEqual(['A seasonal campaign needs the dates it runs between.'])
    expect(await refused({ name: 'A', kind: 'seasonal', window: { start: '2026-12-01', end: '2026-11-01' } })).toEqual(['The window ends before it starts.'])
    expect(await refused({ name: 'A', kind: 'target-depth', targetIds: ['m1', 'm31'] })).toEqual(['A target depth project has exactly one target.'])
    expect(await refused({ name: 'A', kind: 'target-depth' })).toEqual(['A target depth project has exactly one target.'])
    expect(await refused({ name: 'A', kind: 'mosaic' })).toEqual(['Choose the mosaic to follow.'])
    expect(await refused({ name: 'A', kind: 'mosaic', workspaceId: 'nope' })).toEqual(['Choose the mosaic to follow.'])
    expect(await refused({ name: 'A', kind: 'mosaic', workspaceId: r.empty.id, rule: { ...DEFAULT_RULES.mosaic, published: true } })).toEqual([
      'This mosaic has no target, so its stacks and images cannot be found: ask for coverage and integration only.'
    ])
    expect(await refused({ name: 'A', kind: 'custom', targetIds: ['m1', 'x', 'y'] })).toEqual(['2 targets were not found.'])
    expect(await refused({ name: 'A', kind: 'target-depth', targetIds: ['x'] })).toEqual(['One target was not found.'])
    expect(await refused({ name: 'A', kind: 'custom', rule: { ...DEFAULT_RULES.custom, coverage: true } })).toEqual(['Only a mosaic campaign can ask for coverage.'])
    expect(await r.store.list()).toEqual([])
  })
})

describe('changing projects', () => {
  it('[AP-001] Given a project, When targets are added and one removed, Then the list follows; unknown targets are refused', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Mine', kind: 'custom', targetIds: ['m1'] })
    expect(await r.add(p.id, ['m31', 'm1', 'm31'])).toMatchObject({ ok: true, project: { targetIds: ['m1', 'm31'] } })
    expect(await r.add(p.id, ['zz'])).toEqual({ ok: false, problems: ['One target was not found.'] })
    expect(await r.remove(p.id, 'm1')).toMatchObject({ ok: true, project: { targetIds: ['m31'] } })
    expect(await r.add('nope', ['m1'])).toEqual({ ok: false, problems: ['There is no such project.'] })
    expect(await r.remove('nope', 'm1')).toEqual({ ok: false, problems: ['There is no such project.'] })
  })

  it('[AP-012] Given a target depth project or a mosaic campaign, When a target is added or removed, Then it is refused and the targets stay', async () => {
    const r = await rig()
    const depth = await r.make({ name: 'Deep', kind: 'target-depth', targetIds: ['m31'] })
    const veil = await r.make({ name: 'Veil', kind: 'mosaic', workspaceId: r.veil.id })
    expect(await r.add(depth.id, ['m1'])).toEqual({ ok: false, problems: ['A target depth project keeps its one target.'] })
    expect(await r.remove(depth.id, 'm31')).toEqual({ ok: false, problems: ['A target depth project keeps its one target.'] })
    expect(await r.add(veil.id, ['m1'])).toEqual({ ok: false, problems: ["A mosaic campaign's target is its mosaic's."] })
    expect(await r.remove(veil.id, 'ngc6960')).toEqual({ ok: false, problems: ["A mosaic campaign's target is its mosaic's."] })
    expect((await r.store.get(depth.id))?.targetIds).toEqual(['m31'])
  })

  it('[AP-001, AP-006] Given a new rule, When set, Then a valid one is kept and an invalid one refused', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Mine', kind: 'custom', targetIds: ['m1'] })
    const rule: CompletionRule = { integration: { kind: 'per filter', goals: [{ filter: 'L', seconds: H }] }, coverage: false, stacked: true, processed: false, published: false }
    expect(await r.setRule(p.id, rule)).toMatchObject({ ok: true, project: { rule } })
    expect(await r.setRule(p.id, { ...rule, coverage: true })).toEqual({ ok: false, problems: ['Only a mosaic campaign can ask for coverage.'] })
    expect(await r.setRule('nope', rule)).toEqual({ ok: false, problems: ['There is no such project.'] })
    const lonely = await r.make({ name: 'Lonely', kind: 'mosaic', workspaceId: r.empty.id })
    expect((await r.setRule(lonely.id, { ...DEFAULT_RULES.mosaic, stacked: true })).ok).toBe(false)
    expect((await r.setRule(lonely.id, { ...DEFAULT_RULES.mosaic, integration: { kind: 'none' } })).ok).toBe(true)
  })

  it('[AP-008, AP-009] Given a project, When renamed, paused, archived or its window moved, Then the change is kept; bad changes are refused', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Winter', kind: 'seasonal', window: { start: '2026-11-01', end: '2027-02-28' }, targetIds: ['m42'] })
    expect(await r.update(p.id, { name: ' Winter 26 ', status: 'paused' })).toMatchObject({ ok: true, project: { name: 'Winter 26', status: 'paused' } })
    expect(await r.update(p.id, { window: { start: '2026-12-01', end: '2027-03-31' } })).toMatchObject({ ok: true, project: { window: { start: '2026-12-01', end: '2027-03-31' }, name: 'Winter 26' } })
    expect(await r.update(p.id, { name: '' })).toEqual({ ok: false, problems: ['The project needs a name.'] })
    expect(await r.update(p.id, { window: { start: '2027-12-01', end: '2027-03-31' } })).toEqual({ ok: false, problems: ['The window ends before it starts.'] })
    const other = await r.make({ name: 'Other', kind: 'custom', targetIds: ['m1'] })
    expect(await r.update(other.id, { window: { start: '2026-12-01', end: '2027-03-31' } })).toEqual({ ok: false, problems: ['Only a seasonal campaign has a window.'] })
    expect(await r.update(other.id, { status: 'archived' })).toMatchObject({ ok: true, project: { status: 'archived', name: 'Other' } })
    expect(await r.update('nope', { status: 'active' })).toEqual({ ok: false, problems: ['There is no such project.'] })
  })
})

describe('progress from the index', () => {
  it('[AP-002, AP-003] Given targets with lights, stacks and images, When described, Then each task is judged from the index as it is now', async () => {
    const r = await rig()
    const rule: CompletionRule = { integration: { kind: 'per filter', goals: [{ filter: 'L', seconds: 2 * H }] }, coverage: false, stacked: false, processed: false, published: true }
    const p = await r.make({ name: 'Mine', kind: 'custom', targetIds: ['m1', 'm31', 'm42'], rule })
    r.frames.add(target('m1', 'M 1', { subs: [sub('L', 2 * H), sub('L', H, true)], finalCount: 1 }))
    r.frames.add(target('m31', 'M 31', { subs: [sub('L', H)], stacks: [{ producedAt: new Date('2026-10-02') }] }))
    const d = await r.describe(p.id)
    expect(d?.progress).toMatchObject({ done: 1, total: 3, complete: false })
    expect(d?.progress.tasks.map(t => [t.label, t.stage, t.done])).toEqual([
      ['M 1', 'published', true],
      ['M 31', 'stacked', false],
      ['M 42', 'not observed', false]
    ])
    expect(d?.next.map(a => [a.label, a.kind])).toEqual([
      ['M 31', 'capture'],
      ['M 42', 'capture']
    ])
    expect(d?.at).toEqual(r.clock.now())
    // New files indexed since: the next look sees them, with nothing imported again (AP-002).
    r.frames.add(target('m31', 'M 31', { subs: [sub('L', 2 * H)], stacks: [{ producedAt: new Date('2026-10-02') }], finalCount: 1 }))
    expect((await r.describe(p.id))?.progress.done).toBe(2)
    expect(await r.describe('nope')).toBeNull()
  })

  it('[AP-002] Given lights flagged for rejection, When integration is judged, Then they are acquired but not usable', () => {
    const e = evidenceOf('m1', 'M 1', target('m1', 'M 1', { subs: [sub('Ha', 600), sub(null, 300), sub(' ', 60), sub('Ha', 300, true)], filterGoals: [{ filter: 'Ha', goalSec: 900 }] }))
    expect(e.acquired).toEqual([
      { filter: 'Ha', seconds: 900 },
      { filter: 'No filter', seconds: 360 }
    ])
    expect(e.usable).toEqual([
      { filter: 'Ha', seconds: 600 },
      { filter: 'No filter', seconds: 360 }
    ])
    expect(e.goals).toEqual([{ filter: 'Ha', seconds: 900 }])
    expect(evidenceOf('m2', 'M 2', undefined)).toEqual({ targetId: 'm2', name: 'M 2', acquired: [], usable: [], stacks: 0, processed: 0, published: 0, goals: [] })
    expect(evidenceOf('m3', 'M 3', target('m3', 'M 3', { filterGoals: undefined })).goals).toEqual([])
  })

  it('[AP-002, AP-003] Given a mosaic campaign, When lights are solved on one panel, Then that panel is covered and short of its goal, apart from the other', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Veil', kind: 'mosaic', workspaceId: r.veil.id, rule: { ...DEFAULT_RULES.mosaic, published: true } })
    let d = await r.describe(p.id)
    expect(d?.mosaic).toEqual({ id: r.veil.id, name: 'Veil', revision: 1 })
    expect(d?.progress.tasks.map(t => [t.id, t.kind, t.stage, t.done])).toEqual([
      ['R1C1', 'panel', 'not started', false],
      ['R1C2', 'panel', 'not started', false],
      ['ngc6960', 'target', 'not observed', false]
    ])
    await r.shoot(1, 6)
    d = await r.describe(p.id)
    const right = d?.progress.tasks[1]
    expect(right?.parts).toEqual({ coverage: { met: true, detail: '100% covered' }, integration: { met: false, detail: 'Ha needs 0.5 h' } })
    expect(d?.progress.tasks[0].next?.kind).toBe('cover')
    expect(d?.progress.tasks[0].next?.text).toMatch(/^Cover R1C1 \(\d+% covered\), aiming at RA 12:\d\d:\d\d, Dec [+-]00:\d\d:\d\d$/)
    expect(d?.progress.tasks[2].parts).toEqual({ published: { met: false, detail: 'No finished image yet' } })
    expect(d?.progress.parts.map(t => [t.part, t.met, t.of])).toEqual([
      ['coverage', 1, 2],
      ['integration', 0, 2],
      ['published', 0, 1]
    ])
    await r.shoot(1, 6)
    expect((await r.describe(p.id))?.progress.tasks[1].done).toBe(true)
  })

  it('[AP-003] Given a mosaic campaign whose mosaic was deleted, When described, Then it shows the mosaic as gone and can never look complete', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Veil', kind: 'mosaic', workspaceId: r.veil.id })
    await r.shoot(0, 12)
    await r.shoot(1, 12)
    expect((await r.describe(p.id))?.progress.complete).toBe(true)
    const kept = r.store.projects.get(p.id)
    if (kept) kept.workspaceId = null
    const d = await r.describe(p.id)
    expect(d?.mosaic).toBeNull()
    expect(d?.progress.tasks.map(t => [t.id, t.stage, t.done])).toEqual([['mosaic', 'missing', false]])
    expect(d?.progress.complete).toBe(false)
    expect(d?.next[0].text).toMatch(/^The mosaic this project followed was deleted/)
  })

  it('[AP-003] Given a mosaic campaign that asks only for a finished image, When judged, Then its panels are not tasks and only the target counts', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Veil', kind: 'mosaic', workspaceId: r.veil.id, rule: { integration: { kind: 'none' }, coverage: false, stacked: false, processed: false, published: true } })
    const d = await r.describe(p.id)
    expect(d?.mosaic).toEqual({ id: r.veil.id, name: 'Veil', revision: 1 })
    expect(d?.progress.tasks.map(t => t.id)).toEqual(['ngc6960'])
    expect(d?.progress).toMatchObject({ done: 0, total: 1, complete: false })
  })

  it('[AP-001] Given a mosaic campaign with its own per-filter goals, When judged, Then the rule\'s goals replace the target\'s', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Veil', kind: 'mosaic', workspaceId: r.veil.id, rule: { ...DEFAULT_RULES.mosaic, integration: { kind: 'per filter', goals: [{ filter: 'Ha', seconds: 1800 }] } } })
    await r.shoot(1, 6)
    expect((await r.describe(p.id))?.progress.tasks[1]).toMatchObject({ done: true })
    const none = await r.make({ name: 'Just cover', kind: 'mosaic', workspaceId: r.veil.id, rule: { ...DEFAULT_RULES.mosaic, integration: { kind: 'none' } } })
    expect((await r.describe(none.id))?.progress.tasks.map(t => [t.id, t.done])).toEqual([
      ['R1C1', false],
      ['R1C2', true]
    ])
  })

  it('[AP-008] Given a paused project, When described, Then its progress stays and it offers no next actions', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Mine', kind: 'custom', targetIds: ['m1'] })
    expect((await r.describe(p.id))?.next).toHaveLength(1)
    await r.update(p.id, { status: 'paused' })
    const d = await r.describe(p.id)
    expect(d?.next).toEqual([])
    expect(d?.progress.total).toBe(1)
  })

  it('[AP-009] Given an evening west of Greenwich, When today is worked out, Then it is the local date, not the UTC one', () => {
    expect(localDate(new Date(2026, 9, 26, 23, 30))).toBe('2026-10-26')
    expect(localDate(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05')
  })

  it('[AP-009] Given a seasonal campaign, When described, Then its window is judged against today', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Winter', kind: 'seasonal', window: { start: '2026-10-20', end: '2026-10-31' }, targetIds: ['m42'] })
    expect((await r.describe(p.id))?.window).toEqual({ state: 'open', daysLeft: 6 })
    const q = await r.make({ name: 'Other', kind: 'custom', targetIds: ['m42'] })
    expect((await r.describe(q.id))?.window).toBeNull()
  })

  it('[AP-011] Given a collection that gained a member, When described and the new members added, Then the project shows and then takes them', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Mine', kind: 'custom', collectionId: 'fav' })
    expect((await r.describe(p.id))?.source).toEqual({ kind: 'collection', id: 'fav', name: 'Favourites', notInProject: [] })
    r.collection.targetIds.push('m1')
    expect((await r.describe(p.id))?.source?.notInProject).toEqual(['m1'])
    expect(await r.addNew(p.id)).toMatchObject({ ok: true, project: { targetIds: ['m31', 'm45', 'm1'] } })
    const cat = await r.make({ name: 'Messier', kind: 'catalogue', catalogueId: 'messier' })
    await r.remove(cat.id, 'm42')
    expect((await r.describe(cat.id))?.source).toEqual({ kind: 'catalogue', id: 'messier', name: 'Messier', notInProject: [] })
  })

  it('[AP-011] Given a target taken out by hand, When the source gains a member, Then only the new member is offered and the removed one stays out until added back', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Mine', kind: 'custom', collectionId: 'fav' })
    await r.remove(p.id, 'm45')
    r.collection.targetIds.push('m1')
    expect((await r.describe(p.id))?.source?.notInProject).toEqual(['m1'])
    expect(await r.addNew(p.id)).toMatchObject({ ok: true, project: { targetIds: ['m31', 'm1'] } })
    await r.add(p.id, ['m45'])
    expect((await r.store.get(p.id))?.removedTargetIds).toEqual([])
  })

  it('[AP-011] Given a project from no catalogue or collection, When new members are asked for, Then it is refused', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Mine', kind: 'custom', targetIds: ['m1'] })
    expect((await r.describe(p.id))?.source).toBeNull()
    expect(await r.addNew(p.id)).toEqual({ ok: false, problems: ['This project was not started from a catalogue or collection.'] })
    expect(await r.addNew('nope')).toEqual({ ok: false, problems: ['There is no such project.'] })
  })

  it('[AP-001] Given two campaigns on one mosaic, When listed, Then names are read once and the mosaic\'s coverage worked out once', async () => {
    const r = await rig()
    let coverageCalls = 0
    let nameCalls = 0
    const coverage = r.coverage
    const sources = r.sources
    const deps = {
      ...r,
      coverage: (id: string, revision?: number) => (coverageCalls++, coverage(id, revision)),
      sources: Object.assign(Object.create(sources) as typeof sources, { targetNames: (ids: string[]) => (nameCalls++, sources.targetNames(ids)) })
    }
    await r.make({ name: 'A', kind: 'mosaic', workspaceId: r.veil.id })
    await r.make({ name: 'B', kind: 'mosaic', workspaceId: r.veil.id })
    await r.make({ name: 'C', kind: 'custom', targetIds: ['m1'] })
    const list = await makeListProjects(deps)()
    expect(list.map(x => [x.project.name, x.total])).toEqual([
      ['C', 1],
      ['B', 2],
      ['A', 2]
    ])
    expect([coverageCalls, nameCalls]).toEqual([1, 1])
  })

  it('[AP-001] Given several projects, When listed, Then each comes newest first with how many tasks are done', async () => {
    const r = await rig()
    r.frames.add(target('m1', 'M 1', { finalCount: 1 }))
    await r.make({ name: 'Old', kind: 'custom', targetIds: ['m1', 'm31'] })
    r.clock.set('2026-10-27T20:00:00Z')
    await r.make({ name: 'New', kind: 'seasonal', window: { start: '2026-11-01', end: '2026-11-30' }, targetIds: ['m1'] })
    const list = await r.list()
    expect(list.map(s => [s.project.name, s.done, s.total, s.complete])).toEqual([
      ['New', 0, 1, false],
      ['Old', 1, 2, false]
    ])
    expect(list[0].window).toEqual({ state: 'not begun', daysToStart: 5 })
    expect(list.map(x => x.project.removedTargetIds)).toEqual([[], []])
    expect(await r.listSources()).toEqual({ catalogues: [{ id: 'messier', name: 'Messier', size: 3 }], collections: [{ id: 'fav', name: 'Favourites', size: 2 }] })
  })

  it('[AP-007] Given a project, When its manifest is exported, Then the file is named from it and holds every task', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Messier marathon', kind: 'catalogue', catalogueId: 'messier' })
    const csv = await r.exportManifest(p.id, 'csv')
    expect(csv?.fileName).toBe('Messier_marathon-manifest.csv')
    expect(csv?.text.split('\n')).toHaveLength(5)
    const json = await r.exportManifest(p.id, 'json')
    expect(json?.fileName).toBe('Messier_marathon-manifest.json')
    expect(JSON.parse(json?.text ?? '{}')).toMatchObject({ project: 'Messier marathon', kind: 'catalogue', total: 3, worked_out_at: '2026-10-26T20:00:00.000Z' })
    expect(await r.exportManifest('nope', 'csv')).toBeNull()
  })
})

describe('usable light from grading', () => {
  it('[AI-004] Given grading, When a frame is rejected by hand, Then the project\'s usable light and its bottlenecks follow the next time it is asked', async () => {
    const r = await rig()
    const store = new InMemoryFrameGradeStore()
    for (let i = 1; i <= 12; i++) store.add('m31', { fileId: `f${i}`, path: `D:/m31/L${i}.fit`, filter: 'L', exposureSec: 600, capturedAt: new Date('2026-10-01T22:00:00Z') })
    const grading = makeFrameGrading({ store, measurer: new FakeFrameMeasurer(), limits: new FixedGradeLimits(), clock: r.clock })
    const describe = makeDescribeProject({ ...r, grading })
    const rule: CompletionRule = { integration: { kind: 'per filter', goals: [{ filter: 'L', seconds: 2 * H }] }, coverage: false, stacked: false, processed: false, published: false }
    const p = await r.make({ name: 'Deep', kind: 'target-depth', targetIds: ['m31'], rule })
    // Grading knows the lights even when the catalogue has not counted them.
    expect((await describe(p.id))?.progress.tasks[0]).toMatchObject({ done: true, stage: 'acquired' })
    await grading.setOverride('f1', 'reject')
    const d = await describe(p.id)
    expect(d?.progress.tasks[0].parts.integration).toEqual({ met: false, detail: 'L needs 0.2 h' })
    expect(d?.bottlenecks.map(b => [b.id, b.label, b.forecast.kind])).toEqual([['m31|L', 'M 31 L', 'theoretical']])
  })

  it('[AI-006] Given a mosaic campaign short on a panel, When described, Then each short panel\'s filter is a bottleneck, the one with light to build on first', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Veil', kind: 'mosaic', workspaceId: r.veil.id })
    await r.shoot(1, 6)
    const d = await r.describe(p.id)
    expect(d?.bottlenecks.map(b => [b.id, b.forecast.kind])).toEqual([
      ['R1C2|Ha', 'theoretical'],
      ['R1C1|Ha', 'insufficient data']
    ])
    expect(d?.bottlenecks[0].forecast.inputs).toMatchObject({ frames: 6, acceptedSec: 1800 })
  })

  it('[AI-004] Given grading and a light the quality analysis flagged, When described, Then it is not usable until kept by hand', async () => {
    const r = await rig()
    const store = new InMemoryFrameGradeStore()
    for (let i = 1; i <= 12; i++) store.add('m31', { fileId: `f${i}`, path: `D:/m31/L${i}.fit`, filter: 'L', exposureSec: 600, capturedAt: new Date('2026-10-01T22:00:00Z'), qualityRejected: i === 1 })
    const grading = makeFrameGrading({ store, measurer: new FakeFrameMeasurer(), limits: new FixedGradeLimits(), clock: r.clock })
    const describe = makeDescribeProject({ ...r, grading })
    const rule: CompletionRule = { integration: { kind: 'per filter', goals: [{ filter: 'L', seconds: 2 * H }] }, coverage: false, stacked: false, processed: false, published: false }
    const p = await r.make({ name: 'Deep', kind: 'target-depth', targetIds: ['m31'], rule })
    expect((await describe(p.id))?.progress.tasks[0].parts.integration).toEqual({ met: false, detail: 'L needs 0.2 h' })
    await grading.setOverride('f1', 'keep')
    expect((await describe(p.id))?.progress.tasks[0].parts.integration).toMatchObject({ met: true })
  })

  it('[AI-001, AI-006] Given no grading, When a target is short, Then its bottleneck is forecast from the indexed subs, flagged ones rejected', async () => {
    const r = await rig()
    r.frames.add(target('m31', 'M 31', { subs: [...Array.from({ length: 6 }, () => sub('L', 600)), sub('L', 600, true), sub('L', 600, true)] }))
    const p = await r.make({ name: 'Deep', kind: 'target-depth', targetIds: ['m31'], rule: { ...DEFAULT_RULES['target-depth'], integration: { kind: 'per filter', goals: [{ filter: 'L', seconds: 2 * H }] } } })
    const [b] = (await r.describe(p.id))?.bottlenecks ?? []
    expect(b.forecast.kind).toBe('theoretical')
    expect(b.forecast.inputs).toMatchObject({ frames: 8, acceptedSec: H })
  })

  it('[AI-006] Given a target in two projects, When the projects are listed, Then it is graded once', async () => {
    const r = await rig()
    const store = new InMemoryFrameGradeStore()
    store.add('m31', { fileId: 'f1', path: 'D:/m31/L1.fit', filter: 'L', exposureSec: 600, capturedAt: new Date('2026-10-01T22:00:00Z') })
    const real = makeFrameGrading({ store, measurer: new FakeFrameMeasurer(), limits: new FixedGradeLimits(), clock: r.clock })
    const asked: string[] = []
    const grading = { ...real, grade: (id: string) => (asked.push(id), real.grade(id)) }
    const rule = { ...DEFAULT_RULES['target-depth'], integration: { kind: 'per filter' as const, goals: [{ filter: 'L', seconds: 2 * H }] } }
    await r.make({ name: 'One', kind: 'target-depth', targetIds: ['m31'], rule })
    await r.make({ name: 'Two', kind: 'target-depth', targetIds: ['m31'], rule })
    await r.make({ name: 'Three', kind: 'target-depth', targetIds: ['m42'], rule })
    expect(await makeListProjects({ ...r, grading })()).toHaveLength(3)
    expect(asked.sort()).toEqual(['m31', 'm42'])
  })

  it('[AI-003] Given a target short of a goal with nothing captured, When described, Then its bottleneck has no number', async () => {
    const r = await rig()
    const p = await r.make({ name: 'Deep', kind: 'target-depth', targetIds: ['m42'], rule: { ...DEFAULT_RULES['target-depth'], integration: { kind: 'per filter', goals: [{ filter: 'Ha', seconds: H }] } } })
    expect((await r.describe(p.id))?.bottlenecks.map(b => [b.label, b.forecast.snrGain])).toEqual([['M 42 Ha', null]])
  })
})
