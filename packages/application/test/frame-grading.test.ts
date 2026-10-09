import { describe, expect, it } from 'vitest'
import { makeEstimateSirilRun, makeFrameGrading, makePrepareSirilWorkspace, MEASURE_BATCH } from '@astro/application'
import { DEFAULT_GRADE_LIMITS } from '@astro/domain'
import { FakeFrameMeasurer, FixedClock, FixedGradeLimits, InMemoryFrameGradeStore, InMemorySirilWorkspace, measurement } from '@astro/testkit'

const clock = new FixedClock(new Date('2026-10-09T12:00:00Z'))

function setup(count = 3) {
  const store = new InMemoryFrameGradeStore()
  const measurer = new FakeFrameMeasurer()
  for (let i = 1; i <= count; i++) {
    const path = `/data/M 42/Light_00${i}.fit`
    store.add('m42', { fileId: `f${i}`, path, capturedAt: new Date(Date.UTC(2026, 0, 10, 21, i)) })
    measurer.set(path, measurement())
  }
  const limits = new FixedGradeLimits()
  return { store, measurer, limits, grading: makeFrameGrading({ store, measurer, limits, clock }) }
}

describe('FrameGrading', () => {
  it('[NFR-014] Given more lights than one batch, When measured, Then each call measures one batch and says how many remain', async () => {
    const { grading, measurer } = setup(MEASURE_BATCH + 3)
    expect(await grading.measureBatch('m42')).toEqual({ measured: MEASURE_BATCH, failed: 0, remaining: 3 })
    expect(await grading.measureBatch('m42')).toEqual({ measured: 3, failed: 0, remaining: 0 })
    expect(await grading.measureBatch('m42')).toEqual({ measured: 0, failed: 0, remaining: 0 })
    expect(measurer.measured).toHaveLength(MEASURE_BATCH + 3)
  })

  it('[GRD-011] Given a light that cannot be read, When measured, Then the reason is saved, it is not retried unless asked, and it stays in the stack', async () => {
    const { grading, measurer, store } = setup(2)
    measurer.set('/data/M 42/Light_002.fit', 'The pixel data is truncated.')
    expect(await grading.measureBatch('m42')).toEqual({ measured: 1, failed: 1, remaining: 0 })
    expect(await grading.measureBatch('m42')).toEqual({ measured: 0, failed: 0, remaining: 0 })
    const report = await grading.grade('m42')
    expect(report.grades[1]).toMatchObject({ verdict: 'unmeasured', reasons: ['Not measured: The pixel data is truncated.'] })
    measurer.set('/data/M 42/Light_002.fit', measurement())
    expect(await grading.measureBatch('m42', { retry: true })).toEqual({ measured: 1, failed: 0, remaining: 0 })
    expect(store.saved.at(-1)?.at.toISOString()).toBe('2026-10-09T12:00:00.000Z')
  })

  it('[GRD-005] Given the user rejects a light, When graded, Then it is rejected by hand; cleared, Then the limits decide again', async () => {
    const { grading } = setup()
    await grading.measureBatch('m42')
    await grading.setOverride('f2', 'reject')
    expect((await grading.grade('m42')).grades[1].verdict).toBe('reject')
    await grading.setOverride('f2', null)
    expect((await grading.grade('m42')).grades[1].verdict).toBe('keep')
  })

  it('[GRD-010] Given limits changed in Settings, When graded, Then the new limits apply without measuring again', async () => {
    const { grading, measurer, limits } = setup()
    measurer.set('/data/M 42/Light_003.fit', measurement({ eccentricity: 0.5 }))
    await grading.measureBatch('m42')
    expect((await grading.grade('m42')).rejected).toBe(0)
    limits.limits = { ...DEFAULT_GRADE_LIMITS, maxEccentricity: 0.4 }
    const report = await grading.grade('m42')
    expect(report.rejected).toBe(1)
    expect(report.limits.maxEccentricity).toBe(0.4)
    expect(measurer.measured).toHaveLength(3)
  })

  it('[GRD-008] Given a graded target, When exported, Then the CSV has a row per light', async () => {
    const { grading } = setup()
    await grading.measureBatch('m42')
    expect((await grading.exportCsv('m42')).trimEnd().split('\r\n')).toHaveLength(4)
  })
})

describe('Stacking with grades', () => {
  function stackable() {
    const { grading, measurer } = setup()
    measurer.set('/data/M 42/Light_002.fit', measurement({ eccentricity: 0.9 }))
    const workspace = new InMemorySirilWorkspace().addSource(
      '/data/M 42',
      { name: 'Light_001.fit' }, { name: 'Light_002.fit' }, { name: 'Light_003.fit' }, { name: 'Dark_001.fit', imageType: 'Dark' }
    )
    workspace.space = { freeBytes: 1e12, usedBytes: 0 }
    return { grading, workspace }
  }

  it('[GRD-007] Given a rejected light, When the stack is estimated, Then it is left out of the count and the space', async () => {
    const { grading, workspace } = stackable()
    await grading.measureBatch('m42')
    const without = await makeEstimateSirilRun({ workspace })('/data/M 42', '/work/M 42')
    const graded = await makeEstimateSirilRun({ workspace, selection: grading })('/data/M 42', '/work/M 42')
    expect(without.counts.lights).toBe(3)
    expect(graded.counts).toMatchObject({ lights: 2, darks: 1 })
    expect(graded.rejectedLights).toBe(1)
    expect(graded.scripts[0].neededBytes).toBeLessThan(without.scripts[0].neededBytes)
  })

  it('[GRD-007] Given a light rejected after an earlier run placed it, When the work area is prepared again, Then it is removed and the source is untouched', async () => {
    const { grading, workspace } = stackable()
    const prepare = makePrepareSirilWorkspace({ workspace, selection: grading })
    expect((await prepare('/data/M 42', '/work/M 42')).byFolder.lights).toBe(3)
    await grading.measureBatch('m42')
    const before = structuredClone(workspace.source.get('/data/M 42'))
    const again = await prepare('/data/M 42', '/work/M 42')
    expect(again).toMatchObject({ rejected: 1, pruned: 1, byFolder: { lights: 2, darks: 1 } })
    expect(workspace.placed.has('/work/M 42/lights/Light_002.fit')).toBe(false)
    expect(workspace.placed.has('/work/M 42/darks/Dark_001.fit')).toBe(true)
    expect(workspace.source.get('/data/M 42')).toEqual(before)
  })

  it('[GRD-011] Given lights never measured, When the stack is estimated, Then all of them are kept', async () => {
    const { grading, workspace } = stackable()
    expect((await makeEstimateSirilRun({ workspace, selection: grading })('/data/M 42', '/work/M 42')).counts.lights).toBe(3)
  })
})
