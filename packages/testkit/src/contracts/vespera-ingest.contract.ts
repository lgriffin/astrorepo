import { describe, expect, it } from 'vitest'
import { ScopeDisconnectedError, type IngestDisk, type VesperaMetadata, type VesperaScope, type VesperaTransferStore } from '@astro/application'
import type { TransferJob } from '@astro/domain'

/** Commands that change anything on an FTP server; none may ever reach the scope (VIN-025). */
export const FTP_WRITE_COMMANDS = ['STOR', 'STOU', 'APPE', 'RNFR', 'RNTO', 'MKD', 'XMKD', 'RMD', 'XRMD', 'DELE', 'SITE', 'MFMT', 'MFCT', 'MFF'] as const

const collect = async (chunks: AsyncIterable<Uint8Array>) => {
  const parts: number[] = []
  for await (const c of chunks) parts.push(...c)
  return new Uint8Array(parts)
}

export interface ScopeFixture {
  scope: VesperaScope
  /** Every command the adapter sent, verb first ("LIST user", "RETR …", "REST 4"). */
  commands: () => string[]
  /** Drops the link before the next command. */
  drop: () => void
}

/**
 * Every VesperaScope adapter must pass this suite. `make` serves the files given (path from the
 * scope's root, and content) and nothing else.
 */
export function vesperaScopeContract(adapterName: string, make: (files: Record<string, string>) => Promise<ScopeFixture> | ScopeFixture): void {
  const files = {
    'user/2024-06-15_21-00-54_observation_NGC3372/observation.json': '{"target":"NGC 3372"}',
    'user/2024-06-15_21-00-54_observation_NGC3372/01-images-initial/img-0001.fits': 'SIMPLE  = T 0123456789',
    'system/firmware.bin': 'x'
  }

  describe(`VesperaScope contract: ${adapterName}`, () => {
    it('[VIN-001] Given the scope, When its root and a session are listed, Then folders and files come back with their sizes', async () => {
      const { scope } = await make(files)
      const root = await scope.list('')
      expect(root.filter(e => e.type === 'dir').map(e => e.name).sort()).toEqual(['system', 'user'])
      const session = await scope.list('user/2024-06-15_21-00-54_observation_NGC3372')
      expect(session.map(e => [e.name, e.type]).sort()).toEqual([['01-images-initial', 'dir'], ['observation.json', 'file']])
      expect(session.find(e => e.name === 'observation.json')?.sizeBytes).toBe(21)
    })

    it('[VIN-024] Given a file, When it is read from an offset the scope honours, Then the bytes from that offset come back and the result says where they start', async () => {
      const { scope } = await make(files)
      const read = await scope.read('user/2024-06-15_21-00-54_observation_NGC3372/01-images-initial/img-0001.fits', 12)
      const rest = new TextDecoder().decode(await collect(read.chunks))
      expect(read.from === 0 ? rest : `${'SIMPLE  = T '}${rest}`).toBe('SIMPLE  = T 0123456789')
      expect([0, 12]).toContain(read.from)
    })

    it('[VIN-010] Given a file, When its head is read, Then at most that many bytes come back', async () => {
      const { scope } = await make(files)
      const head = await scope.head('user/2024-06-15_21-00-54_observation_NGC3372/observation.json', 8)
      expect(new TextDecoder().decode(head)).toBe('{"target')
    })

    it('[VIN-022] Given the link drops, When the scope is listed, Then the adapter fails with ScopeDisconnectedError', async () => {
      const { scope, drop } = await make(files)
      drop()
      await expect(scope.list('user')).rejects.toBeInstanceOf(ScopeDisconnectedError)
    })

    it('[VIN-025] Given a scan and reads, When the commands are checked, Then not one writes, renames, makes or deletes anything on the scope', async () => {
      const { scope, commands } = await make(files)
      await scope.list('')
      await scope.list('user')
      await collect((await scope.read('user/2024-06-15_21-00-54_observation_NGC3372/observation.json', 0)).chunks)
      await scope.head('user/2024-06-15_21-00-54_observation_NGC3372/observation.json', 4)
      const verbs = commands().map(c => c.split(' ')[0].toUpperCase())
      expect(verbs.length).toBeGreaterThan(0)
      expect(verbs.filter(v => (FTP_WRITE_COMMANDS as readonly string[]).includes(v))).toEqual([])
      const methods = new Set<string>()
      for (let o: object | null = scope; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) for (const k of Object.getOwnPropertyNames(o)) methods.add(k)
      expect([...methods].filter(m => /^(put|upload|write|store|append|rename|mkdir|makeDir|remove|delete|rmdir|del)/i.test(m))).toEqual([])
    })
  })
}

/** Every IngestDisk adapter must pass this suite. `make` gives the disk and an empty folder on it. */
export function ingestDiskContract(adapterName: string, make: () => Promise<{ disk: IngestDisk; root: string }> | { disk: IngestDisk; root: string }): void {
  const bytes = (s: string) => new TextEncoder().encode(s)

  describe(`IngestDisk contract: ${adapterName}`, () => {
    it('[VIN-019] Given a new file in a new folder, When it is written in chunks, Then its folders are made and its size is every chunk', async () => {
      const { disk, root } = await make()
      const p = disk.join(root, 'M31_2026-10-14_FIT=1', '01-images-initial', 'img-0001.fits.part')
      const w = await disk.append(p, 0)
      await w.write(bytes('abc'))
      await w.write(bytes('def'))
      await w.close()
      expect(await disk.size(p)).toBe(6)
      expect(await disk.exists(disk.join(root, 'M31_2026-10-14_FIT=1'))).toBe(true)
    })

    it('[VIN-024] Given a partial file, When it is opened from a shorter offset, Then what is past the offset is cut before writing goes on', async () => {
      const { disk, root } = await make()
      const p = disk.join(root, 'a.part')
      const first = await disk.append(p, 0)
      await first.write(bytes('0123456789'))
      await first.close()
      const again = await disk.append(p, 4)
      await again.write(bytes('xy'))
      await again.close()
      expect(await disk.size(p)).toBe(6)
      await disk.rename(p, disk.join(root, 'a'))
      expect(await disk.size(p)).toBeNull()
      expect(await disk.size(disk.join(root, 'a'))).toBe(6)
    })

    it('[VIN-026] Given text written whole, When read back, Then it is the same; and a missing file reads as null', async () => {
      const { disk, root } = await make()
      const p = disk.join(root, 'f', 'astrorepo.manifest.json')
      await disk.writeText(p, '{"schema":1}')
      expect(await disk.readText(p)).toBe('{"schema":1}')
      expect(await disk.readText(disk.join(root, 'none.json'))).toBeNull()
      await disk.remove(p)
      await disk.remove(p)
      expect(await disk.exists(p)).toBe(false)
    })
  })
}

export interface MetadataFixture {
  metadata: VesperaMetadata
  /** A JPEG's first bytes, with this EXIF description (none when null). */
  jpeg: (description: string | null) => Uint8Array
  /** A FITS file's first bytes, with this OBJECT card (none when null). */
  fits: (object: string | null) => Uint8Array
}

/** Every VesperaMetadata adapter must pass this suite. */
export function vesperaMetadataContract(adapterName: string, make: () => MetadataFixture): void {
  describe(`VesperaMetadata contract: ${adapterName}`, () => {
    it('[VIN-010] Given a stacked JPEG, When its EXIF is read, Then its description comes back', () => {
      const { metadata, jpeg } = make()
      expect(metadata.exifDescription(jpeg('M 42 - 120 frames'))).toBe('M 42 - 120 frames')
      expect(metadata.exifDescription(jpeg(null))).toBeNull()
    })

    it('[VIN-011] Given a FITS frame, When its header is read, Then its OBJECT comes back', () => {
      const { metadata, fits } = make()
      expect(metadata.fitsObject(fits('IC 443'))).toBe('IC 443')
      expect(metadata.fitsObject(fits(null))).toBeNull()
    })

    it('[VIN-011] Given bytes that are neither, When read, Then both give null and nothing is thrown', () => {
      const { metadata } = make()
      for (const b of [new Uint8Array(0), new Uint8Array([0xff, 0xd8, 0xff]), new TextEncoder().encode('not a file')]) {
        expect(metadata.exifDescription(b)).toBeNull()
        expect(metadata.fitsObject(b)).toBeNull()
      }
    })
  })
}

const job = (id: string, createdAt: string, state: TransferJob['state'] = 'planned'): TransferJob => ({
  id,
  sessionId: '2024-06-15_21-00-54_observation_NGC3372',
  sessionPath: 'user/2024-06-15_21-00-54_observation_NGC3372',
  target: { name: 'NGC 3372', catalogue: 'NGC', confidence: 'folder', evidence: ['folder: NGC3372'], review: false },
  destinationRoot: '/repo',
  destinationFolder: id.split('/').pop()!,
  include: ['fits'],
  items: [{ path: '01-images-initial/img-0001.fits', kind: 'fits', sizeBytes: 4, frameNo: 1, runOrder: 1 }],
  state,
  committed: [],
  copiedBytes: 0,
  totalBytes: 4,
  findings: [{ level: 'warn', code: 'NO_TIFF', message: 'no TIFF', run: '01-images-initial' }],
  reason: null,
  startedAt: '2024-06-15T21:00:54',
  listedAt: '2026-10-14T19:00:00.000Z',
  createdAt,
  updatedAt: createdAt
})

/** Every VesperaTransferStore adapter must pass this suite. `make` returns an empty store. */
export function vesperaTransferStoreContract(adapterName: string, make: () => Promise<VesperaTransferStore> | VesperaTransferStore): void {
  describe(`VesperaTransferStore contract: ${adapterName}`, () => {
    it('[VIN-016] Given a saved job, When it is read back, Then every field is as saved', async () => {
      const store = await make()
      const a = job('/repo/NGC3372_2024-06-15_FIT=1', '2026-10-14T19:00:00.000Z')
      await store.save(a)
      expect(await store.get(a.id)).toEqual(a)
      expect(await store.get('/repo/none')).toBeNull()
    })

    it('[VIN-016] Given a job saved again, When listed, Then it is replaced, and jobs come newest first', async () => {
      const store = await make()
      const a = job('/repo/A_2024-06-15_FIT=1', '2026-10-14T19:00:00.000Z')
      const b = job('/repo/B_2024-06-15_FIT=1', '2026-10-14T20:00:00.000Z')
      await store.save(a)
      await store.save(b)
      await store.save({ ...a, state: 'done', committed: ['01-images-initial/img-0001.fits'], updatedAt: '2026-10-14T21:00:00.000Z' })
      const listed = await store.list()
      expect(listed.map(j => [j.id, j.state])).toEqual([[b.id, 'planned'], [a.id, 'done']])
    })
  })
}
