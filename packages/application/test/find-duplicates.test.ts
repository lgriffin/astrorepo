import { describe, it, expect } from 'vitest'
import { makeFindDuplicates } from '@astro/application'
import { InMemoryDisk, InMemoryFileHashStore } from '@astro/testkit'

function setup() {
  const disk = new InMemoryDisk()
    .put('/nas/seestar/M 81_sub/Light_001.fit', 'HEAD-m81-001-PIXELS-TAIL')
    .put('/nas/old-backup/2024/m81/Light_001.fit', 'HEAD-m81-001-PIXELS-TAIL')
    .put('/nas/seestar/M 81_sub/Light_002.fit', 'HEAD-m81-002-PIXELS-TAIL')
    .put('/nas/seestar/M 42_sub/Light_001.fit', 'HEAD-m42-001-PIXELS-TAIL-longer')
  const hashes = new InMemoryFileHashStore()
  return { disk, hashes, find: makeFindDuplicates({ files: disk, hasher: disk, hashes }) }
}

describe('FindDuplicates', () => {
  it('[ING-003] Given the same bytes in two folders, When duplicates are found, Then one group lists both paths and the reclaimable bytes', async () => {
    const { find } = setup()
    const report = await find()
    expect(report.groups).toEqual([
      { contentHash: 'full:HEAD-m81-001-PIXELS-TAIL', sizeBytes: 24, paths: ['/nas/old-backup/2024/m81/Light_001.fit', '/nas/seestar/M 81_sub/Light_001.fit'] }
    ])
    expect(report.duplicateFiles).toBe(1)
    expect(report.reclaimableBytes).toBe(24)
  })

  it('[ING-012] Given same-size subs whose sampled bytes differ, When duplicates are found, Then only files with colliding samples are read in full', async () => {
    const { find, disk } = setup()
    const { stats } = await find()
    expect(stats).toEqual({ indexed: 4, reused: 0, sampled: 4, fullyHashed: 2, unreadable: 0 })
    expect(disk.reads.filter(r => r.kind === 'full').map(r => r.path).sort()).toEqual([
      '/nas/old-backup/2024/m81/Light_001.fit',
      '/nas/seestar/M 81_sub/Light_001.fit'
    ])
  })

  it('[ING-008] Given a second check with nothing changed, When duplicates are found, Then no file is read and the report is the same', async () => {
    const { find, disk } = setup()
    const first = await find()
    disk.reads.length = 0
    const second = await find()
    expect(disk.reads).toEqual([])
    expect(second.stats).toEqual({ indexed: 4, reused: 4, sampled: 0, fullyHashed: 0, unreadable: 0 })
    expect(second.groups).toEqual(first.groups)
  })

  it('[ING-008] Given one file changed and one removed since the last check, When checked again, Then only the changed file is read and the removed one is forgotten', async () => {
    const { find, disk, hashes } = setup()
    await find()
    disk.reads.length = 0
    disk.put('/nas/seestar/M 81_sub/Light_002.fit', 'HEAD-m81-002-EDITED-TAIL', '2026-03-05T09:00:00.000Z')
    disk.remove('/nas/old-backup/2024/m81/Light_001.fit')

    const report = await find()

    expect(disk.reads).toEqual([{ path: '/nas/seestar/M 81_sub/Light_002.fit', kind: 'sample' }])
    expect(report.groups).toEqual([])
    expect((await hashes.listHashes()).map(h => h.path)).not.toContain('/nas/old-backup/2024/m81/Light_001.fit')
  })

  it('[ING-001] Given a duplicate check, When it runs, Then every file keeps its content and modified time', async () => {
    const { find, disk } = setup()
    const before = structuredClone([...disk.files.entries()])
    await find()
    expect([...disk.files.entries()]).toEqual(before)
  })

  it('[ING-003] Given a file that cannot be read, When duplicates are found, Then it is counted as unreadable and the rest of the check stands', async () => {
    const { disk, hashes } = setup()
    const failing = {
      listIndexedFiles: () => disk.listIndexedFiles(),
      quickKey: (f: Parameters<typeof disk.quickKey>[0]) => (f.path.includes('M 42') ? Promise.reject(new Error('EBUSY')) : disk.quickKey(f)),
      fullHash: (p: string) => (p.startsWith('/nas/old-backup') ? Promise.reject(new Error('offline')) : disk.fullHash(p))
    }
    const report = await makeFindDuplicates({ files: failing, hasher: failing, hashes })()
    expect(report.stats.unreadable).toBe(2)
    expect(report.groups).toEqual([])
    expect((await hashes.listHashes()).map(h => h.path).sort()).toEqual(['/nas/seestar/M 81_sub/Light_001.fit', '/nas/seestar/M 81_sub/Light_002.fit'])
  })
})
