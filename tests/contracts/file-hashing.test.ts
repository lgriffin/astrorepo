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

const tempDirs: string[] = []
afterEach(() => {
  for (const d of tempDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

fileHashStoreContract('in-memory', () => new InMemoryFileHashStore())
fileHashStoreContract('SQLite', () => new SqliteFileHashStore(setupTestDb()))

fileIndexContract('in-memory', ({ files }) => {
  const disk = new InMemoryDisk()
  // The fake derives size from content length; files that are gone are simply not on it.
  for (const f of files) disk.put(`/z/${f.name}`, 'x'.repeat(f.sizeBytes), f.modifiedAt)
  return { index: disk, pathOf: name => `/z/${name}` }
})
fileIndexContract('SQLite', ({ files, gone }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-index-'))
  tempDirs.push(dir)
  const db = setupTestDb()
  const scanId = seedFitsScan(db)
  for (const f of files) {
    const p = path.join(dir, f.name)
    fs.writeFileSync(p, 'x'.repeat(f.sizeBytes))
    fs.utimesSync(p, new Date(f.modifiedAt), new Date(f.modifiedAt))
    // The catalogue's stamp is from an older scan; the adapter must read the disk instead.
    const id = seedFitsFile(db, scanId, { filePath: p, fileSizeBytes: f.sizeBytes + 1 })
    db.prepare('UPDATE fits_files SET file_modified_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', id)
  }
  for (const name of gone) seedFitsFile(db, scanId, { filePath: path.join(dir, name), fileSizeBytes: 5 })
  return { index: new SqliteFileIndex(db), pathOf: name => path.join(dir, name) }
})

contentHasherContract('in-memory', async () => {
  const disk = new InMemoryDisk()
  return {
    hasher: disk,
    write: async (name, content) => disk.put(`/mem/${name}`, content).stamp(`/mem/${name}`),
    read: async p => disk.files.get(p)!.content
  }
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
