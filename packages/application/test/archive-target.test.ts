import { describe, expect, it } from 'vitest'
import { ArchiveRefusedError, makeArchiveTarget, makeListStackingSuggestions, type ArchiveRequest } from '@astro/application'
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
  const archive = makeArchiveTarget({
    area,
    store,
    frames,
    stacks: new InMemoryStackCatalogue().addTarget('target-m-42', { name: 'M 42' }),
    jobs,
    workspace: new InMemorySirilWorkspace(),
    clock
  })
  const request: ArchiveRequest = { targetId: 'target-m-42', workDir: WORK, archiveRoot: '/archive', readOnlyDirs: ['/nas'] }
  return { area, store, jobs, frames, archive, request }
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
    expect((await w.archive.preview(w.request)).blocked).toMatch(/queued or running/)
    await expect(w.archive.archive({ ...w.request, mode: 'linked', remove: [] })).rejects.toThrow(/queued or running/)
    expect(w.area.listing('/archive')).toEqual([])
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
