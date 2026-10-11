import { expect } from 'vitest'
import {
  JobRefusedError, makeEstimateSirilRun, makeJobScheduler, makeQueueStack, type JobScheduler, type JobsSnapshot
} from '@astro/application'
import { parseClock, type Job, type SirilScriptId } from '@astro/domain'
import {
  FakeMachine, FakeProcessRunner, FakeToolHub, FixedClock, FixedJobSettings, InMemoryJobLogs, InMemoryJobStore,
  InMemorySirilWorkspace, InMemoryStackCatalogue
} from '@astro/testkit'
import { defineSteps } from '@astro/testkit/bdd'
import { bytes, targetName } from '../support/words'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

/** "02:30 on 30 September 2026" as a local time, as the run window counts it. */
function at(hhmm: string, day: number, month: string, year: number): Date {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(year, MONTHS.indexOf(month), day, h, m)
}

class JobRunner {
  readonly store = new InMemoryJobStore()
  readonly runner = new FakeProcessRunner()
  readonly logs = new InMemoryJobLogs()
  readonly machine = new FakeMachine()
  readonly settings = new FixedJobSettings()
  readonly clock = new FixedClock()
  freeBytes: number | null = 100 * 1024 ** 3
  readonly jobs = new Map<string, Job>()
  snapshot: JobsSnapshot | null = null
  refusal: unknown = null
  readonly workspace = new InMemorySirilWorkspace()

  readonly scheduler: JobScheduler = makeJobScheduler({
    store: this.store,
    settings: this.settings,
    machine: this.machine,
    runner: this.runner,
    logs: this.logs,
    workspace: { workAreaSpace: async () => ({ freeBytes: this.freeBytes, usedBytes: 0 }) },
    prepare: async (_sourceDir, workDir) => ({
      workDir, linked: 30, copied: 2, existing: 1, rejected: 0, pruned: 0,
      byFolder: { lights: 30, darks: 1, flats: 1, biases: 1 }, placements: [], rejectedPaths: []
    }),
    readOnlyDirs: () => ['D:/astro'],
    clock: this.clock
  })

  async job(name: string): Promise<Job> {
    const id = this.jobs.get(name)?.id
    const job = id ? await this.store.get(id) : null
    if (!job) throw new Error(`No ${name} stack was queued`)
    return job
  }

  async wait(name: string) {
    const job = await this.job(name)
    return this.snapshot?.schedule.queue.find(q => q.jobId === job.id)?.wait
  }
}

export const jobSteps = defineSteps(() => new JobRunner(), ({ Given, When, Then, defineParameterType }) => {
  defineParameterType(targetName)
  defineParameterType({ name: 'time', regexp: /\d{2}:\d{2}/, transform: s => s })
  defineParameterType({ name: 'size', regexp: /[\d.]+ GB/, transform: s => bytes(s) })

  Given('the run window is {time} to {time}, a job waits for {int} idle minutes and CPU under {int}%',
    (w, start: string, end: string, idleMinutes: number, maxCpuPercent: number) => {
      w.settings.settings = { windowStart: parseClock(start)!, windowEnd: parseClock(end)!, idleMinutes, maxCpuPercent }
    })
  Given('the work disk has {size} free', (w, free: number) => { w.freeBytes = free })
  Given('it is {time} on {int} {word} {int}', (w, time: string, day: number, month: string, year: number) => {
    w.clock.set(at(time, day, month, year).toISOString())
  })
  Given('the PC was last used {int} seconds ago and its CPU is at {int}%', (w, idle: number, cpu: number) => {
    w.machine.load = { userIdleSeconds: idle, cpuPercent: cpu }
  })
  Given('I queued a window stack of {target} needing {size}', async (w, name: string, needed: number) => {
    const job = await w.store.add({
      kind: 'stack',
      targetId: name,
      title: `Stack ${name}`,
      timing: 'window',
      command: { program: 'siril-cli', args: ['-s', 'OSC_Preprocessing.ssf'], cwd: `/work/${name}` },
      prepare: { sourceDir: `/astro/${name}`, workDir: `/work/${name}` },
      spaceDir: `/work/${name}`,
      neededBytes: needed
    }, w.clock.now())
    w.jobs.set(name, job)
    // Queued one after the other, so the queue order is the order of the steps.
    w.clock.set(new Date(w.clock.now().getTime() + 1000).toISOString())
  })

  When('the job runner checks the queue', async w => {
    w.snapshot = await w.scheduler.tick()
    await flush()
  })
  When('I choose Run now for the {target} stack', async (w, name: string) => { await w.scheduler.runNow((await w.job(name)).id) })
  When('I cancel the {target} stack', async (w, name: string) => { await w.scheduler.cancel((await w.job(name)).id) })
  When('Siril prints {string} and exits with code {int} at {time}', async (w, text: string, code: number, time: string) => {
    const [h, m] = time.split(':').map(Number)
    const now = w.clock.now()
    w.clock.set(new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).toISOString())
    w.runner.last!.output(`${text}\n`)
    w.runner.last!.exit(code)
    await w.scheduler.idle()
  })

  Then('nothing starts', w => {
    expect(w.snapshot?.schedule.start).toBeNull()
    expect(w.runner.runs).toEqual([])
  })
  Then('Siril starts on the {target} stack', async (w, name: string) => {
    const job = await w.job(name)
    expect(w.snapshot?.schedule.start).toBe(job.id)
    expect(w.runner.runs).toHaveLength(1)
    expect(w.runner.last?.command.cwd).toBe(`/work/${name}`)
    expect(job.state).toBe('running')
  })
  Then('Siril starts on the {target} stack after Prep for Siril', async (w, name: string) => {
    const job = await w.job(name)
    expect(job.state).toBe('running')
    expect(w.runner.last?.command.program).toBe('siril-cli')
    expect(await w.scheduler.log(job.id)).toContain('Prep for Siril')
  })
  Then('the {target} stack waits for the window, which opens at {time} on {int} {word} {int}',
    async (w, name: string, time: string, day: number, month: string, year: number) => {
      expect(await w.wait(name)).toEqual({ code: 'window', opensAt: at(time, day, month, year) })
    })
  Then('the {target} stack waits because of {string}', async (w, name: string, code: string) => {
    expect((await w.wait(name))?.code).toBe(code)
  })
  Then('the {target} stack waits for the next window because it would overrun the close at {time}', async (w, name: string, time: string) => {
    const wait = await w.wait(name)
    expect(wait?.code).toBe('overrun')
    const now = w.clock.now()
    const [h, m] = time.split(':').map(Number)
    expect(wait?.code === 'overrun' && wait.closesAt).toEqual(new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m))
  })
  Then('the {target} stack waits for space, {size} short', async (w, name: string, short: number) => {
    expect(await w.wait(name)).toEqual({ code: 'space', shortBytes: short })
  })
  Then('the {target} stack has succeeded', async (w, name: string) => {
    expect(await w.job(name)).toMatchObject({ state: 'succeeded', exitCode: 0 })
  })
  Then('the {target} stack has failed with exit code {int}', async (w, name: string, code: number) => {
    const job = await w.job(name)
    expect(job).toMatchObject({ state: 'failed', exitCode: code })
    expect(job.note).toContain(String(code))
  })
  Then('the {target} stack is cancelled', async (w, name: string) => { expect((await w.job(name)).state).toBe('cancelled') })
  Then('its log reads {string}', async (w, text: string) => {
    const [job] = await w.store.list()
    expect(await w.scheduler.log(job.id)).toContain(text)
  })

  // Confirming a stack: the plan is worked out again before anything is queued.

  Given('{string} holds {int} colour lights and no calibration frames', (w, dir: string, n: number) => {
    w.workspace.addSource(dir, ...Array.from({ length: n }, (_, i) => ({ name: `Light_${i + 1}.fit` })))
    for (let i = 1; i <= n; i++) w.workspace.describe(`${dir}/Light_${i}.fit`, { width: 1080, height: 1920, colour: true })
    w.workspace.space = { freeBytes: 1e12, usedBytes: 0 }
  })
  When('I confirm a window stack of {target} from {string} with {string}', async (w, name: string, dir: string, script: string) => {
    const queue = makeQueueStack({
      estimate: makeEstimateSirilRun({ workspace: w.workspace }),
      tools: new FakeToolHub().installAll(),
      stacks: new InMemoryStackCatalogue().addTarget(name, { name }),
      store: w.store,
      clock: w.clock
    })
    try {
      w.jobs.set(name, await queue({ targetId: name, sourceDir: dir, workDir: `D:/work/siril/${name}`, script: script as SirilScriptId, timing: 'window' }))
    } catch (e) {
      w.refusal = e
    }
  })
  Then('the stack is refused because {string}', (w, reason: string) => {
    expect(w.refusal).toBeInstanceOf(JobRefusedError)
    expect((w.refusal as Error).message).toContain(reason)
  })
  Then('nothing is queued', async w => { expect(await w.store.list()).toEqual([]) })
  Then('a window job {string} is queued to run Siril in {string}', async (w, title: string, dir: string) => {
    const [job] = await w.store.list()
    expect(job).toMatchObject({ title, timing: 'window', state: 'queued', prepare: { workDir: dir } })
    expect(job.command.args).toContain(dir)
  })
})
