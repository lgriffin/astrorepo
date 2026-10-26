import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach } from 'vitest'
import { InMemoryExperimentStore, InMemoryOutputFolder } from '@astro/testkit'
import { experimentStoreContract, outputFolderContract } from '@astro/testkit/contracts/experiments.contract'
import { NodeOutputFolder } from '../../src/main/adapters/node-output-folder'
import { SqliteExperimentStore } from '../../src/main/adapters/sqlite-experiments'
import { seedTarget, setupTestDb, teardownTestDb } from '../helpers/setup'

const temps: string[] = []
afterEach(() => {
  teardownTestDb()
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

experimentStoreContract('in-memory', () => new InMemoryExperimentStore())

experimentStoreContract('SQLite', () => {
  const db = setupTestDb()
  for (const id of ['m31', 'm42']) seedTarget(db, { id, canonicalName: id.toUpperCase() })
  return new SqliteExperimentStore(db)
})

outputFolderContract('in-memory', () => {
  const folder = new InMemoryOutputFolder()
  folder.folders.add('D:/out')
  return { folder, write: (p, text) => folder.put(p, text), root: 'D:/out' }
})

outputFolderContract('Node', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-out-'))
  temps.push(root)
  return { folder: new NodeOutputFolder(), write: (p, text) => fs.writeFileSync(p, text), root }
})
