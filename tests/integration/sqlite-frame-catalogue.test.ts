import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { SqliteFrameCatalogue, parseUtc } from '../../src/main/adapters/sqlite-frame-catalogue'
import { composeCore } from '../../src/main/composition'
import { setupTestDb, teardownTestDb, seedFitsScan, seedFitsFile, seedTarget } from '../helpers/setup'

let sqlite: Database.Database
let scanId: string

beforeEach(() => {
  sqlite = setupTestDb()
  scanId = seedFitsScan(sqlite)
})
afterEach(() => teardownTestDb())

describe('SqliteFrameCatalogue', () => {
  it('[DSC-013] Given a stack whose DATE-OBS is its first sub but whose file was written later, When listed, Then it is dated by the file', async () => {
    const t = seedTarget(sqlite, { canonicalName: 'M 101' })
    const id = seedFitsFile(sqlite, scanId, { targetId: t, isStacked: true, dateObs: '2026-02-01T21:00:00' })
    sqlite.prepare('UPDATE fits_files SET file_modified_at = ? WHERE id = ?').run('2026-02-15T12:00:00.000Z', id)

    const [frames] = await new SqliteFrameCatalogue(sqlite).listTargetFrames()

    expect(frames.stacks[0].producedAt.toISOString()).toBe('2026-02-15T12:00:00.000Z')
  })

  it('[DSC-013] Given a stack with no file time, When listed, Then it falls back to DATE-OBS', async () => {
    const t = seedTarget(sqlite, { canonicalName: 'M 101' })
    seedFitsFile(sqlite, scanId, { targetId: t, isStacked: true, dateObs: '2026-02-01T21:00:00' })

    const [frames] = await new SqliteFrameCatalogue(sqlite).listTargetFrames()

    expect(frames.stacks[0].producedAt.toISOString()).toBe('2026-02-01T21:00:00.000Z')
  })

  it('[DSC-010] Given darks, flats and unlinked lights, When listed, Then only light subs of known targets are returned', async () => {
    const t = seedTarget(sqlite, { canonicalName: 'M 81' })
    seedFitsFile(sqlite, scanId, { targetId: t, exposureSec: 10, imageType: 'Light Frame' })
    seedFitsFile(sqlite, scanId, { targetId: t, exposureSec: 10, imageType: 'light' })
    seedFitsFile(sqlite, scanId, { targetId: t, exposureSec: 10, imageType: 'Dark Frame' })
    seedFitsFile(sqlite, scanId, { targetId: t, exposureSec: 1, imageType: 'Flat Frame' })
    seedFitsFile(sqlite, scanId, { targetId: null, exposureSec: 10 })

    const frames = await new SqliteFrameCatalogue(sqlite).listTargetFrames()

    expect(frames).toHaveLength(1)
    expect(frames[0].subs).toHaveLength(2)
  })

  it('[DSC-010] Given 3 h of lights in the desktop database, When the composed core lists suggestions, Then the target is ready to stack', async () => {
    const t = seedTarget(sqlite, { canonicalName: 'M 51' })
    for (let i = 0; i < 36; i++) {
      seedFitsFile(sqlite, scanId, { targetId: t, exposureSec: 300, dateObs: `2026-04-0${1 + (i % 3)}T22:00:00` })
    }

    const suggestions = await composeCore(sqlite).listStackingSuggestions()

    expect(suggestions).toEqual([expect.objectContaining({
      kind: 'ready-to-stack', targetName: 'M 51', integrationSec: 10800, subCount: 36, nights: 3
    })])
  })
})

describe('parseUtc', () => {
  it('[DSC-013] Given FITS dates with and without a zone, When parsed, Then both are read as UTC', () => {
    expect(parseUtc('2026-02-01T21:00:00')?.toISOString()).toBe('2026-02-01T21:00:00.000Z')
    expect(parseUtc('2026-02-01T21:00:00.500Z')?.toISOString()).toBe('2026-02-01T21:00:00.500Z')
    expect(parseUtc('2026-02-01T21:00:00+01:00')?.toISOString()).toBe('2026-02-01T20:00:00.000Z')
    expect(parseUtc('not a date')).toBeNull()
    expect(parseUtc(null)).toBeNull()
  })
})
