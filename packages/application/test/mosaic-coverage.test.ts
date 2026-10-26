import { describe, expect, it } from 'vitest'
import { makeAssignCapture, makeCreateWorkspace, makeDescribeCoverage, makeExportNextSession } from '@astro/application'
import { layoutGrid } from '@astro/domain'
import {
  FixedClock,
  gridDefinition,
  InMemoryFileHashStore,
  InMemoryIntegrationGoalSource,
  InMemoryMosaicAssignmentStore,
  InMemoryMosaicStore,
  InMemoryMosaicWorkspaceStore,
  InMemorySolveStore,
  skyFile,
  solvedField
} from '@astro/testkit'

/** A 1 by 2 grid of Seestar fields at RA 180°, Dec 0°, with grading, hashes and goals to count against. */
async function rig(options: { targetId?: string | null; goals?: { targetId: string; filter: string; seconds: number }[] } = {}) {
  const workspaces = new InMemoryMosaicWorkspaceStore()
  const assignments = new InMemoryMosaicAssignmentStore()
  const solves = new InMemorySolveStore()
  const mosaics = new InMemoryMosaicStore()
  const hashes = new InMemoryFileHashStore()
  const goals = new InMemoryIntegrationGoalSource(options.goals ?? [])
  const rejected = new Set<string>()
  const asked: string[][] = []
  const selection = {
    rejected: async (paths: string[]) => {
      asked.push(paths)
      return new Set(paths.filter(p => rejected.has(p)))
    }
  }
  const clock = new FixedClock(new Date('2026-10-26T20:00:00Z'))
  const grid = gridDefinition({ centre: { raDeg: 180, decDeg: 0 }, rows: 1, columns: 2 })
  const made = await makeCreateWorkspace({ store: workspaces, clock })({ name: 'Veil', targetId: options.targetId === undefined ? 'ngc1' : options.targetId, grid })
  if (!made.ok) throw new Error('no workspace')
  const panels = layoutGrid(grid)
  const deps = { workspaces, assignments, solves, mosaics, selection, hashes, goals }
  /** A night of lights in one folder, solved at a position. */
  const night = async (folder: string, at: { raDeg: number; decDeg: number }, frames: { name: string; filter?: string; seconds?: number | null; modifiedAt?: string | null }[], targetId = 'ngc1') => {
    solves.add(
      ...frames.map(f =>
        skyFile({ path: `${folder}/${f.name}`, targetId, filter: f.filter ?? 'Ha', exposureSec: f.seconds === undefined ? 300 : f.seconds, modifiedAt: f.modifiedAt === undefined ? '2026-10-01T23:00:00.000Z' : f.modifiedAt })
      )
    )
    await solves.save({ path: `${folder}/${frames[0].name}`, field: solvedField(at.raDeg, at.decDeg), source: 'astap', solvedAt: clock.now(), error: null })
  }
  const hash = (path: string, fullHash: string | null, over: { sizeBytes?: number; modifiedAt?: string } = {}) =>
    hashes.saveHashes([{ path, sizeBytes: over.sizeBytes ?? 4_000_000, modifiedAt: over.modifiedAt ?? '2026-10-01T23:00:00.000Z', quickKey: 'q', fullHash }])
  return { ...deps, clock, id: made.workspace.id, panels, night, hash, rejected, asked, describe: makeDescribeCoverage(deps), exportNext: makeExportNextSession(deps) }
}

describe('coverage of a mosaic', () => {
  it('[MO-008, MO-018] Given a night of lights solved on R1C2, When coverage is worked out, Then R1C2 is covered with their exposure and R1C1 only by the overlap', async () => {
    const r = await rig({ goals: [{ targetId: 'ngc1', filter: 'Ha', seconds: 3600 }] })
    await r.night('D:/v/n1', r.panels[1].centre, [{ name: 'L1.fit' }, { name: 'L2.fit' }])
    const c = await r.describe(r.id)
    expect(c?.revision.revision).toBe(1)
    const [left, right] = c?.progress ?? []
    expect(right).toMatchObject({ panelId: 'R1C2', state: 'covered', captures: 1, goalsMet: false })
    expect(right.filters).toEqual([{ filter: 'Ha', haveSec: 600, goalSec: 3600, needSec: 3000 }])
    expect(left).toMatchObject({ panelId: 'R1C1', state: 'partly covered', captures: 0 })
    expect(left.coverage.fraction).toBeLessThan(0.3)
    expect(c?.totals).toEqual([{ filter: 'Ha', seconds: 600 }])
    expect(c?.goals).toEqual([{ filter: 'Ha', seconds: 3600 }])
    expect(c?.counted).toEqual([expect.objectContaining({ label: '2 lights, 2026-10-01, v/n1', kind: 'lights', panelId: 'R1C2', counted: 2, note: null })])
    expect(c?.next.map(n => n.panel.id)).toEqual(['R1C1', 'R1C2'])
    expect(c?.map.cells.length).toBeGreaterThan(0)
    expect(c?.unsolved).toBe(0)
  })

  it('[MO-011] Given lights between both panels, When coverage is worked out, Then they cover both but their exposure counts once, toward one panel', async () => {
    const r = await rig()
    await r.night('D:/v/n1', { raDeg: 180, decDeg: 0 }, [{ name: 'L1.fit', seconds: 600 }])
    const c = await r.describe(r.id)
    expect(c?.progress.every(p => p.coverage.fraction > 0.3)).toBe(true)
    const counted = (c?.progress ?? []).flatMap(p => p.filters).reduce((s, f) => s + f.haveSec, 0)
    expect(counted).toBe(600)
    expect(c?.totals).toEqual([{ filter: 'Ha', seconds: 600 }])
    const deepest = Math.max(...(c?.map.cells ?? []).map(cell => cell.seconds))
    expect(deepest).toBe(600)
  })

  it('[MO-020] Given lights grading rejects, When coverage is worked out, Then they add no exposure, and lights all rejected add no coverage either', async () => {
    const r = await rig()
    await r.night('D:/v/n1', r.panels[1].centre, [{ name: 'L1.fit' }, { name: 'L2.fit' }])
    await r.night('D:/v/n2', r.panels[0].centre, [{ name: 'L1.fit' }])
    r.rejected.add('D:/v/n1/L2.fit').add('D:/v/n2/L1.fit')
    const c = await r.describe(r.id)
    expect(r.asked).toEqual([['D:/v/n1/L1.fit', 'D:/v/n1/L2.fit', 'D:/v/n2/L1.fit']])
    expect(c?.totals).toEqual([{ filter: 'Ha', seconds: 300 }])
    const n2 = c?.counted.find(k => k.id.endsWith('D:/v/n2'))
    expect(n2).toMatchObject({ counted: 0, note: '1 frame rejected by grading.' })
    expect(c?.progress[0].coverage.fraction).toBeLessThan(0.3)
  })

  it('[MO-011] Given the same frames indexed in two folders, When coverage is worked out, Then they count once, from the first path', async () => {
    const r = await rig()
    await r.night('D:/a/n1', r.panels[1].centre, [{ name: 'L1.fit' }])
    await r.night('E:/copy/n1', r.panels[1].centre, [{ name: 'L1.fit' }])
    await r.hash('D:/a/n1/L1.fit', 'same')
    await r.hash('E:/copy/n1/L1.fit', 'same')
    const c = await r.describe(r.id)
    expect(c?.totals).toEqual([{ filter: 'Ha', seconds: 300 }])
    expect(c?.counted.find(k => k.id.includes('E:/copy'))?.note).toBe('1 frame with the same content as L1.fit, counted there.')
  })

  it('[MO-011] Given a hash not worked out in full, When coverage is worked out, Then the frames are not taken for copies', async () => {
    const r = await rig()
    await r.night('D:/a/n1', r.panels[1].centre, [{ name: 'L1.fit' }])
    await r.night('E:/b/n1', r.panels[1].centre, [{ name: 'L1.fit' }])
    await r.hash('D:/a/n1/L1.fit', null)
    await r.hash('E:/b/n1/L1.fit', null)
    expect((await r.describe(r.id))?.totals).toEqual([{ filter: 'Ha', seconds: 600 }])
  })

  it('[MO-011] Given a master over its lights on the same panel, When coverage is worked out, Then it adds no exposure there and covers no sky its lights do not', async () => {
    const r = await rig()
    await r.night('D:/v/n1', r.panels[1].centre, [{ name: 'L1.fit' }])
    r.solves.add(skyFile({ path: 'D:/v/master.fit', targetId: 'ngc1', kind: 'master', capturedAt: null, filter: 'Ha', exposureSec: 3600 }))
    // Solved a little east of its lights, still mostly on R1C2.
    await r.solves.save({ path: 'D:/v/master.fit', field: solvedField(r.panels[1].centre.raDeg + 0.2, r.panels[1].centre.decDeg), source: 'astap', solvedAt: r.clock.now(), error: null })
    const lightsOnly = await r.describe(r.id)
    expect(lightsOnly?.totals).toEqual([{ filter: 'Ha', seconds: 300 }])
    expect(lightsOnly?.counted.find(k => k.kind === 'master')).toMatchObject({ label: 'master master.fit', counted: 0, note: 'Its lights on R1C2 are counted instead, so it adds no exposure there.' })
    const left = lightsOnly?.progress[0].coverage.fraction
    r.rejected.add('D:/v/n1/L1.fit')
    const masterOnly = await r.describe(r.id)
    expect(masterOnly?.progress[0].coverage.fraction).toBeGreaterThan(left as number)
  })

  it('[MO-020, MO-022] Given a master with no exposure time, When coverage is worked out, Then it covers nothing and says why', async () => {
    const r = await rig()
    r.solves.add(skyFile({ path: 'D:/v/master.fit', targetId: 'ngc1', kind: 'master', capturedAt: null, filter: 'Ha', exposureSec: null }))
    await r.solves.save({ path: 'D:/v/master.fit', field: solvedField(r.panels[0].centre.raDeg, r.panels[0].centre.decDeg), source: 'astap', solvedAt: r.clock.now(), error: null })
    const c = await r.describe(r.id)
    expect(c?.progress.every(p => p.state === 'not started')).toBe(true)
    expect(c?.counted[0]).toMatchObject({ counted: 0, note: '1 frame with no exposure time.' })
  })

  it('[MO-011] Given a hash made before the file changed, When coverage is worked out, Then it is not taken for a copy', async () => {
    const r = await rig()
    await r.night('D:/a/n1', r.panels[1].centre, [{ name: 'L1.fit' }])
    await r.night('E:/b/n1', r.panels[1].centre, [{ name: 'L1.fit', modifiedAt: '2026-10-20T10:00:00.000Z' }])
    await r.night('F:/c/n1', r.panels[1].centre, [{ name: 'L1.fit', modifiedAt: null }])
    await r.hash('D:/a/n1/L1.fit', 'same')
    await r.hash('E:/b/n1/L1.fit', 'same')
    await r.hash('F:/c/n1/L1.fit', 'same', { sizeBytes: 5 })
    expect((await r.describe(r.id))?.totals).toEqual([{ filter: 'Ha', seconds: 900 }])
    await r.hash('F:/c/n1/L1.fit', 'same')
    expect((await r.describe(r.id))?.totals).toEqual([{ filter: 'Ha', seconds: 600 }])
  })

  it('[MO-011] Given lights put by hand on a panel this revision no longer has, When coverage is worked out, Then they count toward no panel and no total', async () => {
    const r = await rig()
    await r.night('D:/v/n1', r.panels[1].centre, [{ name: 'L1.fit' }])
    await r.assignments.set(r.id, { captureId: 'lights:ngc1|2026-10-01|D:/v/n1', action: 'assign', panelId: 'R9C9', reason: null, revision: 1, at: r.clock.now() })
    const c = await r.describe(r.id)
    expect(c?.counted[0].panelId).toBeNull()
    expect(c?.totals).toEqual([])
    expect(c?.progress[1].state).toBe('covered')
  })

  it('[MO-011] Given only a master on a panel, When coverage is worked out, Then it covers the panel and its exposure counts', async () => {
    const r = await rig()
    r.solves.add(skyFile({ path: 'D:/v/master.fit', targetId: 'ngc1', kind: 'master', capturedAt: null, filter: 'OIII', exposureSec: 3600 }))
    await r.solves.save({ path: 'D:/v/master.fit', field: solvedField(r.panels[0].centre.raDeg, r.panels[0].centre.decDeg), source: 'astap', solvedAt: r.clock.now(), error: null })
    const c = await r.describe(r.id)
    expect(r.asked).toEqual([])
    expect(c?.progress[0]).toMatchObject({ state: 'covered', filters: [{ filter: 'OIII', haveSec: 3600, goalSec: null, needSec: null }] })
  })

  it('[MO-022] Given a capture left out and another not solved, When coverage is worked out, Then neither adds coverage or exposure, and the unsolved one is counted as such', async () => {
    const r = await rig()
    await r.night('D:/v/n1', r.panels[1].centre, [{ name: 'L1.fit' }])
    r.solves.add(skyFile({ path: 'D:/v/n2/L1.fit', targetId: 'ngc1' }))
    await makeAssignCapture({ ...r, clock: r.clock })(r.id, 'lights:ngc1|2026-10-01|D:/v/n1', { action: 'exclude', reason: 'clouds' })
    const c = await r.describe(r.id)
    expect(c?.counted).toEqual([])
    expect(c?.totals).toEqual([])
    expect(c?.progress.every(p => p.state === 'not started')).toBe(true)
    expect(c?.unsolved).toBe(1)
    expect(c?.next).toHaveLength(2)
  })

  it('[MO-021] Given no workspace or no such revision, When coverage or the next session is asked for, Then there is none', async () => {
    const r = await rig()
    expect(await r.describe('nope')).toBeNull()
    expect(await r.describe(r.id, 9)).toBeNull()
    expect(await r.exportNext('nope', 'csv')).toBeNull()
  })

  it('[MO-008] Given a workspace with no target, When coverage is worked out, Then no goals are asked for and none apply', async () => {
    const r = await rig({ targetId: null, goals: [{ targetId: 'ngc1', filter: 'Ha', seconds: 60 }] })
    await r.night('D:/v/n1', r.panels[1].centre, [{ name: 'L1.fit' }], 'other')
    const c = await r.describe(r.id)
    expect(c?.goals).toEqual([])
    expect(c?.progress[1]).toMatchObject({ state: 'covered', goalsMet: null })
  })

  it('[MO-021] Given a panel short of its goal, When the next session is exported, Then the file is named for the plan and lists what each panel still needs', async () => {
    const r = await rig({ goals: [{ targetId: 'ngc1', filter: 'Ha', seconds: 900 }] })
    await r.night('D:/v/n1', r.panels[1].centre, [{ name: 'L1.fit' }])
    const csv = await r.exportNext(r.id, 'csv')
    expect(csv?.fileName).toBe('Veil-r1-next.csv')
    const lines = csv?.text.trim().split('\n') ?? []
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain(',R1C1,partly covered,')
    expect(lines[2]).toContain(',R1C2,covered,')
    expect(lines[2]).toContain(',Ha,300,900,600,Ha needs 0.2 h more')
    const json = await r.exportNext(r.id, 'json', 1)
    expect(json?.fileName).toBe('Veil-r1-next.json')
    expect(JSON.parse(json?.text ?? '{}').panels.map((p: { id: string }) => p.id)).toEqual(['R1C1', 'R1C2'])
  })
})
