import { describe, expect, it } from 'vitest'
import { makeEstimateSirilRun, makeFrameGrading, type MemoryProbe } from '@astro/application'
import type { FrameIndexSettings, MachineMemory } from '@astro/domain'
import { FakeFrameMeasurer, FixedClock, FixedGradeLimits, InMemoryFrameGradeStore, InMemorySirilWorkspace, measurement } from '@astro/testkit'

const GB = 1024 ** 3
const clock = new FixedClock(new Date('2026-10-09T12:00:00Z'))

class FixedMemory implements MemoryProbe {
  constructor(private readonly memory: MachineMemory | null) {}
  async read() {
    return this.memory
  }
}

const settings = (over: Partial<FrameIndexSettings> = {}): FrameIndexSettings => ({
  exposureSec: 300, gain: 100, sensorTempC: -10, filter: null, capturedAt: null, focalMm: 250, pixelUm: 2.9, scope: 'Vespera Pro', ...over
})

/** A colour target with lights over two nights, darks, and flats from the first night only. */
function target(lights = 3, extra: { name: string; imageType?: string }[] = []) {
  const store = new InMemoryFrameGradeStore()
  const measurer = new FakeFrameMeasurer()
  const workspace = new InMemorySirilWorkspace()
  workspace.space = { freeBytes: 1e12, usedBytes: 0 }
  const names: { name: string; imageType?: string }[] = []
  for (let i = 1; i <= lights; i++) {
    const name = `Light_${String(i).padStart(3, '0')}.fit`
    const path = `/data/NGC 7000/${name}`
    const at = new Date(Date.UTC(2026, 0, i % 2 ? 10 : 12, 22, i))
    names.push({ name })
    store.add('ngc7000', { fileId: `l${i}`, path, capturedAt: at })
    measurer.set(path, measurement())
    workspace.describe(path, { width: 1000, height: 1000, colour: true, settings: settings({ capturedAt: at }) })
  }
  names.push({ name: 'Dark_001.fit', imageType: 'Dark' }, { name: 'Flat_001.fit', imageType: 'Flat' }, ...extra)
  workspace.addSource('/data/NGC 7000', ...names)
  workspace.describe('/data/NGC 7000/Dark_001.fit', { width: 1000, height: 1000, colour: true, settings: settings({ sensorTempC: 5 }) })
  workspace.describe('/data/NGC 7000/Flat_001.fit', { width: 1000, height: 1000, colour: true, settings: settings({ exposureSec: 1, capturedAt: new Date('2026-01-10T21:00:00Z') }) })
  const grading = makeFrameGrading({ store, measurer, limits: new FixedGradeLimits(), clock })
  return { store, workspace, grading }
}

describe('estimating a stack with advice', () => {
  it('[ADV-001] [ADV-002] Given the PC\'s memory, When a stack is estimated, Then each script says what it needs and whether it fits', async () => {
    const { workspace } = target()
    const roomy = await makeEstimateSirilRun({ workspace, memory: new FixedMemory({ totalBytes: 64 * GB, availableBytes: 32 * GB }) })('/data/NGC 7000', '/work')
    expect(roomy.scripts[0].memory).toMatchObject({ fit: 'one-pass', text: expect.stringMatching(/^Fits in memory/) })
    const unknown = await makeEstimateSirilRun({ workspace })('/data/NGC 7000', '/work')
    expect(unknown.scripts[0].memory?.fit).toBe('unknown')
  })

  it('[ADV-001] Given lights never indexed with a size, When estimated, Then memory is left out rather than guessed from nothing', async () => {
    const workspace = new InMemorySirilWorkspace().addSource('/x')
    const e = await makeEstimateSirilRun({ workspace, memory: new FixedMemory(null) })('/x', '/work')
    expect(e.scripts.every(s => s.memory === null)).toBe(true)
    expect(e.advice).toMatchObject({ scaleArcsec: null, nights: null, rejection: { siril: 'rej n' } })
  })

  it('[ADV-003] [ADV-004] [ADV-009] Given colour lights at 2.39"/px, When estimated, Then the scale, drizzle and rejection advice come from the kept lights', async () => {
    const { workspace } = target(12)
    const e = await makeEstimateSirilRun({ workspace })('/data/NGC 7000', '/work')
    expect(e.advice.scaleArcsec).toBe(2.39)
    expect(e.advice.drizzle).toMatchObject({ suggest: false, reason: expect.stringMatching(/12 lights are too few/) })
    expect(e.advice.rejection.siril).toBe('rej w 3 3')
  })

  it('[ADV-004] Given enough lights to drizzle, When estimated, Then drizzle is suggested with its extra disk over the recommended script', async () => {
    const { workspace } = target(120, [{ name: 'Bias_001.fit', imageType: 'Bias' }])
    const e = await makeEstimateSirilRun({ workspace })('/data/NGC 7000', '/work')
    expect(e.advice.drizzle.suggest).toBe(true)
    expect(e.recommended.script).not.toBe('OSC_Preprocessing_BayerDrizzle')
  })

  it('[ADV-004] Given enough lights to drizzle but no biases, When estimated, Then drizzle is not suggested and the missing frames are named', async () => {
    const { workspace } = target(120)
    const e = await makeEstimateSirilRun({ workspace })('/data/NGC 7000', '/work')
    expect(e.advice.drizzle).toMatchObject({ suggest: false, reason: expect.stringMatching(/but its script needs biases, which this folder lacks\.$/) })
  })

  it('[ADV-005] Given a dark that suits no light beside ones that do, When estimated, Then the stray is called out', async () => {
    const { workspace } = target(3, [{ name: 'Dark_002.fit', imageType: 'Dark' }])
    workspace.describe('/data/NGC 7000/Dark_001.fit', { width: 1000, height: 1000, colour: true, settings: settings() })
    workspace.describe('/data/NGC 7000/Dark_002.fit', { width: 1000, height: 1000, colour: true, settings: settings({ exposureSec: 60 }) })
    const e = await makeEstimateSirilRun({ workspace })('/data/NGC 7000', '/work')
    expect(e.advice.calibration.find(c => c.kind === 'dark')).toMatchObject({
      status: 'mismatch',
      text: "1 of 2 darks match no lights: the first has 60 s exposures against the lights' 300 s. Siril will use them with the rest; move them out of the folder."
    })
  })

  it('[ADV-005] Given darks warmer than the lights, When estimated, Then the calibration check says what differs', async () => {
    const { workspace } = target()
    const e = await makeEstimateSirilRun({ workspace })('/data/NGC 7000', '/work')
    expect(e.advice.calibration.find(c => c.kind === 'dark')).toMatchObject({ status: 'mismatch', text: expect.stringMatching(/sensor at 5 °C against the lights' -10 °C/) })
    expect(e.advice.calibration.find(c => c.kind === 'flat')?.status).toBe('matches')
    expect(e.advice.calibration.find(c => c.kind === 'bias')?.status).toBe('none')
  })

  it('[ADV-007] Given grading and lights over two nights, When estimated, Then each night shows with its flats and the shared flats are called out', async () => {
    const { workspace, grading } = target(4)
    await grading.measureBatch('ngc7000')
    const e = await makeEstimateSirilRun({ workspace, selection: grading })('/data/NGC 7000', '/work')
    expect(e.advice.nights?.nights.map(n => [n.night, n.lights, n.flats])).toEqual([['2026-01-10', 2, 1], ['2026-01-12', 2, 0]])
    expect(e.advice.nights?.sharedFlatsNote).toMatch(/^1 of 2 nights/)
  })

  it('[ADV-008] Given a night left out, When estimated again, Then its lights leave the stack; used again, Then they return', async () => {
    const { workspace, grading } = target(4)
    await grading.measureBatch('ngc7000')
    const paths = [1, 2, 3, 4].map(i => `/data/NGC 7000/Light_00${i}.fit`)
    await grading.setOverride('l4', 'keep')
    expect(await grading.setNightLeftOut(paths, '2026-01-12', true)).toBe(1)
    const estimate = makeEstimateSirilRun({ workspace, selection: grading })
    const without = await estimate('/data/NGC 7000', '/work')
    expect(without.counts.lights).toBe(3)
    expect(without.advice.nights?.nights.find(n => n.night === '2026-01-12')).toMatchObject({ lights: 2, kept: 1, rejected: 1, leftOut: true })
    await grading.setNightLeftOut(paths, '2026-01-12', false)
    const back = await estimate('/data/NGC 7000', '/work')
    expect(back.counts.lights).toBe(4)
    expect(back.advice.nights?.nights.find(n => n.night === '2026-01-12')?.leftOut).toBe(false)
    expect(await grading.setNightLeftOut(paths, '1999-01-01', true)).toBe(0)
  })
})
