import { describe, expect, it } from 'vitest'
import {
  FORECAST_MINUTES,
  forecastFrame,
  makeCreateWorkspace,
  makeDescribeCoverage,
  makeDescribeIntegration,
  makeDescribeMosaicIntegration,
  makeFrameGrading,
  panelSummaries
} from '@astro/application'
import { layoutGrid, type FrameMeasurement } from '@astro/domain'
import {
  FakeFrameMeasurer,
  FixedClock,
  FixedGradeLimits,
  gridDefinition,
  InMemoryFileHashStore,
  InMemoryFrameGradeStore,
  InMemoryIntegrationGoalSource,
  InMemoryMosaicAssignmentStore,
  InMemoryMosaicStore,
  InMemoryMosaicWorkspaceStore,
  InMemorySolveStore,
  skyFile,
  solvedField
} from '@astro/testkit'

const H = 3600
const measured = (snr: number): FrameMeasurement => ({ fwhm: 3, eccentricity: 0.3, starCount: 200, background: 100, noise: 5, snr })

/** A target's lights in grading, with goals. */
function rig(goals: { targetId: string; filter: string; seconds: number }[] = []) {
  const store = new InMemoryFrameGradeStore()
  const clock = new FixedClock(new Date('2026-10-26T20:00:00Z'))
  const grading = makeFrameGrading({ store, measurer: new FakeFrameMeasurer(), limits: new FixedGradeLimits(), clock })
  let n = 0
  const add = (count: number, over: { filter?: string | null; exposureSec?: number | null; snr?: number | null; override?: 'keep' | 'reject' } = {}) => {
    for (let i = 0; i < count; i++) {
      n++
      store.add('m31', {
        fileId: `f${n}`,
        path: `D:/m31/L${String(n).padStart(3, '0')}.fit`,
        capturedAt: new Date('2026-10-01T22:00:00Z'),
        filter: over.filter === undefined ? 'Ha' : over.filter,
        exposureSec: over.exposureSec === undefined ? 300 : over.exposureSec,
        measurement: over.snr ? measured(over.snr) : null,
        override: over.override ?? null
      })
    }
  }
  return { store, grading, add, describe: makeDescribeIntegration({ grading, goals: new InMemoryIntegrationGoalSource(goals) }) }
}

describe('a target\'s integration', () => {
  it('[AI-001] Given kept and rejected lights in two filters, When described, Then acquired and accepted are apart for the target and each filter', async () => {
    const r = rig()
    r.add(10)
    r.add(2, { override: 'reject' })
    r.add(4, { filter: 'OIII', exposureSec: 600 })
    const t = await r.describe('m31')
    expect(t.all).toMatchObject({ frames: 16, acceptedFrames: 14, acquiredSec: 6000, acceptedSec: 5400 })
    expect(t.filters.map(f => [f.summary.filter, f.summary.acquiredSec, f.summary.acceptedSec, f.goalSec])).toEqual([
      ['Ha', 3600, 3000, null],
      ['OIII', 2400, 2400, null]
    ])
    expect(t.filters[0].forecasts.map(f => f.addedSec)).toEqual(FORECAST_MINUTES.map(m => m * 60))
    expect(t.filters[0].toGoal).toBeNull()
    expect(t.targetId).toBe('m31')
  })

  it('[AI-005, AI-006] Given goals, When described, Then each filter has its time to goal, goals with nothing captured show too, and the best filter for an hour leads', async () => {
    const r = rig([
      { targetId: 'm31', filter: 'ha', seconds: 2 * H },
      { targetId: 'm31', filter: 'SII', seconds: H }
    ])
    r.add(12)
    r.add(12, { filter: 'OIII' })
    const t = await r.describe('m31', [60])
    const ha = t.filters.find(f => f.summary.filter === 'Ha')
    expect(ha?.goalSec).toBe(2 * H)
    expect(ha?.toGoal).toMatchObject({ needSec: H, captureSec: H })
    const sii = t.filters.find(f => f.summary.filter === 'SII')
    expect(sii).toMatchObject({ goalSec: H, toGoal: { needSec: H, captureSec: null, range: null } })
    expect(sii?.forecasts[0].kind).toBe('insufficient data')
    expect(t.best.map(b => b.id)).toEqual(['Ha', 'OIII', 'SII'])
  })

  it('[AI-004] Given a frame rejected by hand after a forecast, When described again, Then the forecast is worked out from the new acceptance', async () => {
    const r = rig()
    r.add(12, { snr: 10 })
    const before = await r.describe('m31', [60])
    await r.grading.setOverride('f1', 'reject')
    await r.grading.setOverride('f2', 'reject')
    const after = await r.describe('m31', [60])
    expect(before.all.acceptedFrames).toBe(12)
    expect(after.all.acceptedFrames).toBe(10)
    expect([before, after].map(t => t.filters[0].forecasts[0].expectedAcceptedSec)).toEqual([H, 3000])
    expect(after.filters[0].forecasts[0].range).not.toEqual(before.filters[0].forecasts[0].range)
    expect(after.filters[0].forecasts[0].assumptions[1]).toBe('New capture is accepted at the rate so far: 83% of 12 frames.')
  })

  it('[AI-002] Given measured kept frames, When described, Then the forecast is measured and the light carries its SNR only while kept', async () => {
    const r = rig()
    r.add(12, { snr: 10 })
    expect((await r.describe('m31', [60])).filters[0].forecasts[0].kind).toBe('measured')
    const report = await r.grading.grade('m31')
    expect(forecastFrame(report.grades[0])).toEqual({ seconds: 300, filter: 'Ha', accepted: true, snr: 10 })
    expect(forecastFrame({ ...report.grades[0], verdict: 'reject' })).toEqual({ seconds: 300, filter: 'Ha', accepted: false, snr: null })
    expect(forecastFrame({ ...report.grades[0], verdict: 'unmeasured', measurement: null })).toMatchObject({ accepted: true, snr: null })
  })

  it('[AI-005] Given goals for one filter in two spellings and a goal with nothing captured, When described, Then the larger goal counts and the empty filter is named, placed and forecast like the rest', async () => {
    const r = rig([
      { targetId: 'm31', filter: 'OIII', seconds: H },
      { targetId: 'm31', filter: 'oiii', seconds: 2 * H },
      { targetId: 'm31', filter: ' Ha ', seconds: H }
    ])
    r.add(12, { filter: 'OIII' })
    const t = await r.describe('m31', [30, 60])
    expect(t.filters.map(f => [f.summary.filter, f.goalSec])).toEqual([
      ['Ha', H],
      ['OIII', 2 * H]
    ])
    expect(t.filters[0].forecasts.map(f => f.addedSec)).toEqual([1800, 3600])
  })

  it('[AI-008] Given a duration the user types, When described, Then each filter is forecast for exactly that long', async () => {
    const r = rig()
    r.add(12)
    const t = await r.describe('m31', [45, 90])
    expect(t.filters[0].forecasts.map(f => f.addedSec)).toEqual([2700, 5400])
  })

  it('[AI-003] Given a target with nothing, When described, Then there are no filters and nothing is claimed', async () => {
    const t = await rig().describe('m31')
    expect(t.filters).toEqual([])
    expect(t.best).toEqual([])
    expect(t.all.frames).toBe(0)
  })
})

describe('a mosaic\'s panels', () => {
  it('[AI-001] Given tallies, When summed for a panel, Then counted and rejected frames give acquired and accepted per filter', () => {
    const { all, byFilter } = panelSummaries([
      { filter: 'OIII', counted: 0, countedSec: 0, rejected: 1, rejectedSec: 300 },
      { filter: 'Ha', counted: 6, countedSec: 1800, rejected: 2, rejectedSec: 600 },
      { filter: 'ha', counted: 2, countedSec: 600, rejected: 0, rejectedSec: 0 }
    ])
    expect(all).toMatchObject({ filter: null, frames: 11, acceptedFrames: 8, acquiredSec: 3300, acceptedSec: 2400, measured: 0, weightedSec: null })
    expect(byFilter.map(s => [s.filter, s.frames, s.acceptedSec, s.acquiredSec, s.acceptance])).toEqual([
      ['Ha', 10, 2400, 3000, 0.8],
      ['OIII', 1, 0, 300, 0]
    ])
    expect(panelSummaries([]).all.acceptance).toBeNull()
  })

  it('[AI-002] Given a mosaic with lights on one panel, When described, Then that panel has a forecast and the empty one only its goal', async () => {
    const workspaces = new InMemoryMosaicWorkspaceStore()
    const solves = new InMemorySolveStore()
    const clock = new FixedClock(new Date('2026-10-26T20:00:00Z'))
    const grid = gridDefinition({ centre: { raDeg: 180, decDeg: 0 }, rows: 1, columns: 2 })
    const made = await makeCreateWorkspace({ store: workspaces, clock })({ name: 'Veil', targetId: 'ngc6960', grid })
    if (!made.ok) throw new Error('no workspace')
    const at = layoutGrid(grid)[1].centre
    solves.add(...Array.from({ length: 6 }, (_, i) => skyFile({ path: `D:/v/L${i}.fit`, targetId: 'ngc6960', filter: 'Ha', exposureSec: 300 })))
    await solves.save({ path: 'D:/v/L0.fit', field: solvedField(at.raDeg, at.decDeg), source: 'astap', solvedAt: clock.now(), error: null })
    const coverage = makeDescribeCoverage({
      workspaces,
      solves,
      assignments: new InMemoryMosaicAssignmentStore(),
      mosaics: new InMemoryMosaicStore(),
      selection: { rejected: async (paths: string[]) => new Set(paths.slice(0, 1)) },
      hashes: new InMemoryFileHashStore(),
      goals: new InMemoryIntegrationGoalSource([{ targetId: 'ngc6960', filter: 'Ha', seconds: H }])
    })
    const m = await makeDescribeMosaicIntegration({ coverage })(made.workspace.id, undefined, [60])
    expect(m?.revision).toBe(1)
    const [left, right] = m?.panels ?? []
    expect(right.all).toMatchObject({ frames: 6, acceptedFrames: 5, acceptedSec: 1500, acquiredSec: 1800 })
    expect(right.filters[0]).toMatchObject({ goalSec: H, toGoal: { needSec: 2100 } })
    expect(right.filters[0].forecasts[0].kind).toBe('theoretical')
    expect(left.filters.map(f => [f.summary.filter, f.summary.frames, f.goalSec])).toEqual([['Ha', 0, H]])
    expect(m?.best[0]).toMatchObject({ id: 'R1C2|Ha', label: 'R1C2 Ha' })
    expect(await makeDescribeMosaicIntegration({ coverage })('nope')).toBeNull()
  })
})
