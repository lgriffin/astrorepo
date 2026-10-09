import { describe, expect, it } from 'vitest'
import {
  makeDescribeTargetGeometry,
  makeExportMosaicCsv,
  makeJobScheduler,
  makeListMosaicGaps,
  makeListNextActions,
  makePlanMosaic,
  makePreferredSolver,
  makeQueueSolves,
  makeRunSolveJob,
  makeSaveMosaicPlan,
  type PrepareSirilWorkspace
} from '@astro/application'
import { DEFAULT_JOB_SETTINGS, NO_SOLVER, planMosaic, type Job, type SolveTask } from '@astro/domain'
import {
  FakeEphemeris,
  FakeMachine,
  FakePlateSolver,
  FakeProcessRunner,
  FakeToolHub,
  FixedClock,
  FixedJobSettings,
  InMemoryJobLogs,
  InMemoryJobStore,
  InMemoryMosaicStore,
  InMemoryPlanningSettings,
  InMemorySolveStore,
  skyFile,
  solvedField
} from '@astro/testkit'

const london = { latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 20 }
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const until = async (check: () => boolean) => {
  for (let i = 0; i < 50 && !check(); i++) await flush()
}

const seestar = { widthDeg: 0.72, heightDeg: 1.28 }

function mosaics() {
  return new InMemoryMosaicStore()
    .addTarget({ id: 'm31', name: 'M 31', raHours: 10.6847 / 15, decDeg: 41.2688, sizeArcmin: 178, goalSec: 6 * 3600 })
    .addTarget({ id: 'm31-p2', name: 'M 31 panel 2' })
    .addTarget({ id: 'm42', name: 'M 42', raHours: 5.5883, decDeg: -5.391, sizeArcmin: 85 })
}

describe('the preferred solver', () => {
  it('[SKY-002] Given ASTAP and Siril found, only Siril, or neither, When a solver is chosen, Then it is ASTAP, Siril, or a reason naming both', async () => {
    const solvers = [new FakePlateSolver('astap'), new FakePlateSolver('siril')]
    const both = await makePreferredSolver({ tools: new FakeToolHub().installAll(), solvers })()
    expect(both).toMatchObject({ solver: { id: 'astap' }, program: 'C:/Program Files/astap/astap_cli.exe' })
    const siril = await makePreferredSolver({ tools: new FakeToolHub().install('siril', 'C:/Siril/siril-cli.exe'), solvers })()
    expect(siril).toMatchObject({ solver: { id: 'siril' }, program: 'C:/Siril/siril-cli.exe' })
    expect(await makePreferredSolver({ tools: new FakeToolHub(), solvers })()).toEqual({ solver: null, reason: NO_SOLVER })
    // An ASTAP found but no adapter for it is not chosen.
    expect(await makePreferredSolver({ tools: new FakeToolHub().install('astap', '/a'), solvers: [solvers[1]] })()).toEqual({ solver: null, reason: NO_SOLVER })
  })
})

function queueSetup(tools = new FakeToolHub().installAll()) {
  const store = new InMemorySolveStore()
  const jobs = new InMemoryJobStore()
  const queue = makeQueueSolves({
    store,
    mosaics: mosaics(),
    preferred: makePreferredSolver({ tools, solvers: [new FakePlateSolver('astap'), new FakePlateSolver('siril')] }),
    jobs,
    clock: new FixedClock(new Date('2026-10-09T12:00:00Z')),
    workDir: id => `D:/work/solve/${id}`
  })
  return { store, jobs, queue }
}

describe('queueing plate solves', () => {
  it('[SKY-003] Given a target with two nights and a master, When plate solving is asked for, Then one job solves one light per night and the master with ASTAP near the catalogue position', async () => {
    const { store, jobs, queue } = queueSetup()
    store.add(
      skyFile({ path: 'D:/astro/M31/1.fit', capturedAt: new Date('2026-10-01T21:00:00Z'), sizeBytes: 5 }),
      skyFile({ path: 'D:/astro/M31/2.fit', capturedAt: new Date('2026-10-02T21:00:00Z'), sizeBytes: 9 }),
      skyFile({ path: 'D:/astro/M31/stack.fit', kind: 'master', sizeBytes: 7 }),
      skyFile({ path: 'D:/astro/M42/1.fit', targetId: 'm42' })
    )
    const result = await queue('m31')
    expect(result).toMatchObject({ fromHeaders: 0, toSolve: 3, solver: 'astap', message: '3 files queued in Jobs to plate solve with ASTAP.' })
    const job = result.job as Job
    expect(job).toMatchObject({ kind: 'solve', targetId: 'm31', timing: 'now', title: 'Plate solve M 31 with ASTAP (3 files)', spaceDir: 'D:/work/solve/m31', neededBytes: 9, prepare: null })
    expect(job.solve?.files.map(f => f.path).sort()).toEqual(['D:/astro/M31/1.fit', 'D:/astro/M31/2.fit', 'D:/astro/M31/stack.fit'])
    expect(job.solve?.files[0].hint).toEqual({ raDeg: expect.closeTo(10.6847, 4), decDeg: 41.2688 })
    expect(job.command.args.slice(0, 2)).toEqual(['-f', 'D:/work/solve/m31/solve.fit'])
    expect(job.command.args).toContain('-spd')
    expect(await jobs.list()).toHaveLength(1)
  })

  it('[SKY-003, SKY-004] Given files with a WCS, files solved and files in a running job, When asked again, Then the WCS is stored and nothing else is queued', async () => {
    const { store, jobs, queue } = queueSetup()
    store.add(
      skyFile({ path: '/a/1.fit', capturedAt: new Date('2026-10-01T21:00:00Z'), wcs: { CRVAL1: 10.7, CRVAL2: 41.3, CDELT1: -0.000664, CDELT2: 0.000664 } }),
      skyFile({ path: '/a/2.fit', capturedAt: new Date('2026-10-02T21:00:00Z') }),
      skyFile({ path: '/a/3.fit', capturedAt: new Date('2026-10-03T21:00:00Z') })
    )
    await store.save({ path: '/a/2.fit', field: solvedField(10.7, 41.3), source: 'astap', solvedAt: new Date(), error: null })
    const solve: SolveTask = { solver: 'astap', program: 'astap', workDir: '/w', files: [{ path: '/a/3.fit', widthPx: 1, heightPx: 1, hint: null, optics: null }] }
    await jobs.add({ kind: 'solve', targetId: 'm31', title: 't', timing: 'now', command: { program: 'astap', args: [], cwd: '/w' }, prepare: null, spaceDir: '/w', neededBytes: 0, solve }, new Date())
    const result = await queue('m31')
    expect(result).toMatchObject({ fromHeaders: 1, toSolve: 0, job: null, message: '1 file already carried a position in its headers. Every light night and master of this target is placed.' })
    expect(store.stored.get('/a/1.fit')).toMatchObject({ source: 'header', error: null, field: { raDeg: 10.7 } })
    expect(await jobs.list()).toHaveLength(1)
  })

  it("[SKY-003] Given a target whose only stored solve failed, When asked again, Then the file is queued again, counted unsolved, and a success replaces the failure", async () => {
    const { store, jobs, queue } = queueSetup()
    store.add(skyFile({ path: '/a/1.fit', capturedAt: new Date('2026-10-01T21:00:00Z') }))
    await store.save({ path: '/a/1.fit', field: null, source: 'astap', solvedAt: new Date(), error: 'ASTAP found no solution.' })
    expect((await makeDescribeTargetGeometry({ store, mosaics: mosaics() })('m31'))?.unsolved).toBe(1)
    const result = await queue('m31')
    expect(result).toMatchObject({ toSolve: 1, message: '1 file queued in Jobs to plate solve with ASTAP.' })
    expect(result.job?.solve?.files.map(f => f.path)).toEqual(['/a/1.fit'])
    // While that job waits, asking again queues nothing more.
    expect(await queue('m31')).toMatchObject({ toSolve: 0, job: null })
    const run = makeRunSolveJob({ solvers: [new FakePlateSolver('astap').answer('/a/1.fit', { ok: true, field: solvedField(10.7, 41.3) })], store, clock: new FixedClock() })
    const io = { run: async () => ({ exitCode: 0, error: null, output: '' }), log: () => {}, progress: async () => {}, cancelled: () => false }
    expect(await run(result.job as Job, io)).toEqual({ state: 'succeeded', note: 'Solved 1 of 1 file.' })
    expect(store.stored.get('/a/1.fit')).toMatchObject({ error: null, field: { raDeg: 10.7 } })
    expect((await makeDescribeTargetGeometry({ store, mosaics: mosaics() })('m31'))?.unsolved).toBe(0)
    expect(await jobs.list()).toHaveLength(1)
  })

  it('[SKY-002] Given no solver installed, When plate solving is asked for, Then nothing is queued and the reason names both solvers', async () => {
    const { store, jobs, queue } = queueSetup(new FakeToolHub())
    store.add(skyFile({ path: '/a/1.fit' }))
    expect(await queue('m31', 'window')).toMatchObject({ job: null, solver: null, toSolve: 1, message: NO_SOLVER })
    expect(await jobs.list()).toEqual([])
    const unknown = queueSetup()
    unknown.store.add(skyFile({ path: '/b/1.fit', targetId: 'ghost' }))
    expect((await unknown.queue('ghost')).job).toMatchObject({ title: 'Plate solve target with ASTAP (1 file)' })
  })
})

function runnerSetup(astap = new FakePlateSolver('astap')) {
  const store = new InMemorySolveStore()
  const jobs = new InMemoryJobStore()
  const runner = new FakeProcessRunner()
  const logs = new InMemoryJobLogs()
  const clock = new FixedClock(new Date(2026, 9, 9, 2, 30))
  const scheduler = makeJobScheduler({
    store: jobs,
    settings: new FixedJobSettings(DEFAULT_JOB_SETTINGS),
    machine: new FakeMachine(),
    runner,
    logs,
    workspace: { workAreaSpace: async () => ({ freeBytes: 10 ** 12, usedBytes: 0 }) },
    prepare: (async () => {
      throw new Error('not for solves')
    }) as PrepareSirilWorkspace,
    readOnlyDirs: () => [],
    clock,
    solve: makeRunSolveJob({ solvers: [astap], store, clock })
  })
  const task = (paths: string[]): SolveTask => ({ solver: 'astap', program: 'astap_cli', workDir: '/w', files: paths.map(path => ({ path, widthPx: 1080, heightPx: 1920, hint: null, optics: null })) })
  const add = (paths: string[], solve: SolveTask | null = task(paths)) =>
    jobs.add({ kind: 'solve', targetId: 'm31', title: 'Plate solve M 31', timing: 'now', command: { program: 'astap_cli', args: [], cwd: '/w' }, prepare: null, spaceDir: '/w', neededBytes: 1, solve }, clock.now())
  return { store, jobs, runner, logs, astap, scheduler, add }
}

describe('running a solve job', () => {
  it('[SKY-001, SKY-003] Given a solve job, When it runs, Then each file is solved through the runner, its field or failure stored, and its progress shown', async () => {
    const { store, jobs, runner, logs, astap, scheduler, add } = runnerSetup()
    astap.answer('/a/1.fit', { ok: true, field: solvedField(10.7, 41.3) })
    const job = await add(['/a/1.fit', '/a/2.fit'])
    await scheduler.tick()
    await until(() => runner.runs.length === 1)
    expect((await jobs.get(job.id))?.progress).toMatchObject({ step: 0, of: 2, label: '1.fit' })
    runner.last?.output('Solution found\n')
    runner.last?.exit(0)
    await until(() => runner.runs.length === 2)
    runner.last?.exit(1)
    await scheduler.idle()
    const done = await jobs.get(job.id)
    expect(done).toMatchObject({ state: 'succeeded', exitCode: 0, note: 'Solved 1 of 2 files. Not solved: 2.fit: ASTAP found no solution.' })
    expect(done?.progress).toMatchObject({ step: 2, of: 2, label: null })
    expect(store.stored.get('/a/1.fit')).toMatchObject({ source: 'astap', error: null, field: { raDeg: 10.7 } })
    expect(store.stored.get('/a/2.fit')).toMatchObject({ field: null, error: 'ASTAP found no solution.' })
    expect(runner.runs[0].command.args.slice(0, 2)).toEqual(['-f', '/w/solve.fit'])
    expect(logs.text.get(job.id)).toMatch(/Solved: RA 10\.7000°/)
    expect(logs.text.get(job.id)).toMatch(/Solution found/)
  })

  it('[SKY-003] Given a job interrupted after its first file, When it runs again, Then the stored file is skipped; with nothing solved it fails', async () => {
    const { store, jobs, runner, astap, scheduler, add } = runnerSetup()
    await store.save({ path: '/a/1.fit', field: solvedField(1, 2), source: 'astap', solvedAt: new Date(), error: null })
    astap.answer('/a/2.fit', { ok: false, reason: 'ASTAP found too few stars to solve it.' })
    const job = await add(['/a/1.fit', '/a/2.fit'])
    await scheduler.tick()
    await until(() => runner.runs.length === 1)
    runner.last?.exit(2)
    await scheduler.idle()
    expect(astap.solved).toEqual(['/a/2.fit'])
    expect(await jobs.get(job.id)).toMatchObject({
      state: 'failed',
      note: 'Solved 0 of 1 file. 1 file solved in an earlier run. Not solved: 2.fit: ASTAP found too few stars to solve it.'
    })
  })

  it('[SKY-003] Given a running solve job, When it is cancelled, Then the solver stops and the job says it was cancelled', async () => {
    const { jobs, runner, scheduler, add } = runnerSetup()
    const job = await add(['/a/1.fit', '/a/2.fit'])
    await scheduler.tick()
    await until(() => runner.runs.length === 1)
    const cancelled = await scheduler.cancel(job.id)
    expect(runner.runs).toHaveLength(1)
    expect(runner.runs[0].cancelled).toBe(true)
    expect(cancelled).toMatchObject({ state: 'cancelled' })
    expect(cancelled.note).toMatch(/^Cancelled while it ran\. Solved 0 of 0 files\.$/)
    expect((await jobs.get(job.id))?.state).toBe('cancelled')
  })

  it('[SKY-003] Given a cancel that comes while the next file is being staged, When the solver goes to run it, Then no further process starts', async () => {
    let release = () => {}
    const staged = new Promise<void>(resolve => (release = resolve))
    // The second file waits as a real solver does while it hard links or copies the file.
    class StagingSolver extends FakePlateSolver {
      override async solve(...args: Parameters<FakePlateSolver['solve']>) {
        if (this.solved.length === 1) await staged
        return super.solve(...args)
      }
    }
    const { runner, scheduler, add } = runnerSetup(new StagingSolver('astap'))
    const job = await add(['/a/1.fit', '/a/2.fit', '/a/3.fit'])
    await scheduler.tick()
    await until(() => runner.runs.length === 1)
    runner.last?.exit(1)
    for (let i = 0; i < 10; i++) await flush()
    const cancelling = scheduler.cancel(job.id)
    for (let i = 0; i < 10; i++) await flush()
    release()
    expect(await cancelling).toMatchObject({ state: 'cancelled' })
    expect(runner.runs).toHaveLength(1)
  })

  it('[SKY-005, SKY-003] Given a hinted solve that finds no match, When the job runs, Then the file is solved once more over the whole sky and its field stored', async () => {
    const store = new InMemorySolveStore().add(skyFile({ path: '/a/1.fit' }), skyFile({ path: '/a/2.fit', capturedAt: new Date('2026-10-02T22:00:00Z') }))
    const astap = new FakePlateSolver('astap')
      .answer('/a/1.fit (blind)', { ok: true, field: solvedField(83.8, -5.4) })
      .answer('/a/2.fit', { ok: false, reason: 'ASTAP found no star database.' })
    const run = makeRunSolveJob({ solvers: [astap], store, clock: new FixedClock() })
    const commands: string[][] = []
    const log: string[] = []
    const io = { run: async (c: { args: string[] }) => (commands.push(c.args), { exitCode: 0, error: null, output: '' }), log: (t: string) => log.push(t), progress: async () => {}, cancelled: () => false }
    const hint = { raDeg: 10.6847, decDeg: 41.2688 }
    const files = ['/a/1.fit', '/a/2.fit'].map(path => ({ path, widthPx: 1080, heightPx: 1920, hint, optics: null }))
    const result = await run({ solve: { solver: 'astap', program: 'astap_cli', workDir: '/w', files } } as unknown as Job, io)
    expect(result).toEqual({ state: 'succeeded', note: 'Solved 1 of 2 files. Not solved: 2.fit: ASTAP found no star database.' })
    // Only the file with no match is retried, and the retry carries no hint: ASTAP searches the whole sky.
    expect(astap.solved).toEqual(['/a/1.fit', '/a/1.fit', '/a/2.fit'])
    expect(commands[0]).toEqual(expect.arrayContaining(['-r', '10', '-ra']))
    expect(commands[1]).toEqual(expect.arrayContaining(['-r', '180']))
    expect(commands[1]).not.toContain('-ra')
    expect(log.join('')).toMatch(/Not solved near the target's catalogue position \(ASTAP found no solution\.\) Trying the whole sky\./)
    expect(store.stored.get('/a/1.fit')).toMatchObject({ error: null, field: { raDeg: 83.8 } })
    // Placed where it really points, the misfiled warning can fire.
    await store.save({ path: '/a/2.fit', field: solvedField(83.8, -5.4), source: 'astap', solvedAt: new Date(), error: null })
    expect((await makeDescribeTargetGeometry({ store, mosaics: mosaics() })('m31'))?.misfiled).toMatchObject({ far: 2, of: 2 })
  })

  it('[SKY-003] Given a solve job without files or a solver it knows, When it runs, Then it fails with a plain reason', async () => {
    const { jobs, scheduler, add } = runnerSetup()
    const empty = await add([], null)
    await scheduler.tick()
    await scheduler.idle()
    expect(await jobs.get(empty.id)).toMatchObject({ state: 'failed', note: 'This job has no files to plate solve.' })
    const store = new InMemorySolveStore()
    const run = makeRunSolveJob({ solvers: [], store, clock: new FixedClock() })
    const io = { run: async () => ({ exitCode: 0, error: null, output: '' }), log: () => {}, progress: async () => {}, cancelled: () => false }
    expect(await run({ solve: { solver: 'siril', program: 's', workDir: '/w', files: [] } } as unknown as Job, io)).toEqual({ state: 'failed', note: 'This job has no files to plate solve.' })
    const throwing = new FakePlateSolver('siril')
    throwing.solve = async () => {
      throw new Error('The disk is full.')
    }
    const crashed = makeRunSolveJob({ solvers: [throwing], store, clock: new FixedClock() })
    const result = await crashed({ solve: { solver: 'siril', program: 's', workDir: '/w', files: [{ path: '/x.fit', widthPx: 1, heightPx: 1, hint: null, optics: null }] } } as unknown as Job, io)
    expect(result).toEqual({ state: 'failed', note: 'Solved 0 of 1 file. Not solved: x.fit: The disk is full.' })
    const many = makeRunSolveJob({ solvers: [new FakePlateSolver('siril')], store: new InMemorySolveStore(), clock: new FixedClock() })
    const four = ['/1.fit', '/2.fit', '/3.fit', '/4.fit'].map(path => ({ path, widthPx: 1, heightPx: 1, hint: null, optics: null }))
    expect((await many({ solve: { solver: 'siril', program: 's', workDir: '/w', files: four } } as unknown as Job, io)).note).toMatch(/And 1 more\.$/)
  })
})

function geometrySetup() {
  const store = new InMemorySolveStore()
  const m = mosaics()
  return { store, mosaics: m, describe: makeDescribeTargetGeometry({ store, mosaics: m }) }
}

describe("what a target's solves say", () => {
  it('[SKY-005, SKY-006] Given lights that point far from M 31 on two nights turned 10° apart, When described, Then it may be misfiled and the rotation is shown per night', async () => {
    const { store, describe: describeGeometry } = geometrySetup()
    store.add(
      skyFile({ path: '/a/n1/1.fit', capturedAt: new Date('2026-10-01T21:00:00Z') }),
      skyFile({ path: '/a/n2/1.fit', capturedAt: new Date('2026-10-02T21:00:00Z') }),
      skyFile({ path: '/a/n3/1.fit', capturedAt: new Date('2026-10-03T21:00:00Z') }),
      skyFile({ path: '/a/stack.fit', kind: 'master', capturedAt: null })
    )
    await store.save({ path: '/a/n1/1.fit', field: solvedField(83.8, -5.4, { rotationDeg: 0 }), source: 'astap', solvedAt: new Date(), error: null })
    await store.save({ path: '/a/n2/1.fit', field: solvedField(83.8, -5.4, { rotationDeg: 10 }), source: 'siril', solvedAt: new Date(), error: null })
    await store.save({ path: '/a/stack.fit', field: null, source: 'astap', solvedAt: new Date(), error: 'ASTAP found no solution.' })
    const g = await describeGeometry('m31')
    expect(g?.solves.map(s => s.path)).toEqual(['/a/stack.fit', '/a/n1/1.fit', '/a/n2/1.fit'])
    // The third night and the master whose solve failed are still to place.
    expect(g?.unsolved).toBe(2)
    expect(g?.misfiled).toMatchObject({ far: 2, of: 2 })
    expect(g?.rotation).toEqual({ nights: [{ night: '2026-10-01', rotationDeg: 0 }, { night: '2026-10-02', rotationDeg: 10 }], spreadDeg: 10 })
    expect(await describeGeometry('nope')).toBeNull()
  })

  it('[SKY-011] Given panels under two targets whose fields overlap, When described, Then they are one mosaic; only saving a plan links the other target, once', async () => {
    const { store, mosaics: m, describe: describeGeometry } = geometrySetup()
    store.add(
      skyFile({ path: '/a/p1/1.fit', capturedAt: new Date('2026-10-01T21:00:00Z') }),
      skyFile({ path: '/a/p1/2.fit', capturedAt: new Date('2026-10-01T21:10:00Z') }),
      skyFile({ path: '/b/p2/1.fit', targetId: 'm31-p2', capturedAt: new Date('2026-10-01T22:00:00Z') }),
      skyFile({ path: '/c/m42/1.fit', targetId: 'm42', capturedAt: new Date('2026-10-01T23:00:00Z') })
    )
    await store.save({ path: '/a/p1/1.fit', field: solvedField(10.68, 41.27), source: 'astap', solvedAt: new Date(), error: null })
    await store.save({ path: '/b/p2/1.fit', field: solvedField(11.3, 41.27), source: 'astap', solvedAt: new Date(), error: null })
    await store.save({ path: '/c/m42/1.fit', field: solvedField(83.8, -5.4), source: 'astap', solvedAt: new Date(), error: null })
    const g = await describeGeometry('m31')
    expect(g?.mosaic.grouping.panels.map(p => ({ targets: p.targetIds, lights: p.lightCount, sec: p.integrationSec }))).toEqual([
      { targets: ['m31'], lights: 2, sec: 20 },
      { targets: ['m31-p2'], lights: 1, sec: 10 }
    ])
    expect(g?.mosaic.grouping.mosaic).toEqual([1, 2])
    expect(g?.mosaic.linkedTargetIds).toEqual(['m31-p2'])
    expect(g?.misfiled).toBeNull()
    // Looking writes nothing.
    expect(m.links).toEqual([])
    const save = makeSaveMosaicPlan({ store, mosaics: m, clock: new FixedClock() })
    await save('m31', { field: seestar, rotationDeg: 0, overlap: 0.2 })
    await save('m31', { field: seestar, rotationDeg: 0, overlap: 0.2 })
    await describeGeometry('m31')
    expect(m.links).toEqual([['m31', 'm31-p2']])
    expect(await m.linked('m31-p2')).toEqual(['m31'])
    // A target with no catalogue entry saves its plan and links nothing.
    await makeSaveMosaicPlan({ store, mosaics: m, clock: new FixedClock() })('ghost', { field: seestar, rotationDeg: 0, overlap: 0.2 })
    expect(m.links).toHaveLength(1)
  })
})

function plannerSetup(site: typeof london | null = london) {
  const store = new InMemorySolveStore()
  const m = mosaics()
  const ephemeris = new FakeEphemeris()
  const clock = new FixedClock(new Date('2026-10-09T15:00:00Z'))
  const deps = { store, mosaics: m, settings: new InMemoryPlanningSettings(site), ephemeris, clock }
  return { ...deps, plan: makePlanMosaic(deps, 10), save: makeSaveMosaicPlan({ store, mosaics: m, clock }), gaps: makeListMosaicGaps(deps, 10) }
}


describe('planning a mosaic', () => {
  it('[SKY-007, SKY-008] Given M 31 and a Seestar field, When planned, Then tiles carry what they have and need for the goal, and the coming nights are marked', async () => {
    const { plan, ephemeris } = plannerSetup()
    const r = await plan({ targetId: 'm31', field: seestar, rotationDeg: 0 })
    if (r.status !== 'ok') throw new Error(r.status)
    expect(r.fieldFrom).toBe('request')
    expect(r.plan).toMatchObject({ columns: 5, rows: 3 })
    expect(r.tiles[0]).toEqual({ tile: 1, capturedSec: 0, lightCount: 0, neededSec: 6 * 3600 })
    expect(r.nights).toHaveLength(10)
    expect(r.nights?.[0].night).toBe('2026-10-09')
    expect(r.nights?.every(n => n.clear)).toBe(true)
    expect(ephemeris.nightsRequested).toHaveLength(10)
    expect(r.saved).toBeNull()
  })

  it('[SKY-008, SKY-010] Given no site, no position, no size or no field, When planned, Then it says what is missing', async () => {
    const { plan, mosaics: m } = plannerSetup(null)
    const r = await plan({ targetId: 'm31', field: seestar })
    expect(r.status === 'ok' && r.nights).toBeNull()
    expect(await plan({ targetId: 'm31' })).toMatchObject({ status: 'no-field' })
    expect(await plan({ targetId: 'nope' })).toEqual({ status: 'no-target' })
    m.addTarget({ id: 'custom', name: 'Custom', raHours: 1, decDeg: 2 })
    expect(await plan({ targetId: 'custom', field: seestar })).toMatchObject({ status: 'no-size' })
    expect(await plan({ targetId: 'm31-p2', field: seestar })).toMatchObject({ status: 'no-position' })
  })

  it('[SKY-007, SKY-011] Given no equipment chosen but solved lights in a tile, When planned, Then their field is used, the tile shows its integration, and a saved plan wins next time', async () => {
    const { plan, save, store, mosaics: m } = plannerSetup()
    const tiles = planMosaic({ centre: { raDeg: 10.6847, decDeg: 41.2688 }, targetWidthArcmin: 178, targetHeightArcmin: 178, field: { widthDeg: 1080 * 2.39 / 3600, heightDeg: 1920 * 2.39 / 3600 }, rotationDeg: 0, overlap: 0.2 }).tiles
    store.add(skyFile({ path: '/a/t1/1.fit', exposureSec: 600 }), skyFile({ path: '/a/t1/2.fit', exposureSec: 600 }))
    await store.save({ path: '/a/t1/1.fit', field: solvedField(tiles[0].raDeg, tiles[0].decDeg), source: 'astap', solvedAt: new Date(), error: null })
    store.add(skyFile({ path: '/b/t1/1.fit', targetId: 'm31-p2' }))
    await store.save({ path: '/b/t1/1.fit', field: solvedField(tiles[1].raDeg, tiles[1].decDeg), source: 'astap', solvedAt: new Date(), error: null })
    const fromSolves = await plan({ targetId: 'm31' })
    if (fromSolves.status !== 'ok') throw new Error(fromSolves.status)
    expect(fromSolves.fieldFrom).toBe('solves')
    expect(fromSolves.tiles[0]).toEqual({ tile: 1, capturedSec: 1200, lightCount: 2, neededSec: 6 * 3600 - 1200 })
    // Planning links nothing; saving the plan links the other target's panel.
    expect(await m.linked('m31')).toEqual([])
    const saved = await save('m31', { field: { widthDeg: 1080 * 2.39 / 3600, heightDeg: 1920 * 2.39 / 3600 }, rotationDeg: 0, overlap: 0.2 })
    expect(await m.linked('m31')).toEqual(['m31-p2'])
    await save('m31', { field: seestar, rotationDeg: 30, overlap: 0.25 })
    expect(saved).toMatchObject({ targetId: 'm31', rotationDeg: 0, overlap: 0.2 })
    const again = await plan({ targetId: 'm31' })
    expect(again.status === 'ok' && { from: again.fieldFrom, rotation: again.plan.rotationDeg, overlap: again.plan.overlap, saved: !!again.saved }).toEqual({ from: 'saved', rotation: 30, overlap: 0.25, saved: true })
  })

  it('[SKY-009] Given a plan, When exported, Then the CSV is named after the target and lists each tile with the hours it needs', async () => {
    const { plan } = plannerSetup()
    const exportCsv = makeExportMosaicCsv(plan)
    const csv = await exportCsv({ targetId: 'm31', field: seestar })
    expect(csv?.fileName).toBe('M_31-mosaic.csv')
    expect(csv?.csv.split('\n')[1]).toMatch(/^1,1,1,.*,6\.0$/)
    expect(await exportCsv({ targetId: 'nope' })).toBeNull()
    const noGoal = makeExportMosaicCsv(async () => ({ ...((await plan({ targetId: 'm31', field: seestar })) as Extract<Awaited<ReturnType<typeof plan>>, { status: 'ok' }>), tiles: [] }))
    expect((await noGoal({ targetId: 'm31' }))?.csv.split('\n')[1].endsWith(',')).toBe(true)
  })
})

describe('tiles with no lights in next actions', () => {
  it('[SKY-012] Given a saved plan with one tile captured, When next actions are listed, Then every other tile says it has no lights with the nights it is up', async () => {
    const { save, gaps, store, mosaics: m, settings, ephemeris, clock } = plannerSetup()
    await save('m31', { field: { widthDeg: 2, heightDeg: 2 }, rotationDeg: 0, overlap: 0.2 })
    await save('m42', { field: { widthDeg: 2, heightDeg: 2 }, rotationDeg: 0, overlap: 0.2 })
    const plan = planMosaic({ centre: { raDeg: 10.6847, decDeg: 41.2688 }, targetWidthArcmin: 178, targetHeightArcmin: 178, field: { widthDeg: 2, heightDeg: 2 }, rotationDeg: 0, overlap: 0.2 })
    store.add(skyFile({ path: '/a/t1/1.fit' }))
    await store.save({ path: '/a/t1/1.fit', field: solvedField(plan.tiles[0].raDeg, plan.tiles[0].decDeg, { widthPx: 2400, heightPx: 2400 }), source: 'astap', solvedAt: new Date(), error: null })
    const list = await gaps()
    expect(plan.tiles).toHaveLength(4)
    expect(list.map(g => `${g.targetId}:${g.tile}/${g.of}`)).toEqual(['m31:2/4', 'm31:3/4', 'm31:4/4'])
    expect(list[0]).toMatchObject({ targetName: 'M 31', lookedAt: 10, goalSec: 6 * 3600 })
    expect(list[0].nights).toHaveLength(10)

    const actions = await makeListNextActions({
      listStackingSuggestions: async () => [],
      planForward: async () => ({ status: 'no-site' }),
      listMosaicGaps: gaps
    })()
    expect(actions.map(a => a.kind)).toEqual(['mosaic-tile', 'mosaic-tile', 'mosaic-tile'])

    const errors: unknown[] = []
    const failing = await makeListNextActions({
      listStackingSuggestions: async () => [],
      planForward: async () => ({ status: 'no-site' }),
      listMosaicGaps: async () => {
        throw new Error('boom')
      },
      onPlanError: e => errors.push(e)
    })()
    expect(failing).toEqual([])
    expect(errors).toHaveLength(1)

    const noSite = makeListMosaicGaps({ store, mosaics: m, settings: new InMemoryPlanningSettings(null), ephemeris, clock }, 10)
    expect((await noSite())[0]).toMatchObject({ nights: [], lookedAt: 0 })
    expect(await makeListMosaicGaps({ store, mosaics: new InMemoryMosaicStore(), settings, ephemeris, clock })()).toEqual([])
  })
})
