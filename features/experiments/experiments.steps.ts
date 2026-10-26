import { expect } from 'vitest'
import {
  makeCompareExperiment,
  makeCreateExperiment,
  makeExportExperimentReport,
  makePlanPostProcessing,
  makePreferVariant,
  makeRunExperiment,
  type ExperimentComparison,
  type ExperimentRecord,
  type ExperimentResult,
  type RunResult
} from '@astro/application'
import type { Profile, Quality } from '@astro/domain'
import { FakeImagePixels, FakeToolHub, FakeToolProbe, FixedClock, InMemoryExperimentStore, InMemoryJobStore, InMemoryOutputFolder, InMemorySirilWorkspace, InMemoryStackCatalogue } from '@astro/testkit'
import { defineSteps } from '@astro/testkit/bdd'

const GB = 1e9

class Lab {
  readonly store = new InMemoryExperimentStore()
  readonly folder = new InMemoryOutputFolder()
  readonly stacks = new InMemoryStackCatalogue()
  readonly tools = new FakeToolHub().installAll()
  readonly workspace = new InMemorySirilWorkspace()
  readonly jobs = new InMemoryJobStore()
  readonly pixels = new FakeImagePixels()
  readonly clock = new FixedClock(new Date('2026-10-26T09:00:00Z'))
  stackPath = ''
  made: ExperimentResult | null = null
  ran: RunResult | null = null
  compared: ExperimentComparison | null = null

  get deps() {
    return { store: this.store, plan: makePlanPostProcessing({ stacks: this.stacks, tools: this.tools, workspace: this.workspace }), tools: this.tools, probe: new FakeToolProbe(), jobs: this.jobs, folder: this.folder, hasher: this.folder, space: this.workspace, pixels: this.pixels, clock: this.clock }
  }

  get experiment(): ExperimentRecord {
    if (!this.made?.ok) throw new Error('no experiment')
    return this.made.experiment
  }

  async make(name: string, variants: { profile: Profile; quality: Quality }[]) {
    this.made = await makeCreateExperiment(this.deps)('m31', { name, stackPath: this.stackPath, variants })
  }

  async jobOf(letter: string) {
    const v = (await this.store.get(this.experiment.id))?.variants.find(x => x.letter === letter)
    return v?.run ? this.jobs.get(v.run.jobId) : null
  }

  async finish(letter: string, state: 'succeeded' | 'failed', file?: string) {
    const job = await this.jobOf(letter)
    if (!job) throw new Error(`variant ${letter} has no job`)
    await this.jobs.update(job.id, { state, exitCode: state === 'succeeded' ? 0 : 1 })
    if (file) {
      const path = `D:/m31/processed/M31-exp1-${letter}/${file}`
      this.folder.put(path, `${letter} image`)
      this.pixels.add(path, { width: 40, height: 30, colour: true })
    }
  }
}

const variant = (profile: string, quality: string) => ({ profile: profile as Profile, quality: quality as Quality })

export const experimentSteps = defineSteps(() => new Lab(), ({ Given, When, Then }) => {
  Given('{string} has a stack {string} and Siril_Scripts is installed', (w, _target: string, file: string) => {
    w.stackPath = `D:/m31/${file}`
    w.stacks.addTarget('m31', { name: 'M 31', objectType: 'galaxy', raHours: 0.712, decDeg: 41.27 }).addStack('m31', { path: w.stackPath, sizeBytes: GB, width: 3000, height: 2000, focalMm: 250, pixelUm: 2.9 })
    w.folder.put(w.stackPath, 'the stack')
    w.workspace.space = { freeBytes: 1000 * GB, usedBytes: 0 }
  })

  When('I make an experiment {string} with a {string} {string} variant and a {string} {string} variant', (w, name: string, p1: string, q1: string, p2: string, q2: string) =>
    w.make(name, [variant(p1, q1), variant(p2, q2)])
  )
  Given('I made an experiment {string} with a {string} {string} variant and a {string} {string} variant', (w, name: string, p1: string, q1: string, p2: string, q2: string) =>
    w.make(name, [variant(p1, q1), variant(p2, q2)])
  )
  When('I try to make an experiment {string} with two {string} {string} variants', (w, name: string, p: string, q: string) => w.make(name, [variant(p, q), variant(p, q)]))
  Given('the stack is stacked again', w => {
    w.folder.put(w.stackPath, 'a new stack')
  })
  Given('both variants finished with a final image', async w => {
    await makeRunExperiment(w.deps)(w.experiment.id, 'now')
    await w.finish('A', 'succeeded', 'M31_final.fit')
    await w.finish('B', 'succeeded', 'M31_final.fit')
  })

  When('I run the experiment', async w => {
    w.ran = await makeRunExperiment(w.deps)(w.experiment.id, 'window')
  })
  When('variant {string} finishes and leaves {string}', (w, letter: string, file: string) => w.finish(letter, 'succeeded', file))
  When('variant {string} fails', (w, letter: string) => w.finish(letter, 'failed'))
  When('I compare the experiment', async w => {
    w.compared = await makeCompareExperiment(w.deps)(w.experiment.id)
  })
  When('I prefer variant {string}', async (w, letter: string) => {
    const v = w.experiment.variants.find(x => x.letter === letter)
    expect((await makePreferVariant(w.deps)(w.experiment.id, v?.id ?? null)).ok).toBe(true)
  })

  Then("the stack's SHA-256 is kept", w => {
    expect(w.experiment.input.sha256).toBe('sha:the stack')
  })
  Then('variant {string} writes to {string} and variant {string} to {string}', (w, a: string, aDir: string, b: string, bDir: string) => {
    const dir = (letter: string) => w.experiment.variants.find(v => v.letter === letter)?.outputDir
    expect([dir(a), dir(b)]).toEqual([`D:/m31/${aDir}`, `D:/m31/${bDir}`])
  })
  Then('{int} post-process jobs are queued', async (w, count: number) => {
    expect((await w.jobs.list()).filter(j => j.kind === 'post-process')).toHaveLength(count)
  })
  Then('variant {string} ran with {string}', async (w, letter: string, arg: string) => {
    expect((await w.jobOf(letter))?.command.args).toContain(arg)
  })
  Then('only variant {string} is queued again', (w, letter: string) => {
    expect(w.ran).toEqual({ ok: true, queued: [letter] })
  })
  Then('it is refused because {string}', (w, problem: string) => {
    const result = w.ran ?? w.made
    expect(result).toMatchObject({ ok: false, problems: [problem] })
  })
  Then('both final images are shown with the same figures and no winner is named', w => {
    expect(w.compared?.variants.map(v => v.image && 'metrics' in v.image)).toEqual([true, true])
    expect(w.compared?.notes.at(-1)).toMatch(/^No one figure picks the best image/)
    expect(w.compared?.notes.join(' ')).not.toMatch(/best variant|winner/i)
  })
  Then('variant {string} is preferred and variant {string} keeps its files', async (w, preferred: string, other: string) => {
    const e = await w.store.get(w.experiment.id)
    expect(e?.variants.find(v => v.id === e.preferredVariantId)?.letter).toBe(preferred)
    expect(w.folder.files.has(`D:/m31/processed/M31-exp1-${other}/M31_final.fit`)).toBe(true)
  })
  Then('the report says variant {string} is preferred and the stack is unchanged', async (w, letter: string) => {
    const report = await makeExportExperimentReport({ ...w.deps, targetName: async () => 'M 31' })(w.experiment.id, 'md')
    expect(report?.text).toContain(`## Variant ${letter} (preferred)`)
    expect(report?.text).toContain('- unchanged since the experiment was made')
  })
})
