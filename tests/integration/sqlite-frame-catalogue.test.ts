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

describe('Cockpit through the desktop database', () => {
  it('[DSC-001] Given a sub with no TELESCOP but an INSTRUME, When listed, Then the instrument names the scope', async () => {
    const t = seedTarget(sqlite, { canonicalName: 'M 27' })
    seedFitsFile(sqlite, scanId, { targetId: t, exposureSec: 10, telescope: ' ', instrument: 'ZWO ASI585MC' })
    const [frames] = await new SqliteFrameCatalogue(sqlite).listTargetFrames()
    expect(frames.subs[0].scope).toBe('ZWO ASI585MC')
  })

  it('[DSC-008] Given a ready-to-stack target, When the composed core dismisses it, Then it stays hidden until a new sub is indexed', async () => {
    const t = seedTarget(sqlite, { canonicalName: 'M 81' })
    for (let i = 0; i < 3; i++) seedFitsFile(sqlite, scanId, { targetId: t, exposureSec: 3600, dateObs: `2026-03-01T2${i}:00:00` })
    const core = composeCore(sqlite)
    const [s] = await core.listStackingSuggestions()

    expect(await core.dismissSuggestion(s.id)).toEqual({ dismissed: true })
    expect(await core.listStackingSuggestions()).toEqual([])

    seedFitsFile(sqlite, scanId, { targetId: t, exposureSec: 600, dateObs: '2026-03-05T21:00:00' })
    expect((await core.listStackingSuggestions()).map(x => x.targetName)).toEqual(['M 81'])
  })

  it('[DSC-006] Given an unlinked light and a flat for an unused filter, When the composed core reports hidden data, Then both appear', async () => {
    const t = seedTarget(sqlite, { canonicalName: 'M 81' })
    seedFitsFile(sqlite, scanId, { targetId: t, exposureSec: 10, filter: 'IRCUT', dateObs: '2026-03-01T21:00:00' })
    seedFitsFile(sqlite, scanId, { exposureSec: 10, filter: 'IRCUT', folderName: 'Unknown_sub', dateObs: '2026-03-02T21:00:00' })
    seedFitsFile(sqlite, scanId, { imageType: 'Flat Field', exposureSec: 1, filter: 'Ha' })

    const report = await composeCore(sqlite).reportHiddenData()

    expect(report.unassigned.byFolder).toEqual([{ folder: 'Unknown_sub', subCount: 1, integrationSec: 10 }])
    expect(report.orphanCalibration.map(g => [g.kind, g.filter])).toEqual([['flat', 'Ha']])
    expect(report.neverStacked.map(x => x.targetName)).toEqual(['M 81'])
  })

  it('[DSC-009] Given targets at several stages, When the composed core discovers them, Then progress is counted from the data', async () => {
    const planned = seedTarget(sqlite, { canonicalName: 'M 31' })
    sqlite.prepare("INSERT INTO integration_goals (id, target_id, filter, goal_seconds, created_at, updated_at) VALUES ('g1', ?, 'Any', 3600, '', '')").run(planned)
    const t = seedTarget(sqlite, { canonicalName: 'M 42' })
    seedFitsFile(sqlite, scanId, { targetId: t, isStacked: true, imageType: null, dateObs: '2026-01-02T09:00:00' })

    const { progress } = await composeCore(sqlite).discoverTargets()

    expect(Object.fromEntries(progress.map(p => [p.state, p.count]))).toMatchObject({ planned: 1, stacked: 1 })
    expect((await composeCore(sqlite).discoverTarget(t))?.progress).toBe('stacked')
  })
})
