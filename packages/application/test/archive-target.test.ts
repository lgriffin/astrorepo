import { describe, expect, it } from 'vitest'
import { ArchiveRefusedError, ArchiveRemovalError, FolderRemovalError, makeArchiveTarget, makeListStackingSuggestions, makeTargetHolds, type ArchiveRequest } from '@astro/application'
import { stackManifest, type SirilPlacement } from '@astro/domain'
import {
  FixedClock,
  InMemoryArchiveArea,
  InMemoryArchiveStore,
  InMemoryDismissalStore,
  InMemoryFrameCatalogue,
  InMemoryJobStore,
  InMemorySirilWorkspace,
  InMemoryStackCatalogue,
  subs,
  target
} from '@astro/testkit'

const WORK = '/work/siril/M42'
const placements: SirilPlacement[] = [
  { from: '/nas/M42/Light_001.fit', folder: 'lights', name: 'Light_001.fit' },
  { from: '/nas/M42/Light_002.fit', folder: 'lights', name: 'Light_002.fit' }
]
const manifest = stackManifest({
  result: { path: `${WORK}/result_60s.fit`, sizeBytes: 9, modifiedAt: null },
  target: { id: 'target-m-42', name: 'M 42' },
  job: { id: 'job-1', title: 'Stack M 42', startedAt: null },
  finishedAt: new Date('2026-10-01T03:00:00Z'),
  program: 'siril-cli',
  script: '/siril/OSC_Preprocessing.ssf',
  steps: [],
  placements,
  rejected: []
})

/** M 42 stacked: lights hard-linked from the NAS, Siril's process folder, a failed run, masters and a result with its manifest. */
function world() {
  const area = new InMemoryArchiveArea()
    .put('/nas/M42/Light_001.fit', 'light one')
    .put('/nas/M42/Light_002.fit', 'light two')
    .put(`${WORK}/process/pp_light_00001.fit`, 'x'.repeat(300))
    .put(`${WORK}/failed/job-0/result_30s.fit`, 'partial')
    .put(`${WORK}/masters/dark_stacked.fit`, 'dark')
    .put(`${WORK}/result_60s.fit`, 'the stack')
    .put(`${WORK}/result_60s.fit.astrorepo.json`, JSON.stringify(manifest))
  area.link(`${WORK}/lights/Light_001.fit`, '/nas/M42/Light_001.fit').link(`${WORK}/lights/Light_002.fit`, '/nas/M42/Light_002.fit')
  const store = new InMemoryArchiveStore()
  const jobs = new InMemoryJobStore()
  const frames = new InMemoryFrameCatalogue().add(target('M 42', { subs: subs(1080, 10, '2026-03-01T21:00:00Z') }))
  const clock = new FixedClock(new Date(2026, 9, 9, 21, 0))
  const holds = makeTargetHolds()
  const archive = makeArchiveTarget({
    area,
    store,
    frames,
    stacks: new InMemoryStackCatalogue().addTarget('target-m-42', { name: 'M 42' }),
    jobs,
    workspace: new InMemorySirilWorkspace(),
    clock,
    holds
  })
  const request: ArchiveRequest = { targetId: 'target-m-42', workDir: WORK, archiveRoot: '/archive', readOnlyDirs: ['/nas'] }
  return { area, store, jobs, frames, archive, request, holds }
}

const DEST = '/archive/M 42 2026-10-09'

describe('Archive this target', () => {
  it('[ARC-001] [ARC-012] Given a stacked target, When the archive is previewed, Then each folder shows its size, what it frees and whether it rebuilds, and nothing is written', async () => {
    const w = world()
    const before = [...w.area.disk.keys()].sort()
    const p = await w.archive.preview(w.request)
    expect(p.blocked).toBeNull()
    expect(p.destination).toBe(DEST)
    expect(p.manifests).toBe(1)
    expect(p.folders.filter(f => f.intermediate).map(f => [f.folder, f.sizeBytes, f.freesBytes, f.rebuildable])).toEqual([
      ['lights', 18, 0, true],
      ['process', 300, 300, true],
      ['failed', 7, 7, false]
    ])
    expect(p.options.map(o => [o.mode, o.plan.copyBytes, o.space.verdict])).toEqual([['linked', 4 + 9 + JSON.stringify(manifest).length, 'fits'], ['self-contained', 4 + 9 + JSON.stringify(manifest).length + 18, 'fits']])
    expect(p.record).toBeNull()
    expect([...w.area.disk.keys()].sort()).toEqual(before)
  })

  it('[ARC-004] [ARC-009] [ARC-010] Given a linked archive with process and failed ticked, When archived, Then the archive is made first, those go, the lights and sources stay, and the record says so', async () => {
    const w = world()
    const out = await w.archive.archive({ ...w.request, mode: 'linked', remove: ['process', 'failed'] })
    expect(out.indexPath).toBe(`${DEST}/astrorepo-archive.json`)
    expect(w.area.listing(DEST)).toEqual(['astrorepo-archive.json', 'masters/dark_stacked.fit', 'result_60s.fit', 'result_60s.fit.astrorepo.json'])
    const index = JSON.parse(w.area.disk.get(out.indexPath)?.text ?? '')
    expect(index.frames.lights.map((f: { source: string }) => f.source)).toEqual(['/nas/M42/Light_001.fit', '/nas/M42/Light_002.fit'])
    expect(w.area.listing(WORK)).toEqual(['lights/Light_001.fit', 'lights/Light_002.fit', 'masters/dark_stacked.fit', 'result_60s.fit', 'result_60s.fit.astrorepo.json'])
    expect(w.area.listing('/nas/M42')).toEqual(['Light_001.fit', 'Light_002.fit'])
    expect(await w.store.get('target-m-42')).toMatchObject({ mode: 'linked', path: DEST, removed: ['failed', 'process'], freedBytes: 307, archivedAt: new Date(2026, 9, 9, 21, 0) })
    expect(out.record.copiedBytes).toBe(out.plan.copyBytes)
  })

  it('[ARC-005] Given a self-contained archive, When archived, Then the raw frames are bundled in, and removing the hard-linked lights frees nothing', async () => {
    const w = world()
    const out = await w.archive.archive({ ...w.request, mode: 'self-contained', remove: ['lights'] })
    expect(w.area.listing(DEST)).toContain('frames/lights/Light_002.fit')
    expect(w.area.disk.get(`${DEST}/frames/lights/Light_002.fit`)?.text).toBe('light two')
    expect(out.record).toMatchObject({ mode: 'self-contained', removed: ['lights'], freedBytes: 0 })
    expect(w.area.listing('/nas/M42')).toEqual(['Light_001.fit', 'Light_002.fit'])
  })

  it('[ARC-006] Given a source frame that changes while it is copied, When archived, Then nothing is archived, recorded or removed', async () => {
    const w = world()
    const realBuild = w.area.build.bind(w.area)
    w.area.build = async (work, dest, copies, index) => {
      w.area.put('/nas/M42/Light_002.fit', 'light two, rewritten')
      return realBuild(work, dest, copies, index)
    }
    await expect(w.archive.archive({ ...w.request, mode: 'self-contained', remove: ['process'] })).rejects.toThrow(/changed/)
    expect(w.area.listing('/archive')).toEqual([])
    expect(await w.store.get('target-m-42')).toBeNull()
    expect(w.area.listing(WORK)).toContain('process/pp_light_00001.fit')
  })

  it('[ARC-007] Given an archive folder for today already there, inside a folder the app only reads, overlapping the work folder or short of space, When archived, Then it is refused with what to change', async () => {
    const exists = world()
    exists.area.put(`${DEST}/old.txt`, 'x')
    await expect(exists.archive.archive({ ...exists.request, mode: 'linked', remove: [] })).rejects.toThrow(/already exists/)

    const readOnly = world()
    await expect(readOnly.archive.archive({ ...readOnly.request, archiveRoot: '/nas/archive', mode: 'linked', remove: [] })).rejects.toThrow(/only reads/)

    const overlap = world()
    expect((await overlap.archive.preview({ ...overlap.request, archiveRoot: `${WORK}/archive` })).blocked).toMatch(/overlap/)

    const short = world()
    short.area.free = 10
    await expect(short.archive.archive({ ...short.request, mode: 'linked', remove: [] })).rejects.toThrow(ArchiveRefusedError)
    expect(short.area.listing('/archive')).toEqual([])
  })

  it('[ARC-008] Given a stack queued for the target, When archived, Then it is refused and nothing is copied', async () => {
    const w = world()
    await w.jobs.add({ kind: 'stack', targetId: 'target-m-42', title: 'Stack M 42', timing: 'window', command: { program: 'siril-cli', args: [], cwd: WORK }, prepare: null, spaceDir: WORK, neededBytes: 0 }, new Date())
    expect((await w.archive.preview(w.request)).blocked).toBe('A job for this target is queued or running. Let it finish, or cancel it in Jobs, then archive.')
    await expect(w.archive.archive({ ...w.request, mode: 'linked', remove: [] })).rejects.toThrow(/queued or running/)
    expect(w.area.listing('/archive')).toEqual([])
  })

  it('[ARC-008] Given a plate solve queued for the target, When archived, Then it is refused in words that fit any job', async () => {
    const w = world()
    await w.jobs.add({ kind: 'solve', targetId: 'target-m-42', title: 'Plate solve M 42', timing: 'now', command: { program: 'astap_cli', args: [], cwd: WORK }, prepare: null, spaceDir: WORK, neededBytes: 0 }, new Date())
    await expect(w.archive.archive({ ...w.request, mode: 'linked', remove: [] })).rejects.toThrow('A job for this target is queued or running.')
    expect(w.area.listing('/archive')).toEqual([])
  })

  it('[ARC-008] Given an archive under way, When it copies and removes, Then the target is held so no job for it starts, and let go after, even when it fails', async () => {
    const w = world()
    const held: boolean[] = []
    const build = w.area.build.bind(w.area)
    w.area.build = async (...args) => {
      held.push(w.holds.hold('target-m-42') === null)
      return build(...args)
    }
    await w.archive.archive({ ...w.request, mode: 'linked', remove: ['process'] })
    expect(held).toEqual([true])
    const release = w.holds.hold('target-m-42')
    expect(release).not.toBeNull()
    await expect(w.archive.archive({ ...w.request, mode: 'linked', remove: [] })).rejects.toThrow(/already being archived/)
    release?.()
    await expect(w.archive.archive({ ...w.request, mode: 'linked', remove: [] })).rejects.toThrow(/already exists/)
    expect(w.holds.hold('target-m-42')).not.toBeNull()
  })

  it('[ARC-009] Given a folder that fails part way through removal, When archived, Then the archive stays, the record lists what went, and the message says what was made and what was not removed', async () => {
    const w = world()
    w.area.failRemoval = 'process'
    const error = await w.archive.archive({ ...w.request, mode: 'linked', remove: ['process', 'failed'] }).catch(e => e)
    expect(error).toBeInstanceOf(ArchiveRemovalError)
    expect(error.message).toBe(`The archive was made in ${DEST}. Removed from the work folder: failed. The work folder's process could not be removed: EBUSY: a file in it is in use. Remove the rest by hand, or archive again another day.`)
    expect(w.area.listing(DEST)).toContain('astrorepo-archive.json')
    expect(await w.store.get('target-m-42')).toMatchObject({ removed: ['failed'], freedBytes: 7 })
    expect(w.area.listing(`${WORK}/process`)).toEqual(['pp_light_00001.fit'])
  })

  it('[ARC-009] Given a folder that cannot be rebuilt, When the user asks for it to go, Then nothing is archived or removed', async () => {
    const w = world()
    w.area.delete('/nas/M42/Light_002.fit')
    await expect(w.archive.archive({ ...w.request, mode: 'linked', remove: ['process', 'masters'] })).rejects.toThrow(/process, masters cannot be removed/)
    expect(w.area.listing('/archive')).toEqual([])
    expect(w.area.listing(WORK)).toContain('process/pp_light_00001.fit')
  })

  it('[ARC-001] Given no raw folder or an empty work folder, When previewed, Then it says why there is nothing to archive', async () => {
    const w = world()
    const none = await w.archive.preview({ ...w.request, workDir: null })
    expect([none.blocked, none.options]).toEqual(['This target has no raw folder, so it has no work folder to archive.', []])
    await expect(w.archive.archive({ ...w.request, workDir: null, mode: 'linked', remove: [] })).rejects.toThrow(/no raw folder/)
    expect((await w.archive.preview({ ...w.request, workDir: '/work/siril/empty' })).blocked).toMatch(/empty or missing/)
  })

  it('[ARC-011] Given an archived target, When stacking suggestions are listed, Then it is left out until new frames arrive', async () => {
    const w = world()
    const suggest = makeListStackingSuggestions({ frames: w.frames, dismissals: new InMemoryDismissalStore(), archives: w.store })
    expect((await suggest()).map(s => s.targetName)).toEqual(['M 42'])
    await w.archive.archive({ ...w.request, mode: 'linked', remove: [] })
    expect(await suggest()).toEqual([])
    w.frames.add(target('M 42', { subs: subs(2000, 10, '2026-03-01T21:00:00Z') }))
    expect((await suggest()).map(s => s.targetName)).toEqual(['M 42'])
  })
})

describe('A removal that stops part way', () => {
  it('[ARC-009] Given a folder that could not be removed, When the error is made, Then it names the folder, keeps what was removed and ends the reason with one full stop', () => {
    const plain = new FolderRemovalError(['process'], 'failed', 'access denied')
    expect(plain.message).toBe("The work folder's failed could not be removed: access denied.")
    expect(plain.name).toBe('FolderRemovalError')
    expect(plain.removed).toEqual(['process'])
    expect(new FolderRemovalError([], 'process', 'in use.').message).toBe("The work folder's process could not be removed: in use.")
  })
})

describe('Archive this target, edge by edge', () => {
  const job = (targetId: string) => ({ kind: 'stack' as const, targetId, title: 'Stack', timing: 'now' as const, command: { program: 'siril-cli', args: [], cwd: WORK }, prepare: null, spaceDir: WORK, neededBytes: 0 })

  it('[ARC-001] Given a stacked target, When previewed, Then the preview names the target, its work folder, the free space, shared files and the last archive', async () => {
    const w = world()
    w.area.free = 5000
    const p = await w.archive.preview(w.request)
    expect(p).toMatchObject({ target: { id: 'target-m-42', name: 'M 42' }, workDir: WORK, freeBytes: 5000, shared: [], record: null, blocked: null })
    expect(p.options.map(o => o.space.verdict)).toEqual(['fits', 'fits'])
    await w.archive.archive({ ...w.request, mode: 'linked', remove: [] })
    expect((await w.archive.preview(w.request)).record).toMatchObject({ targetId: 'target-m-42', path: DEST, removed: [], freedBytes: 0 })
  })

  it('[ARC-007] Given an archive folder that holds the work folder, inside a read-only folder, or already there, When previewed, Then each is refused in full words', async () => {
    const w = world()
    expect((await w.archive.preview({ ...w.request, archiveRoot: '/work' })).blocked).toBe(
      `The archive folder /work and the work folder ${WORK} overlap. Choose another archive folder in Settings → Folders.`
    )
    expect((await w.archive.preview({ ...w.request, archiveRoot: `${WORK}/archive` })).blocked).toBe(
      `The archive folder ${WORK}/archive and the work folder ${WORK} overlap. Choose another archive folder in Settings → Folders.`
    )
    expect((await w.archive.preview({ ...w.request, readOnlyDirs: ['/elsewhere', '/nas'], archiveRoot: '/nas/archive' })).blocked).toBe(
      'The archive folder /nas/archive is inside /nas, which the app only reads. Choose another archive folder in Settings → Folders.'
    )
    w.area.put(`${DEST}/old.txt`, 'x')
    expect((await w.archive.preview(w.request)).blocked).toBe(`${DEST} already exists. Move or rename it, then archive again.`)
    expect((await w.archive.preview({ ...w.request, workDir: '/work/siril/empty' })).blocked).toBe(
      'The work folder /work/siril/empty is empty or missing, so there is nothing to archive. Stack the target first.'
    )
  })

  it('[ARC-008] Given a running job for the target, When previewed, Then it is refused; finished jobs and jobs for other targets are not counted', async () => {
    const w = world()
    const other = await w.jobs.add(job('target-m-31'), new Date())
    const done = await w.jobs.add(job('target-m-42'), new Date())
    await w.jobs.update(done.id, { state: 'succeeded' })
    expect((await w.archive.preview(w.request)).blocked).toBeNull()
    await w.jobs.update(other.id, { state: 'running' })
    expect((await w.archive.preview(w.request)).blocked).toBeNull()
    const running = await w.jobs.add(job('target-m-42'), new Date())
    await w.jobs.update(running.id, { state: 'running' })
    expect((await w.archive.preview(w.request)).blocked).toBe('A job for this target is queued or running. Let it finish, or cancel it in Jobs, then archive.')
  })

  it('[ARC-009] Given the first folder fails to go, or the removal fails with no folder named, When archived, Then nothing is listed as removed and the reason ends with one full stop', async () => {
    const first = world()
    first.area.failRemoval = 'failed'
    const error = await first.archive.archive({ ...first.request, mode: 'linked', remove: ['process', 'failed'] }).catch(e => e)
    expect(error).toBeInstanceOf(ArchiveRemovalError)
    expect(error.name).toBe('ArchiveRemovalError')
    expect(error.message).toBe(`The archive was made in ${DEST}. The work folder's failed could not be removed: EBUSY: a file in it is in use. Remove the rest by hand, or archive again another day.`)
    expect(error.record).toMatchObject({ removed: [], freedBytes: 0 })
    expect(await first.store.get('target-m-42')).toMatchObject({ removed: [], freedBytes: 0 })

    const plain = world()
    plain.area.removeFolders = async () => Promise.reject('disk gone')
    const e2 = await plain.archive.archive({ ...plain.request, mode: 'linked', remove: ['process'] }).catch(e => e)
    expect(e2.message).toBe(`The archive was made in ${DEST}. disk gone. Remove the rest by hand, or archive again another day.`)
    const e3 = await (() => {
      const w = world()
      w.area.removeFolders = async () => Promise.reject(new Error('Disk gone.'))
      return w.archive.archive({ ...w.request, mode: 'linked', remove: ['process'] }).catch(e => e)
    })()
    expect(e3.message).toBe(`The archive was made in ${DEST}. Disk gone. Remove the rest by hand, or archive again another day.`)
    expect(e3.record.removed).toEqual([])
  })

  it('[ARC-010] Given a target with no frames listed and no holds wired, When archived, Then the record has no fingerprint and the archive is made', async () => {
    const w = world()
    const archive = makeArchiveTarget({
      area: w.area,
      store: w.store,
      frames: new InMemoryFrameCatalogue(),
      stacks: new InMemoryStackCatalogue(),
      jobs: w.jobs,
      workspace: new InMemorySirilWorkspace(),
      clock: new FixedClock(new Date(2026, 9, 9, 21, 0))
    })
    const p = await archive.preview(w.request)
    expect(p.target).toEqual({ id: 'target-m-42', name: null })
    expect(p.destination).toBe('/archive/target 2026-10-09')
    const out = await archive.archive({ ...w.request, mode: 'linked', remove: ['process'] })
    expect(out.record).toMatchObject({ fingerprint: '', path: '/archive/target 2026-10-09', removed: ['process'], freedBytes: 300 })
    const fingerprinted = await w.archive.archive({ ...w.request, archiveRoot: '/archive2', mode: 'linked', remove: [] })
    expect(fingerprinted.record.fingerprint).not.toBe('')
  })

  it('[ARC-010] Given frames for another target listed first, When archived, Then the record is fingerprinted from this target\'s frames only', async () => {
    const one = world()
    const alone = (await one.archive.archive({ ...one.request, mode: 'linked', remove: [] })).record.fingerprint
    const two = world()
    two.frames.add(target('M 31', { subs: subs(5, 60, '2026-01-01T21:00:00Z') }))
    const archive = makeArchiveTarget({
      area: two.area,
      store: two.store,
      frames: { listTargetFrames: async () => [...(await two.frames.listTargetFrames())].reverse() },
      stacks: new InMemoryStackCatalogue().addTarget('target-m-42', { name: 'M 42' }),
      jobs: two.jobs,
      workspace: new InMemorySirilWorkspace(),
      clock: new FixedClock(new Date(2026, 9, 9, 21, 0))
    })
    expect((await two.frames.listTargetFrames()).map(t => t.targetId)).toContain('target-m-31')
    expect((await archive.archive({ ...two.request, mode: 'linked', remove: [] })).record.fingerprint).toBe(alone)
  })

  it('[ARC-007] Given a disk short of the space, When archived, Then the refusal says what to do', async () => {
    const w = world()
    w.area.free = 10
    const error = await w.archive.archive({ ...w.request, mode: 'linked', remove: [] }).catch(e => e)
    expect(error.name).toBe('ArchiveRefusedError')
    expect(error.message).toBe("The archive folder's disk is short of the space this archive needs. Free space there, or choose another archive folder in Settings → Folders.")
  })

  it('[ARC-001] Given a manifest that cannot be read, When previewed, Then it is not counted and nothing fails', async () => {
    const w = world()
    w.area.readText = async () => Promise.reject(new Error('EACCES'))
    const p = await w.archive.preview(w.request)
    expect(p.manifests).toBe(0)
    expect(p.blocked).toBeNull()
  })
})

describe('Target holds', () => {
  it('[ARC-008] Given a hold let go and the target held again, When the first release is called twice, Then a second hold is refused and the stale release does not let the new hold go', () => {
    const holds = makeTargetHolds()
    expect(holds.held('m42')).toBe(false)
    const first = holds.hold('m42')
    expect(holds.held('m42')).toBe(true)
    expect(holds.held('m31')).toBe(false)
    expect(holds.hold('m42')).toBeNull()
    first?.()
    expect(holds.held('m42')).toBe(false)
    const second = holds.hold('m42')
    expect(second).not.toBeNull()
    first?.()
    expect(holds.held('m42')).toBe(true)
    expect(holds.hold('m42')).toBeNull()
    second?.()
    expect(holds.held('m42')).toBe(false)
  })
})
