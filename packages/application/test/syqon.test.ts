import { describe, it, expect } from 'vitest'
import { JobRefusedError, makeJobScheduler, makeListSyqonModels, makePlanSyqon, makeQueueSyqon } from '@astro/application'
import { DEFAULT_JOB_SETTINGS } from '@astro/domain'
import {
  FakeMachine,
  FakeProcessRunner,
  FakeToolHub,
  FakeToolProbe,
  FixedClock,
  FixedJobSettings,
  InMemoryJobLogs,
  InMemoryJobStore,
  InMemorySirilWorkspace,
  InMemoryStackCatalogue
} from '@astro/testkit'

const SYQON = 'C:/Users/leigh/AppData/Local/Programs/SyQon Studio/syqon-cli.exe'
const STACK = 'D:/work/M31/result_3600s.fit'
const MODELS = 'axiom-mini available Star separation\nstellar-q available Star removal\nparallax-nano locked Sharpening\nprism-essential included Denoise\n'
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function setup(over: { models?: string; installed?: boolean; free?: number | null } = {}) {
  const tools = new FakeToolHub()
  if (over.installed !== false) tools.install('syqon', SYQON)
  tools.folders.set('D:/work/M31', ['result_3600s.fit'])
  const probe = new FakeToolProbe().answer(SYQON, ['--list-models'], { stdout: over.models ?? MODELS })
  const stacks = new InMemoryStackCatalogue().addTarget('m31', { name: 'M 31' }).addStack('m31', { path: STACK, sizeBytes: 300e6, modifiedAt: new Date('2026-09-20T00:00:00Z') })
  const workspace = new InMemorySirilWorkspace()
  workspace.space = { freeBytes: over.free === undefined ? 100e9 : over.free, usedBytes: 0 }
  const plan = makePlanSyqon({ stacks, tools, workspace, models: makeListSyqonModels({ tools, probe }) })
  const store = new InMemoryJobStore()
  return { tools, probe, stacks, workspace, plan, store, queue: makeQueueSyqon({ plan, store, clock: new FixedClock(new Date(2026, 8, 29, 20)) }) }
}

describe('Planning a SyQon step', () => {
  it('[HUB-007] [HUB-011] Given models the CLI listed, When star separation is planned, Then only available star models are offered and the command writes beside the stack', async () => {
    const s = setup()
    const plan = await s.plan('m31', { step: 'star-separation' })
    expect(plan.models?.map(m => m.id)).toEqual(['axiom-mini', 'stellar-q'])
    expect(plan).toMatchObject({ model: 'axiom-mini', output: 'D:/work/M31/result_3600s_starless.fit', outputExists: false, blocked: null, neededBytes: 300e6 })
    expect(plan.command).toEqual({
      program: SYQON,
      args: ['--model', 'axiom-mini', '--input', STACK, '--output', 'D:/work/M31/result_3600s_starless.fit'],
      cwd: 'D:/work/M31'
    })
    expect((await s.plan('m31', { step: 'star-separation', model: 'stellar-q' })).model).toBe('stellar-q')
    // A model the account may not use is never offered, even when asked for.
    expect((await s.plan('m31', { step: 'sharpen', model: 'parallax-nano' })).blocked).toBe(
      'Your SyQon account has no model for sharpen available. Settings, under Tools, lists the models and whether each is available.'
    )
  })

  it('[HUB-014] Given the output already beside the stack, When planned without Replace it, Then it is blocked; with it, the overwrite flag is passed', async () => {
    const s = setup()
    s.tools.folders.set('D:/work/M31', ['result_3600s.fit', 'result_3600s_denoised.fit'])
    const kept = await s.plan('m31', { step: 'denoise' })
    expect(kept).toMatchObject({ outputExists: true, overwrite: false })
    expect(kept.blocked).toBe('result_3600s_denoised.fit is already beside the stack. Tick Replace it to write over it, or move it away first.')
    expect(kept.command?.args).not.toContain('--overwrite')
    const replaced = await s.plan('m31', { step: 'denoise', overwrite: true })
    expect(replaced.blocked).toBeNull()
    expect(replaced.command?.args).toContain('--overwrite')
  })

  it('[HUB-014] Given a stack in a folder the app only reads, When planned, Then it is blocked because SyQon writes beside it', async () => {
    const plan = await setup().plan('m31', { readOnlyDirs: ['D:/work'] })
    expect(plan.blocked).toMatch(/^The stack is in a folder the app only reads, and SyQon writes beside it/)
  })

  it('[HUB-011] Given no SyQon CLI, models it cannot list, no stack, an unknown target, or a disk with no room, When planned, Then each says why', async () => {
    expect((await setup({ installed: false }).plan('m31')).blocked).toMatch(/^The SyQon CLI was not found/)
    const failing = setup()
    failing.probe.answer(SYQON, ['--list-models'], { exitCode: 2 })
    expect((await failing.plan('m31')).blocked).toBe('The SyQon CLI could not list its models. SyQon CLI stopped with exit code 2. Its last lines in the log say why.')
    expect((await setup().plan('nope')).blocked).toBe('This target is not in the catalogue.')
    const empty = setup()
    empty.stacks.stacks.clear()
    expect(await empty.plan('m31')).toMatchObject({ stack: null, blocked: 'No stack yet. Stack this target first, and its SyQon steps appear here.' })
    expect((await setup({ free: null }).plan('m31')).blocked).toMatch(/does not report its free space/)
    expect((await setup({ free: 1e6 }).plan('m31')).blocked).toMatch(/short of the space/)
  })
})

describe('Queueing a SyQon step', () => {
  it('[HUB-011] Given a confirmed step that still holds, When queued, Then a SyQon job runs the CLI on the stack with the chosen model', async () => {
    const s = setup()
    const job = await s.queue('m31', { step: 'star-separation', model: 'axiom-mini', stackPath: STACK }, 'now')
    expect(job).toMatchObject({ kind: 'syqon', title: 'Star separation for M 31 with SyQon axiom-mini', timing: 'now', prepare: null, spaceDir: 'D:/work/M31', neededBytes: 300e6 })
    expect(job.command.args).toEqual(['--model', 'axiom-mini', '--input', STACK, '--output', 'D:/work/M31/result_3600s_starless.fit'])
  })

  it('[HUB-007] [HUB-014] Given a model no longer available, an output in the way, or another stack, When queued, Then nothing is queued and it says why', async () => {
    const s = setup()
    await expect(s.queue('m31', { step: 'star-separation', model: 'gone-model' }, 'window')).rejects.toThrow('The SyQon CLI does not report gone-model as available for this step any more.')
    s.tools.folders.set('D:/work/M31', ['result_3600s_starless.fit'])
    await expect(s.queue('m31', { step: 'star-separation', model: 'axiom-mini' }, 'window')).rejects.toThrow(/already beside the stack/)
    await expect(s.queue('m31', { step: 'star-separation', model: 'axiom-mini', stackPath: 'D:/other.fit' }, 'window')).rejects.toThrow('D:/other.fit is no longer there for SyQon.')
    await expect(s.queue('nope', { step: 'star-separation', model: 'axiom-mini' }, 'window')).rejects.toBeInstanceOf(JobRefusedError)
    expect(await s.store.list()).toEqual([])
  })
})

describe('Running a SyQon step', () => {
  async function running() {
    const store = new InMemoryJobStore()
    const runner = new FakeProcessRunner()
    const logs = new InMemoryJobLogs()
    const clock = new FixedClock(new Date(2026, 8, 30, 2, 30))
    const scheduler = makeJobScheduler({
      store,
      settings: new FixedJobSettings(DEFAULT_JOB_SETTINGS),
      machine: new FakeMachine(),
      runner,
      logs,
      workspace: { workAreaSpace: async () => ({ freeBytes: 100e9, usedBytes: 0 }) },
      prepare: async () => {
        throw new Error('no preparation for SyQon')
      },
      readOnlyDirs: () => [],
      clock
    })
    const job = await store.add(
      {
        kind: 'syqon',
        targetId: 'm31',
        title: 'Denoise for M 31 with SyQon prism-essential',
        timing: 'now',
        command: { program: SYQON, args: ['--model', 'prism-essential', '--input', STACK, '--output', 'D:/work/M31/out.fit'], cwd: 'D:/work/M31' },
        prepare: null,
        spaceDir: 'D:/work/M31',
        neededBytes: 300e6
      },
      clock.now()
    )
    await scheduler.tick()
    await flush()
    const run = runner.last
    if (!run) throw new Error('nothing ran')
    return { store, runner, logs, clock, scheduler, job, run }
  }

  it('[HUB-011] Given SyQon printing percentages on stderr, When it runs, Then the job shows the percentage, and on exit 0 the output path from stdout is logged', async () => {
    const t = await running()
    t.run.output('Loading model prism-essential\n', 'stderr')
    t.run.output('Denoising  12%\r', 'stderr')
    t.run.output('Denoising  12.6%\r', 'stderr')
    t.run.output('Denoising  57%\r', 'stderr')
    await flush()
    expect((await t.store.get(t.job.id))?.progress?.live).toEqual({ percent: 57, line: 'Denoising  57%' })
    t.run.output('D:/work/M31/out.fit\n', 'stdout')
    t.run.exit(0)
    await t.scheduler.idle()
    expect(await t.store.get(t.job.id)).toMatchObject({ state: 'succeeded', exitCode: 0, note: null })
    expect(t.logs.text.get(t.job.id)).toContain('Wrote D:/work/M31/out.fit.')
  })

  it('[HUB-011] Given SyQon printing lines without percentages, When it runs, Then its last line is kept, at most every few seconds', async () => {
    const t = await running()
    t.run.output('tile 1 of 9\n')
    await flush()
    expect((await t.store.get(t.job.id))?.progress?.live).toEqual({ percent: null, line: 'tile 1 of 9' })
    t.run.output('tile 2 of 9\n', 'stderr')
    await flush()
    expect((await t.store.get(t.job.id))?.progress?.live?.line).toBe('tile 1 of 9')
    t.clock.set(new Date(t.clock.now().getTime() + 5_000).toISOString())
    t.run.output('tile 3 of 9\n', 'stderr')
    t.run.output('\n', 'stderr')
    await flush()
    expect((await t.store.get(t.job.id))?.progress?.live?.line).toBe('tile 3 of 9')
    t.run.exit(0)
    await t.scheduler.idle()
  })

  it('[HUB-013] Given SyQon exits with code 4, When the job ends, Then it failed saying the account lacks the model and a retry will not help', async () => {
    const t = await running()
    t.run.output('error: model not included\n', 'stderr')
    t.run.exit(4)
    await t.scheduler.idle()
    expect(await t.store.get(t.job.id)).toMatchObject({
      state: 'failed',
      exitCode: 4,
      note: 'Your SyQon account does not include this model. Pick a model Settings, under Tools, lists as available, or check your SyQon plan. Queueing it again will fail the same way until that is fixed.'
    })
  })

  it('[HUB-012] Given SyQon exits with 130, or a code its pages do not explain, When the job ends, Then it is cancelled, or failed with a generic message', async () => {
    const cancelled = await running()
    cancelled.run.exit(130)
    await cancelled.scheduler.idle()
    expect(await cancelled.store.get(cancelled.job.id)).toMatchObject({ state: 'cancelled', exitCode: 130, note: 'SyQon CLI was cancelled before it finished.' })
    const failed = await running()
    failed.run.exit(6, 'ignored for SyQon')
    await failed.scheduler.idle()
    expect(await failed.store.get(failed.job.id)).toMatchObject({ state: 'failed', note: 'SyQon CLI stopped with exit code 6. Its last lines in the log say why.' })
  })
})
