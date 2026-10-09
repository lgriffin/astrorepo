import { describe, it, expect } from 'vitest'
import type { ArchiveArea, ArchiveRecord, ArchiveStore } from '@astro/application'
import { ARCHIVE_INDEX_FILE, type ArchiveIndex } from '@astro/domain'

export interface ArchiveAreaFixture {
  area: ArchiveArea
  workDir: string
  /** Where archives go; empty at the start. */
  archiveRoot: string
  /** Writes a file of the work folder, by its relative path. */
  writeWork: (relative: string, text: string) => Promise<void>
  /** Writes a source frame and returns its path. */
  writeSource: (name: string, text: string) => Promise<string>
  /** Puts a source frame in the work folder as a hard link, as Prep for Siril does on one disk. */
  linkWork: (relative: string, source: string) => Promise<void>
  /** Every file under a folder, relative with forward slashes, sorted; empty when there is none. */
  listing: (dir: string) => Promise<string[]>
  readFile: (path: string) => Promise<string>
}

const index = (over: Partial<ArchiveIndex> = {}): ArchiveIndex => ({
  format: 'astrorepo-archive',
  version: 1,
  target: { id: 't1', name: 'M 42' },
  mode: 'linked',
  archivedAt: '2026-10-09T20:00:00.000Z',
  workFolder: '/work',
  kept: [],
  manifests: [],
  frames: { lights: [], darks: [], flats: [], biases: [] },
  intermediates: [],
  ...over
})

/** Every ArchiveArea adapter must pass this suite. `setup` gives an empty work folder, source folder and archive root. */
export function archiveAreaContract(adapterName: string, setup: () => Promise<ArchiveAreaFixture>): void {
  describe(`ArchiveArea contract: ${adapterName}`, () => {
    it('[NFR-006] [ARC-002] Given a work folder, When it is surveyed, Then every file comes back with its size, and a hard-linked frame has two names', async () => {
      const f = await setup()
      const source = await f.writeSource('Light_001.fit', 'pixels')
      await f.writeWork('result_60s.fit', 'stack')
      await f.writeWork('process/pp_light_00001.fit', 'calibrated')
      await f.linkWork('lights/Light_001.fit', source)
      const files = await f.area.survey(f.workDir)
      expect(files.map(x => [x.path, x.sizeBytes, x.links, x.symlink])).toEqual([
        ['lights/Light_001.fit', 6, 2, false],
        ['process/pp_light_00001.fit', 10, 1, false],
        ['result_60s.fit', 5, 1, false]
      ])
      expect(await f.area.survey(f.area.join(f.workDir, 'never'))).toEqual([])
    })

    it('[NFR-006] Given files and a missing one, When read and sized, Then text and sizes come back, and the missing one is null', async () => {
      const f = await setup()
      await f.writeWork('result_60s.fit.astrorepo.json', '{"format":1}')
      const source = await f.writeSource('Light_001.fit', 'pixels')
      expect(await f.area.readText(f.workDir, 'result_60s.fit.astrorepo.json')).toBe('{"format":1}')
      await expect(f.area.readText(f.workDir, '../escape.json')).rejects.toThrow()
      expect(await f.area.sizes([source, f.area.join(f.workDir, 'gone.fit')])).toEqual([6, null])
      expect(await f.area.exists(source)).toBe(true)
      expect(await f.area.exists(f.area.join(f.archiveRoot, 'nothing'))).toBe(false)
      const free = await f.area.freeBytes(f.area.join(f.archiveRoot, 'not made yet'))
      expect(free === null || free > 0).toBe(true)
    })

    it('[ARC-004] [ARC-005] Given kept files and a source frame, When the archive is built, Then each lands at its place with the index, and the work folder and source are untouched', async () => {
      const f = await setup()
      const source = await f.writeSource('Light_001.fit', 'pixels')
      await f.writeWork('result_60s.fit', 'stack')
      await f.writeWork('masters/bias_stacked.fit', 'bias')
      const dest = f.area.join(f.archiveRoot, 'M 42 2026-10-09')
      const indexPath = await f.area.build(f.workDir, dest, [
        { from: 'result_60s.fit', inWorkFolder: true, to: 'result_60s.fit', sizeBytes: 5 },
        { from: 'masters/bias_stacked.fit', inWorkFolder: true, to: 'masters/bias_stacked.fit', sizeBytes: 4 },
        { from: source, inWorkFolder: false, to: 'frames/lights/Light_001.fit', sizeBytes: 6 }
      ], index({ mode: 'self-contained' }))
      expect(await f.listing(dest)).toEqual([ARCHIVE_INDEX_FILE, 'frames/lights/Light_001.fit', 'masters/bias_stacked.fit', 'result_60s.fit'])
      expect(await f.listing(f.archiveRoot)).toEqual((await f.listing(dest)).map(p => `M 42 2026-10-09/${p}`))
      expect(JSON.parse(await f.readFile(indexPath))).toMatchObject({ format: 'astrorepo-archive', mode: 'self-contained' })
      expect(await f.readFile(f.area.join(dest, 'frames/lights/Light_001.fit'))).toBe('pixels')
      expect(await f.listing(f.workDir)).toEqual(['masters/bias_stacked.fit', 'result_60s.fit'])
      expect(await f.readFile(source)).toBe('pixels')
    })

    it('[ARC-006] Given a source that is gone or a file whose size changed, When the archive is built, Then it fails and leaves nothing in the archive root', async () => {
      const f = await setup()
      await f.writeWork('result_60s.fit', 'stack')
      const dest = f.area.join(f.archiveRoot, 'M 42 2026-10-09')
      const kept = { from: 'result_60s.fit', inWorkFolder: true, to: 'result_60s.fit', sizeBytes: 5 }
      await expect(f.area.build(f.workDir, dest, [kept, { from: f.area.join(f.workDir, 'gone.fit'), inWorkFolder: false, to: 'frames/lights/gone.fit', sizeBytes: 3 }], index())).rejects.toThrow()
      expect(await f.listing(f.archiveRoot)).toEqual([])
      await expect(f.area.build(f.workDir, dest, [{ ...kept, sizeBytes: 99 }], index())).rejects.toThrow()
      expect(await f.listing(f.archiveRoot)).toEqual([])
      expect(await f.area.exists(dest)).toBe(false)
    })

    it('[ARC-007] Given an archive folder that exists, When another is built there, Then it is refused and the first is untouched', async () => {
      const f = await setup()
      await f.writeWork('result_60s.fit', 'stack')
      const dest = f.area.join(f.archiveRoot, 'M 42 2026-10-09')
      const copies = [{ from: 'result_60s.fit', inWorkFolder: true, to: 'result_60s.fit', sizeBytes: 5 }]
      await f.area.build(f.workDir, dest, copies, index())
      await expect(f.area.build(f.workDir, dest, copies, index({ mode: 'self-contained' }))).rejects.toThrow(/already exists/)
      expect(JSON.parse(await f.readFile(f.area.join(dest, ARCHIVE_INDEX_FILE))).mode).toBe('linked')
    })

    it('[ARC-009] [NFR-016] Given intermediates and kept folders, When folders are removed, Then only intermediate folders go, and the source behind a hard link keeps its bytes', async () => {
      const f = await setup()
      const source = await f.writeSource('Light_001.fit', 'pixels')
      await f.linkWork('lights/Light_001.fit', source)
      await f.writeWork('process/pp_light_00001.fit', 'calibrated')
      await f.writeWork('masters/bias_stacked.fit', 'bias')
      await f.writeWork('result_60s.fit', 'stack')
      expect(await f.area.removeFolders(f.workDir, ['process', 'lights', 'masters', '..', 'process/sub', 'failed'])).toEqual(['lights', 'process'])
      expect(await f.listing(f.workDir)).toEqual(['masters/bias_stacked.fit', 'result_60s.fit'])
      expect(await f.readFile(source)).toBe('pixels')
      expect(await f.area.removeFolders(f.area.join(f.workDir, 'never'), ['process'])).toEqual([])
    })
  })
}

/** Every ArchiveStore adapter must pass this suite. `make` returns an empty store. */
export function archiveStoreContract(adapterName: string, make: () => Promise<ArchiveStore> | ArchiveStore): void {
  const first: ArchiveRecord = {
    targetId: 'target-m42',
    archivedAt: new Date('2026-10-09T20:00:00Z'),
    mode: 'linked',
    path: '/archive/M 42 2026-10-09',
    fingerprint: '10|1|0|0|abc|def',
    copiedBytes: 1234,
    removed: [],
    freedBytes: 0
  }

  describe(`ArchiveStore contract: ${adapterName}`, () => {
    it('[NFR-006] [ARC-010] Given an empty store, When an archive is saved, Then it is read back and listed with every field intact', async () => {
      const store = await make()
      expect(await store.get(first.targetId)).toBeNull()
      await store.save(first)
      expect(await store.get(first.targetId)).toEqual(first)
      expect(await store.list()).toEqual([first])
    })

    it('[NFR-006] [ARC-010] Given a saved archive, When the target is saved again with what was removed, Then only the newer record is kept', async () => {
      const store = await make()
      await store.save(first)
      const again = { ...first, mode: 'self-contained' as const, removed: ['lights', 'process'], freedBytes: 5000 }
      await store.save(again)
      expect(await store.list()).toEqual([again])
    })
  })
}
