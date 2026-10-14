import { describe, expect, it } from 'vitest'
import { MANIFEST_FILE, TRANSFER_FILE, type IngestTarget, type TransferJob, type TransferManifest } from '@astro/domain'
import {
  makeIdentifyTarget,
  makePlanVesperaTransfer,
  makeRunVesperaTransfer,
  makeScanVespera,
  makeVesperaCopyQueue,
  ScopeLayoutError,
  type PlanRequest,
  type PlanResult,
  type RunOptions
} from '../src'
import { FakeVesperaMetadata, FakeVesperaScope, FixedClock, InMemoryIngestDisk, InMemoryVesperaTransferStore, LEIGH_USER_LISTING, seedVesperaSession, vesperaImageRun } from '@astro/testkit'

const ID = '2024-06-15_21-00-54_observation_NGC3372'
const clock = new FixedClock(new Date('2026-10-14T19:00:00Z'))

function world(opts: { frames?: number; stacked?: number[]; fitsBytes?: number } = {}) {
  const scope = new FakeVesperaScope().dir('system')
  seedVesperaSession(scope, ID, { '01-pointing-initial': { 'p.jpg': 3 }, '02-images-initial': vesperaImageRun(opts.frames ?? 3, opts.stacked ?? [1, 2, 3], { fitsBytes: opts.fitsBytes ?? 10, tiff: 3 }) }, { observationJson: '{"target":"NGC 3372"}' })
  const disk = new InMemoryIngestDisk()
  const store = new InMemoryVesperaTransferStore()
  const scan = makeScanVespera({ scope, clock })
  const identify = makeIdentifyTarget({ scope, metadata: new FakeVesperaMetadata() })
  const plan = makePlanVesperaTransfer({ disk, store, clock })
  const run = makeRunVesperaTransfer({ scope, disk, hasher: disk, store, clock })
  return { scope, disk, store, scan, identify, plan, run }
}

const target: IngestTarget = { name: 'NGC 3372', catalogue: 'NGC', confidence: 'folder', evidence: ['folder: NGC3372'], review: false }

async function planned(w: ReturnType<typeof world>, extra: Partial<PlanRequest> = {}): Promise<TransferJob> {
  const { userFolder, sessions } = await w.scan()
  const s = sessions.find(x => x.session.id === ID)!
  const r = await w.plan({ session: s.session, userFolder, target, findings: s.inventory.findings, destinationRoot: '/repo', include: ['fits'], ...extra })
  if (r.status !== 'planned') throw new Error(r.status)
  return r.job
}

describe('Scanning a Vespera', () => {
  it('[VIN-001, VIN-006] Given Leigh\'s scope, When scanned, Then one session per folder other than expert-mode, newest first, from listings alone', async () => {
    const scope = new FakeVesperaScope().dir('system')
    for (const name of LEIGH_USER_LISTING) scope.dir(`user/${name}`)
    const progress: string[] = []
    const scan = await makeScanVespera({ scope, clock })(p => progress.push(`${p.listed}/${p.of}`))
    expect(scan.userFolder).toBe('user')
    expect(scan.expertMode).toBe(true)
    expect(scan.sessions).toHaveLength(17)
    expect(scan.sessions[0].session.id).toBe('2024-07-16_20-40-47_observation_moon')
    expect(scan.sessions.at(-1)!.session.id).toBe('2024-06-15_21-00-54_observation_NGC3372')
    expect(scan.sessions.filter(s => s.session.kind === 'auto-init')).toHaveLength(3)
    expect(scan.sessions.find(s => s.session.id.endsWith('M8_M20_10_18'))!.session.rawLabel).toBe('M8_M20_10_18')
    expect(progress[0]).toBe('0/17')
    expect(progress.at(-1)).toBe('17/17')
    expect(scope.commands.every(c => c.startsWith('LIST '))).toBe(true)
    expect(scope.commands).not.toContain('LIST system')
  })

  it('[VIN-006] Given a session with runs, When scanned, Then nothing is read and every run is listed once', async () => {
    const w = world()
    const scan = await w.scan()
    expect(w.scope.commands).toEqual(['LIST ', 'LIST user', `LIST user/${ID}`, `LIST user/${ID}/01-pointing-initial`, `LIST user/${ID}/02-images-initial`])
    expect(scan.sessions[0].inventory.totals).toEqual({ fits: 3, tiff: 1, jpeg: 4, json: 8, other: 0 })
    expect(scan.sessions[0].session.listedAt).toEqual(clock.now())
    expect(scan.expertMode).toBe(false)
  })

  it('[VIN-001] Given a scope with no user folder, When scanned, Then the scan fails with ScopeLayoutError', async () => {
    await expect(makeScanVespera({ scope: new FakeVesperaScope().dir('system'), clock })()).rejects.toBeInstanceOf(ScopeLayoutError)
  })

  it('[VIN-001] Given the folder is USER, When scanned, Then it is found and used', async () => {
    const scope = new FakeVesperaScope()
    seedVesperaSession(scope, ID, {}, { userFolder: 'USER' })
    const scan = await makeScanVespera({ scope, clock })()
    expect(scan.userFolder).toBe('USER')
    expect(scan.sessions.map(s => s.session.id)).toEqual([ID])
  })
})

describe('Identifying a target', () => {
  const sessionOf = async (scope: FakeVesperaScope, id: string) => (await makeScanVespera({ scope, clock })()).sessions.find(s => s.session.id === id)!.session

  it('[VIN-010] Given a labelled folder, When identified, Then the label names it and nothing is read', async () => {
    const w = world()
    const s = await sessionOf(w.scope, ID)
    w.scope.commands.length = 0
    const r = await w.identify(s, 'user')
    expect(r.target).toMatchObject({ name: 'NGC 3372', confidence: 'folder' })
    expect(w.scope.commands).toEqual([])
  })

  it('[VIN-013] Given a label and an observation.json that disagree, When cross-checked, Then the label wins and TARGET_MISMATCH warns', async () => {
    const scope = new FakeVesperaScope()
    seedVesperaSession(scope, '2024-06-15_21-00-54_observation_M31', { '01-images-initial': vesperaImageRun(1, [1]) }, { observationJson: '{"target":"M 32"}' })
    const s = await sessionOf(scope, '2024-06-15_21-00-54_observation_M31')
    const identify = makeIdentifyTarget({ scope, metadata: new FakeVesperaMetadata() })
    expect((await identify(s, 'user', { crossCheck: true })).findings.map(f => f.code)).toEqual(['TARGET_MISMATCH'])
    expect((await identify(s, 'user')).findings).toEqual([])
  })

  it('[VIN-010] Given no label, When identified, Then observation.json names it', async () => {
    const scope = new FakeVesperaScope()
    seedVesperaSession(scope, '2024-06-15_21-52-17_auto-init', { '01-images-initial': vesperaImageRun(1, [1]) }, { observationJson: '{"objectName":"Jellyfish Nebula"}' })
    const s = await sessionOf(scope, '2024-06-15_21-52-17_auto-init')
    const r = await makeIdentifyTarget({ scope, metadata: new FakeVesperaMetadata() })(s, 'user')
    expect(r.target).toMatchObject({ name: 'IC 443', confidence: 'observation-json' })
  })

  it('[VIN-010] Given no label and no observation.json, When identified, Then the last stacked JPEG of the last image run is read', async () => {
    const scope = new FakeVesperaScope()
    const id = '01-observation-eagle-15-15'
    seedVesperaSession(scope, id, { '02-images-initial': { 'img-0001.fits': 4, 'img-0001-output.jpg': 'EXIF:M 8' }, '04-images-adjust-framing': { 'img-0001.fits': 4, 'img-0002-output.jpg': 'EXIF:M 16, 12 frames', 'img-0001-output.jpg': 'EXIF:M 20' } })
    const s = await sessionOf(scope, id)
    scope.commands.length = 0
    const r = await makeIdentifyTarget({ scope, metadata: new FakeVesperaMetadata() })(s, 'user')
    expect(r.target).toMatchObject({ name: 'M 16', confidence: 'exif' })
    expect(scope.commands).toEqual([`RETR user/${id}/04-images-adjust-framing/img-0002-output.jpg (first 131072 bytes)`])
  })

  it('[VIN-011] Given nothing but FITS, When identified, Then the first frame\'s OBJECT names it', async () => {
    const scope = new FakeVesperaScope()
    const id = '01-observation-x'
    seedVesperaSession(scope, id, { '01-pointing-initial': { 'p.jpg': 'EXIF:' }, '02-images-initial': { 'img-0002.fits': 'OBJECT:NGC 9', 'img-0001.fits': 'OBJECT:IC443' } }, { observationJson: '{"other":1}' })
    const s = await sessionOf(scope, id)
    const r = await makeIdentifyTarget({ scope, metadata: new FakeVesperaMetadata() })(s, 'user')
    expect(r.target).toMatchObject({ name: 'IC 443', confidence: 'fits-header' })
  })

  it('[VIN-011] Given no clue names a target, When identified, Then the target is unknown', async () => {
    const scope = new FakeVesperaScope()
    const id = '01-observation-x'
    seedVesperaSession(scope, id, { '02-images-initial': { 'img-0001.fits': 'SIMPLE', 'img-0001-output.jpg': 'JPEG' } })
    const s = await sessionOf(scope, id)
    const r = await makeIdentifyTarget({ scope, metadata: new FakeVesperaMetadata() })(s, 'user')
    expect(r.target.confidence).toBe('unknown')
  })
})

describe('Planning a transfer', () => {
  it('[VIN-016] Given a session, When Transfer is pressed, Then it goes in its target\'s folder, named from target, date and counts, and the job is recorded before any byte', async () => {
    const w = world()
    const job = await planned(w)
    expect(job.destinationFolder).toBe('NGC3372_2024-06-15_FIT=3')
    expect(job.targetFolder).toBe('NGC3372')
    expect(job.id).toBe('/repo/NGC3372/NGC3372_2024-06-15_FIT=3')
    expect(job).toMatchObject({ state: 'planned', destinationRoot: '/repo', include: ['fits'], committed: [], copiedBytes: 0, totalBytes: 30, sessionPath: `user/${ID}`, startedAt: '2024-06-15T21:00:54', reason: null })
    expect(await w.store.get(job.id)).toEqual(job)
    expect(JSON.parse((await w.disk.readText(`/repo/NGC3372/NGC3372_2024-06-15_FIT=3/${TRANSFER_FILE}`))!)).toEqual(job)
    expect(w.disk.writes).toEqual([`/repo/NGC3372/NGC3372_2024-06-15_FIT=3/${TRANSFER_FILE}`])
    expect(w.scope.commands.some(c => c.startsWith('RETR'))).toBe(false)
  })

  it('[VIN-016] Given more kinds chosen, When planned, Then each has its token, in order', async () => {
    const job = await planned(world(), { include: ['json', 'tiff', 'fits'] })
    expect(job.destinationFolder).toBe('NGC3372_2024-06-15_FIT=3_TIF=1_JSON=8')
    expect(job.include).toEqual(['fits', 'tiff', 'json'])
  })

  it('[VIN-015] Given an error finding, an unknown target, no kinds or no date, When planned, Then it is refused and nothing is written', async () => {
    const w = world()
    const { sessions } = await w.scan()
    const s = sessions[0]
    const base = { session: s.session, userFolder: 'user', target, findings: [], destinationRoot: '/repo', include: ['fits' as const] }
    expect(await w.plan({ ...base, findings: [{ level: 'error', code: 'FITS_LT_JPEG', message: '' }] })).toEqual({ status: 'blocked', reason: 'The session has an error finding; look at it first.' })
    expect(await w.plan({ ...base, target: { ...target, confidence: 'unknown' } })).toEqual({ status: 'blocked', reason: 'Name the target first.' })
    expect(await w.plan({ ...base, include: [] })).toEqual({ status: 'blocked', reason: 'Choose at least one kind of file to copy.' })
    expect(await w.plan({ ...base, session: { ...s.session, startedAt: null } })).toEqual({ status: 'blocked', reason: 'The session has no date to name its folder by.' })
    expect(w.disk.writes).toEqual([])
  })

  it('[VIN-018] Given the folder holds this session, When planned again, Then resume is offered with the saved job', async () => {
    const w = world()
    const first = await planned(w)
    const { sessions } = await w.scan()
    const again = await w.plan({ session: sessions[0].session, userFolder: 'user', target, findings: [], destinationRoot: '/repo', include: ['fits' as const] })
    expect(again).toEqual({ status: 'resume', job: first })
    w.store.jobs.clear()
    const fromFolder = await w.plan({ session: sessions[0].session, userFolder: 'user', target, findings: [], destinationRoot: '/repo', include: ['fits' as const] })
    expect(fromFolder).toEqual({ status: 'resume', job: first })
  })

  it('[VIN-018] Given the folder holds another session or something else, When planned, Then it is refused with DEST_EXISTS, or the next suffix is taken when asked', async () => {
    const w = world()
    await w.disk.writeText(`/repo/NGC3372/NGC3372_2024-06-15_FIT=3/${MANIFEST_FILE}`, JSON.stringify({ sessionId: 'another' }))
    await w.disk.writeText('/repo/NGC3372/NGC3372_2024-06-15_FIT=3_2/notes.txt', 'mine')
    const { sessions } = await w.scan()
    const req = { session: sessions[0].session, userFolder: 'user', target, findings: [], destinationRoot: '/repo', include: ['fits' as const] }
    const refused = await w.plan(req)
    expect(refused).toMatchObject({ status: 'refused', folder: 'NGC3372_2024-06-15_FIT=3', finding: { level: 'error', code: 'DEST_EXISTS' } })
    expect(refused.status === 'refused' && refused.finding.message).toBe('NGC3372_2024-06-15_FIT=3 already exists in /repo/NGC3372 and holds another session (another). Nothing was copied into it.')
    const dup = await w.plan({ ...req, allowDuplicate: true })
    expect(dup.status === 'planned' && dup.job.destinationFolder).toBe('NGC3372_2024-06-15_FIT=3_3')
  })

  it('[VIN-018] Given a folder astrorepo did not make, When planned, Then it is refused, saying so', async () => {
    const w = world()
    await w.disk.writeText('/repo/NGC3372/NGC3372_2024-06-15_FIT=3/x.fits', 'x')
    const { sessions } = await w.scan()
    const r = await w.plan({ session: sessions[0].session, userFolder: 'user', target, findings: [], destinationRoot: '/repo', include: ['fits' as const] })
    expect(r.status === 'refused' && r.finding.message).toContain('holds something astrorepo did not copy')
  })

  it('[VIN-018] Given this session\'s folder with an unreadable record, When planned, Then it is refused rather than guessed', async () => {
    const w = world()
    await w.disk.writeText(`/repo/NGC3372/NGC3372_2024-06-15_FIT=3/${TRANSFER_FILE}`, JSON.stringify({ sessionId: ID }))
    const { sessions } = await w.scan()
    const r = await w.plan({ session: sessions[0].session, userFolder: 'user', target, findings: [], destinationRoot: '/repo', include: ['fits' as const] })
    expect(r.status === 'refused' && r.finding.message).toContain('holds an unreadable copy of this session')
  })
})

describe('Running a transfer', () => {
  const bytesOf = (w: ReturnType<typeof world>, p: string) => w.disk.files.get(p)!.length

  it('[VIN-019, VIN-020, VIN-026] Given a planned job, When run, Then each file lands in its run folder via .part, is hashed, and the manifest is written', async () => {
    const w = world()
    const job = await planned(w, { include: ['fits', 'tiff'] })
    const seen: string[] = []
    const done = await w.run(job, { onProgress: p => p.current && seen.push(p.current) })
    expect(done.state).toBe('done')
    expect(seen).toEqual(['02-images-initial/img-0001.fits', '02-images-initial/img-0002.fits', '02-images-initial/img-0003.fits', '02-images-initial/img-0003.tif'])
    expect(done.committed).toEqual(seen)
    expect(done.copiedBytes).toBe(78)
    expect(bytesOf(w, '/repo/NGC3372/NGC3372_2024-06-15_FIT=3_TIF=1/02-images-initial/img-0001.fits')).toBe(10)
    expect([...w.disk.files.keys()].some(k => k.endsWith('.part'))).toBe(false)
    expect(w.disk.writes.filter(p => p.endsWith('.part'))).toHaveLength(4)
    const manifest = JSON.parse((await w.disk.readText(`${job.id}/${MANIFEST_FILE}`))!) as TransferManifest
    expect(manifest).toMatchObject({ schema: 1, sessionId: ID, folder: job.destinationFolder, include: ['fits', 'tiff'], counts: { fits: 3, tiff: 1 }, startedAt: '2024-06-15T21:00:54', copiedAt: '2026-10-14T19:00:00.000Z', target })
    expect(manifest.files[0]).toEqual({ remote: `user/${ID}/02-images-initial/img-0001.fits`, local: '02-images-initial/img-0001.fits', sizeBytes: 10, sha256: (await w.disk.fullHash(`${job.id}/02-images-initial/img-0001.fits`)).slice(7) })
    expect(manifest.files[0].sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(manifest.findings).toEqual(job.findings)
    expect(await w.store.get(job.id)).toEqual(done)
    expect(await w.run(done)).toBe(done)
  })

  it('[VIN-025] Given a full transfer, When the scope\'s commands are checked, Then every one only listed or read', async () => {
    const w = world()
    await w.run(await planned(w, { include: ['fits', 'tiff', 'jpeg', 'json'] }))
    expect(w.scope.commands.every(c => /^(LIST|RETR|REST) /.test(c))).toBe(true)
  })

  it('[VIN-022] Given the link drops part way through a file, When run, Then the job is paused, not failed, keeping the .part', async () => {
    const w = world({ fitsBytes: 100 })
    w.scope.chunkBytes = 30
    w.scope.dropAfterBytes = 140
    const job = await planned(w)
    const paused = await w.run(job)
    expect(paused.state).toBe('paused')
    expect(paused.reason).toBe('The connection to the scope dropped: the Wi-Fi went away.')
    expect(paused.committed).toEqual(['02-images-initial/img-0001.fits'])
    expect(bytesOf(w, `${job.id}/02-images-initial/img-0002.fits.part`)).toBe(40)
    expect(await w.store.get(job.id)).toMatchObject({ state: 'paused' })
  })

  it('[VIN-023, VIN-024] Given a paused job and a scope that resumes, When resumed, Then it lists again, resumes the .part from its length and finishes', async () => {
    const w = world({ fitsBytes: 100 })
    w.scope.chunkBytes = 30
    w.scope.dropAfterBytes = 140
    const paused = await w.run(await planned(w))
    w.scope.commands.length = 0
    const done = await w.run(paused)
    expect(done.state).toBe('done')
    expect(w.scope.commands.slice(0, 3)).toEqual([`LIST user/${ID}`, `LIST user/${ID}/01-pointing-initial`, `LIST user/${ID}/02-images-initial`])
    expect(w.scope.commands).toContain('REST 40')
    expect(w.scope.commands.filter(c => c.startsWith('RETR'))).toEqual([`RETR user/${ID}/02-images-initial/img-0002.fits`, `RETR user/${ID}/02-images-initial/img-0003.fits`])
    expect(done.findings.some(f => f.code === 'SESSION_GREW')).toBe(false)
    expect(bytesOf(w, `${done.id}/02-images-initial/img-0002.fits`)).toBe(100)
  })

  it('[VIN-024] Given a scope that will not resume, When a .part is resumed, Then the file is fetched again from the start', async () => {
    const w = world({ fitsBytes: 100 })
    w.scope.chunkBytes = 30
    w.scope.dropAfterBytes = 140
    const paused = await w.run(await planned(w))
    w.scope.resumes = false
    w.scope.commands.length = 0
    const done = await w.run(paused)
    expect(done.state).toBe('done')
    expect(w.scope.commands.some(c => c.startsWith('REST'))).toBe(false)
    expect(bytesOf(w, `${done.id}/02-images-initial/img-0002.fits`)).toBe(100)
    expect(w.disk.files.get(`${done.id}/02-images-initial/img-0002.fits`)).toEqual(w.scope.files.get(`user/${ID}/02-images-initial/img-0002.fits`)!.bytes)
  })

  it('[VIN-023] Given the session grew while paused, When resumed, Then SESSION_GREW and NAME_COUNT_STALE are raised, the name kept and only the planned files copied', async () => {
    const w = world()
    w.scope.dropAfterBytes = 15
    const job = await planned(w)
    const paused = await w.run(job)
    w.scope.file(`user/${ID}/02-images-initial/img-0004.fits`, 10)
    const done = await w.run(paused)
    expect(done.state).toBe('done')
    expect(done.destinationFolder).toBe('NGC3372_2024-06-15_FIT=3')
    expect(done.findings.map(f => f.code)).toEqual(expect.arrayContaining(['SESSION_GREW', 'NAME_COUNT_STALE']))
    expect(done.findings.find(f => f.code === 'SESSION_GREW')?.message).toBe('The session changed since it was listed: 1 new and 0 changed file. This copy keeps to what was planned; plan another for the rest.')
    expect(done.committed).toHaveLength(3)
    const manifest = JSON.parse((await w.disk.readText(`${job.id}/${MANIFEST_FILE}`))!) as TransferManifest
    expect(manifest.findings.map(f => f.code)).toContain('NAME_COUNT_STALE')
    expect(manifest.counts).toEqual({ fits: 3 })
    const again = await w.run({ ...done, state: 'paused' })
    expect(again.findings.filter(f => f.code === 'SESSION_GREW')).toHaveLength(1)
  })

  it('[VIN-023] Given a file that changed size while paused, When resumed, Then SESSION_GREW says one changed file', async () => {
    const w = world()
    w.scope.dropAfterBytes = 15
    const paused = await w.run(await planned(w))
    w.scope.file(`user/${ID}/02-images-initial/img-0003.fits`, 12)
    const r = await w.run(paused)
    expect(r.findings.find(f => f.code === 'SESSION_GREW')?.message).toBe('The session changed since it was listed: 0 new and 1 changed file. This copy keeps to what was planned; plan another for the rest.')
    expect(r.state).toBe('paused')
  })

  it('[VIN-021] Given a file that comes short three times, When run, Then the copy stops: the job pauses with SIZE_MISMATCH and no .part is left for it', async () => {
    const w = world()
    w.scope.shortReads = 3
    const job = await planned(w)
    const r = await w.run(job)
    expect(r.state).toBe('paused')
    expect(r.reason).toBe('02-images-initial/img-0001.fits came out the wrong size 3 times.')
    expect(r.findings.at(-1)).toEqual({ level: 'warn', code: 'SIZE_MISMATCH', message: r.reason })
    expect(w.disk.files.has(`${job.id}/02-images-initial/img-0001.fits.part`)).toBe(false)
    expect(w.scope.commands.filter(c => c.startsWith('RETR'))).toHaveLength(3)
  })

  it('[VIN-020] Given a file that comes short twice, When run, Then the third try lands it', async () => {
    const w = world()
    w.scope.shortReads = 2
    const r = await w.run(await planned(w))
    expect(r.state).toBe('done')
    expect(w.scope.commands.filter(c => c.startsWith('RETR'))).toHaveLength(5)
  })

  it('[VIN-020] Given a .part longer than the file, When resumed, Then it is started again from 0', async () => {
    const w = world()
    const job = await planned(w)
    w.disk.files.set(`${job.id}/02-images-initial/img-0001.fits.part`, new Uint8Array(50))
    const r = await w.run(job)
    expect(r.state).toBe('done')
    expect(w.scope.commands.some(c => c.startsWith('REST'))).toBe(false)
  })

  it('[VIN-023] Given a file already copied whole but not committed, When run, Then it is not fetched again', async () => {
    const w = world()
    const job = await planned(w)
    w.disk.files.set(`${job.id}/02-images-initial/img-0001.fits`, new Uint8Array(10))
    const r = await w.run(job)
    expect(r.committed).toHaveLength(3)
    expect(w.scope.commands.filter(c => c.startsWith('RETR'))).toHaveLength(2)
  })

  it('[VIN-022] Given the link drops on the re-listing, When resumed, Then it stays paused', async () => {
    const w = world()
    w.scope.dropAfterBytes = 15
    const paused = await w.run(await planned(w))
    w.scope.dropOnList = true
    const r = await w.run(paused)
    expect(r).toMatchObject({ state: 'paused', reason: 'The connection to the scope dropped: the Wi-Fi went away.' })
  })

  it('[VIN-022] Given the destination disk refuses writes, When run, Then the job fails with the reason (only a dropped link pauses)', async () => {
    const w = world()
    const job = await planned(w)
    w.disk.failWrites = `${job.id}/02-images-initial`
    const r = await w.run(job)
    expect(r.state).toBe('failed')
    expect(r.reason).toBe(`EACCES: ${job.id}/02-images-initial/img-0001.fits.part`)
  })

  it('[VIN-019] Given the user pauses, When the next file is due, Then the job pauses there', async () => {
    const w = world()
    let n = 0
    const r = await w.run(await planned(w), { shouldPause: () => ++n > 1 })
    expect(r).toMatchObject({ state: 'paused', reason: 'Paused.', committed: ['02-images-initial/img-0001.fits'] })
  })

  it('[VIN-026] Given a committed file that went missing before verifying, When run, Then the job pauses and the file is no longer committed', async () => {
    const w = world()
    const job = await planned(w)
    const disk = w.disk
    const origRename = disk.rename.bind(disk)
    disk.rename = async (from, to) => {
      await origRename(from, to)
      if (to.endsWith('img-0003.fits')) disk.files.delete(`${job.id}/02-images-initial/img-0001.fits`)
    }
    const r = await w.run(job)
    expect(r.state).toBe('paused')
    expect(r.reason).toBe('02-images-initial/img-0001.fits is missing or the wrong size on the destination.')
    expect(r.committed).toEqual(['02-images-initial/img-0002.fits', '02-images-initial/img-0003.fits'])
    expect(r.copiedBytes).toBe(20)
    disk.rename = origRename
    const again = await w.run(r)
    expect(again.state).toBe('done')
  })

  it('[VIN-022] Given a non-Error thrown, When run, Then the job fails with its text', async () => {
    const w = world()
    const job = await planned(w)
    w.disk.append = async () => { throw 'disk gone' }
    expect(await w.run(job)).toMatchObject({ state: 'failed', reason: 'disk gone' })
  })
})

describe('Room where copies land', () => {
  it('[VIN-027] Given too little free space, When a job is run, Then it is paused with SPACE_SHORT and nothing is fetched', async () => {
    const w = world()
    const job = await planned(w, { include: ['fits', 'tiff'] })
    w.disk.free = 78
    const paused = await w.run(job)
    expect(paused.state).toBe('paused')
    expect(paused.reason).toBe('Nothing more was copied: the folder copies land in needs 1 B more room.')
    expect(paused.findings.filter(f => f.code === 'SPACE_SHORT')).toEqual([{ level: 'error', code: 'SPACE_SHORT', message: paused.reason }])
    expect(w.scope.commands.some(c => c.startsWith('RETR'))).toBe(false)
    expect(await w.run(paused)).toMatchObject({ state: 'paused' })
    expect((await w.store.get(job.id))!.findings.filter(f => f.code === 'SPACE_SHORT')).toHaveLength(1)

    w.disk.free = 79
    const done = await w.run(paused)
    expect(done.state).toBe('done')
    expect(done.findings.some(f => f.code === 'SPACE_SHORT')).toBe(false)
  })

  it('[VIN-027] Given part of a job already copied, When room is checked, Then only the bytes still to copy count', async () => {
    const w = world()
    const job = await planned(w, { include: ['fits', 'tiff'] })
    const first = await w.run(job, { shouldPause: (() => { let n = 0; return () => n++ > 0 })() })
    expect(first.committed).toHaveLength(1)
    w.disk.free = Math.ceil((78 - 10) * 1.01)
    expect((await w.run(first)).state).toBe('done')
  })

  it('[VIN-016] Given a session with none of the kinds chosen, When planned, Then it is refused with nothing written', async () => {
    const w = world()
    const { userFolder, sessions } = await w.scan()
    const s = sessions.find(x => x.session.id === ID)!
    expect(await w.plan({ session: s.session, userFolder, target, findings: [], destinationRoot: '/repo', include: ['json'] })).toEqual({ status: 'planned', job: expect.anything() })
    const bare = { ...s.session, runs: s.session.runs.map(r => ({ ...r, files: r.files.filter(f => f.kind !== 'tiff') })) }
    expect(await w.plan({ session: bare, userFolder, target, findings: [], destinationRoot: '/repo', include: ['tiff'] })).toEqual({ status: 'blocked', reason: 'The session holds no files of the kinds chosen to copy.' })
  })
})

describe('Copying several sessions', () => {
  const at = (id: string, patch: Partial<TransferJob> = {}): TransferJob => ({
    id: `/repo/M31/${id}`,
    sessionId: id,
    sessionPath: `user/${id}`,
    target,
    destinationRoot: '/repo',
    targetFolder: 'M31',
    destinationFolder: `${id}_FIT=1`,
    include: ['fits'],
    items: [{ path: 'r/img-0001.fits', kind: 'fits', sizeBytes: 100, frameNo: 1, runOrder: 1 }],
    state: 'planned',
    committed: [],
    copiedBytes: 0,
    totalBytes: 100,
    findings: [],
    reason: null,
    startedAt: null,
    listedAt: '2026-10-14T19:00:00.000Z',
    createdAt: '2026-10-14T19:00:00.000Z',
    updatedAt: '2026-10-14T19:00:00.000Z',
    ...patch
  })
  const planOf = (r: PlanResult) => async () => r
  const item = (id: string, r: PlanResult = { status: 'planned', job: at(id) }) => ({ sessionId: id, plan: planOf(r) })

  function queue(ends: Record<string, TransferJob['state']> = {}) {
    const ran: string[] = []
    const finished: number[] = []
    const q = makeVesperaCopyQueue({
      clock,
      run: async (job: TransferJob, _options?: RunOptions) => {
        ran.push(job.sessionId)
        const state = ends[job.sessionId] ?? 'done'
        if (state === 'failed') throw new Error('disk on fire')
        return { ...job, state, committed: state === 'done' ? job.items.map(i => i.path) : [], copiedBytes: state === 'done' ? job.totalBytes : 0, reason: state === 'paused' ? 'The link dropped.' : null }
      },
      onFinished: n => void finished.push(n)
    })
    return { q, ran, finished }
  }

  it('[VIN-031] Given three ticked sessions, When copied, Then they run one after another and each says what it copied', async () => {
    const { q, ran, finished } = queue()
    expect(q.state()).toBeNull()
    expect(q.start([item('a'), item('b'), item('c')])).toEqual({ started: true })
    expect(q.busy()).toBe(true)
    await q.idle()
    expect(ran).toEqual(['a', 'b', 'c'])
    expect(q.busy()).toBe(false)
    const state = q.state()!
    expect(state).toMatchObject({ busy: false, job: null, current: null, pace: null, position: 3, total: 3 })
    expect(state.outcomes.map(o => o.message)).toEqual(['a', 'b', 'c'].map(id => `Copied 1 file (100 B) into M31/${id}_FIT=1.`))
    expect(state.outcomes.every(o => o.level === 'info' && !o.refused && o.job?.state === 'done')).toBe(true)
    expect(finished).toEqual([3])
  })

  it('[VIN-031] Given a session whose folder is taken and one that is refused, When copied, Then each is reported and skipped and the rest still copy', async () => {
    const { q, ran } = queue()
    const refused: PlanResult = { status: 'refused', folder: 'x', finding: { level: 'error', code: 'DEST_EXISTS', message: 'x already exists' } }
    q.start([item('a', refused), item('b', { status: 'blocked', reason: 'Name the target first.' }), { sessionId: 'c', plan: async () => { throw new Error('gone') } }, item('d', { status: 'resume', job: at('d') })])
    await q.idle()
    expect(ran).toEqual(['d'])
    expect(q.state()!.outcomes.map(o => [o.sessionId, o.level, o.refused, o.message])).toEqual([
      ['a', 'warn', true, 'x already exists'],
      ['b', 'warn', false, 'Name the target first.'],
      ['c', 'error', false, 'gone'],
      ['d', 'info', false, 'Copied 1 file (100 B) into M31/d_FIT=1.']
    ])
  })

  it('[VIN-031] Given a session that pauses or fails, When copied, Then the queue stops before the next session', async () => {
    const paused = queue({ b: 'paused' })
    paused.q.start([item('a'), item('b'), item('c')])
    await paused.q.idle()
    expect(paused.ran).toEqual(['a', 'b'])
    expect(paused.q.state()!.outcomes.map(o => o.message)).toEqual(['Copied 1 file (100 B) into M31/a_FIT=1.', 'b_FIT=1 is paused after 0 of 1 files: The link dropped. Resume carries on from there.'])
    expect(paused.finished).toEqual([1])

    const failed = queue({ a: 'failed' })
    failed.q.start([item('a'), item('b')])
    await failed.q.idle()
    expect(failed.ran).toEqual(['a'])
    expect(failed.q.state()!.outcomes).toMatchObject([{ level: 'error', message: 'a_FIT=1 failed: disk on fire' }])
    expect(failed.finished).toEqual([])
  })

  it('[VIN-028] Given a queue that copied nothing, When it ends, Then nothing is indexed', async () => {
    const { q, finished } = queue({ a: 'paused' })
    q.start([item('a')])
    await q.idle()
    expect(finished).toEqual([])
    expect(q.state()!.outcomes[0]).toMatchObject({ level: 'warn' })
  })

  it('[VIN-029] Given a copy under way, When another is started, Then it is refused, and the state shows the session, the file and the pace', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>(r => (release = r))
    const states: ReturnType<typeof q.state>[] = []
    const q = makeVesperaCopyQueue({
      clock,
      run: async (job, options) => {
        options?.onProgress?.({ job: { ...job, copiedBytes: 40 }, current: 'r/img-0001.fits' })
        expect(options?.shouldPause?.()).toBe(false)
        states.push(q.state())
        expect(q.pause()).toBe(true)
        expect(options?.shouldPause?.()).toBe(true)
        await gate
        return { ...job, state: 'paused', reason: 'Paused.' }
      }
    })
    expect(q.start([])).toEqual({ started: false, reason: 'Choose at least one session to copy.' })
    expect(q.pause()).toBe(false)
    q.start([item('a'), item('b')])
    await new Promise(r => setTimeout(r, 0))
    expect(q.start([item('c')])).toEqual({ started: false, reason: 'A copy is already under way; wait for it or pause it.' })
    expect(states[0]).toMatchObject({ busy: true, current: 'r/img-0001.fits', position: 1, total: 2, outcomes: [] })
    expect(states[0]!.job!.copiedBytes).toBe(40)
    expect(states[0]!.pace).toEqual({ fraction: 0.4, bytesPerSecond: null, remainingSeconds: null })
    release()
    await q.idle()
    expect(q.state()).toMatchObject({ busy: false, position: 1, total: 2 })
    expect(q.pause()).toBe(false)
  })

  it('[VIN-023] Given a paused job to resume, When started with no other sessions, Then it alone runs', async () => {
    const { q, ran } = queue()
    expect(q.start([], at('z', { state: 'paused' }))).toEqual({ started: true })
    await q.idle()
    expect(ran).toEqual(['z'])
    expect(q.state()).toMatchObject({ total: 1, position: 1 })
  })
})
