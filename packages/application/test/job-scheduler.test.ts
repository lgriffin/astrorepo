import { describe, expect, it } from 'vitest'
import { JobStateError, makeJobScheduler, makeTargetHolds, type RunSolveJob, type SirilWorkspaceResult } from '@astro/application'
import type { ResultFile, SirilPlacement } from '@astro/domain'
import { FakeMachine, FakeProcessRunner, FixedClock, FixedJobSettings, InMemoryJobLogs, InMemoryJobStore, InMemoryRunArea, type FakeRun } from '@astro/testkit'

const GB = 1024 ** 3
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const NOW = new Date(Date.UTC(2026, 8, 30, 1, 30))
const ISO = NOW.toISOString()
const SCRIPT = '/siril/scripts/OSC_Preprocessing.ssf'
const STOCK = `requires 1.2.0
cd lights
convert light -out=../process
cd ../process
register light
stack r_light rej 3 3 -norm=addscale -out=result
load result
save ../result_$LIVETIME:%d$s
cd ..
close
`

const prepResult = (over: Partial<SirilWorkspaceResult> = {}): SirilWorkspaceResult => ({
  workDir: '/work',
  linked: 30,
  copied: 2,
  existing: 1,
  rejected: 0,
  pruned: 0,
  byFolder: { lights: 30, darks: 1, flats: 1, biases: 1 },
  placements: [],
  rejectedPaths: [],
  ...over
})

const lights = (n: number): SirilPlacement[] => Array.from({ length: n }, (_, i) => ({ from: `/astro/m42/Light_${i + 1}.fit`, folder: 'lights', name: `Light_${i + 1}.fit` }))

interface World {
  store: InMemoryJobStore
  logs: InMemoryJobLogs
  area: InMemoryRunArea
  results: ResultFile[]
}

const newWorld = (): World => ({ store: new InMemoryJobStore(), logs: new InMemoryJobLogs(), area: new InMemoryRunArea(), results: [] })

/** A scheduler over fakes; with `steps`, stack jobs run Siril's stock script a step at a time. A shared `world` is the app after a restart. */
function setup(
  over: {
    prepare?: (...args: unknown[]) => Promise<SirilWorkspaceResult>
    steps?: boolean
    inputs?: boolean
    free?: number | null
    world?: World
    solve?: RunSolveJob
    onStart?: (run: FakeRun) => void
  } = {}
) {
  const world = over.world ?? newWorld()
  const { store, logs, area, results } = world
  const runner = new FakeProcessRunner(run => over.onStart?.(run))
  const clock = new FixedClock(NOW)
  area.texts.set(SCRIPT, STOCK)
  area.onSetAside = p => results.splice(0, results.length, ...results.filter(r => r.path !== p))
  const prepared: unknown[][] = []
  const spaceAsked: string[] = []
  const holds = makeTargetHolds()
  let changes = 0
  const s = makeJobScheduler({
    store,
    settings: new FixedJobSettings(),
    machine: new FakeMachine(),
    runner,
    logs,
    workspace: {
      workAreaSpace: async dir => {
        spaceAsked.push(dir)
        return { freeBytes: over.free === undefined ? (dir === '/small' ? GB / 4 : 100 * GB) : over.free, usedBytes: 0 }
      },
      ...(over.steps ? { stackResults: async () => results.map(r => ({ ...r })) } : {}),
      ...(over.inputs ? { inputFrames: async () => [{ folder: 'lights' as const, name: 'Light_1.fit', sizeBytes: 1, modifiedAt: null }] } : {})
    },
    prepare: async (...args) => {
      prepared.push(args)
      return over.prepare ? over.prepare(...args) : prepResult({ placements: lights(2) })
    },
    runArea: over.steps ? area : undefined,
    targetName: over.steps ? async () => 'M 42' : undefined,
    readOnlyDirs: async () => ['D:/astro'],
    clock,
    onChange: () => changes++,
    holds,
    solve: over.solve
  })
  const add = (job: Partial<Parameters<InMemoryJobStore['add']>[0]> = {}) =>
    store.add(
      {
        kind: 'stack',
        targetId: 'm42',
        title: 'Stack M 42',
        timing: 'now',
        command: { program: 'siril-cli', args: ['-d', '/work', '-s', SCRIPT], cwd: '/work' },
        prepare: { sourceDir: '/astro/m42', workDir: '/work' },
        spaceDir: '/work',
        neededBytes: GB,
        ...job
      },
      clock.now()
    )
  const step = async (exitCode: number | null, output = '') => {
    await flush()
    if (output) runner.last?.output(output)
    runner.last?.exit(exitCode)
    await flush()
  }
  return { s, store, runner, logs, clock, area, results, prepared, spaceAsked, holds, add, step, world, changes: () => changes }
}

describe('the job runner, what it logs', () => {
  it('[JOB-009] Given a job that runs and succeeds, When it ends, Then its log has the start, the command, the prep and the end line exactly', async () => {
    const t = setup()
    const job = await t.add()
    await t.s.tick()
    await t.step(0, 'Stacking\n')
    await t.s.idle()
    expect(t.logs.text.get(job.id)).toBe(
      `${ISO} started Stack M 42\n> siril-cli -d /work -s ${SCRIPT}\n\n` +
        'Prep for Siril: 30 linked, 2 copied, 1 already in place.\n\n' +
        'Stacking\n' +
        `\n${ISO} succeeded (exit code 0)\n`
    )
    expect(t.prepared).toEqual([['/astro/m42', '/work', ['D:/astro'], {}]])
  })

  it('[GRD-007] [RIG-009] Given one light rejected and two files pruned for one filter, When the frames are laid out, Then the log says so in the singular and plural and the filter is passed on', async () => {
    const t = setup({ prepare: async () => prepResult({ rejected: 1, pruned: 2 }) })
    const job = await t.add({ prepare: { sourceDir: '/astro/m42', workDir: '/work', filter: 'Ha' } })
    await t.s.tick()
    await t.step(0)
    await t.s.idle()
    expect(t.logs.text.get(job.id)).toContain(
      'Prep for Siril: 30 linked, 2 copied, 1 already in place. 1 light rejected by frame grading left out. 2 files from an earlier run removed from the work area.\n\n'
    )
    expect(t.prepared[0][3]).toEqual({ filter: 'Ha' })
  })

  it('[JOB-009] Given a program that fails with a code, When it ends, Then the end line carries the code and the note', async () => {
    const t = setup()
    const job = await t.add({ prepare: null })
    await t.s.tick()
    await t.step(3)
    await t.s.idle()
    expect(t.logs.text.get(job.id)).toMatch(new RegExp(`\\n${ISO.replace(/\./g, '\\.')} failed \\(exit code 3\\): siril-cli exited with code 3\\.\\n$`))
    expect(await t.store.get(job.id)).toMatchObject({ state: 'failed', exitCode: 3, note: 'siril-cli exited with code 3.', finishedAt: NOW })
  })

  it('[JOB-009] Given a program that gave a code and an error, When it fails, Then the note is the exit-code reason, not the runner error', async () => {
    const t = setup()
    const job = await t.add({ prepare: null })
    await t.s.tick()
    await flush()
    t.runner.last?.exit(2, 'something odd')
    await t.s.idle()
    expect((await t.store.get(job.id))?.note).toBe('siril-cli exited with code 2.')
  })

  it('[JOB-009] [PRV-006] Given a run whole that fails on a known Siril message, When it ends, Then the note and log say what it means', async () => {
    const t = setup()
    const job = await t.add({ prepare: null })
    await t.s.tick()
    await t.step(1, 'save: No space left on device\n')
    await t.s.idle()
    const note = (await t.store.get(job.id))?.note ?? ''
    expect(note.startsWith('siril-cli exited with code 1. The work area’s disk filled up.')).toBe(true)
    expect(t.logs.text.get(job.id)).toContain('\nWhat this usually means: The work area’s disk filled up.')
  })

  it('[JOB-010] Given a job cancelled while its frames are laid out and the layout fails, When it stops, Then it is cancelled with the layout\'s reason', async () => {
    let fail: (e: Error) => void = () => {}
    const t = setup({ prepare: () => new Promise((_, reject) => (fail = reject)) })
    const job = await t.add()
    await t.s.tick()
    await flush()
    const cancelling = t.s.cancel(job.id)
    await flush()
    fail(new Error('stopped laying out'))
    expect(await cancelling).toMatchObject({ state: 'cancelled', note: 'stopped laying out' })
    expect(t.runner.runs).toHaveLength(0)
  })
})

describe('the job runner, its controls', () => {
  it('[JOB-011] Given a queued job, When moved ahead, Then the host is told; a running one is refused with the reason', async () => {
    const t = setup()
    const job = await t.add({ timing: 'window', prepare: null })
    const before = t.changes()
    expect(await t.s.runNow(job.id)).toMatchObject({ timing: 'now' })
    expect(t.changes()).toBe(before + 1)
    await t.store.update(job.id, { state: 'running' })
    await expect(t.s.runNow(job.id)).rejects.toThrow('Only a queued job can be moved ahead.')
    await expect(t.s.runNow('gone')).rejects.toThrow('That job no longer exists.')
    const err = await t.s.runNow(job.id).catch(e => e)
    expect(err).toBeInstanceOf(JobStateError)
    expect(err.name).toBe('JobStateError')
  })

  it('[JOB-008] Given jobs left running, one this process runs, and others finished, When recovered, Then only the stray running ones change, with their note logged', async () => {
    const t = setup()
    const live = await t.add({ prepare: null })
    await t.s.tick()
    await flush()
    const stray = await t.add({ prepare: null })
    const twice = await t.add({ prepare: null })
    const done = await t.add({ prepare: null })
    await t.store.update(stray.id, { state: 'running', attempts: 1 })
    await t.store.update(twice.id, { state: 'running', attempts: 2 })
    await t.store.update(done.id, { state: 'succeeded', finishedAt: new Date(0) })
    await t.s.recover()
    expect(await t.store.get(live.id)).toMatchObject({ state: 'running' })
    expect(await t.store.get(stray.id)).toMatchObject({ state: 'queued', finishedAt: null })
    expect(await t.store.get(twice.id)).toMatchObject({ state: 'failed', finishedAt: NOW })
    expect(await t.store.get(done.id)).toMatchObject({ state: 'succeeded', finishedAt: new Date(0) })
    const note = (await t.store.get(stray.id))?.note
    expect(t.logs.text.get(stray.id)).toBe(`\n${ISO} ${note}\n`)
    expect(t.logs.text.get(done.id)).toBeUndefined()
    t.runner.last?.exit(0)
    await t.s.idle()
  })

  it('[ARC-008] [JOB-004] Given the first job\'s target held, When ticked, Then nothing starts even though another target\'s job waits behind it', async () => {
    const t = setup()
    await t.add({ prepare: null })
    const release = t.holds.hold('m42')
    const snap = await t.s.tick()
    await flush()
    expect(snap.schedule.start).not.toBeNull()
    expect(t.runner.runs).toHaveLength(0)
    expect(t.s.busy()).toBe(false)
    release?.()
  })

  it('[JOB-007] Given queued jobs writing to different disks, When the snapshot is taken, Then each is checked against its own disk', async () => {
    const t = setup()
    await t.add({ prepare: null, spaceDir: '/small' })
    await t.add({ prepare: null, spaceDir: '/work' })
    const snap = await t.s.snapshot()
    expect(snap.schedule.queue.map(q => q.wait?.code ?? null)).toEqual(['space', null])
    expect(snap.runningEstimate).toBeNull()
  })

  it('[JOB-009] Given a long log, When it is read without a limit, Then the last 64 KB are returned', async () => {
    const t = setup()
    t.logs.append('j1', 'a'.repeat(70 * 1024))
    expect((await t.s.log('j1')).length).toBe(64 * 1024)
    expect((await t.s.log('j1', 10)).length).toBe(10)
  })

  it('[JOB-010] Given nothing running, When the table is cleared, Then it returns at once', async () => {
    const t = setup()
    await t.s.clear()
    await t.s.idle()
    expect(t.s.busy()).toBe(false)
  })
})

describe('a plate solve job with nothing to solve', () => {
  it('[SKY-003] Given a solve job with no solver wired, When it runs, Then it fails saying it has no files, after logging its start', async () => {
    const t = setup()
    const job = await t.add({ kind: 'solve', title: 'Plate solve M 42', prepare: null })
    await t.s.tick()
    await t.s.idle()
    expect(await t.store.get(job.id)).toMatchObject({ state: 'failed', exitCode: null, note: 'This job has no files to plate solve.' })
    expect(t.logs.text.get(job.id)).toBe(`${ISO} started Plate solve M 42\n\n\n${ISO} failed: This job has no files to plate solve.\n`)
    expect(t.runner.runs).toHaveLength(0)
  })
})

describe('a stack run step by step, what it logs', () => {
  it('[PRV-003] [PRV-001] Given a stack whose steps all succeed, When it runs, Then each step is logged, the result published with its manifest, and the progress has no resume', async () => {
    const t = setup({ steps: true, inputs: true })
    const job = await t.add()
    await t.s.tick()
    await flush()
    expect((await t.store.get(job.id))?.progress).toMatchObject({ step: 0, of: 4, label: 'convert light' })
    expect((await t.store.get(job.id))?.progress?.resumedFrom).toBeUndefined()
    t.clock.set(new Date(NOW.getTime() + 61_400).toISOString())
    await t.step(0)
    for (let i = 0; i < 2; i++) await t.step(0)
    t.results.push({ path: '/work/result_120s.fit', sizeBytes: 5000, modifiedAt: NOW })
    await t.step(0)
    await t.s.idle()
    const log = t.logs.text.get(job.id) ?? ''
    expect(log).toContain('── Step 1 of 4: convert light\n')
    expect(log).toContain('── Step 4 of 4: load result\n')
    expect(log).toContain('\nPublished /work/result_120s.fit with its manifest /work/result_120s.fit.astrorepo.json.\n')
    expect(log).not.toContain('Starting from the first step')
    const manifest = t.area.manifests.get('/work/result_120s.fit')
    expect(manifest?.steps.map(s => [s.label, s.seconds, s.resumed])).toEqual([
      ['convert light', 61, false],
      ['register light', 0, false],
      ['stack r_light', 0, false],
      ['load result', 0, false]
    ])
    // The frames in the input folders, not every placement, are what it used.
    expect(manifest?.frames.lights).toEqual([{ name: 'Light_1.fit', source: '/astro/m42/Light_1.fit' }])
    const done = await t.store.get(job.id)
    expect(done).toMatchObject({ state: 'succeeded', exitCode: 0, note: null, progress: { step: 4, of: 4, label: null, published: ['/work/result_120s.fit'] } })
    expect(done?.progress?.resumedFrom).toBeUndefined()
    expect(t.changes()).toBeGreaterThanOrEqual(6)
  })

  it('[PRV-002] Given a step that cannot start, When it fails, Then the note gives the runner\'s reason and what it wrote is set aside with a log line', async () => {
    const t = setup({ steps: true })
    const job = await t.add()
    await t.s.tick()
    await t.step(0)
    t.results.push({ path: '/work/result.fit', sizeBytes: 1, modifiedAt: NOW })
    await t.step(null, '')
    await t.s.idle()
    const done = await t.store.get(job.id)
    expect(done?.state).toBe('failed')
    expect(done?.note).toBe("Step 2 of 4 (register light) failed: Siril stopped before it finished, with no exit code. What it wrote is in the work folder's failed folder.")
    expect(t.logs.text.get(job.id)).toContain('\nSet aside in failed: /work/failed/')
    expect(t.logs.text.get(job.id)).toContain(', so it is never taken for a finished stack.\n')
  })

  it('[PRV-002] Given a step that fails with a runner error, When it stops, Then the error is the reason given', async () => {
    const t = setup({ steps: true })
    const job = await t.add()
    await t.s.tick()
    await flush()
    t.runner.last?.exit(null, 'spawn siril-cli ENOENT')
    await t.s.idle()
    expect((await t.store.get(job.id))?.note).toBe('Step 1 of 4 (convert light) failed: spawn siril-cli ENOENT')
  })

  it('[PRV-002] Given publishing fails with something that is not an error, When the stack ends, Then the reason is still given', async () => {
    const t = setup({ steps: true })
    t.area.writeManifest = async () => Promise.reject('disk gone')
    const job = await t.add()
    await t.s.tick()
    for (let i = 0; i < 3; i++) await t.step(0)
    t.results.push({ path: '/work/result_120s.fit', sizeBytes: 5000, modifiedAt: NOW })
    await t.step(0)
    await t.s.idle()
    expect(await t.store.get(job.id)).toMatchObject({
      state: 'failed',
      exitCode: 0,
      note: "Siril finished, but publishing the result failed: disk gone. What it wrote is in the work folder's failed folder."
    })
  })

  it('[PRV-003] Given a script that cannot be split into steps, When the stack runs, Then the log says it runs whole', async () => {
    const t = setup({ steps: true })
    t.area.texts.set(SCRIPT, '')
    const job = await t.add()
    await t.s.tick()
    await t.step(0)
    await t.s.idle()
    expect(t.runner.runs.map(r => r.command.args)).toEqual([['-d', '/work', '-s', SCRIPT]])
    expect(t.logs.text.get(job.id)).toContain('The script could not be split into steps, so it runs whole and cannot carry on after an interruption.\n\n')
  })

  it('[PRV-003] Given a script that cannot be read, When the stack runs, Then the log says it runs whole', async () => {
    const t = setup({ steps: true })
    t.area.texts.clear()
    const job = await t.add()
    await t.s.tick()
    await t.step(0)
    await t.s.idle()
    expect(t.logs.text.get(job.id)).toContain('The script could not be split into steps')
  })

  it('[PRV-003] Given a stack job with no layout, or a job that is not a stack, When it runs, Then the script runs whole without a word about steps', async () => {
    for (const job of [{ prepare: null }, { kind: 'post-process' as const }]) {
      const t = setup({ steps: true })
      const added = await t.add(job)
      await t.s.tick()
      await t.step(0)
      await t.s.idle()
      expect(t.runner.runs).toHaveLength(1)
      expect(t.logs.text.get(added.id)).not.toContain('could not be split')
      expect(t.area.steps).toEqual([])
    }
  })

  it('[PRV-003] Given a stack whose steps all succeed, When it runs, Then its progress moves step by step to the end before it is published', async () => {
    const t = setup({ steps: true })
    const seen: (string | number)[] = []
    const update = t.store.update.bind(t.store)
    t.store.update = async (id, patch) => {
      if (patch.progress) seen.push(patch.progress.published ? 'published' : patch.progress.step)
      return update(id, patch)
    }
    await t.add()
    await t.s.tick()
    for (let i = 0; i < 3; i++) await t.step(0)
    t.results.push({ path: '/work/result_120s.fit', sizeBytes: 5000, modifiedAt: NOW })
    await t.step(0)
    await t.s.idle()
    expect(seen).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 'published'])
  })

  it('[PRV-002] Given a cancel that arrives as the last step is saved, When the result would be published, Then it is cancelled before publishing and the result set aside', async () => {
    const t = setup({ steps: true })
    const job = await t.add()
    const update = t.store.update.bind(t.store)
    let cancelling: Promise<unknown> | null = null
    t.store.update = async (id, patch) => {
      const out = await update(id, patch)
      if (patch.progress?.step === 4 && !patch.progress.published && !cancelling) {
        cancelling = t.s.cancel(id)
        await flush()
      }
      return out
    }
    await t.s.tick()
    for (let i = 0; i < 3; i++) await t.step(0)
    t.results.push({ path: '/work/result_120s.fit', sizeBytes: 5000, modifiedAt: NOW })
    await t.step(0)
    await t.s.idle()
    await cancelling
    expect(await t.store.get(job.id)).toMatchObject({
      state: 'cancelled',
      note: "Cancelled after its last step, before its result was published. What it wrote is in the work folder's failed folder."
    })
    expect(t.area.manifests.size).toBe(0)
    expect(t.area.setAsideFiles).toEqual(['/work/result_120s.fit'])
  })

  it('[JOB-008] [PRV-004] Given the app quits while a step is written, When it stops, Then the step never runs and the job is left running for recovery', async () => {
    const t = setup({ steps: true })
    const job = await t.add()
    const write = t.area.writeStep.bind(t.area)
    t.area.writeStep = async (workDir, name, text) => {
      if (name === 'step-02.ssf') t.s.shutdown()
      return write(workDir, name, text)
    }
    await t.s.tick()
    await t.step(0)
    await t.s.idle()
    expect(t.runner.runs).toHaveLength(1)
    expect(await t.store.get(job.id)).toMatchObject({ state: 'running', progress: { step: 1 } })
  })

  it('[JOB-008] [PRV-004] Given the app quits as the last step is saved, When it stops, Then nothing is published and the job is left running', async () => {
    const t = setup({ steps: true })
    const job = await t.add()
    const update = t.store.update.bind(t.store)
    t.store.update = async (id, patch) => {
      if (patch.progress?.step === 4 && !patch.progress.published) t.s.shutdown()
      return update(id, patch)
    }
    await t.s.tick()
    for (let i = 0; i < 3; i++) await t.step(0)
    t.results.push({ path: '/work/result_120s.fit', sizeBytes: 5000, modifiedAt: NOW })
    await t.step(0)
    await t.s.idle()
    expect(t.area.manifests.size).toBe(0)
    expect(await t.store.get(job.id)).toMatchObject({ state: 'running' })
  })

  it('[JOB-008] [PRV-001] Given the app quits while the result is published, When publishing ends, Then the job is left running without its published list', async () => {
    const t = setup({ steps: true })
    const job = await t.add()
    const write = t.area.writeManifest.bind(t.area)
    t.area.writeManifest = async (resultPath, manifest) => {
      t.s.shutdown()
      return write(resultPath, manifest)
    }
    await t.s.tick()
    for (let i = 0; i < 3; i++) await t.step(0)
    t.results.push({ path: '/work/result_120s.fit', sizeBytes: 5000, modifiedAt: NOW })
    await t.step(0)
    await t.s.idle()
    const left = await t.store.get(job.id)
    expect(left?.state).toBe('running')
    expect(left?.progress?.published).toBeUndefined()
  })

  it('[PRV-004] Given the app closed after the step that wrote the result, When it starts again, Then that result is kept and published, not set aside', async () => {
    const first = setup({ steps: true })
    const job = await first.add()
    await first.s.tick()
    await first.step(0)
    await first.step(0)
    first.results.push({ path: '/work/result_120s.fit', sizeBytes: 5000, modifiedAt: NOW })
    await first.step(0)
    await flush()
    first.s.shutdown()
    await first.s.idle()

    const again = setup({ steps: true, world: first.world })
    await again.s.recover()
    await again.s.tick()
    await again.step(0)
    await again.s.idle()
    expect(again.area.setAsideFiles).toEqual([])
    expect(await again.store.get(job.id)).toMatchObject({ state: 'succeeded', note: null, progress: { resumedFrom: 3, published: ['/work/result_120s.fit'] } })
    expect(again.logs.text.get(job.id)).not.toContain('what the earlier attempt wrote')
  })

  it('[PRV-005] Given a run that stopped part way having written two files, and the frames changed, When it starts again, Then both are set aside and named', async () => {
    const first = setup({ steps: true })
    const job = await first.add()
    await first.s.tick()
    await first.step(0)
    first.results.push({ path: '/work/a.fit', sizeBytes: 1, modifiedAt: NOW }, { path: '/work/b.fit', sizeBytes: 1, modifiedAt: NOW })
    await first.step(0)
    await flush()
    first.s.shutdown()
    await first.s.idle()

    const again = setup({ steps: true, world: first.world, prepare: async () => prepResult({ placements: lights(3) }) })
    await again.s.recover()
    await again.s.tick()
    await flush()
    await flush()
    expect(again.logs.text.get(job.id)).toContain('Set aside in failed what the earlier attempt wrote: /work/failed/')
    expect(again.logs.text.get(job.id)).toMatch(/what the earlier attempt wrote: \/work\/failed\/[^,]+\/a\.fit, \/work\/failed\/[^,]+\/b\.fit\.\n/)
    expect(again.logs.text.get(job.id)).toContain('Starting from the first step: the script or the frames changed since the earlier run.\n\n')
    again.s.shutdown()
  })

  it('[PRV-005] Given a run that stopped part way having written nothing, and the frames changed, When it starts again, Then nothing is set aside or said about it', async () => {
    const first = setup({ steps: true })
    const job = await first.add()
    await first.s.tick()
    await first.step(0)
    await flush()
    first.s.shutdown()
    await first.s.idle()

    const again = setup({ steps: true, world: first.world, prepare: async () => prepResult({ placements: lights(3) }) })
    await again.s.recover()
    await again.s.tick()
    await flush()
    await flush()
    expect(again.logs.text.get(job.id)).not.toContain('what the earlier attempt wrote')
    expect(again.area.setAsideFiles).toEqual([])
    again.s.shutdown()
  })

  it('[PRV-002] Given a failed step that wrote two files, When it stops, Then the log names both', async () => {
    const t = setup({ steps: true })
    const job = await t.add()
    await t.s.tick()
    await flush()
    t.results.push({ path: '/work/a.fit', sizeBytes: 1, modifiedAt: NOW }, { path: '/work/b.fit', sizeBytes: 1, modifiedAt: NOW })
    await t.step(1)
    await t.s.idle()
    expect(t.logs.text.get(job.id)).toMatch(/\nSet aside in failed: \/work\/failed\/[^,]+\/a\.fit, \/work\/failed\/[^,]+\/b\.fit, so it is never taken for a finished stack\.\n/)
  })
})

describe('the job runner, more of its edges', () => {
  it('[JOB-007] Given finished and queued jobs, When the snapshot is taken, Then only the queued ones have their disk checked', async () => {
    const t = setup()
    const done = await t.add({ prepare: null, spaceDir: '/done' })
    await t.store.update(done.id, { state: 'succeeded' })
    await t.add({ prepare: null, spaceDir: '/work' })
    await t.s.snapshot()
    expect(t.spaceAsked).toEqual(['/work'])
  })

  it('[JOB-010] Given a job with no layout cancelled just as it starts, When the program would start, Then it never runs and says it was cancelled before it started', async () => {
    const t = setup()
    const job = await t.add({ prepare: null })
    const transition = t.store.transition.bind(t.store)
    let cancelling: Promise<unknown> | null = null
    t.store.transition = async (id, from, patch) => {
      const moved = await transition(id, from, patch)
      if (patch.state === 'running') {
        cancelling = t.s.cancel(id)
        await flush()
      }
      return moved
    }
    await t.s.tick()
    await t.s.idle()
    expect(await cancelling).toMatchObject({ state: 'cancelled', note: 'Cancelled before it started.' })
    expect(t.runner.runs).toHaveLength(0)
    expect(t.logs.text.get(job.id)).toContain(`\n${ISO} cancelled: Cancelled before it started.\n`)
  })

  it('[JOB-008] Given the app quits while a job is started and the start fails, When it fails, Then the job is not marked failed', async () => {
    const t = setup()
    const job = await t.add({ prepare: null })
    t.store.transition = async () => {
      t.s.shutdown()
      throw new Error('database closed')
    }
    await t.s.tick()
    await t.s.idle()
    expect(await t.store.get(job.id)).toMatchObject({ state: 'queued', note: null })
  })

  it('[HUB-012] Given a SyQon job whose log holds a message Siril is known for, When it fails, Then no Siril explanation is added', async () => {
    const t = setup()
    const job = await t.add({ kind: 'syqon', prepare: null, command: { program: 'syqon-cli', args: [], cwd: '/work' } })
    await t.s.tick()
    await t.step(6, 'save: No space left on device\n')
    await t.s.idle()
    expect((await t.store.get(job.id))?.note).toBe('SyQon CLI stopped with exit code 6. Its last lines in the log say why.')
    expect(t.logs.text.get(job.id)).not.toContain('What this usually means')
  })

  it('[HUB-011] Given a SyQon job, When it prints whole percentages, the same percent again, several lines at once and a long unfinished line, Then each is read as SyQon means it', async () => {
    const t = setup()
    const job = await t.add({ kind: 'syqon', title: 'Denoise M 42', prepare: null, command: { program: 'syqon-cli', args: [], cwd: '/work' } })
    await t.s.tick()
    await flush()
    const live = async () => (await t.store.get(job.id))?.progress
    t.runner.last?.output('Denoising 12%\r', 'stderr')
    await flush()
    t.runner.last?.output('Denoising 12.6%\r', 'stderr')
    await flush()
    expect(await live()).toEqual({ step: 0, of: 1, key: 'live', label: 'Denoise M 42', live: { percent: 12, line: 'Denoising 12%' } })
    t.runner.last?.output('step 30%\nstep 40%\n\n', 'stderr')
    await flush()
    expect((await live())?.live).toEqual({ percent: 40, line: 'step 40%' })
    t.runner.last?.output('Saving 99%\n', 'stdout')
    await flush()
    expect((await live())?.live?.percent).toBe(40)
    t.runner.last?.output(`${'a'.repeat(1000)}${'b'.repeat(4100)} 50%`, 'stderr')
    t.runner.last?.output('Saving\nD:/work/out.fit\n', 'stdout')
    t.runner.last?.exit(0)
    await t.s.idle()
    expect((await live())?.live).toEqual({ percent: 50, line: 'b'.repeat(200) })
    expect(t.logs.text.get(job.id)).toContain('\nWrote D:/work/out.fit.\n')
  })

  it('[HUB-011] Given SyQon lines without percentages, When the next comes exactly three seconds later, Then it is kept', async () => {
    const t = setup()
    const job = await t.add({ kind: 'syqon', prepare: null, command: { program: 'syqon-cli', args: [], cwd: '/work' } })
    await t.s.tick()
    await flush()
    t.runner.last?.output('tile 1\n', 'stderr')
    await flush()
    t.clock.set(new Date(NOW.getTime() + 2999).toISOString())
    t.runner.last?.output('tile 2\n', 'stderr')
    await flush()
    expect((await t.store.get(job.id))?.progress?.live?.line).toBe('tile 1')
    t.clock.set(new Date(NOW.getTime() + 3000).toISOString())
    t.runner.last?.output('tile 3\n', 'stderr')
    await flush()
    expect((await t.store.get(job.id))?.progress?.live?.line).toBe('tile 3')
    t.runner.last?.exit(0)
    await t.s.idle()
  })

  it('[HUB-011] Given a post-processing job printing percentages, When it runs, Then no live progress is kept', async () => {
    const t = setup()
    const job = await t.add({ kind: 'post-process', prepare: null, command: { program: 'bash', args: [], cwd: '/work' } })
    await t.s.tick()
    await flush()
    t.runner.last?.output('Working 50%\n', 'stderr')
    t.runner.last?.output('Working 60%\n')
    await flush()
    expect((await t.store.get(job.id))?.progress).toBeNull()
    t.runner.last?.exit(0)
    await t.s.idle()
  })
})

describe('a plate solve job, through the runner', () => {
  const solveJob = { kind: 'solve' as const, title: 'Plate solve M 42', prepare: null, command: { program: 'astap_cli', args: [], cwd: '/w' }, solve: { solver: 'astap' as const, program: 'astap_cli', workDir: '/w', files: [] } }

  it('[SKY-003] Given a solver that runs two files, When the job runs, Then each command and its output are logged, the output returned, and the progress saved', async () => {
    const outputs: string[] = []
    const solve: RunSolveJob = async (_job, io) => {
      await io.progress(0, 2, '1.fit')
      for (const f of ['1.fit', '2.fit']) {
        const r = await io.run({ program: 'astap_cli', args: ['-f', f], cwd: '/w' })
        outputs.push(`${r.exitCode}:${r.output}`)
      }
      io.log('solved\n')
      return { state: 'succeeded', note: 'Solved 2 of 2 files.' }
    }
    const t = setup({ solve, onStart: run => queueMicrotask(() => (run.output('out '), run.output(`${run.command.args[1]}\n`), run.exit(0))) })
    const job = await t.add(solveJob)
    await t.s.tick()
    await t.s.idle()
    expect(outputs).toEqual(['0:out 1.fit\n', '0:out 2.fit\n'])
    expect(t.logs.text.get(job.id)).toBe(
      `${ISO} started Plate solve M 42\n\n> astap_cli -f 1.fit\nout 1.fit\n> astap_cli -f 2.fit\nout 2.fit\nsolved\n\n${ISO} succeeded (exit code 0): Solved 2 of 2 files.\n`
    )
    expect(await t.store.get(job.id)).toMatchObject({ state: 'succeeded', exitCode: 0, progress: { step: 0, of: 2, key: 'solve', label: '1.fit' } })
  })

  it('[SKY-003] Given a solver that fails, When the job ends, Then it failed with no exit code', async () => {
    const t = setup({ solve: async () => ({ state: 'failed', note: 'Solved 0 of 1 file.' }) })
    const job = await t.add(solveJob)
    await t.s.tick()
    await t.s.idle()
    expect(await t.store.get(job.id)).toMatchObject({ state: 'failed', exitCode: null, note: 'Solved 0 of 1 file.' })
  })

  it('[SKY-003] Given a solve cancelled between files, When the solver asks to run the next, Then nothing starts and it is told it was cancelled', async () => {
    const answers: unknown[] = []
    let cancel: () => Promise<unknown> = async () => null
    const solve: RunSolveJob = async (_job, io) => {
      await cancel()
      answers.push(io.cancelled(), await io.run({ program: 'astap_cli', args: [], cwd: '/w' }))
      return { state: 'failed', note: null }
    }
    const t = setup({ solve })
    const job = await t.add(solveJob)
    cancel = async () => {
      void t.s.cancel(job.id)
      await flush()
    }
    await t.s.tick()
    await t.s.idle()
    expect(answers).toEqual([true, { exitCode: null, error: 'Cancelled.', output: '' }])
    expect(t.runner.runs).toHaveLength(0)
    expect(await t.store.get(job.id)).toMatchObject({ state: 'cancelled', note: 'Cancelled while it ran.' })
  })

  it('[JOB-008] [SKY-003] Given the app quits as a solver\'s program starts, When it stops, Then the program is stopped and the job left for recovery', async () => {
    let t: ReturnType<typeof setup> | null = null
    const solve: RunSolveJob = async (_job, io) => {
      const r = await io.run({ program: 'astap_cli', args: [], cwd: '/w' })
      return { state: r.exitCode === 0 ? 'succeeded' : 'failed', note: null }
    }
    t = setup({ solve, onStart: () => t?.s.shutdown() })
    const job = await t.add(solveJob)
    await t.s.tick()
    await t.s.idle()
    expect(t.runner.runs[0].cancelled).toBe(true)
    expect(await t.store.get(job.id)).toMatchObject({ state: 'running' })
  })
})
