import { describe, expect, it } from 'vitest'
import {
  JobRefusedError,
  makeEstimateSirilRun,
  makeJobScheduler,
  makePlanComet,
  makePlanForward,
  makePrepareSirilWorkspace,
  makeQueueStack,
  makeSetCometOrbit,
  WorkAreaOverlapsSourceError,
  type FrameSelection,
  type SirilWorkspaceResult
} from '@astro/application'
import { COMET_POSITIONS_FILE, type FrameIndexSettings } from '@astro/domain'
import {
  FakeEphemeris,
  FakeMachine,
  FakeProcessRunner,
  FakeToolHub,
  FixedClock,
  FixedJobSettings,
  InMemoryCometStore,
  InMemoryFrameCatalogue,
  InMemoryJobLogs,
  InMemoryJobStore,
  InMemoryPlanningSettings,
  InMemorySirilWorkspace,
  InMemoryStackCatalogue,
  InMemoryTargetPositions,
  subs,
  target
} from '@astro/testkit'

const GB = 1024 ** 3
const settings = (over: Partial<FrameIndexSettings> = {}): FrameIndexSettings => ({
  exposureSec: 300, gain: 100, sensorTempC: -10, filter: null, capturedAt: null, focalMm: 530, pixelUm: 3.76, scope: 'ZWO ASI2600MM Pro', ...over
})

describe('camera RAW in the stacking plan', () => {
  it('[RIG-004] Given DSLR lights in CR2 and CR3 with RAW darks, When the plan is made, Then they are counted as colour, the colour script is chosen and the RAW lights are summarised', async () => {
    const ws = new InMemorySirilWorkspace().addSource(
      '/data/M 31',
      { name: 'Lights/IMG_0001.CR2', imageType: 'Light' },
      { name: 'Lights/IMG_0002.CR2', imageType: 'Light' },
      { name: 'Lights/IMG_0003.CR3' },
      { name: 'Darks/IMG_0100.CR2', imageType: 'Dark' }
    )
    for (const n of ['IMG_0001.CR2', 'IMG_0002.CR2']) ws.describe(`/data/M 31/Lights/${n}`, { width: 5568, height: 3708, colour: true, settings: settings({ gain: 800, exposureSec: 120 }) })
    ws.describe('/data/M 31/Darks/IMG_0100.CR2', { width: 5568, height: 3708, colour: true, settings: settings({ gain: 800, exposureSec: 120 }) })
    const plan = await makeEstimateSirilRun({ workspace: ws })('/data/M 31', '/work/M 31')
    expect(plan.counts).toEqual({ lights: 3, darks: 1, flats: 0, biases: 0 })
    expect(plan.sensor).toBe('colour')
    expect(plan.recommended.script).toBe('OSC_Preprocessing_WithoutFlat')
    expect(plan.cameraRaw).toEqual({ count: 3, unread: 1, formats: ['CR2', 'CR3'] })
    expect(plan.filters).toBeNull()
    expect(plan.advice.calibration.find(c => c.kind === 'dark')?.status).toBe('matches')
  })

  it('[RIG-016] Given FITS lights only, When the plan is made, Then nothing about camera RAW or filters is added', async () => {
    const ws = new InMemorySirilWorkspace().addSource('/data/M 42', { name: 'Light_M 42_10.0s_1.fit' }, { name: 'Light_M 42_10.0s_2.fit' })
    const plan = await makeEstimateSirilRun({ workspace: ws })('/data/M 42', '/work/M 42')
    expect(plan.cameraRaw).toBeNull()
    expect(plan.filters).toBeNull()
  })
})

/** A mono camera's night: Ha, OIII and SII lights, flats for Ha and OIII only, shared darks and biases. */
function monoTarget() {
  const ws = new InMemorySirilWorkspace()
  const frames: { name: string; imageType: string; filter: string | null }[] = []
  for (let i = 1; i <= 4; i++) frames.push({ name: `Light_Ha_${i}.fits`, imageType: 'Light', filter: 'Ha' })
  for (let i = 1; i <= 3; i++) frames.push({ name: `Light_OIII_${i}.fits`, imageType: 'Light', filter: 'OIII' })
  for (let i = 1; i <= 2; i++) frames.push({ name: `Light_SII_${i}.fits`, imageType: 'Light', filter: 'SII' })
  frames.push({ name: 'Light_nofilter.fits', imageType: 'Light', filter: null })
  for (let i = 1; i <= 2; i++) frames.push({ name: `flats/Flat_Ha_${i}.fits`, imageType: 'Flat', filter: 'Ha' })
  frames.push({ name: 'flats/Flat_OIII_1.fits', imageType: 'Flat', filter: 'OIII' })
  frames.push({ name: 'flats/Flat_none.fits', imageType: 'Flat', filter: null })
  frames.push({ name: 'darks/Dark_1.fits', imageType: 'Dark', filter: null })
  frames.push({ name: 'biases/Bias_1.fits', imageType: 'Bias', filter: null })
  ws.addSource('/data/NGC 6888', ...frames)
  for (const f of frames) ws.describe(`/data/NGC 6888/${f.name}`, { width: 6248, height: 4176, colour: false, sizeBytes: 52_000_000, settings: settings({ filter: f.filter }) })
  ws.space = { freeBytes: 500 * GB, usedBytes: 0 }
  return ws
}

describe('mono cameras with filters', () => {
  it('[RIG-006] [RIG-008] Given mono lights in three filters, When the plan is made, Then each filter is its own stack with its own flats and the shared calibration', async () => {
    const ws = monoTarget()
    ws.results.set('/work/NGC 6888/filters/Ha', [{ path: '/work/NGC 6888/filters/Ha/result_1200s.fit', sizeBytes: 100, modifiedAt: new Date('2026-10-01T03:00:00Z') }])
    const plan = await makeEstimateSirilRun({ workspace: ws })('/data/NGC 6888', '/work/NGC 6888')
    expect(plan.sensor).toBe('mono')
    const f = plan.filters
    expect(f).toMatchObject({ darks: 1, biases: 1, unfilteredLights: 1, unfilteredFlats: 1, flatsMissing: ['SII'] })
    expect(f?.stacks.map(s => [s.filter, s.workDir, s.counts])).toEqual([
      ['Ha', '/work/NGC 6888/filters/Ha', { lights: 4, darks: 1, flats: 2, biases: 1 }],
      ['OIII', '/work/NGC 6888/filters/OIII', { lights: 3, darks: 1, flats: 1, biases: 1 }],
      ['SII', '/work/NGC 6888/filters/SII', { lights: 2, darks: 1, flats: 0, biases: 1 }]
    ])
    expect(f?.stacks.map(s => s.script?.script)).toEqual(['Mono_Preprocessing', 'Mono_Preprocessing', 'Mono_Preprocessing'])
    expect(f?.stacks[2].script?.missing).toEqual(['flats'])
    expect(f?.stacks[0].script?.fits).toBe(true)
  })

  it('[RIG-007] Given a finished Ha stack, When the plan is made, Then the newest result in Ha\'s work folder is its channel master and the others have none', async () => {
    const ws = monoTarget()
    ws.results.set('/work/NGC 6888/filters/Ha', [
      { path: '/work/NGC 6888/filters/Ha/result_600s.fit', sizeBytes: 100, modifiedAt: new Date('2026-09-01T03:00:00Z') },
      { path: '/work/NGC 6888/filters/Ha/result_1200s.fit', sizeBytes: 100, modifiedAt: new Date('2026-10-01T03:00:00Z') }
    ])
    const plan = await makeEstimateSirilRun({ workspace: ws })('/data/NGC 6888', '/work/NGC 6888')
    expect(plan.filters?.stacks.map(s => s.master?.path ?? null)).toEqual(['/work/NGC 6888/filters/Ha/result_1200s.fit', null, null])
  })

  it('[RIG-009] Given one filter, When its stack is estimated and laid out, Then only its lights and flats go, with every dark and bias, in its own folder', async () => {
    const ws = monoTarget()
    const one = await makeEstimateSirilRun({ workspace: ws })('/data/NGC 6888', '/work/NGC 6888/filters/OIII', { filter: 'OIII' })
    expect(one.counts).toEqual({ lights: 3, darks: 1, flats: 1, biases: 1 })
    expect(one.filters).toBeNull()
    const prep = await makePrepareSirilWorkspace({ workspace: ws })('/data/NGC 6888', '/work/NGC 6888/filters/OIII', [], { filter: 'OIII' })
    expect(prep.byFolder).toEqual({ lights: 3, darks: 1, flats: 1, biases: 1 })
    expect([...ws.placed.keys()].sort()).toEqual([
      '/work/NGC 6888/filters/OIII/biases/Bias_1.fits',
      '/work/NGC 6888/filters/OIII/darks/Dark_1.fits',
      '/work/NGC 6888/filters/OIII/flats/Flat_OIII_1.fits',
      '/work/NGC 6888/filters/OIII/lights/Light_OIII_1.fits',
      '/work/NGC 6888/filters/OIII/lights/Light_OIII_2.fits',
      '/work/NGC 6888/filters/OIII/lights/Light_OIII_3.fits'
    ])
  })

  const queueSetup = () => {
    const ws = monoTarget()
    const store = new InMemoryJobStore()
    const queue = makeQueueStack({
      estimate: makeEstimateSirilRun({ workspace: ws }),
      tools: new FakeToolHub().installAll(),
      stacks: new InMemoryStackCatalogue().addTarget('ngc6888', { name: 'NGC 6888' }),
      store,
      clock: new FixedClock(new Date(2026, 8, 29, 20))
    })
    return { queue, store }
  }
  const base = { targetId: 'ngc6888', sourceDir: '/data/NGC 6888', workDir: '/work/NGC 6888', script: 'Mono_Preprocessing' as const, timing: 'window' as const }

  it('[RIG-009] Given a filter\'s stack is queued, When the job is made, Then Siril runs the mono script in that filter\'s work folder and its frames are laid out by filter', async () => {
    const { queue } = queueSetup()
    const job = await queue({ ...base, filter: 'Ha' })
    expect(job.title).toBe('Stack NGC 6888 (Ha) with Mono_Preprocessing')
    expect(job.prepare).toEqual({ sourceDir: '/data/NGC 6888', workDir: '/work/NGC 6888/filters/Ha', filter: 'Ha' })
    expect(job.spaceDir).toBe('/work/NGC 6888/filters/Ha')
    expect(job.command.args).toEqual(['-d', '/work/NGC 6888/filters/Ha', '-s', 'C:/Program Files/Siril/share/siril/scripts/Mono_Preprocessing.ssf'])
  })

  it('[RIG-009] Given filters "S II" and "S.II" whose names make one folder name, When each is queued, Then each runs in the folder its plan gave it, never the same one', async () => {
    const ws = new InMemorySirilWorkspace()
    const frames: { name: string; imageType: string; filter: string | null }[] = ['S II', 'S.II'].flatMap((filter, n) => [
      { name: `Light_${n}_1.fits`, imageType: 'Light', filter },
      { name: `flats/Flat_${n}_1.fits`, imageType: 'Flat', filter }
    ])
    frames.push({ name: 'darks/Dark_1.fits', imageType: 'Dark', filter: null }, { name: 'biases/Bias_1.fits', imageType: 'Bias', filter: null })
    ws.addSource('/data/Sh2', ...frames)
    for (const f of frames) ws.describe(`/data/Sh2/${f.name}`, { width: 100, height: 100, colour: false, sizeBytes: 1000, settings: settings({ filter: f.filter }) })
    ws.space = { freeBytes: 500 * GB, usedBytes: 0 }
    const estimate = makeEstimateSirilRun({ workspace: ws })
    const queue = makeQueueStack({ estimate, tools: new FakeToolHub().installAll(), stacks: new InMemoryStackCatalogue().addTarget('sh2', { name: 'Sh2' }), store: new InMemoryJobStore(), clock: new FixedClock(new Date(2026, 8, 29, 20)) })
    const plan = await estimate('/data/Sh2', '/work/Sh2')
    const request = { ...base, targetId: 'sh2', sourceDir: '/data/Sh2', workDir: '/work/Sh2' }
    const jobs = [await queue({ ...request, filter: 'S II' }), await queue({ ...request, filter: 'S.II' })]
    expect(jobs.map(j => j.prepare?.workDir)).toEqual(['S II', 'S.II'].map(f => plan.filters?.stacks.find(s => s.filter === f)?.workDir))
    expect(new Set(jobs.map(j => j.prepare?.workDir)).size).toBe(2)
  })

  it('[RIG-018] Given mono lights in several filters, When one stack of them all is queued, Then it is refused; a filter with no flats or no lights is refused too', async () => {
    const { queue, store } = queueSetup()
    await expect(queue(base)).rejects.toThrow(JobRefusedError)
    await expect(queue(base)).rejects.toThrow('Queue each filter')
    await expect(queue({ ...base, filter: 'SII' })).rejects.toThrow('needs flats')
    await expect(queue({ ...base, filter: 'Lum' })).rejects.toThrow('have no Lum lights')
    expect(await store.list()).toEqual([])
  })

  it('[RIG-009] Given a queued filter stack, When the runner starts it, Then it lays out that filter alone', async () => {
    const store = new InMemoryJobStore()
    const prepared: unknown[] = []
    const clock = new FixedClock(new Date(2026, 8, 30, 2, 30))
    const runnerOf = new FakeProcessRunner()
    const scheduler = makeJobScheduler({
      store,
      settings: new FixedJobSettings(),
      machine: new FakeMachine(),
      runner: runnerOf,
      logs: new InMemoryJobLogs(),
      workspace: { workAreaSpace: async () => ({ freeBytes: 100 * GB, usedBytes: 0 }) },
      prepare: async (sourceDir, workDir, _dirs, options): Promise<SirilWorkspaceResult> => {
        prepared.push({ sourceDir, workDir, options })
        return { workDir, linked: 1, copied: 0, existing: 0, rejected: 0, pruned: 0, byFolder: { lights: 1, darks: 0, flats: 0, biases: 0 }, placements: [], rejectedPaths: [] }
      },
      readOnlyDirs: () => [],
      clock
    })
    await store.add(
      { kind: 'stack', targetId: 't', title: 'Stack (Ha)', timing: 'now', command: { program: 'siril-cli', args: [], cwd: '/w/filters/Ha' }, prepare: { sourceDir: '/d', workDir: '/w/filters/Ha', filter: 'Ha' }, spaceDir: '/w/filters/Ha', neededBytes: 1 },
      clock.now()
    )
    const runner = runnerOf
    await scheduler.tick()
    for (let i = 0; i < 20 && runner.runs.length === 0; i++) await new Promise(resolve => setImmediate(resolve))
    runner.last?.exit(0)
    await scheduler.idle()
    expect(prepared).toEqual([{ sourceDir: '/d', workDir: '/w/filters/Ha', options: { filter: 'Ha' } }])
  })
})

describe('the filter to shoot tonight', () => {
  it('[RIG-010] Given a filter-wheel target and a dark night, When tonight is planned, Then its choice names the broadband filter that lags; a one-shot-colour target names none', async () => {
    const frames = new InMemoryFrameCatalogue()
      .add(target('M 101', { subs: [...subs(60, 300, '2026-04-01T21:00:00Z', { filter: 'L' }), ...subs(30, 300, '2026-04-02T21:00:00Z', { filter: 'R' }), ...subs(30, 300, '2026-04-03T21:00:00Z', { filter: 'G' }), ...subs(4, 300, '2026-04-04T21:00:00Z', { filter: 'B' })] }))
      .add(target('M 31', { subs: subs(12, 300, '2026-09-20T21:00:00Z', { filter: 'IRCUT' }) }))
    const positions = new InMemoryTargetPositions()
      .add({ targetId: 'target-m-101', raHours: 14.05, decDeg: 54.35, objectType: 'galaxy' })
      .add({ targetId: 'target-m-31', raHours: 0.71, decDeg: 41.27, objectType: 'galaxy' })
    const plan = await makePlanForward({
      frames,
      positions,
      settings: new InMemoryPlanningSettings({ latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 20 }),
      ephemeris: new FakeEphemeris(),
      clock: new FixedClock(new Date('2026-06-01T15:00:00Z'))
    })({ scope: 'tonight' })
    if (plan.status !== 'ok') throw new Error('expected a plan')
    const m101 = plan.tonight?.choices.find(c => c.targetName === 'M 101')
    expect(m101?.filter).toMatchObject({ filter: 'B', family: 'broadband', brightMoon: false })
    expect(plan.tonight?.choices.find(c => c.targetName === 'M 31')?.filter ?? null).toBeNull()
  })
})

const ENCKE_LINE = '0002P         1990 10 28.54502  0.330886  0.850220  186.23352  334.75006   11.94524  19901006   9.8  6.0  2P/Encke'

function cometSetup(objectType: string | null = 'comet') {
  const ws = new InMemorySirilWorkspace().addSource(
    '/data/2P',
    { name: 'Light_001.fit' },
    { name: 'Light_002.fit' },
    { name: 'Light_003.fit' },
    { name: 'Light_undated.fit' },
    { name: 'darks/Dark_001.fit', imageType: 'Dark' }
  )
  for (let i = 1; i <= 3; i++) ws.describe(`/data/2P/Light_00${i}.fit`, { settings: settings({ exposureSec: 120, capturedAt: new Date(Date.UTC(1990, 9, 6, 1 + i)) }) })
  const comets = new InMemoryCometStore()
  const sky = new InMemoryPlanningSettings(null)
  const plan = makePlanComet({
    comets,
    workspace: ws,
    ephemeris: new FakeEphemeris(),
    settings: sky,
    targets: new InMemoryStackCatalogue().addTarget('2p', { name: '2P/Encke', objectType }).addTarget('m42', { name: 'M 42', objectType: 'emission_nebula' })
  })
  return { ws, comets, plan, setOrbit: makeSetCometOrbit({ comets }), sky }
}

describe('comets', () => {
  it('[RIG-011] Given a comet target, When its MPC line is saved, Then the orbit is kept with it; null unmarks it', async () => {
    const { comets, setOrbit } = cometSetup()
    const saved = await setOrbit('2p', ENCKE_LINE)
    expect(saved.ok).toBe(true)
    expect(await comets.get('2p')).toMatchObject({ name: '2P/Encke', q: 0.330886, e: 0.85022, epoch: '1990-10-06' })
    expect(await setOrbit('2p', null)).toEqual({ ok: true, orbit: null })
    expect(await comets.get('2p')).toBeNull()
  })

  it('[RIG-012] Given an orbit, When a line that does not read is saved, Then it says why and the orbit stays', async () => {
    const { comets, setOrbit } = cometSetup()
    await setOrbit('2p', ENCKE_LINE)
    const bad = await setOrbit('2p', 'not an orbit')
    expect(bad.ok).toBe(false)
    expect(bad.ok ? '' : bad.error).toContain('MPC comet line')
    expect((await comets.get('2p'))?.name).toBe('2P/Encke')
  })

  it('[RIG-016] Given a target that is not a comet and has no orbit, When its comet plan is asked for, Then there is nothing to show', async () => {
    const { plan } = cometSetup()
    expect(await plan('m42', '/data/2P', '/work/2P')).toEqual({ status: 'not-comet' })
  })

  it('[RIG-013] [RIG-015] Given a comet with dated and undated lights, When planned, Then each dated light has a mid-exposure position in time order and the undated one is counted', async () => {
    const { plan, setOrbit, ws } = cometSetup()
    expect(await plan('2p', '/data/2P', '/work/2P')).toMatchObject({ status: 'comet', orbit: null, positions: [], file: '/work/2P/comet_positions.csv' })
    await setOrbit('2p', ENCKE_LINE)
    const p = await plan('2p', '/data/2P', '/work/2P')
    if (p.status !== 'comet') throw new Error('expected a comet')
    expect(p.positions.map(x => [x.frame, x.at.toISOString()])).toEqual([
      ['Light_001.fit', '1990-10-06T02:01:00.000Z'],
      ['Light_002.fit', '1990-10-06T03:01:00.000Z'],
      ['Light_003.fit', '1990-10-06T04:01:00.000Z']
    ])
    expect(p.undated).toBe(1)
    expect(p.fromSite).toBe(false)
    // Meeus' example 33.a puts Encke at 10h34m14s +19°09′31″ at 0h TT; the fake Earth is good to about an arc minute.
    expect(p.positions[0].raDeg).toBeCloseTo(158.56, 0)
    expect(p.positions[0].decDeg).toBeCloseTo(19.16, 0)
    expect(p.motion?.spanHours).toBe(2)
    expect(p.motion?.arcsecPerHour).toBeGreaterThan(100)
    expect(p.written).toBe(false)
    expect(ws.written.size).toBe(0)
  })

  it('[RIG-014] [NFR-020] Given a comet with positions, When the file is asked for, Then it is written into the work folder only, and never when the work folder overlaps the source', async () => {
    const { plan, setOrbit, ws, sky } = cometSetup()
    await setOrbit('2p', ENCKE_LINE)
    sky.setSite({ latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 20 })
    const p = await plan('2p', '/data/2P', '/work/2P', { write: true })
    expect(p.status === 'comet' && p.written && p.fromSite).toBe(true)
    const csv = ws.written.get(`/work/2P/${COMET_POSITIONS_FILE}`) ?? ''
    expect(csv.split('\n')[0]).toBe('frame,date_utc,ra_deg,dec_deg')
    expect(csv.trim().split('\n')).toHaveLength(4)
    await expect(plan('2p', '/data/2P', '/data/2P/work', { write: true })).rejects.toThrow(WorkAreaOverlapsSourceError)
    expect([...ws.written.keys()]).toEqual([`/work/2P/${COMET_POSITIONS_FILE}`])
  })

  it('[RIG-013] Given grading rejected a light, When the comet is planned, Then that light gets no position', async () => {
    const { ws, comets } = cometSetup()
    await makeSetCometOrbit({ comets })('2p', ENCKE_LINE)
    const selection = { rejected: async () => new Set(['/data/2P/Light_002.fit']), reportFor: async () => ({ grades: [] }) } as unknown as FrameSelection
    const plan = makePlanComet({ comets, workspace: ws, selection, ephemeris: new FakeEphemeris(), settings: new InMemoryPlanningSettings(null), targets: new InMemoryStackCatalogue().addTarget('2p', { name: '2P', objectType: null }) })
    const p = await plan('2p', '/data/2P', null, { write: true })
    expect(p.status === 'comet' && p.positions.map(x => x.frame)).toEqual(['Light_001.fit', 'Light_003.fit'])
    expect(p.status === 'comet' && p.written).toBe(false)
  })
})
