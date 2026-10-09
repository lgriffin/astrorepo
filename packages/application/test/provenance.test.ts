import { describe, expect, it } from 'vitest'
import { makeJobScheduler, makeTargetHolds, type PrepareSirilWorkspace, type SirilWorkspaceResult } from '@astro/application'
import type { ResultFile, SirilPlacement } from '@astro/domain'
import { FakeMachine, FakeProcessRunner, FixedClock, FixedJobSettings, InMemoryJobLogs, InMemoryJobStore, InMemoryRunArea } from '@astro/testkit'

const GB = 1024 ** 3
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const SCRIPT = '/siril/scripts/OSC_Preprocessing.ssf'
const STOCK = `requires 1.2.0
# Convert, register and stack the lights
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

const lights = (n: number): SirilPlacement[] =>
  Array.from({ length: n }, (_, i) => ({ from: `/astro/m42/Light_${i + 1}.fit`, folder: 'lights', name: `Light_${i + 1}.fit` }))

/** A scheduler wired for step-by-step stacks; `world` is shared, so a second one is the app after a restart. */
function harness(world = { store: new InMemoryJobStore(), logs: new InMemoryJobLogs(), area: new InMemoryRunArea(), results: [] as ResultFile[], frames: lights(3) }) {
  const runner = new FakeProcessRunner()
  const clock = new FixedClock(new Date(2026, 8, 30, 2, 30))
  world.area.texts.set(SCRIPT, STOCK)
  world.area.onSetAside = p => (world.results = world.results.filter(r => r.path !== p))
  const s = makeJobScheduler({
    store: world.store,
    settings: new FixedJobSettings(),
    machine: new FakeMachine(),
    runner,
    logs: world.logs,
    workspace: { workAreaSpace: async () => ({ freeBytes: 100 * GB, usedBytes: 0 }), stackResults: async () => world.results.map(r => ({ ...r })) },
    prepare: async (_source, workDir): Promise<SirilWorkspaceResult> => ({
      workDir, linked: world.frames.length, copied: 0, existing: 0, rejected: 1, pruned: 0,
      byFolder: { lights: world.frames.length, darks: 0, flats: 0, biases: 0 }, placements: world.frames, rejectedPaths: ['/astro/m42/Light_9.fit']
    }),
    runArea: world.area,
    targetName: async () => 'M 42',
    readOnlyDirs: () => [],
    clock
  })
  const add = () =>
    world.store.add(
      {
        kind: 'stack', targetId: 'm42', title: 'Stack M 42 with OSC_Preprocessing', timing: 'now',
        command: { program: 'siril-cli', args: ['-d', '/work', '-s', SCRIPT], cwd: '/work' },
        prepare: { sourceDir: '/astro/m42', workDir: '/work' }, spaceDir: '/work', neededBytes: GB
      },
      clock.now()
    )
  /** Lets the current step start, then ends it. */
  const step = async (exitCode: number | null, output = '') => {
    await flush()
    if (output) runner.last?.output(output)
    runner.last?.exit(exitCode)
    await flush()
  }
  return { s, runner, clock, add, step, world }
}

describe('stacks run step by step', () => {
  it('[PRV-003] [PRV-001] Given a stock script, When the stack runs, Then each step is its own Siril run and the result is published with a manifest', async () => {
    const t = harness()
    const job = await t.add()
    await t.s.tick()
    await t.step(0)
    expect(t.runner.runs[0].command.args).toEqual(['-d', '/work', '-s', '/work/.astrorepo/step-01.ssf'])
    expect(t.world.area.steps[0].text).toBe('requires 1.2.0\ncd lights\nconvert light -out=../process\n')
    expect((await t.world.store.get(job.id))?.progress).toMatchObject({ step: 1, of: 4, label: 'register light' })
    await t.step(0)
    await t.step(0)
    t.world.results.push({ path: '/work/result_120s.fit', sizeBytes: 5000, modifiedAt: new Date(2026, 8, 30, 3) })
    await t.step(0)
    await t.s.idle()
    expect(t.world.area.steps.map(s => s.path.split('/').pop())).toEqual(['step-01.ssf', 'step-02.ssf', 'step-03.ssf', 'step-04.ssf'])
    expect(t.world.area.steps[3].text).toBe('requires 1.2.0\ncd "process"\nload result\nsave ../result_$LIVETIME:%d$s\ncd ..\n')
    const done = await t.world.store.get(job.id)
    expect(done).toMatchObject({ state: 'succeeded', note: null, progress: { step: 4, of: 4, published: ['/work/result_120s.fit'] } })
    const manifest = t.world.area.manifests.get('/work/result_120s.fit')
    expect(manifest).toMatchObject({
      format: 'astrorepo-stack-manifest',
      result: { file: 'result_120s.fit', sizeBytes: 5000 },
      target: { id: 'm42', name: 'M 42' },
      siril: { program: 'siril-cli', script: 'OSC_Preprocessing.ssf' },
      rejected: ['/astro/m42/Light_9.fit']
    })
    expect(manifest?.frames.lights).toHaveLength(3)
    expect(manifest?.steps.map(s => s.label)).toEqual(['convert light', 'register light', 'stack r_light', 'load result'])
  })

  it('[PRV-002] [PRV-006] Given a step that fails with a known Siril message, When the stack stops, Then the partial result is set aside and the failure explained', async () => {
    const t = harness()
    const job = await t.add()
    await t.s.tick()
    await t.step(0)
    t.world.results.push({ path: '/work/result.fit', sizeBytes: 10, modifiedAt: new Date() })
    await t.step(1, 'Registration aborted: not enough stars\n')
    await t.s.idle()
    const failed = await t.world.store.get(job.id)
    expect(failed?.state).toBe('failed')
    expect(failed?.note).toMatch(/^Step 2 of 4 \(register light\) failed: Siril exited with code 1\. Registration could not find enough stars/)
    expect(failed?.note).toMatch(/What it wrote is in the work folder's failed folder\.$/)
    expect(t.world.area.setAsideFiles).toEqual(['/work/result.fit'])
    expect(t.world.area.manifests.size).toBe(0)
    expect(await t.s.log(job.id)).toContain('What this usually means: Registration could not find enough stars')
  })

  it('[PRV-002] Given a stack cancelled mid-step, When it stops, Then it is cancelled and nothing is published', async () => {
    const t = harness()
    const job = await t.add()
    await t.s.tick()
    await flush()
    const cancelled = t.s.cancel(job.id)
    await flush()
    expect(await cancelled).toMatchObject({ state: 'cancelled', note: 'Cancelled during step 1 of 4 (convert light).' })
  })

  it('[PRV-004] Given the app closed during step 3, When it starts again over the same frames, Then the stack carries on from step 3', async () => {
    const first = harness()
    const job = await first.add()
    await first.s.tick()
    await first.step(0)
    await first.step(0)
    await flush()
    first.s.shutdown()
    await first.s.idle()

    const again = harness(first.world)
    await again.s.recover()
    expect(await again.world.store.get(job.id)).toMatchObject({ state: 'queued', note: 'The app closed while it ran, so it carries on from step 3 of 4 if the frames have not changed.' })
    await again.s.tick()
    await flush()
    await flush()
    expect(again.runner.runs[0].command.args).toContain('/work/.astrorepo/step-03.ssf')
    await again.step(0)
    again.world.results.push({ path: '/work/result_120s.fit', sizeBytes: 5000, modifiedAt: new Date() })
    await again.step(0)
    await again.s.idle()
    expect(await again.world.store.get(job.id)).toMatchObject({ state: 'succeeded', progress: { step: 4, resumedFrom: 2 } })
    expect(await again.s.log(job.id)).toContain('Carrying on from step 3 of 4: steps 1 to 2 finished in an earlier run over the same frames.')
    expect(again.world.area.manifests.get('/work/result_120s.fit')?.steps.map(s => s.resumed)).toEqual([true, true, false, false])
  })

  it('[PRV-005] Given the frames changed since the run stopped, When it starts again, Then it starts from the first step', async () => {
    const first = harness()
    const job = await first.add()
    await first.s.tick()
    await first.step(0)
    await first.step(0)
    await flush()
    first.s.shutdown()
    await first.s.idle()

    first.world.frames = lights(4)
    const again = harness(first.world)
    await again.s.recover()
    await again.s.tick()
    await flush()
    await flush()
    expect(again.runner.runs[0].command.args).toContain('/work/.astrorepo/step-01.ssf')
    expect(await again.s.log(job.id)).toContain('Starting from the first step: the script or the frames changed since the earlier run.')
  })

  it('[PRV-004] Given an earlier stack\'s result in the work folder, When a stack resumes and finishes, Then only its own result is published and the earlier one is left alone', async () => {
    const first = harness()
    const old = { path: '/work/result_60s.fit', sizeBytes: 900, modifiedAt: new Date(2026, 0, 1) }
    first.world.results.push(old)
    const job = await first.add()
    await first.s.tick()
    await first.step(0)
    await first.step(0)
    await flush()
    first.s.shutdown()
    await first.s.idle()

    const again = harness(first.world)
    await again.s.recover()
    await again.s.tick()
    await again.step(0)
    again.world.results.push({ path: '/work/result_120s.fit', sizeBytes: 5000, modifiedAt: new Date() })
    await again.step(0)
    await again.s.idle()
    expect(await again.world.store.get(job.id)).toMatchObject({ state: 'succeeded', progress: { published: ['/work/result_120s.fit'] } })
    expect([...again.world.area.manifests.keys()]).toEqual(['/work/result_120s.fit'])
  })

  it('[PRV-004] Given an earlier stack\'s result, When a resumed stack fails, Then only what the resumed run wrote is set aside', async () => {
    const first = harness()
    first.world.results.push({ path: '/work/result_60s.fit', sizeBytes: 900, modifiedAt: new Date(2026, 0, 1) })
    await first.add()
    await first.s.tick()
    await first.step(0)
    await flush()
    first.s.shutdown()
    await first.s.idle()

    const again = harness(first.world)
    await again.s.recover()
    await again.s.tick()
    again.world.results.push({ path: '/work/result_partial.fit', sizeBytes: 10, modifiedAt: new Date() })
    await again.step(1)
    await again.s.idle()
    expect(again.world.area.setAsideFiles).toEqual(['/work/result_partial.fit'])
  })

  it('[PRV-005] Given a run that stopped part way and the frames changed since, When it starts again, Then what the earlier attempt wrote is set aside first', async () => {
    const first = harness()
    const job = await first.add()
    await first.s.tick()
    await first.step(0)
    first.world.results.push({ path: '/work/result_partial.fit', sizeBytes: 10, modifiedAt: new Date() })
    await first.step(0)
    await flush()
    first.s.shutdown()
    await first.s.idle()

    first.world.frames = lights(4)
    const again = harness(first.world)
    await again.s.recover()
    await again.s.tick()
    await flush()
    await flush()
    expect(again.world.area.setAsideFiles).toEqual(['/work/result_partial.fit'])
    expect(await again.s.log(job.id)).toContain('Set aside in failed what the earlier attempt wrote')
  })

  it('[PRV-002] Given a cancel that arrives between steps, When the next step would start, Then it never starts and the stack is cancelled', async () => {
    const t = harness()
    const job = await t.add()
    const write = t.world.area.writeStep.bind(t.world.area)
    let cancelling: Promise<unknown> | null = null
    t.world.area.writeStep = async (workDir, name, text) => {
      if (name === 'step-02.ssf') {
        cancelling = t.s.cancel(job.id)
        await flush()
      }
      return write(workDir, name, text)
    }
    await t.s.tick()
    await t.step(0)
    await t.s.idle()
    await cancelling
    expect(t.runner.runs).toHaveLength(1)
    expect(await t.world.store.get(job.id)).toMatchObject({ state: 'cancelled', note: 'Cancelled before step 2 of 4 (register light).' })
  })

  it('[PRV-002] Given a cancel that arrives while the result is being published, When publishing ends, Then the stack is cancelled and the result set aside', async () => {
    const t = harness()
    const job = await t.add()
    const write = t.world.area.writeManifest.bind(t.world.area)
    let cancelling: Promise<unknown> | null = null
    t.world.area.writeManifest = async (resultPath, manifest) => {
      cancelling = t.s.cancel(job.id)
      await flush()
      return write(resultPath, manifest)
    }
    await t.s.tick()
    for (let i = 0; i < 3; i++) await t.step(0)
    t.world.results.push({ path: '/work/result_120s.fit', sizeBytes: 5000, modifiedAt: new Date() })
    await t.step(0)
    await t.s.idle()
    await cancelling
    const done = await t.world.store.get(job.id)
    expect(done).toMatchObject({ state: 'cancelled', progress: { step: 4 } })
    expect(done?.note).toMatch(/^Cancelled while its result was being published\. What it wrote is in the work folder's failed folder\.$/)
    expect(done?.progress?.published).toBeUndefined()
    expect(t.world.area.setAsideFiles).toEqual(['/work/result_120s.fit'])
  })

  it('[PRV-001] [PRV-002] Given every step succeeds but the manifest cannot be written, When the stack ends, Then it fails and the result is set aside', async () => {
    const t = harness()
    t.world.area.writeManifest = async () => {
      throw new Error('EACCES: permission denied')
    }
    const job = await t.add()
    await t.s.tick()
    for (let i = 0; i < 3; i++) await t.step(0)
    t.world.results.push({ path: '/work/result_120s.fit', sizeBytes: 5000, modifiedAt: new Date() })
    await t.step(0)
    await t.s.idle()
    const done = await t.world.store.get(job.id)
    expect(done?.state).toBe('failed')
    expect(done?.note).toMatch(/^Siril finished, but publishing the result failed: EACCES: permission denied\. What it wrote is in the work folder's failed folder\.$/)
    expect(t.world.area.setAsideFiles).toEqual(['/work/result_120s.fit'])
  })

  it('[PRV-003] Given a script that cannot be read, When the stack runs, Then the stock script runs whole as before', async () => {
    const t = harness()
    t.world.area.texts.clear()
    const job = await t.add()
    await t.s.tick()
    await t.step(0)
    await t.s.idle()
    expect(t.runner.runs.map(r => r.command.args)).toEqual([['-d', '/work', '-s', SCRIPT]])
    expect(await t.world.store.get(job.id)).toMatchObject({ state: 'succeeded', progress: null })
  })

  it('[PRV-001] Given every step succeeds but Siril saved no result, When the stack ends, Then it says so', async () => {
    const t = harness()
    const job = await t.add()
    await t.s.tick()
    for (let i = 0; i < 4; i++) await t.step(0)
    await t.s.idle()
    expect(await t.world.store.get(job.id)).toMatchObject({ state: 'succeeded', note: 'Siril finished, but no result file appeared in the work folder.' })
  })

  it('[PRV-006] Given a script run whole that fails on a full disk, When it stops, Then the note says what it means and what to do', async () => {
    const t = harness()
    t.world.area.texts.clear()
    const job = await t.add()
    await t.s.tick()
    await t.step(1, 'save: No space left on device\n')
    await t.s.idle()
    expect((await t.world.store.get(job.id))?.note).toMatch(/^siril-cli exited with code 1\. The work area’s disk filled up\. Free space/)
  })
})

describe('one filter of a mono target, stacked like any other stack (specs/026-other-rigs)', () => {
  const MONO = '/siril/scripts/Mono_Preprocessing.ssf'

  function monoHarness() {
    const store = new InMemoryJobStore()
    const logs = new InMemoryJobLogs()
    const area = new InMemoryRunArea()
    area.texts.set(MONO, STOCK)
    const runner = new FakeProcessRunner()
    const clock = new FixedClock(new Date(2026, 8, 30, 2, 30))
    const holds = makeTargetHolds()
    const prepared: Parameters<PrepareSirilWorkspace>[] = []
    const results: ResultFile[] = []
    const s = makeJobScheduler({
      store,
      settings: new FixedJobSettings(),
      machine: new FakeMachine(),
      runner,
      logs,
      workspace: { workAreaSpace: async () => ({ freeBytes: 100 * GB, usedBytes: 0 }), stackResults: async () => results.map(r => ({ ...r })) },
      prepare: async (...args): Promise<SirilWorkspaceResult> => {
        prepared.push(args)
        return { workDir: args[1], linked: 2, copied: 0, existing: 0, rejected: 0, pruned: 0, byFolder: { lights: 2, darks: 0, flats: 0, biases: 0 }, placements: lights(2), rejectedPaths: [] }
      },
      runArea: area,
      targetName: async () => 'M 42',
      readOnlyDirs: () => [],
      clock,
      holds
    })
    const add = () =>
      store.add(
        {
          kind: 'stack', targetId: 'm42', title: 'Stack M 42 (Ha) with Mono_Preprocessing', timing: 'now',
          command: { program: 'siril-cli', args: ['-d', '/work/Ha', '-s', MONO], cwd: '/work/Ha' },
          prepare: { sourceDir: '/astro/m42', workDir: '/work/Ha', filter: 'Ha' }, spaceDir: '/work/Ha', neededBytes: GB
        },
        clock.now()
      )
    const step = async (exitCode: number | null, output = '') => {
      await flush()
      if (output) runner.last?.output(output)
      runner.last?.exit(exitCode)
      await flush()
    }
    return { s, store, area, runner, holds, prepared, results, add, step }
  }

  it('[RIG-009] [ARC-008] [PRV-003] Given one filter\'s stack queued while its target is held, When the hold ends, Then only that filter is laid out and Siril runs the mono script step by step to a manifest', async () => {
    const t = monoHarness()
    const release = t.holds.hold('m42')
    const job = await t.add()
    await t.s.tick()
    await flush()
    expect(t.runner.runs).toEqual([])
    expect((await t.store.get(job.id))?.state).toBe('queued')
    release?.()
    await t.s.tick()
    for (let i = 0; i < 3; i++) await t.step(0)
    t.results.push({ path: '/work/Ha/result_120s.fit', sizeBytes: 5000, modifiedAt: new Date(2026, 8, 30, 3) })
    await t.step(0)
    await t.s.idle()
    expect(t.prepared[0].slice(0, 2)).toEqual(['/astro/m42', '/work/Ha'])
    expect(t.prepared[0][3]).toEqual({ filter: 'Ha' })
    expect(t.runner.runs.map(r => r.command.args)).toEqual([1, 2, 3, 4].map(n => ['-d', '/work/Ha', '-s', `/work/Ha/.astrorepo/step-0${n}.ssf`]))
    expect(await t.store.get(job.id)).toMatchObject({ state: 'succeeded', progress: { step: 4, of: 4, published: ['/work/Ha/result_120s.fit'] } })
    expect(t.area.manifests.get('/work/Ha/result_120s.fit')).toMatchObject({ siril: { script: 'Mono_Preprocessing.ssf' } })
  })

  it('[RIG-009] [HUB-012] Given one filter\'s stack whose step fails, When Siril exits non-zero, Then its exit code is read through the one contract and the job fails at that step', async () => {
    const t = monoHarness()
    const job = await t.add()
    await t.s.tick()
    await t.step(0)
    await t.step(3)
    await t.s.idle()
    expect(t.runner.runs).toHaveLength(2)
    expect((await t.store.get(job.id))?.state).toBe('failed')
    expect((await t.store.get(job.id))?.note).toBe('Step 2 of 4 (register light) failed: Siril exited with code 3.')
  })
})
