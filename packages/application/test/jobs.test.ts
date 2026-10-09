import { describe, expect, it } from 'vitest'
import {
  JobRefusedError,
  JobStateError,
  makeJobScheduler,
  makeQueuePostProcess,
  makeQueueStack,
  type EstimateSirilRun,
  type PlanPostProcessing,
  type PostProcessingPlan,
  type SirilRunEstimate,
  type SirilWorkspaceResult
} from '@astro/application'
import { DEFAULT_JOB_SETTINGS, type PostProcessRecipe } from '@astro/domain'
import { FakeMachine, FakeProcessRunner, FakeToolHub, FixedClock, FixedJobSettings, InMemoryJobLogs, InMemoryJobStore, InMemoryStackCatalogue, stackAdvice } from '@astro/testkit'

const GB = 1024 ** 3
/** 02:30 local time on 30 September 2026: inside the default window. */
const inWindow = () => new Date(2026, 8, 30, 2, 30)
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function estimate(over: Partial<SirilRunEstimate['scripts'][number]> = {}, lights = 40): SirilRunEstimate {
  return {
    counts: { lights, darks: 10, flats: 10, biases: 10 },
    rejectedLights: 0,
    sensor: 'colour',
    sensorKnown: true,
    geometry: { width: 1080, height: 1920 },
    geometryApproximate: false,
    geometryMixed: false,
    prepBytes: 0,
    freeBytes: 100 * GB,
    usedBytes: 0,
    recommended: { script: 'OSC_Preprocessing', reason: '' },
    scripts: [
      { script: 'OSC_Preprocessing', label: 'Colour', missing: [], scriptBytes: 5 * GB, stages: [], neededBytes: 5 * GB, fits: true, headroomBytes: 95 * GB, shortBytes: null, memory: null, ...over }
    ],
    advice: stackAdvice()
  }
}

function stackSetup(est: SirilRunEstimate = estimate(), tools = new FakeToolHub().installAll()) {
  const store = new InMemoryJobStore()
  const stacks = new InMemoryStackCatalogue().addTarget('m42', { name: 'M 42' })
  const queue = makeQueueStack({ estimate: (async () => est) as EstimateSirilRun, tools, stacks, store, clock: new FixedClock(new Date(2026, 8, 29, 20)) })
  return { store, queue, tools }
}

const request = { targetId: 'm42', sourceDir: 'D:/astro/M42', workDir: 'D:/work/siril/M42', script: 'OSC_Preprocessing' as const, timing: 'window' as const }

describe('queueing a stack', () => {
  it('[JOB-001] Given a confirmed stacking plan that still holds, When queued, Then a window job runs Siril with the stock script after laying out the frames', async () => {
    const { store, queue } = stackSetup()
    const job = await queue(request)
    expect(job).toMatchObject({
      kind: 'stack',
      state: 'queued',
      title: 'Stack M 42 with OSC_Preprocessing',
      timing: 'window',
      prepare: { sourceDir: 'D:/astro/M42', workDir: 'D:/work/siril/M42' },
      spaceDir: 'D:/work/siril/M42',
      neededBytes: 5 * GB
    })
    expect(job.command.program).toBe('C:/Program Files/Siril/bin/siril-cli.exe')
    expect(job.command.args).toEqual(['-d', 'D:/work/siril/M42', '-s', 'C:/Program Files/Siril/share/siril/scripts/OSC_Preprocessing.ssf'])
    expect(await store.list()).toHaveLength(1)
  })

  it('[JOB-001] Given the plan no longer holds, When queued, Then it is refused with the reason and nothing is queued', async () => {
    const cases: [ReturnType<typeof stackSetup>, typeof request, RegExp][] = [
      [stackSetup(), { ...request, script: 'Mono_Preprocessing' as never }, /not a stock Siril script/],
      [stackSetup(estimate({}, 0)), request, /no light frames/],
      [stackSetup(estimate({ missing: ['flats'] })), request, /needs flats/],
      [stackSetup(estimate({ fits: false, shortBytes: GB })), request, /short/],
      [stackSetup({ ...estimate(), freeBytes: null }), request, /does not report its free space/],
      [stackSetup(estimate(), new FakeToolHub()), request, /Siril was not found/]
    ]
    const noScript = stackSetup()
    noScript.tools.scripts.clear()
    cases.push([noScript, request, /OSC_Preprocessing.ssf was not found/])
    for (const [setup, req, message] of cases) {
      await expect(setup.queue(req)).rejects.toThrow(message)
      await expect(setup.queue(req)).rejects.toBeInstanceOf(JobRefusedError)
      expect(await setup.store.list()).toEqual([])
    }
  })

  it('[JOB-001] Given the target is not described, When queued, Then the title still names the stack', async () => {
    const store = new InMemoryJobStore()
    const queue = makeQueueStack({ estimate: (async () => estimate()) as EstimateSirilRun, tools: new FakeToolHub().installAll(), stacks: new InMemoryStackCatalogue(), store, clock: new FixedClock() })
    expect((await queue(request)).title).toBe('Stack target with OSC_Preprocessing')
  })
})

function recipe(over: Partial<PostProcessRecipe> = {}): PostProcessRecipe {
  return {
    profile: 'nebula',
    profileReason: '',
    quality: 'normal',
    missing: [],
    misplaced: [],
    inReadOnlyFolder: false,
    skipped: [],
    warnings: [],
    program: 'C:/S/v2/postprocess.bat',
    args: ['D:/m42/result.fit', '--target=M42'],
    command: 'C:/S/v2/postprocess.bat D:/m42/result.fit --target=M42',
    outputDir: 'D:/m42/processed/M42',
    peakBytes: 2 * GB,
    keptBytes: GB,
    sizeApproximate: false,
    space: { neededBytes: 2 * GB, fits: true, headroomBytes: GB, shortBytes: null },
    ...over
  }
}

function postSetup(plan: Partial<PostProcessingPlan>, tools = new FakeToolHub().installAll()) {
  const store = new InMemoryJobStore()
  const full: PostProcessingPlan = {
    target: { name: 'M 42', objectType: 'emission_nebula', raHours: 5.5, decDeg: -5.4 },
    stacks: [],
    stack: { path: 'D:/m42/result.fit', sizeBytes: GB, width: 1080, height: 1920, colour: true, focalMm: 250, pixelUm: 2.9, modifiedAt: null },
    recipe: recipe(),
    ...plan
  }
  let asked: unknown
  const queue = makeQueuePostProcess({
    plan: (async (_id, options) => {
      asked = options
      return full
    }) as PlanPostProcessing,
    tools,
    store,
    clock: new FixedClock()
  })
  return { store, queue, asked: () => asked }
}

describe('queueing post-processing', () => {
  it('[JOB-001] Given a confirmed recipe, When queued, Then bash runs postprocess.sh in the stack folder with the recipe arguments', async () => {
    const { queue, asked } = postSetup({})
    const job = await queue('m42', { stackPath: 'D:/m42/result.fit' }, 'now')
    expect(asked()).toEqual({ stackPath: 'D:/m42/result.fit' })
    expect(job).toMatchObject({ kind: 'post-process', title: 'Post-process M 42 (nebula, normal)', timing: 'now', prepare: null, spaceDir: 'D:/m42', neededBytes: 2 * GB })
    expect(job.command).toEqual({ program: 'C:/Program Files/Git/bin/bash.exe', args: ['C:/S/v2/postprocess.sh', 'D:/m42/result.fit', '--target=M42'], cwd: 'D:/m42' })
  })

  it('[NFR-012] Given a stack path Command Prompt would act on, When queued, Then the job still runs, since no shell parses it', async () => {
    const { queue } = postSetup({ recipe: recipe({ command: null, args: ['D:/100%/result.fit'] }) })
    expect((await queue('m42', {}, 'window')).command.args).toContain('D:/100%/result.fit')
  })

  it('[JOB-001] Given no stack, a missing or misplaced tool, a read-only folder or too little disk, When queued, Then it is refused', async () => {
    for (const [plan, message] of [
      [{ recipe: null }, /no stack/],
      [{ recipe: recipe({ missing: ['bash'], program: null }) }, /needs bash/],
      [{ recipe: recipe({ misplaced: ['siril', 'rc-astro'] }) }, /only runs Siril and RC Astro CLI from its standard install folder/],
      [{ recipe: recipe({ inReadOnlyFolder: true }) }, /only reads/],
      [{ recipe: recipe({ space: { neededBytes: 2 * GB, fits: true, headroomBytes: null, shortBytes: null } }) }, /does not report its free space/],
      [{ recipe: recipe({ space: { neededBytes: 2 * GB, fits: false, headroomBytes: null, shortBytes: GB } }) }, /short/]
    ] as [Partial<PostProcessingPlan>, RegExp][]) {
      const { queue, store } = postSetup(plan)
      await expect(queue('m42', {}, 'window')).rejects.toThrow(message)
      expect(await store.list()).toEqual([])
    }
  })

  it('[JOB-001] Given the confirmed stack has gone, When the plan falls back to another, Then nothing is queued', async () => {
    const { queue, store } = postSetup({})
    await expect(queue('m42', { stackPath: 'D:/m42/older.fit' }, 'window')).rejects.toThrow('D:/m42/older.fit is no longer there')
    expect(await store.list()).toEqual([])
  })

  it('[JOB-001] Given no Git Bash off Windows, When queued, Then the script runs directly', async () => {
    const tools = new FakeToolHub(false).install('siril-scripts', '/home/l/S/v2/postprocess.sh').install('siril', '/usr/bin/siril-cli')
    const { queue } = postSetup({ recipe: recipe({ program: '/home/l/S/v2/postprocess.sh' }) }, tools)
    expect((await queue('m42', {}, 'window')).command.program).toBe('/home/l/S/v2/postprocess.sh')
  })
})

function scheduler(over: { free?: number | null; prepare?: () => Promise<SirilWorkspaceResult> } = {}) {
  const store = new InMemoryJobStore()
  const runner = new FakeProcessRunner()
  const logs = new InMemoryJobLogs()
  const machine = new FakeMachine()
  const settings = new FixedJobSettings()
  const clock = new FixedClock(inWindow())
  let changes = 0
  const prepared: unknown[] = []
  const s = makeJobScheduler({
    store,
    settings,
    machine,
    runner,
    logs,
    workspace: { workAreaSpace: async () => ({ freeBytes: over.free === undefined ? 100 * GB : over.free, usedBytes: 0 }) },
    prepare:
      over.prepare ??
      (async (sourceDir, workDir, protectedDirs) => {
        prepared.push({ sourceDir, workDir, protectedDirs })
        return { workDir, linked: 30, copied: 2, existing: 1, rejected: 0, pruned: 0, byFolder: { lights: 30, darks: 1, flats: 1, biases: 1 }, placements: [], rejectedPaths: [] }
      }),
    readOnlyDirs: () => ['D:/astro'],
    clock,
    onChange: () => changes++
  })
  const add = (over: Parameters<InMemoryJobStore['add']>[0] extends infer J ? Partial<J> : never = {}) =>
    store.add(
      {
        kind: 'stack',
        targetId: 'm42',
        title: 'Stack M 42',
        timing: 'window',
        command: { program: 'siril-cli', args: ['-s', 'x.ssf'], cwd: '/work' },
        prepare: { sourceDir: '/astro/m42', workDir: '/work' },
        spaceDir: '/work',
        neededBytes: GB,
        ...over
      },
      clock.now()
    )
  return { s, store, runner, logs, machine, settings, clock, add, prepared, changes: () => changes }
}

describe('the job runner', () => {
  it('[UX-007] Given a page that only shows the jobs, When it lists them, Then the machine is not sampled and nothing starts', async () => {
    const t = scheduler()
    const job = await t.add()
    let sampled = 0
    t.machine.sample = async () => {
      sampled++
      return t.machine.load
    }
    expect((await t.s.list()).map(j => j.id)).toEqual([job.id])
    expect(sampled).toBe(0)
    expect(t.runner.runs).toHaveLength(0)
  })

  it('[GRD-007] Given grading rejected lights, When a stack job lays out its frames, Then its log says how many were left out and removed', async () => {
    const t = scheduler({ prepare: async () => ({ workDir: '/work', linked: 30, copied: 0, existing: 0, rejected: 3, pruned: 1, byFolder: { lights: 30, darks: 0, flats: 0, biases: 0 }, placements: [], rejectedPaths: [] }) })
    const job = await t.add()
    await t.s.tick()
    await flush()
    t.runner.last?.exit(0)
    await t.s.idle()
    const log = await t.s.log(job.id)
    expect(log).toContain('3 lights rejected by frame grading left out.')
    expect(log).toContain('1 file from an earlier run removed from the work area.')
  })

  it('[JOB-004] Given a window job and an idle PC in the window, When ticked, Then it lays out the frames, runs Siril and succeeds on exit code 0', async () => {
    const t = scheduler()
    const job = await t.add()
    expect((await t.s.tick()).schedule.start).toBe(job.id)
    await flush()
    expect(await t.store.get(job.id)).toMatchObject({ state: 'running', attempts: 1 })
    expect(t.prepared).toEqual([{ sourceDir: '/astro/m42', workDir: '/work', protectedDirs: ['D:/astro'] }])
    expect(t.runner.last?.command.program).toBe('siril-cli')
    expect(t.s.busy()).toBe(true)
    t.runner.last?.output('Stacking 40 images\n')
    t.clock.set(new Date(2026, 8, 30, 2, 50).toISOString())
    t.runner.last?.exit(0)
    await t.s.idle()
    expect(await t.store.get(job.id)).toMatchObject({ state: 'succeeded', exitCode: 0, finishedAt: new Date(2026, 8, 30, 2, 50) })
    expect(t.s.busy()).toBe(false)
    const log = await t.s.log(job.id)
    expect(log).toContain('Prep for Siril: 30 linked, 2 copied, 1 already in place.')
    expect(log).toContain('Stacking 40 images')
    expect(log).toContain('succeeded (exit code 0)')
    expect(t.changes()).toBeGreaterThanOrEqual(2)
  })

  it('[JOB-004] Given a job running, When ticked again, Then a second job does not start', async () => {
    const t = scheduler()
    const first = await t.add({ prepare: null })
    await t.add({ prepare: null, timing: 'now' })
    await t.s.tick()
    await flush()
    const snap = await t.s.tick()
    expect(t.runner.runs).toHaveLength(1)
    expect(snap.schedule.queue).toEqual([expect.objectContaining({ jobId: first.id, wait: { code: 'running' } })])
    t.runner.last?.exit(0)
    await t.s.idle()
  })

  it('[JOB-009] Given a program that fails, When it exits non-zero or cannot start, Then the job fails with the code or error in its note and log', async () => {
    const t = scheduler()
    const a = await t.add({ prepare: null })
    await t.s.tick()
    await flush()
    t.runner.last?.exit(3)
    await t.s.idle()
    expect(await t.store.get(a.id)).toMatchObject({ state: 'failed', exitCode: 3, note: 'siril-cli exited with code 3.' })

    const b = await t.add({ prepare: null })
    await t.s.tick()
    await flush()
    t.runner.last?.exit(null, 'spawn siril-cli ENOENT')
    await t.s.idle()
    expect(await t.store.get(b.id)).toMatchObject({ state: 'failed', exitCode: null, note: 'spawn siril-cli ENOENT' })
    expect(await t.s.log(b.id)).toContain('failed: spawn siril-cli ENOENT')
  })

  it('[JOB-009] Given Prep for Siril fails, When the job starts, Then Siril never runs and the job fails with the reason', async () => {
    const t = scheduler({ prepare: async () => Promise.reject(new Error('The Siril work area overlaps D:/astro')) })
    const job = await t.add()
    await t.s.tick()
    await t.s.idle()
    expect(t.runner.runs).toHaveLength(0)
    expect(await t.store.get(job.id)).toMatchObject({ state: 'failed', note: 'The Siril work area overlaps D:/astro' })
  })

  it('[JOB-009] Given the store fails mid-run, When the job runs, Then the failure is recorded rather than lost', async () => {
    const t = scheduler({ prepare: async () => Promise.reject('disk gone') })
    const job = await t.add()
    await t.s.tick()
    await t.s.idle()
    expect(await t.store.get(job.id)).toMatchObject({ state: 'failed', note: 'disk gone' })

    const u = scheduler()
    const other = await u.add({ prepare: null })
    const update = u.store.update.bind(u.store)
    let calls = 0
    u.store.update = async (id, patch) => {
      if (patch.state === 'succeeded' && calls++ === 0) throw new Error('database locked')
      return update(id, patch)
    }
    await u.s.tick()
    await flush()
    u.runner.last?.exit(0)
    await u.s.idle()
    expect(await u.store.get(other.id)).toMatchObject({ state: 'failed', note: 'database locked' })

    const v = scheduler()
    const third = await v.add({ prepare: null })
    const vUpdate = InMemoryJobStore.prototype.update.bind(v.store)
    v.store.update = async (id, patch) => {
      if (patch.state === 'succeeded') throw 'store offline'
      return vUpdate(id, patch)
    }
    await v.s.tick()
    await flush()
    v.runner.last?.exit(0)
    await v.s.idle()
    expect(await v.store.get(third.id)).toMatchObject({ state: 'failed', note: 'store offline' })
  })

  it('[JOB-010] Given a queued job, When cancelled, Then it leaves the queue without running', async () => {
    const t = scheduler()
    const job = await t.add()
    expect(await t.s.cancel(job.id)).toMatchObject({ state: 'cancelled', note: 'Cancelled before it started.' })
    await t.s.tick()
    expect(t.runner.runs).toHaveLength(0)
  })

  it('[JOB-010] Given a running job, When cancelled, Then its program is stopped and the job is cancelled', async () => {
    const t = scheduler()
    const job = await t.add({ prepare: null })
    await t.s.tick()
    await flush()
    const cancelled = await t.s.cancel(job.id)
    expect(t.runner.last?.cancelled).toBe(true)
    expect(cancelled).toMatchObject({ state: 'cancelled', note: 'Cancelled while it ran.' })
  })

  /** Holds the store's move to running until the test releases it. */
  function gateStart(t: ReturnType<typeof scheduler>) {
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => (release = resolve))
    const transition = t.store.transition.bind(t.store)
    t.store.transition = async (id, from, patch) => {
      if (patch.state === 'running') await gate
      return transition(id, from, patch)
    }
    return () => release()
  }

  it('[JOB-010] Given a job cancelled while it is being started, When the start lands, Then it does not run and stays cancelled', async () => {
    const t = scheduler()
    const job = await t.add({ prepare: null })
    const release = gateStart(t)
    await t.s.tick()
    expect(await t.s.cancel(job.id)).toMatchObject({ state: 'cancelled', note: 'Cancelled before it started.' })
    release()
    await t.s.idle()
    expect(t.runner.runs).toHaveLength(0)
    expect(await t.store.get(job.id)).toMatchObject({ state: 'cancelled', attempts: 0 })
  })

  it('[JOB-008] Given the app quits while a job is being started, When the start lands, Then its program never runs', async () => {
    const t = scheduler()
    const job = await t.add({ prepare: null })
    const release = gateStart(t)
    await t.s.tick()
    t.s.shutdown()
    release()
    await t.s.idle()
    expect(t.runner.runs).toHaveLength(0)
    expect(await t.store.get(job.id)).toMatchObject({ state: 'running' })
  })

  it('[JOB-010] Given a running job, When the database is about to be reset, Then clearing cancels it and waits for it to stop', async () => {
    const t = scheduler()
    const job = await t.add({ prepare: null })
    await t.s.tick()
    await flush()
    await t.s.clear()
    expect(t.runner.last?.cancelled).toBe(true)
    expect(await t.store.get(job.id)).toMatchObject({ state: 'cancelled' })
    await t.s.clear()
  })

  it('[JOB-008] Given the app is quitting, When a tick picks a job, Then nothing starts', async () => {
    const t = scheduler()
    const job = await t.add({ prepare: null })
    t.s.shutdown()
    await t.s.tick()
    await t.s.idle()
    expect(await t.store.get(job.id)).toMatchObject({ state: 'queued' })
  })

  it('[JOB-010] Given a stack job still laying out frames, When cancelled, Then Siril never starts', async () => {
    let release: () => void = () => {}
    const t = scheduler({
      prepare: () =>
        new Promise(resolve => {
          release = () => resolve({ workDir: '/work', linked: 0, copied: 0, existing: 0, rejected: 0, pruned: 0, byFolder: { lights: 0, darks: 0, flats: 0, biases: 0 }, placements: [], rejectedPaths: [] })
        })
    })
    const job = await t.add()
    await t.s.tick()
    await flush()
    const cancelling = t.s.cancel(job.id)
    await flush()
    release()
    expect(await cancelling).toMatchObject({ state: 'cancelled', note: 'Cancelled before Siril started.' })
    expect(t.runner.runs).toHaveLength(0)
  })

  it('[JOB-010] Given a job that has finished or is unknown, When cancelled or moved ahead, Then it is refused', async () => {
    const t = scheduler()
    const job = await t.add({ prepare: null })
    await t.s.tick()
    await flush()
    t.runner.last?.exit(0)
    await t.s.idle()
    await expect(t.s.cancel(job.id)).rejects.toThrow('The job has already succeeded.')
    await expect(t.s.runNow(job.id)).rejects.toBeInstanceOf(JobStateError)
    await expect(t.s.cancel('nope')).rejects.toThrow('That job no longer exists.')
    await t.store.update(job.id, { state: 'running' })
    await expect(t.s.cancel(job.id)).rejects.toThrow('The job has already stopped.')
  })

  it('[JOB-011] Given a window job outside the window, When moved to Run now and ticked, Then it starts', async () => {
    const t = scheduler()
    t.clock.set(new Date(2026, 8, 30, 14).toISOString())
    const job = await t.add({ prepare: null })
    expect((await t.s.tick()).schedule.queue[0].wait?.code).toBe('window')
    expect(await t.s.runNow(job.id)).toMatchObject({ timing: 'now' })
    await t.s.tick()
    await flush()
    expect(t.runner.runs).toHaveLength(1)
    t.runner.last?.exit(0)
    await t.s.idle()
  })

  it('[JOB-003] Given the PC in use during the window, When ticked, Then nothing starts and the snapshot says why', async () => {
    const t = scheduler()
    t.machine.load = { userIdleSeconds: 30, cpuPercent: 5 }
    await t.add()
    const snap = await t.s.tick()
    expect(snap.schedule.start).toBeNull()
    expect(snap.schedule.queue[0].wait).toMatchObject({ code: 'idle' })
    expect(snap.settings).toEqual(DEFAULT_JOB_SETTINGS)
    expect(snap.load).toEqual({ userIdleSeconds: 30, cpuPercent: 5 })
  })

  it('[JOB-007] Given the disk filled up since the job was queued, When ticked, Then it waits for space', async () => {
    const t = scheduler({ free: GB / 2 })
    await t.add()
    expect((await t.s.tick()).schedule.queue[0].wait).toEqual({ code: 'space', shortBytes: GB / 2 })
    expect(t.runner.runs).toHaveLength(0)
  })

  it('[JOB-006] Given a job that succeeded, When the next is estimated, Then its measured rate is used', async () => {
    const t = scheduler()
    await t.add({ prepare: null, neededBytes: GB })
    await t.s.tick()
    await flush()
    t.clock.set(new Date(2026, 8, 30, 2, 40).toISOString())
    t.runner.last?.exit(0)
    await t.s.idle()
    await t.add({ prepare: null, neededBytes: 2 * GB })
    const snap = await t.s.snapshot()
    expect(snap.schedule.queue[0].estimate).toEqual({ seconds: 1200, basis: 'history' })
  })

  it('[JOB-008] Given jobs left running when the app closed, When recovered, Then one queues again and one that already started twice fails', async () => {
    const t = scheduler()
    const once = await t.add()
    const twice = await t.add()
    await t.store.update(once.id, { state: 'running', attempts: 1 })
    await t.store.update(twice.id, { state: 'running', attempts: 2 })
    await t.s.recover()
    expect(await t.store.get(once.id)).toMatchObject({ state: 'queued', finishedAt: null })
    expect(await t.store.get(twice.id)).toMatchObject({ state: 'failed' })
    expect(await t.s.log(once.id)).toContain('starts again from the beginning')
  })

  it('[JOB-008] Given a job running, When the app shuts down, Then its program is stopped and the job is left for recovery', async () => {
    const t = scheduler()
    const job = await t.add({ prepare: null })
    await t.s.tick()
    await flush()
    t.s.shutdown()
    await t.s.idle()
    expect(t.runner.last?.cancelled).toBe(true)
    expect(await t.store.get(job.id)).toMatchObject({ state: 'running' })
    await t.add({ prepare: null, timing: 'now' })
    await t.s.tick()
    expect(t.runner.runs).toHaveLength(1)
  })

  it('[JOB-008] Given the app shuts down while frames are laid out, When prep ends or fails, Then the job is left for recovery', async () => {
    for (const fail of [false, true]) {
      let release: () => void = () => {}
      const t = scheduler({
        prepare: () =>
          new Promise((resolve, reject) => {
            release = () => (fail ? reject(new Error('stopped')) : resolve({ workDir: '/work', linked: 0, copied: 0, existing: 0, rejected: 0, pruned: 0, byFolder: { lights: 0, darks: 0, flats: 0, biases: 0 }, placements: [], rejectedPaths: [] }))
          })
      })
      const job = await t.add()
      await t.s.tick()
      await flush()
      t.s.shutdown()
      release()
      await t.s.idle()
      expect(t.runner.runs).toHaveLength(0)
      expect(await t.store.get(job.id)).toMatchObject({ state: 'running' })
    }
  })
})
