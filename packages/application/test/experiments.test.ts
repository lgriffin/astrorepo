import { describe, expect, it } from 'vitest'
import {
  makeCompareExperiment,
  makeCreateExperiment,
  makeDescribeExperiment,
  makeExportExperimentReport,
  makeListExperiments,
  makePlanPostProcessing,
  makePreferVariant,
  makeRunExperiment,
  type ExperimentDefinition
} from '@astro/application'
import {
  FakeImagePixels,
  FakeToolHub,
  FakeToolProbe,
  FixedClock,
  InMemoryExperimentStore,
  InMemoryJobStore,
  InMemoryOutputFolder,
  InMemorySirilWorkspace,
  InMemoryStackCatalogue
} from '@astro/testkit'

const GB = 1e9
const STACK = 'D:/m31/result.fit'

function rig(options: { coords?: boolean; free?: number | null } = {}) {
  const store = new InMemoryExperimentStore()
  const folder = new InMemoryOutputFolder().put(STACK, 'the stack')
  const stacks = new InMemoryStackCatalogue()
    .addTarget('m31', { name: 'M 31', objectType: 'galaxy', ...(options.coords === false ? {} : { raHours: 0.712, decDeg: 41.27 }) })
    .addStack('m31', { path: STACK, sizeBytes: GB, width: 3000, height: 2000, focalMm: 250, pixelUm: 2.9 })
  const tools = new FakeToolHub().installAll()
  const workspace = new InMemorySirilWorkspace()
  workspace.space = { freeBytes: options.free === undefined ? 1000 * GB : options.free, usedBytes: 0 }
  const probe = new FakeToolProbe().answer('C:/Program Files/Siril/bin/siril-cli.exe', ['--version'], { stdout: 'siril 1.4.0' })
  const jobs = new InMemoryJobStore()
  const pixels = new FakeImagePixels()
  const clock = new FixedClock(new Date('2026-10-26T09:00:00Z'))
  const deps = { store, plan: makePlanPostProcessing({ stacks, tools, workspace }), tools, probe, jobs, folder, hasher: folder, space: workspace, pixels, clock }
  const create = makeCreateExperiment(deps)
  const definition = (over: Partial<ExperimentDefinition> = {}): ExperimentDefinition => ({
    name: 'Stretch test',
    objective: ' Galaxy or broadband? ',
    stackPath: STACK,
    variants: [
      { profile: 'galaxy', quality: 'normal' },
      { profile: 'broadband', quality: 'strong' }
    ],
    ...over
  })
  const make = async (over: Partial<ExperimentDefinition> = {}) => {
    const r = await create('m31', definition(over))
    if (!r.ok) throw new Error(r.problems.join(' '))
    return r.experiment
  }
  /** The job runner finishing a variant's job, and the files it left. */
  const finish = async (jobId: string, state: 'succeeded' | 'failed', files: Record<string, string> = {}) => {
    await jobs.update(jobId, { state, exitCode: state === 'succeeded' ? 0 : 1, startedAt: new Date('2026-10-26T02:00:00Z'), finishedAt: new Date('2026-10-26T02:20:00Z') })
    const job = await jobs.get(jobId)
    const target = job?.command.args.find(a => a.startsWith('--target='))?.slice('--target='.length)
    for (const [name, content] of Object.entries(files)) folder.put(`D:/m31/processed/${target}/${name}`, content)
  }
  return {
    ...deps,
    stacks,
    workspace,
    create,
    make,
    definition,
    finish,
    describe: makeDescribeExperiment(deps),
    list: makeListExperiments(deps),
    run: makeRunExperiment(deps),
    compare: makeCompareExperiment(deps),
    prefer: makePreferVariant(deps),
    report: makeExportExperimentReport({ ...deps, targetName: async id => (id === 'm31' ? 'M 31' : null) })
  }
}

describe('making an experiment', () => {
  it('[PE-001] Given a stack and two variants, When made, Then its input is kept by size and SHA-256 and each variant gets its own TARGET and folder', async () => {
    const r = rig()
    const e = await r.make()
    expect(e).toMatchObject({ targetId: 'm31', number: 1, name: 'Stretch test', objective: 'Galaxy or broadband?', preferredVariantId: null, createdAt: r.clock.now() })
    expect(e.input).toEqual({ path: STACK, sizeBytes: 9, modifiedAt: new Date('2026-10-26T09:00:00Z'), sha256: 'sha:the stack' })
    expect(e.variants.map(v => [v.letter, v.parameters.profile, v.outputLabel, v.outputDir])).toEqual([
      ['A', 'galaxy', 'M31-exp1-A', 'D:/m31/processed/M31-exp1-A'],
      ['B', 'broadband', 'M31-exp1-B', 'D:/m31/processed/M31-exp1-B']
    ])
    expect((await r.make({ name: 'Again' })).number).toBe(2)
  })

  it('[PE-004] Given no name, bad variants, another file, no coordinates, no target or a stack gone from disk, When made, Then it is refused in words and nothing kept', async () => {
    const r = rig()
    expect(await r.create('m31', r.definition({ name: ' ', variants: [{ profile: 'galaxy', quality: 'normal' }], stackPath: 'D:/m31/other.fit' }))).toEqual({
      ok: false,
      problems: ['The experiment needs a name.', 'An experiment compares at least 2 variants.', 'That file is not one of this target’s stacks.']
    })
    expect(await r.create('nope', r.definition())).toEqual({ ok: false, problems: ['There is no such target.'] })
    const noCoords = rig({ coords: false })
    expect((await noCoords.create('m31', noCoords.definition())).ok).toBe(false)
    expect(await noCoords.create('m31', noCoords.definition())).toMatchObject({ problems: [expect.stringMatching(/^This target has no coordinates/)] })
    r.folder.files.delete(STACK)
    expect(await r.create('m31', r.definition())).toEqual({ ok: false, problems: ['The stack is no longer on disk.'] })
    expect(await r.store.list('m31')).toEqual([])
  })
})

describe('running an experiment', () => {
  it('[PE-002] Given an experiment, When run, Then one post-process job per variant runs its own TARGET, and the run records the program, arguments and tool versions', async () => {
    const r = rig()
    const e = await r.make()
    expect(await r.run(e.id, 'window')).toEqual({ ok: true, queued: ['A', 'B'] })
    const jobs = await r.jobs.list()
    expect(jobs.map(j => [j.kind, j.title, j.timing, j.spaceDir])).toEqual([
      ['post-process', 'Experiment Stretch test, variant A (galaxy, normal)', 'window', 'D:/m31'],
      ['post-process', 'Experiment Stretch test, variant B (broadband, strong)', 'window', 'D:/m31']
    ])
    expect(jobs[0].command.args).toEqual(expect.arrayContaining(['C:/Users/leigh/Siril_Scripts/v2/postprocess.sh', STACK, '--target=M31-exp1-A', '--profile=galaxy', '--quality=normal']))
    expect(jobs[1].command.args).toEqual(expect.arrayContaining(['--target=M31-exp1-B', '--profile=broadband', '--quality=strong']))
    const after = await r.store.get(e.id)
    expect(after?.variants[0].run).toEqual({
      jobId: jobs[0].id,
      outputLabel: 'M31-exp1-A',
      outputDir: 'D:/m31/processed/M31-exp1-A',
      program: 'C:/Program Files/Git/bin/bash.exe',
      args: jobs[0].command.args,
      cwd: 'D:/m31',
      tools: [
        { id: 'siril-scripts', version: null },
        { id: 'siril', version: '1.4.0' },
        { id: 'rc-astro', version: null }
      ],
      queuedAt: r.clock.now()
    })
    expect((await r.describe(e.id))?.variants.map(v => v.state)).toEqual(['queued', 'queued'])
  })

  it('[PE-003] Given one variant succeeded and one failed, When run again, Then only the failed one is queued and the success is never overwritten', async () => {
    const r = rig()
    const e = await r.make()
    await r.run(e.id, 'now')
    const [a, b] = await r.jobs.list()
    await r.finish(a.id, 'succeeded', { 'final.fit': 'A image' })
    await r.finish(b.id, 'failed')
    expect(await r.run(e.id, 'now')).toEqual({ ok: true, queued: ['B'] })
    await r.finish((await r.jobs.list())[2].id, 'succeeded', { 'final.fit': 'B image' })
    expect(await r.run(e.id, 'now')).toEqual({ ok: false, problems: ['Every variant has run or is running.'] })
  })

  it('[PE-003] Given a failed variant that left files, When run again, Then the retry writes to a folder of its own and only its files are recorded', async () => {
    const r = rig()
    const e = await r.make()
    await r.run(e.id, 'now')
    const [a, b] = await r.jobs.list()
    await r.finish(a.id, 'succeeded', { 'final.fit': 'A image' })
    await r.finish(b.id, 'failed', { 'final.fit': 'half an image' })
    await r.run(e.id, 'now')
    const retry = (await r.jobs.list())[2]
    expect(retry.command.args).toContain('--target=M31-exp1-B-r2')
    await r.finish(retry.id, 'succeeded')
    expect((await r.describe(e.id))?.variants[1]).toMatchObject({ outputsMissing: true, record: { outputs: null, run: { outputDir: 'D:/m31/processed/M31-exp1-B-r2' } } })
    r.folder.put('D:/m31/processed/M31-exp1-B-r2/final.fit', 'B image')
    expect((await r.describe(e.id))?.variants[1].record.outputs?.map(f => f.sha256)).toEqual(['sha:B image'])
  })

  it('[PE-003] Given a folder an older experiment left under the same name, When run, Then the variant writes beside it, not into it', async () => {
    const r = rig()
    r.folder.put('D:/m31/processed/M31-exp1-A/final.fit', 'from before a reset')
    const e = await r.make()
    await r.run(e.id, 'now')
    expect((await r.jobs.list()).map(j => j.command.args.find(x => x.startsWith('--target=')))).toEqual(['--target=M31-exp1-A-r2', '--target=M31-exp1-B'])
  })

  it('[PE-003] Given two run requests at once, When both are handled, Then each variant is queued once', async () => {
    const r = rig()
    const e = await r.make()
    const results = await Promise.all([r.run(e.id, 'now'), r.run(e.id, 'now')])
    expect(results).toEqual([{ ok: true, queued: ['A', 'B'] }, { ok: false, problems: ['Every variant has run or is running.'] }])
    expect(await r.jobs.list()).toHaveLength(2)
  })

  it('[PE-001] Given two experiments made at once on one target, When made, Then they are numbered apart', async () => {
    const r = rig()
    const made = await Promise.all([r.create('m31', r.definition()), r.create('m31', r.definition({ name: 'Second' }))])
    expect(made.map(m => (m.ok ? m.experiment.number : null))).toEqual([1, 2])
  })

  it('[PE-001] Given a variant that finished after the stack changed, When described, Then its files are not taken as the experiment\'s, and it cannot be compared or preferred', async () => {
    const r = rig()
    const e = await r.make()
    await r.run(e.id, 'now')
    const [a] = await r.jobs.list()
    r.folder.put(STACK, 'the stack, re-stacked')
    await r.finish(a.id, 'succeeded', { 'final.fit': 'A image' })
    const v = (await r.describe(e.id))?.variants[0]
    expect(v).toMatchObject({ state: 'succeeded', inputChanged: true, outputsMissing: false, record: { outputs: null } })
    expect((await r.compare(e.id))?.variants[0].image).toEqual({ path: null, error: 'It finished after the stack changed.' })
    expect(await r.prefer(e.id, v?.record.id ?? null)).toEqual({ ok: false, problems: ['That variant finished after the stack changed, so it is not part of this comparison.'] })
  })

  it('[PE-004] Given the stack changed or gone, When run, Then nothing is queued and it says why', async () => {
    const r = rig()
    const e = await r.make()
    r.folder.put(STACK, 'the stack, re-stacked')
    expect(await r.run(e.id, 'now')).toEqual({ ok: false, problems: [expect.stringMatching(/^The stack has changed since the experiment was made/)] })
    r.folder.put(STACK, 'the stacK')
    expect((await r.run(e.id, 'now')).ok).toBe(false)
    r.folder.files.delete(STACK)
    expect(await r.run(e.id, 'now')).toEqual({ ok: false, problems: ['The stack is no longer on disk.'] })
    expect(await r.run('nope', 'now')).toEqual({ ok: false, problems: ['There is no such experiment.'] })
    expect(await r.jobs.list()).toEqual([])
  })

  it('[PE-004] Given a missing processor, no coordinates or too little disk, When run, Then each refusal is said once and nothing is queued', async () => {
    const r = rig()
    const e = await r.make()
    r.tools.found.delete('siril')
    expect(await r.run(e.id, 'now')).toEqual({ ok: false, problems: ['Siril_Scripts needs siril, which the tool hub did not find.'] })
    r.tools.install('siril', 'C:/Program Files/Siril/bin/siril-cli.exe')
    const target = r.stacks.targets.get('m31')
    if (target) target.raHours = null
    expect(await r.run(e.id, 'now')).toMatchObject({ ok: false, problems: [expect.stringMatching(/no coordinates/)] })
    if (target) target.raHours = 0.712
    r.workspace.space = { freeBytes: null, usedBytes: 0 }
    expect(await r.run(e.id, 'now')).toEqual({ ok: false, problems: ["The stack's disk does not report its free space, so the runs could fill it."] })
    r.workspace.space = { freeBytes: GB, usedBytes: 0 }
    expect(await r.run(e.id, 'now')).toEqual({ ok: false, problems: ["The stack's disk is short of the space these 2 variants need."] })
    expect(await r.jobs.list()).toEqual([])
  })
})

describe('outputs, comparing and choosing', () => {
  async function ran() {
    const r = rig()
    const e = await r.make({ variants: [{ profile: 'galaxy', quality: 'normal' }, { profile: 'broadband', quality: 'strong' }, { profile: 'minimal', quality: 'light' }] })
    await r.run(e.id, 'now')
    const [a, b, c] = await r.jobs.list()
    await r.finish(a.id, 'succeeded', { 'M31_final.fit': 'A final', 'log.txt': 'ok' })
    await r.finish(b.id, 'succeeded', { 'M31_final.fit': 'B final' })
    await r.finish(c.id, 'failed')
    r.pixels.add('D:/m31/processed/M31-exp1-A/M31_final.fit', { width: 300, height: 200, colour: true, inspection: { star: { x: 1, y: 1, fwhm: 2.4, peak: 1, background: 0, profile: [] } } })
    r.pixels.failures.set('D:/m31/processed/M31-exp1-B/M31_final.fit', 'The file is not a FITS image.')
    return { r, e }
  }

  it('[PE-002] Given a variant succeeded, When described, Then the files it left are recorded once by SHA-256, and a success with no folder says so', async () => {
    const { r, e } = await ran()
    const d = await r.describe(e.id)
    expect(d?.variants.map(v => [v.record.letter, v.state, v.outputBytes, v.outputsMissing])).toEqual([
      ['A', 'succeeded', 9, false],
      ['B', 'succeeded', 7, false],
      ['C', 'failed', null, false]
    ])
    expect(d?.variants[0].record.outputs).toEqual([
      { path: 'D:/m31/processed/M31-exp1-A/M31_final.fit', name: 'M31_final.fit', sizeBytes: 7, sha256: 'sha:A final' },
      { path: 'D:/m31/processed/M31-exp1-A/log.txt', name: 'log.txt', sizeBytes: 2, sha256: 'sha:ok' }
    ])
    expect(d?.variants[0].job).toEqual({ exitCode: 0, startedAt: new Date('2026-10-26T02:00:00Z'), finishedAt: new Date('2026-10-26T02:20:00Z'), note: null })
    const hashed = r.folder.hashed.length
    r.folder.put('D:/m31/processed/M31-exp1-A/M31_final.fit', 'changed later')
    expect((await r.describe(e.id))?.variants[0].record.outputs?.[0].sha256).toBe('sha:A final')
    expect(r.folder.hashed.length).toBe(hashed)
    const lone = rig()
    const x = await lone.make()
    await lone.run(x.id, 'now')
    await lone.finish((await lone.jobs.list())[0].id, 'succeeded')
    expect((await lone.describe(x.id))?.variants[0]).toMatchObject({ state: 'succeeded', outputsMissing: true, outputBytes: null })
    expect(await r.describe('nope')).toBeNull()
    expect((await r.list('m31')).map(l => l.experiment.id)).toEqual([e.id])
  })

  it('[PE-005] Given succeeded variants, When compared, Then each final image comes with the same figures, a failed read says why, and the notes name no winner', async () => {
    const { r, e } = await ran()
    const c = await r.compare(e.id)
    expect(c?.variants.map(v => [v.letter, v.state, v.image === null ? null : 'metrics' in v.image ? v.image.name : v.image.error])).toEqual([
      ['A', 'succeeded', 'M31_final.fit'],
      ['B', 'succeeded', 'The file is not a FITS image.'],
      ['C', 'failed', null]
    ])
    const a = c?.variants[0].image
    expect(a && 'metrics' in a ? a.metrics.fwhm : null).toBe(2.4)
    expect(a && 'preview' in a ? a.preview.width : null).toBe(300)
    expect(c?.notes).toEqual([])
    r.pixels.failures.clear()
    r.pixels.add('D:/m31/processed/M31-exp1-B/M31_final.fit', { width: 300, height: 200, colour: true })
    expect((await r.compare(e.id))?.notes.at(-1)).toMatch(/^No one figure picks the best image/)
    expect(await r.compare('nope')).toBeNull()
  })

  it('[PE-005] Given a success that left no image or no folder, When compared, Then it says which', async () => {
    const r = rig()
    const e = await r.make()
    await r.run(e.id, 'now')
    const [a, b] = await r.jobs.list()
    await r.finish(a.id, 'succeeded', { 'log.txt': 'ok' })
    await r.finish(b.id, 'succeeded')
    expect((await r.compare(e.id))?.variants.map(v => v.image)).toEqual([
      { path: null, error: 'It left no FITS or PNG to compare.' },
      { path: null, error: 'Its output folder is not there.' }
    ])
  })

  it('[PE-006] Given succeeded variants, When one is preferred, Then only it is marked, the others stay, a failed or foreign one is refused, and the choice can be cleared', async () => {
    const { r, e } = await ran()
    const [, b, c] = (await r.store.get(e.id))?.variants ?? []
    expect(await r.prefer(e.id, b.id)).toMatchObject({ ok: true, experiment: { preferredVariantId: b.id } })
    expect((await r.compare(e.id))?.variants.map(v => v.preferred)).toEqual([false, true, false])
    expect(await r.prefer(e.id, c.id)).toEqual({ ok: false, problems: ['Only a variant that ran successfully can be preferred.'] })
    expect(await r.prefer(e.id, 'other')).toEqual({ ok: false, problems: ['That variant is not part of this experiment.'] })
    expect(await r.prefer('nope', null)).toEqual({ ok: false, problems: ['There is no such experiment.'] })
    expect(await r.prefer(e.id, null)).toMatchObject({ ok: true, experiment: { preferredVariantId: null } })
    expect((await r.describe(e.id))?.variants.filter(v => v.record.outputs).length).toBe(2)
  })

  it('[PE-007] Given a run experiment, When its report is exported, Then it names the file, checks the input again and holds each variant', async () => {
    const { r, e } = await ran()
    await r.prefer(e.id, (await r.store.get(e.id))?.variants[0].id ?? null)
    const md = await r.report(e.id, 'md')
    expect(md?.fileName).toBe('Stretch_test-experiment.md')
    expect(md?.text).toContain('Experiment on M 31')
    expect(md?.text).toContain('- unchanged since the experiment was made')
    expect(md?.text).toContain('## Variant A (preferred)')
    const json = JSON.parse((await r.report(e.id, 'json'))?.text ?? '{}')
    expect(json.variants.map((v: { state: string; exitCode: number | null }) => [v.state, v.exitCode])).toEqual([
      ['succeeded', 0],
      ['succeeded', 0],
      ['failed', 1]
    ])
    r.folder.put(STACK, 'a different stack')
    expect(JSON.parse((await r.report(e.id, 'json'))?.text ?? '{}').input.unchanged).toBe(false)
    r.folder.files.delete(STACK)
    expect(JSON.parse((await r.report(e.id, 'json'))?.text ?? '{}').input.unchanged).toBeNull()
    expect(await r.report('nope', 'md')).toBeNull()
    const other = rig()
    const x = await other.make()
    await other.store.create({ ...x, targetId: 'm42', number: 1, variants: x.variants })
    const m42 = (await other.store.list('m42'))[0]
    expect(JSON.parse((await other.report(m42.id, 'json'))?.text ?? '{}').target).toBe('m42')
  })
})
