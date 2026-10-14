import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach } from 'vitest'
import { FakeVesperaMetadata, FakeVesperaScope, InMemoryIngestDisk, InMemoryVesperaTransferStore } from '@astro/testkit'
import { ingestDiskContract, vesperaMetadataContract, vesperaScopeContract, vesperaTransferStoreContract } from '@astro/testkit/contracts/vespera-ingest.contract'
import { NodeIngestDisk } from '../../src/main/adapters/node-ingest-disk'
import { NodeVesperaMetadata } from '../../src/main/adapters/vespera-metadata'
import { SqliteVesperaTransferStore } from '../../src/main/adapters/sqlite-vespera-transfers'
import { setupTestDb, teardownTestDb } from '../helpers/setup'
import { fitsWithObject, jpegWithDescription } from '../helpers/vespera-bytes'

const tempDirs: string[] = []
afterEach(() => {
  teardownTestDb()
  for (const d of tempDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

vesperaScopeContract('in-memory', files => {
  const scope = new FakeVesperaScope()
  for (const [p, content] of Object.entries(files)) scope.file(p, content)
  return { scope, commands: () => scope.commands, drop: () => void (scope.dropOnList = true) }
})

ingestDiskContract('in-memory', () => ({ disk: new InMemoryIngestDisk(), root: '/repo' }))
ingestDiskContract('Node', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-ingest-'))
  tempDirs.push(root)
  return { disk: new NodeIngestDisk(), root }
})

vesperaMetadataContract('in-memory', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  return { metadata: new FakeVesperaMetadata(), jpeg: d => enc(d === null ? 'JPEG' : `EXIF:${d}`), fits: o => enc(o === null ? 'FITS' : `OBJECT:${o}`) }
})
vesperaMetadataContract('Node', () => ({ metadata: new NodeVesperaMetadata(), jpeg: d => jpegWithDescription(d), fits: o => fitsWithObject(o) }))

vesperaTransferStoreContract('in-memory', () => new InMemoryVesperaTransferStore())
vesperaTransferStoreContract('SQLite', () => new SqliteVesperaTransferStore(setupTestDb()))
