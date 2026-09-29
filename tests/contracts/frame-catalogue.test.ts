import Database from 'better-sqlite3'
import { afterEach } from 'vitest'
import { InMemoryFrameCatalogue } from '@astro/testkit'
import { frameCatalogueContract } from '@astro/testkit/contracts/frame-catalogue.contract'
import { SqliteFrameCatalogue } from '../../src/main/adapters/sqlite-frame-catalogue'
import { setupTestDb, teardownTestDb, seedFitsScan, seedFitsFile, seedTarget } from '../helpers/setup'

frameCatalogueContract('in-memory', seed => {
  const catalogue = new InMemoryFrameCatalogue()
  seed.forEach(t => catalogue.add(t))
  return catalogue
})

let sqlite: Database.Database
afterEach(() => teardownTestDb())

frameCatalogueContract('SQLite', seed => {
  sqlite = setupTestDb()
  const scanId = seedFitsScan(sqlite)
  for (const t of seed) {
    seedTarget(sqlite, { id: t.targetId, canonicalName: t.targetName })
    for (const s of t.subs) {
      seedFitsFile(sqlite, scanId, {
        targetId: t.targetId, exposureSec: s.exposureSec,
        // FITS DATE-OBS carries no zone; the adapter must read it as UTC.
        dateObs: s.capturedAt?.toISOString().replace('Z', '') ?? null
      })
    }
    for (const st of t.stacks) {
      const id = seedFitsFile(sqlite, scanId, { targetId: t.targetId, isStacked: true, imageType: null })
      sqlite.prepare('UPDATE fits_files SET file_modified_at = ? WHERE id = ?').run(st.producedAt.toISOString(), id)
    }
  }
  return new SqliteFrameCatalogue(sqlite)
})
