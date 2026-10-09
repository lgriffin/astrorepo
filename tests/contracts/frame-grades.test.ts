import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryFrameGradeStore, measurement } from '@astro/testkit'
import { frameGradeStoreContract } from '@astro/testkit/contracts/frame-grades.contract'
import { SqliteFrameGradeStore, SqliteGradeLimits } from '../../src/main/adapters/sqlite-frame-grades'
import { DEFAULT_GRADE_LIMITS, GRADE_LIMIT_KEYS } from '@astro/domain'
import { seedFitsFile, seedFitsScan, seedTarget, setupTestDb, teardownTestDb } from '../helpers/setup'

frameGradeStoreContract('in-memory', async lights => {
  const store = new InMemoryFrameGradeStore()
  for (const l of lights) store.add(l.targetId, { fileId: l.fileId, path: l.path, capturedAt: new Date(l.capturedAt), filter: l.filter })
  return store
})

afterEach(() => teardownTestDb())

function target(db: ReturnType<typeof setupTestDb>, id: string) {
  if (db.prepare('SELECT 1 FROM targets WHERE id = ?').get(id)) return
  seedTarget(db, { id, canonicalName: id.toUpperCase() })
}

frameGradeStoreContract('SQLite', async lights => {
  const db = setupTestDb()
  const scan = seedFitsScan(db)
  for (const l of lights) {
    target(db, l.targetId)
    seedFitsFile(db, scan, { id: l.fileId, filePath: l.path, targetId: l.targetId, dateObs: l.capturedAt.replace('Z', ''), filter: l.filter, imageType: 'Light', exposureSec: 10 })
  }
  // A stack and a dark of the same target are never graded.
  seedFitsFile(db, scan, { filePath: '/data/m42/stack.fit', targetId: 'm42', isStacked: true })
  seedFitsFile(db, scan, { filePath: '/data/m42/Dark_001.fit', targetId: 'm42', imageType: 'Dark' })
  return new SqliteFrameGradeStore(db)
})

describe('SqliteFrameGradeStore', () => {
  it('[GRD-001] Given a measured frame that changed on disk since, When listed, Then the old measurement is not used, and the override is kept', async () => {
    const db = setupTestDb()
    const scan = seedFitsScan(db)
    target(db, 'm42')
    seedFitsFile(db, scan, { id: 'a', filePath: '/data/a.fit', targetId: 'm42', imageType: 'Light', fileSizeBytes: 100 })
    const store = new SqliteFrameGradeStore(db)
    await store.saveMeasurement('a', { measurement: measurement() }, new Date())
    await store.setOverride('a', 'keep', new Date())
    db.prepare("UPDATE fits_files SET file_size_bytes = 200 WHERE id = 'a'").run()
    expect((await store.lightsOf('m42'))[0]).toMatchObject({ measurement: null, measureError: null, override: 'keep' })
  })

  it('[GRD-007] Given more paths than one query may bind, When looked up, Then every known one comes back', async () => {
    const db = setupTestDb()
    const scan = seedFitsScan(db)
    const paths = Array.from({ length: 1200 }, (_, i) => `/data/L_${i}.fit`)
    db.transaction(() => paths.forEach((p, i) => seedFitsFile(db, scan, { id: `f${i}`, filePath: p, imageType: 'Light' })))()
    expect(await new SqliteFrameGradeStore(db).lightsAlongside(paths)).toHaveLength(1200)
  })

  it('[GRD-010] Given limits saved in Settings, some out of range, When read, Then valid ones are used and the rest fall back', async () => {
    const db = setupTestDb()
    const set = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
    set.run(GRADE_LIMIT_KEYS.maxEccentricity, '0.5')
    set.run(GRADE_LIMIT_KEYS.maxFwhmRatio, '0.2')
    set.run(GRADE_LIMIT_KEYS.maxFwhmPixels, '4.5')
    expect(await new SqliteGradeLimits(db).read()).toEqual({ ...DEFAULT_GRADE_LIMITS, maxEccentricity: 0.5, maxFwhmPixels: 4.5 })
  })
})
