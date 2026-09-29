import Database from 'better-sqlite3'
import { afterEach } from 'vitest'
import { InMemoryFrameCatalogue } from '@astro/testkit'
import { frameCatalogueContract } from '@astro/testkit/contracts/frame-catalogue.contract'
import { SqliteFrameCatalogue } from '../../src/main/adapters/sqlite-frame-catalogue'
import { setupTestDb, teardownTestDb, seedFitsScan, seedFitsFile, seedTarget, seedIntegrationGoal } from '../helpers/setup'

frameCatalogueContract('in-memory', seed => {
  const catalogue = new InMemoryFrameCatalogue()
  seed.targets?.forEach(t => catalogue.add(t))
  catalogue.addUnassigned(...(seed.unassigned ?? []))
  catalogue.addCalibration(...(seed.calibration ?? []))
  catalogue.addLightSettings(...(seed.lightSettings ?? []))
  return catalogue
})

let sqlite: Database.Database
afterEach(() => teardownTestDb())

/** FITS DATE-OBS carries no zone; the adapter must read it as UTC. */
const dateObs = (d: Date | null) => d?.toISOString().replace('Z', '') ?? null

frameCatalogueContract('SQLite', seed => {
  sqlite = setupTestDb()
  const scanId = seedFitsScan(sqlite)
  for (const t of seed.targets ?? []) {
    seedTarget(sqlite, { id: t.targetId, canonicalName: t.targetName })
    for (const s of t.subs) {
      seedFitsFile(sqlite, scanId, {
        targetId: t.targetId, exposureSec: s.exposureSec, dateObs: dateObs(s.capturedAt),
        filter: s.filter, telescope: s.scope, qualityFlag: s.rejected ? 'reject' : 'good'
      })
    }
    for (const st of t.stacks) {
      const id = seedFitsFile(sqlite, scanId, { targetId: t.targetId, isStacked: true, imageType: null })
      sqlite.prepare('UPDATE fits_files SET file_modified_at = ? WHERE id = ?').run(st.producedAt.toISOString(), id)
    }
    if (t.goalSec !== null) seedIntegrationGoal(sqlite, { targetId: t.targetId, filter: 'Any', goalSeconds: t.goalSec })
    if (t.processedCount > 0 || t.finalCount > 0) {
      sqlite.prepare(
        `INSERT INTO target_home_data (target_id, tif_files, image_files, scanned_at) VALUES (?, ?, ?, ?)`
      ).run(t.targetId, t.processedCount, t.finalCount, new Date().toISOString())
    }
  }
  for (const u of seed.unassigned ?? []) {
    seedFitsFile(sqlite, scanId, { exposureSec: u.exposureSec, dateObs: dateObs(u.capturedAt), folderName: u.folder, objectName: u.objectName })
  }
  const imageType = { dark: 'Dark Frame', flat: 'Flat Field', bias: 'Bias Frame' }
  for (const c of seed.calibration ?? []) {
    seedFitsFile(sqlite, scanId, { imageType: imageType[c.kind], exposureSec: c.exposureSec, gain: c.gain, ccdTemp: c.sensorTempC, filter: c.filter })
  }
  for (const l of seed.lightSettings ?? []) {
    for (let i = 0; i < l.count; i++) {
      // Sensor temperatures wander a little between subs; the adapter groups them to whole degrees.
      const ccdTemp = l.sensorTempC === null ? null : l.sensorTempC + (i % 2 === 0 ? 0.2 : -0.2)
      seedFitsFile(sqlite, scanId, { exposureSec: l.exposureSec, gain: l.gain, ccdTemp, filter: l.filter })
    }
  }
  return new SqliteFrameCatalogue(sqlite)
})
