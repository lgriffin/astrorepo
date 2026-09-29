import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach } from 'vitest'
import { InMemoryDisk, InMemoryFileHashStore } from '@astro/testkit'
import { contentHasherContract, fileHashStoreContract, fileIndexContract } from '@astro/testkit/contracts/file-hashing.contract'
import { SqliteFileHashStore, SqliteFileIndex } from '../../src/main/adapters/sqlite-file-hashing'
import { NodeContentHasher } from '../../src/main/adapters/node-content-hasher'
import { setupTestDb, teardownTestDb, seedFitsScan, seedFitsFile } from '../helpers/setup'

afterEach(() => teardownTestDb())

fileHashStoreContract('in-memory', () => new InMemoryFileHashStore())
fileHashStoreContract('SQLite', () => new SqliteFileHashStore(setupTestDb()))

fileIndexContract('in-memory', files => {
  const disk = new InMemoryDisk()
  // The fake derives size from content length.
  for (const f of files) disk.put(f.path, 'x'.repeat(f.sizeBytes), f.modifiedAt)
  return disk
})
fileIndexContract('SQLite', files => {
  const db = setupTestDb()
  const scanId = seedFitsScan(db)
  for (const f of files) {
    const id = seedFitsFile(db, scanId, { filePath: f.path, fileSizeBytes: f.sizeBytes })
    db.prepare('UPDATE fits_files SET file_modified_at = ? WHERE id = ?').run(f.modifiedAt, id)
  }
  return new SqliteFileIndex(db)
})

contentHasherContract('in-memory', async () => {
  const disk = new InMemoryDisk()
  return {
    hasher: disk,
    write: async (name, content) => disk.put(`/mem/${name}`, content).stamp(`/mem/${name}`),
    read: async p => disk.files.get(p)!.content
  }
})

const tempDirs: string[] = []
afterEach(() => {
  for (const d of tempDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

contentHasherContract('Node', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-hash-'))
  tempDirs.push(dir)
  return {
    hasher: new NodeContentHasher(),
    write: async (name, content) => {
      const p = path.join(dir, name)
      fs.writeFileSync(p, content)
      const st = fs.statSync(p)
      return { path: p, sizeBytes: st.size, modifiedAt: st.mtime.toISOString() }
    },
    read: async p => fs.readFileSync(p, 'utf8')
  }
})
