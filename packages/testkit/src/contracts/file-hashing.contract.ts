import { describe, it, expect } from 'vitest'
import type { ContentHasher, FileHashStore, FileIndex } from '@astro/application'
import type { FileHash, FileStamp } from '@astro/domain'

/** Every FileHashStore adapter must pass this suite. `make` returns an empty store. */
export function fileHashStoreContract(adapterName: string, make: () => Promise<FileHashStore> | FileHashStore): void {
  const a: FileHash = { path: '/a.fit', sizeBytes: 10, modifiedAt: '2026-03-01T09:00:00.000Z', quickKey: 'qa', fullHash: null }
  const b: FileHash = { path: '/b.fit', sizeBytes: 20, modifiedAt: '2026-03-01T09:00:00.000Z', quickKey: 'qb', fullHash: 'hb' }

  describe(`FileHashStore contract: ${adapterName}`, () => {
    it('[NFR-006] Given saved hashes, When listed, Then every field comes back, ordered by path', async () => {
      const store = await make()
      await store.saveHashes([b, a])
      expect(await store.listHashes()).toEqual([a, b])
    })

    it('[NFR-006] Given a saved hash, When saved again for the same path, Then it is replaced', async () => {
      const store = await make()
      await store.saveHashes([a])
      await store.saveHashes([{ ...a, fullHash: 'ha', sizeBytes: 11 }])
      expect(await store.listHashes()).toEqual([{ ...a, fullHash: 'ha', sizeBytes: 11 }])
    })

    it('[NFR-006] Given saved hashes, When some paths are removed, Then only the others remain', async () => {
      const store = await make()
      await store.saveHashes([a, b])
      await store.removeHashes(['/a.fit', '/missing.fit'])
      expect(await store.listHashes()).toEqual([b])
    })
  })
}

/** Every FileIndex adapter must pass this suite. `make` seeds the given files. */
export function fileIndexContract(adapterName: string, make: (files: FileStamp[]) => Promise<FileIndex> | FileIndex): void {
  describe(`FileIndex contract: ${adapterName}`, () => {
    it('[NFR-006] Given indexed files, When listed, Then each comes back with size and modified time, ordered by path', async () => {
      const files = [
        { path: '/z/b.fit', sizeBytes: 20, modifiedAt: '2026-03-02T09:00:00.000Z' },
        { path: '/z/a.fit', sizeBytes: 10, modifiedAt: '2026-03-01T09:00:00.000Z' }
      ]
      const index = await make(files)
      expect(await index.listIndexedFiles()).toEqual([files[1], files[0]])
    })
  })
}

/**
 * Every ContentHasher adapter must pass this suite. `write` creates a file with the content and
 * returns its stamp; `read` returns the file's current content, to prove hashing changes nothing.
 */
export function contentHasherContract(
  adapterName: string,
  setup: () => Promise<{ hasher: ContentHasher; write: (name: string, content: string) => Promise<FileStamp>; read: (path: string) => Promise<string> }>
): void {
  describe(`ContentHasher contract: ${adapterName}`, () => {
    it('[NFR-006] Given two files with the same bytes, When hashed, Then quick keys and full hashes match', async () => {
      const { hasher, write } = await setup()
      const a = await write('a.fit', 'SIMPLE = T identical bytes END')
      const b = await write('b.fit', 'SIMPLE = T identical bytes END')
      expect(await hasher.quickKey(a)).toBe(await hasher.quickKey(b))
      expect(await hasher.fullHash(a.path)).toBe(await hasher.fullHash(b.path))
    })

    it('[NFR-006] Given two files that differ, When hashed in full, Then the hashes differ', async () => {
      const { hasher, write } = await setup()
      const a = await write('a.fit', 'SIMPLE = T first file content END')
      const b = await write('b.fit', 'SIMPLE = T other file content END')
      expect(await hasher.fullHash(a.path)).not.toBe(await hasher.fullHash(b.path))
    })

    it('[ING-001] Given a file, When sampled and hashed, Then its content is unchanged', async () => {
      const { hasher, write, read } = await setup()
      const a = await write('a.fit', 'SIMPLE = T keep me exactly as I am END')
      await hasher.quickKey(a)
      await hasher.fullHash(a.path)
      expect(await read(a.path)).toBe('SIMPLE = T keep me exactly as I am END')
    })
  })
}
