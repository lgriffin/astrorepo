import { expect } from 'vitest'
import {
  makeEstimateSirilRun, makeFrameGrading, makePrepareSirilWorkspace,
  type FrameGrading, type MemoryProbe, type SirilRunEstimate, type SirilWorkspaceResult
} from '@astro/application'
import type { GradeReport, MachineMemory } from '@astro/domain'
import { FakeFrameMeasurer, FixedClock, FixedGradeLimits, InMemoryFrameGradeStore, InMemorySirilWorkspace, measurement } from '@astro/testkit'
import { defineSteps } from '@astro/testkit/bdd'

const GB = 1024 ** 3
/** Siril's space figures are in decimal gigabytes. */
const decimalGb = (n: number) => Math.round(n * 1e9)

class StackPlan {
  readonly workspace = new InMemorySirilWorkspace()
  readonly store = new InMemoryFrameGradeStore()
  readonly measurer = new FakeFrameMeasurer()
  memory: MachineMemory | null = null
  grading: FrameGrading | null = null
  plan: SirilRunEstimate | null = null
  report: GradeReport | null = null
  prepared: SirilWorkspaceResult | null = null
  sourceBefore: unknown = null
  placedBefore = new Set<string>()

  constructor() {
    this.workspace.space = { freeBytes: 1e12, usedBytes: 0 }
  }

  private readonly probe: MemoryProbe = { read: async () => this.memory }

  estimate(source: string, work: string): Promise<SirilRunEstimate> {
    return makeEstimateSirilRun({ workspace: this.workspace, memory: this.probe, ...(this.grading ? { selection: this.grading } : {}) })(source, work)
  }

  prepare(source: string, work: string): Promise<SirilWorkspaceResult> {
    return makePrepareSirilWorkspace({ workspace: this.workspace, ...(this.grading ? { selection: this.grading } : {}) })(source, work)
  }

  /** Lights, then darks, flats and biases in their own subfolders, sized when `size` is given. */
  addFrames(dir: string, lights: number, size: { width: number; height: number; colour: boolean } | null, calibration: [number, number, number] = [0, 0, 0]) {
    const frames: { name: string; imageType?: string }[] = []
    for (let i = 1; i <= lights; i++) {
      const name = `Light_${String(i).padStart(3, '0')}.fit`
      frames.push({ name })
      if (size) this.workspace.describe(`${dir}/${name}`, size)
    }
    const kinds = [['darks', 'Dark Frame'], ['flats', 'Flat Field'], ['biases', 'Bias Frame']] as const
    kinds.forEach(([kind, type], k) => {
      for (let i = 1; i <= calibration[k]; i++) frames.push({ name: `${kind}/${kind}_${i}.fit`, imageType: type })
    })
    this.workspace.addSource(dir, ...frames)
  }
}

const recommended = (w: StackPlan) => w.plan?.scripts.find(s => s.script === w.plan?.recommended.script)

export const sirilSteps = defineSteps(() => new StackPlan(), ({ Given, When, Then }) => {
  Given('{string} holds {int} colour lights of {int} by {int} pixels with {int} darks, {int} flats and {int} biases',
    (w, dir: string, n: number, width: number, height: number, d: number, f: number, b: number) =>
      w.addFrames(dir, n, { width, height, colour: true }, [d, f, b]))
  Given('{string} holds {int} mono lights of {int} by {int} pixels with {int} darks, {int} flats and {int} biases',
    (w, dir: string, n: number, width: number, height: number, d: number, f: number, b: number) =>
      w.addFrames(dir, n, { width, height, colour: false }, [d, f, b]))
  Given('{string} holds {int} colour lights of {int} by {int} pixels', (w, dir: string, n: number, width: number, height: number) =>
    w.addFrames(dir, n, { width, height, colour: true }))
  Given('{string} holds {int} lights the index has not read', (w, dir: string, n: number) => w.addFrames(dir, n, null))

  Given('the work disk has {float} GB free and an earlier run left {float} GB in the work folder', (w, free: number, used: number) => {
    w.workspace.space = { freeBytes: decimalGb(free), usedBytes: decimalGb(used) }
  })
  Given('my PC has {float} GB of memory with {float} GB free', (w, total: number, free: number) => {
    w.memory = { totalBytes: total * GB, availableBytes: free * GB }
  })

  When('I plan the stack into {string}', async (w, work: string) => {
    const source = [...w.workspace.source.keys()][0]
    w.plan = await w.estimate(source, work)
  })

  Then('the plan counts {int} lights, {int} darks, {int} flats and {int} biases', (w, lights: number, darks: number, flats: number, biases: number) => {
    expect(w.plan?.counts).toEqual({ lights, darks, flats, biases })
  })
  Then('it recommends {string}', (w, script: string) => {
    expect(w.plan?.recommended.script).toBe(script)
    expect(w.plan?.scripts[0].script).toBe(script)
  })
  Then('no script is recommended', w => { expect(w.plan?.recommended.script).toBeNull() })
  Then('{string} is missing biases and flats', (w, script: string) => {
    expect(w.plan?.scripts.find(s => s.script === script)?.missing).toEqual(['biases', 'flats'])
  })
  Then('{string} needs {float} GB and is short by {float} GB', (w, script: string, needed: number, short: number) => {
    expect(w.plan?.scripts.find(s => s.script === script)).toMatchObject({ neededBytes: decimalGb(needed), fits: false, shortBytes: decimalGb(short) })
  })
  Then('the plan reports {float} GB left by the earlier run', (w, used: number) => { expect(w.plan?.usedBytes).toBe(decimalGb(used)) })
  Then("the plan's frame size is approximate", w => { expect(w.plan).toMatchObject({ geometryApproximate: true }) })
  Then('the lights are taken as colour without that being known', w => { expect(w.plan).toMatchObject({ sensor: 'colour', sensorKnown: false }) })
  Then('no frame was placed and no folder was made', w => {
    expect(w.workspace.placed.size).toBe(0)
    expect(w.workspace.folders.size).toBe(0)
  })
  Then("the recommended script's memory check says {string}", (w, fit: string) => { expect(recommended(w)?.memory?.fit).toBe(fit) })
  Then('its advice mentions {string}', (w, text: string) => { expect(recommended(w)?.memory?.text).toContain(text) })

  // Grading

  Given('{string} holds lights {word}, {word} and {word} from one night, and a dark', (w, dir: string, ...names: string[]) => {
    names.forEach((name, i) => {
      const path = `${dir}/${name}`
      w.store.add('m42', { fileId: name, path, capturedAt: new Date(Date.UTC(2026, 0, 10, 21, i + 1)) })
      w.measurer.set(path, measurement())
    })
    w.workspace.addSource(dir, ...names.map(name => ({ name })), { name: 'Dark_001.fit', imageType: 'Dark' })
    w.sourceBefore = structuredClone(w.workspace.source.get(dir))
    w.grading = makeFrameGrading({ store: w.store, measurer: w.measurer, limits: new FixedGradeLimits(), clock: new FixedClock() })
  })
  Given('{word} measures an eccentricity of {float}', (w, name: string, eccentricity: number) => {
    w.measurer.set(w.store.lights.get(name)!.path, measurement({ eccentricity }))
  })
  Given('{word} cannot be measured because {string}', (w, name: string, reason: string) => {
    w.measurer.set(w.store.lights.get(name)!.path, reason)
  })
  Given('I prepped {string} for Siril in {string} before grading', async (w, source: string, work: string) => {
    w.prepared = await w.prepare(source, work)
    w.placedBefore = new Set(w.workspace.placed.keys())
  })

  When('the lights are graded', async w => {
    await w.grading!.measureBatch('m42')
    w.report = await w.grading!.grade('m42')
  })
  When('I prep {string} for Siril in {string} again', async (w, source: string, work: string) => {
    w.prepared = await w.prepare(source, work)
  })

  const grade = (w: StackPlan, name: string) => w.report?.grades.find(g => g.path.endsWith(`/${name}`))
  Then('{word} is rejected for its eccentricity', (w, name: string) => {
    expect(grade(w, name)?.verdict).toBe('reject')
    expect(grade(w, name)?.reasons.join(' ')).toMatch(/eccentricity/i)
    expect(w.report?.rejected).toBe(1)
  })
  Then('{word} is shown as not measured: {string}', (w, name: string, reason: string) => {
    expect(grade(w, name)).toMatchObject({ verdict: 'unmeasured', reasons: [reason] })
  })
  Then('the plan counts {int} lights and says {int} was rejected by grading', (w, lights: number, rejected: number) => {
    expect(w.plan?.counts.lights).toBe(lights)
    expect(w.plan?.rejectedLights).toBe(rejected)
  })
  Then('{string} was removed from the work area', (w, path: string) => {
    expect(w.placedBefore.has(path)).toBe(true)
    expect(w.workspace.placed.has(path)).toBe(false)
    expect(w.prepared).toMatchObject({ rejected: 1, pruned: 1 })
  })
  Then('{string} is unchanged', (w, dir: string) => { expect(w.workspace.source.get(dir)).toEqual(w.sourceBefore) })
})
