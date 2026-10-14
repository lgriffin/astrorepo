import { describe, expect, it } from 'vitest'
import { MANIFEST_FILE, TRANSFER_FILE, type IngestTarget, type TransferJob, type TransferManifest } from '@astro/domain'
import {
  makeIdentifyTarget,
  makePlanVesperaTransfer,
  makeRunVesperaTransfer,
  makeScanVespera,
  ScopeLayoutError,
  type PlanRequest
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
  const r = await w.plan({ session: s.session, userFolder, target, findings: s.inventory.findings, destinationRoot: '/repo', ...extra })
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
  it('[VIN-016] Given a session, When Transfer is pressed, Then the folder is named from target, date and FITS count and the job is recorded before any byte', async () => {
    const w = world()
    const job = await planned(w)
    expect(job.destinationFolder).toBe('NGC3372_2024-06-15_FIT=3')
    expect(job.id).toBe('/repo/NGC3372_2024-06-15_FIT=3')
    expect(job).toMatchObject({ state: 'planned', include: ['fits'], committed: [], copiedBytes: 0, totalBytes: 30, sessionPath: `user/${ID}`, startedAt: '2024-06-15T21:00:54', reason: null })
    expect(await w.store.get(job.id)).toEqual(job)
    expect(JSON.parse((await w.disk.readText(`/repo/NGC3372_2024-06-15_FIT=3/${TRANSFER_FILE}`))!)).toEqual(job)
    expect(w.disk.writes).toEqual([`/repo/NGC3372_2024-06-15_FIT=3/${TRANSFER_FILE}`])
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
    const base = { session: s.session, userFolder: 'user', target, findings: [], destinationRoot: '/repo' }
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
    const again = await w.plan({ session: sessions[0].session, userFolder: 'user', target, findings: [], destinationRoot: '/repo' })
    expect(again).toEqual({ status: 'resume', job: first })
    w.store.jobs.clear()
    const fromFolder = await w.plan({ session: sessions[0].session, userFolder: 'user', target, findings: [], destinationRoot: '/repo' })
    expect(fromFolder).toEqual({ status: 'resume', job: first })
  })

  it('[VIN-018] Given the folder holds another session or something else, When planned, Then it is refused with DEST_EXISTS, or the next suffix is taken when asked', async () => {
    const w = world()
    await w.disk.writeText(`/repo/NGC3372_2024-06-15_FIT=3/${MANIFEST_FILE}`, JSON.stringify({ sessionId: 'another' }))
    await w.disk.writeText('/repo/NGC3372_2024-06-15_FIT=3_2/notes.txt', 'mine')
    const { sessions } = await w.scan()
    const req = { session: sessions[0].session, userFolder: 'user', target, findings: [], destinationRoot: '/repo' }
    const refused = await w.plan(req)
    expect(refused).toMatchObject({ status: 'refused', folder: 'NGC3372_2024-06-15_FIT=3', finding: { level: 'error', code: 'DEST_EXISTS' } })
    expect(refused.status === 'refused' && refused.finding.message).toBe('NGC3372_2024-06-15_FIT=3 already exists in /repo and holds another session (another). Nothing was copied into it.')
    const dup = await w.plan({ ...req, allowDuplicate: true })
    expect(dup.status === 'planned' && dup.job.destinationFolder).toBe('NGC3372_2024-06-15_FIT=3_3')
  })

  it('[VIN-018] Given a folder astrorepo did not make, When planned, Then it is refused, saying so', async () => {
    const w = world()
    await w.disk.writeText('/repo/NGC3372_2024-06-15_FIT=3/x.fits', 'x')
    const { sessions } = await w.scan()
    const r = await w.plan({ session: sessions[0].session, userFolder: 'user', target, findings: [], destinationRoot: '/repo' })
    expect(r.status === 'refused' && r.finding.message).toContain('holds something astrorepo did not copy')
  })

  it('[VIN-018] Given this session\'s folder with an unreadable record, When planned, Then it is refused rather than guessed', async () => {
    const w = world()
    await w.disk.writeText(`/repo/NGC3372_2024-06-15_FIT=3/${TRANSFER_FILE}`, JSON.stringify({ sessionId: ID }))
    const { sessions } = await w.scan()
    const r = await w.plan({ session: sessions[0].session, userFolder: 'user', target, findings: [], destinationRoot: '/repo' })
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
    expect(bytesOf(w, '/repo/NGC3372_2024-06-15_FIT=3_TIF=1/02-images-initial/img-0001.fits')).toBe(10)
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
