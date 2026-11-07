import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { ulid } from 'ulid'
import { makeRepairCatalogues } from '@astro/application'
import { CROSS_REFERENCE, type SeedCatalogue, type SeedObject } from '@astro/domain'
import { FixedClock, InMemoryCatalogueSeeds } from '@astro/testkit'
import { FileCatalogueSeeds, SqliteCatalogueStore } from '../../src/main/adapters/catalogues'
import { rebuildFtsIndex } from '../../src/main/db/fts'
import { setupTestDb, teardownTestDb } from '../helpers/setup'

let sqlite: Database.Database

beforeEach(() => {
  sqlite = setupTestDb()
})
afterEach(() => teardownTestDb())

const SHIPPED = path.join(__dirname, '../../data/catalogues')

const repairWith = (seeds: SeedCatalogue[] | string, version = 'v1') =>
  makeRepairCatalogues({
    seeds: typeof seeds === 'string' ? new FileCatalogueSeeds(seeds) : new InMemoryCatalogueSeeds(seeds, version),
    store: new SqliteCatalogueStore(sqlite, new FixedClock()),
    newId: ulid
  })

const object = (designation: string, name: string, ra: number, dec: number, aliases: string[] = []): SeedObject =>
  ({ designation, name, type: 'emission_nebula', ra, dec, mag: 4, size: 60, constellation: 'Orion', aliases })

const catalogue = (abbreviation: string, objects: SeedObject[]): SeedCatalogue => ({ name: `${abbreviation} catalogue`, abbreviation, description: 'Test', totalObjects: objects.length, objects })

const count = (sql: string, ...args: unknown[]) => (sqlite.prepare(sql).get(...args) as { n: number }).n
const targetOf = (name: string) =>
  (sqlite.prepare('SELECT t.id FROM targets t LEFT JOIN target_aliases a ON a.target_id = t.id WHERE t.canonical_name = ? OR a.alias = ? LIMIT 1').get(name, name) as { id: string } | undefined)?.id

describe('Catalogue seeding (integration)', () => {
  it('[CAT-003] Given an empty database, When one catalogue is seeded, Then its targets, aliases and entries are written and it is built in', async () => {
    await repairWith([catalogue('TC', [
      object('TC1', 'Alpha Nebula', 5.5, -5.4, ['NGC 9999']),
      object('TC2', 'Beta Cluster', 6.1, 24.0),
      object('TC3', 'Gamma Galaxy', 12.5, 12.3, ['PGC 12345'])
    ])])()
    expect(count('SELECT COUNT(*) AS n FROM targets')).toBe(3)
    expect(count('SELECT COUNT(*) AS n FROM catalogue_entries')).toBe(3)
    expect(count("SELECT COUNT(*) AS n FROM catalogues WHERE abbreviation = 'TC' AND is_builtin = 1")).toBe(1)
    const aliases = (sqlite.prepare('SELECT alias, source FROM target_aliases WHERE target_id = ?').all(targetOf('Alpha Nebula')) as { alias: string; source: string }[])
    expect(aliases).toEqual(expect.arrayContaining([{ alias: 'TC1', source: 'TC' }, { alias: 'NGC 9999', source: CROSS_REFERENCE }]))
  })

  it('[CAT-003] Given the same object in two catalogues, When both are seeded, Then it is one target with an entry in each', async () => {
    await repairWith([
      catalogue('C1', [object('C1-001', 'Orion Nebula', 5.588, -5.39, ['M42'])]),
      catalogue('C2', [object('C2-042', 'NGC7000', 20.98, 44.53, ['C20']), object('C2-043', 'Orion Nebula', 5.588, -5.39, ['NGC 1976'])]),
      catalogue('C3', [object('C3-1', 'North America Nebula', 20.98, 44.53, ['NGC 7000'])])
    ])()
    expect(count("SELECT COUNT(*) AS n FROM targets WHERE canonical_name = 'Orion Nebula'")).toBe(1)
    expect(count('SELECT COUNT(*) AS n FROM targets')).toBe(2)
    expect(count('SELECT COUNT(*) AS n FROM catalogue_entries')).toBe(4)
  })

  it('[CAT-003] Given seeded targets, When the search index is rebuilt, Then a target is found by its name', async () => {
    await repairWith([catalogue('FT', [object('FT1', 'Eagle Nebula', 18.31, -13.78, ['M16']), object('FT2', 'Swan Nebula', 18.34, -16.18, ['M17'])])])()
    rebuildFtsIndex(sqlite)
    expect(sqlite.prepare("SELECT * FROM targets_fts WHERE targets_fts MATCH '\"Eagle\"*'").all().length).toBeGreaterThanOrEqual(1)
  })

  it('[CAT-001] [CAT-003] Given the shipped catalogues, When a new install is seeded, Then every catalogue is whole and each object is one target', async () => {
    const result = await repairWith(SHIPPED)()
    expect(result.ran).toBe(true)
    const entries = Object.fromEntries((sqlite.prepare(
      'SELECT c.abbreviation AS a, COUNT(ce.id) AS n FROM catalogues c LEFT JOIN catalogue_entries ce ON ce.catalogue_id = c.id GROUP BY c.id'
    ).all() as { a: string; n: number }[]).map(r => [r.a, r.n]))
    expect(entries).toEqual({ C: 109, IC: 200, M: 110, NGC: 500, Sh2: 30 })
    expect(targetOf('M31')).toBe(targetOf('NGC 224'))
    expect(targetOf('M101')).toBe(targetOf('NGC 5457'))
    expect(targetOf('M101')).not.toBe(targetOf('M33'))
    expect(targetOf('Pinwheel Galaxy')).toBe(targetOf('M101'))
    expect(targetOf('C31')).toBe(targetOf('IC 405'))
    expect(targetOf('C31')).not.toBe(targetOf('IC 1805'))
    expect(targetOf('C31')).not.toBe(targetOf('NGC 1499'))
    expect(targetOf('Hamburger Galaxy')).toBe(targetOf('NGC 3628'))
    expect((await repairWith(SHIPPED)()).ran).toBe(false)
  })
})

describe('Catalogue repair (integration)', () => {
  /** What the old seeder left: M101 folded into M33 by "Pinwheel Galaxy", C31 on the Heart, Spindle on two galaxies. */
  function oldInstall(): void {
    const now = '2026-10-01T00:00:00.000Z'
    for (const [id, name, abbreviation] of [['cat-m', 'Messier', 'M'], ['cat-c', 'Caldwell', 'C'], ['cat-ngc', 'NGC', 'NGC'], ['cat-ic', 'IC', 'IC']]) {
      sqlite.prepare('INSERT INTO catalogues (id, name, abbreviation, description, total_objects, is_builtin, created_at) VALUES (?, ?, ?, ?, 0, 1, ?)').run(id, name, abbreviation, 'old', now)
    }
    const target = (id: string, name: string, ra: number, dec: number, aliases: Array<[string, string]>, entries: Array<[string, string]>, stage = 'not_observed') => {
      sqlite.prepare(`INSERT INTO targets (id, canonical_name, object_type, ra_hours, dec_degrees, workflow_stage, is_custom, created_at, updated_at) VALUES (?, ?, 'galaxy', ?, ?, ?, 0, ?, ?)`)
        .run(id, name, ra, dec, stage, now, now)
      for (const [alias, source] of aliases) sqlite.prepare('INSERT INTO target_aliases (id, target_id, alias, source) VALUES (?, ?, ?, ?)').run(ulid(), id, alias, source)
      for (const [cat, designation] of entries) sqlite.prepare('INSERT INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, ?, ?, ?)').run(ulid(), cat, id, designation)
    }
    target('t-m33', 'Triangulum Galaxy', 1.56, 30.66,
      [['M33', 'M'], ['NGC 598', CROSS_REFERENCE], ['Pinwheel Galaxy', CROSS_REFERENCE], ['M101', 'M'], ['NGC 5457', 'NGC'], ['Tri', 'user']],
      [['cat-m', 'M33'], ['cat-ngc', 'NGC 598']], 'raw_captured')
    target('t-c31', 'Flaming Star Nebula', 5.27, 34.27,
      [['C31', 'C'], ['IC 405', CROSS_REFERENCE], ['Caldwell 31', CROSS_REFERENCE], ['IC 1805', 'IC'], ['Heart Nebula', CROSS_REFERENCE]],
      [['cat-c', 'C31'], ['cat-ic', 'IC 405']])
    target('t-spindle', 'Spindle Galaxy', 15.1, 55.76, [['M102', 'M'], ['NGC 5866', CROSS_REFERENCE], ['NGC 3115', 'NGC']], [['cat-m', 'M102']])
    sqlite.prepare("INSERT INTO fits_scans (id, folder_path, status, started_at, created_at) VALUES ('scan', 'D:/Astro', 'done', ?, ?)").run(now, now)
    const frame = (id: string, objectName: string, targetId: string) =>
      sqlite.prepare(`INSERT INTO fits_files (id, scan_id, file_path, file_name, file_size_bytes, folder_name, object_name, target_id, created_at) VALUES (?, 'scan', ?, ?, 1, ?, ?, ?, ?)`)
        .run(id, `D:/Astro/${id}.fit`, `${id}.fit`, objectName, objectName, targetId, now)
    frame('f-m33', 'M33', 't-m33')
    frame('f-m101', 'M101', 't-m33')
    frame('f-heart', 'IC 1805', 't-c31')
    frame('f-flame', 'Flaming Star Nebula', 't-c31')
    sqlite.prepare(`INSERT INTO target_home_folders (id, target_id, folder_type, subfolder_name, subfolder_path, scanned_at) VALUES ('h-101', 't-m33', 'raw', 'M101', 'D:/Astro/raw/M101', ?)`).run(now)
    sqlite.prepare(`INSERT INTO collections (id, name, is_auto, source_catalogue_id, created_at, updated_at) VALUES ('col-m', 'Messier Collection', 1, 'cat-m', ?, ?)`).run(now, now)
    sqlite.prepare(`INSERT INTO collection_memberships (collection_id, target_id, added_at) VALUES ('col-m', 't-m33', ?)`).run(now)
  }

  it('[CAT-004] [CAT-005] Given an install the old catalogues merged, When it is repaired, Then each object has its own target and frames, folders and aliases follow their names', async () => {
    oldInstall()
    const result = await repairWith(SHIPPED)()
    expect(result.ran).toBe(true)
    expect(result.split.map(s => s.canonicalName).sort()).toEqual(['Flaming Star Nebula', 'Spindle Galaxy', 'Triangulum Galaxy'])

    // M33 keeps its target, its frame, its stage and the alias the user gave; M101 has its own.
    const m101 = targetOf('M101')!
    expect(m101).not.toBe('t-m33')
    expect(targetOf('M33')).toBe('t-m33')
    expect(targetOf('NGC 5457')).toBe(m101)
    expect(targetOf('Pinwheel Galaxy')).toBe(m101)
    expect(targetOf('Tri')).toBe('t-m33')
    expect(sqlite.prepare('SELECT target_id FROM fits_files WHERE id = ?').pluck().get('f-m101')).toBe(m101)
    expect(sqlite.prepare('SELECT target_id FROM fits_files WHERE id = ?').pluck().get('f-m33')).toBe('t-m33')
    expect(sqlite.prepare("SELECT target_id FROM target_home_folders WHERE id = 'h-101'").pluck().get()).toBe(m101)
    expect(sqlite.prepare("SELECT workflow_stage FROM targets WHERE id = 't-m33'").pluck().get()).toBe('raw_captured')
    const m101Row = sqlite.prepare('SELECT ra_hours, dec_degrees, constellation FROM targets WHERE id = ?').get(m101) as { ra_hours: number; dec_degrees: number; constellation: string }
    expect(m101Row.ra_hours).toBeCloseTo(14.05, 1)
    expect(m101Row.constellation).toBe('Ursa Major')

    // C31 is the Flaming Star only; the Heart's frame goes to the Heart.
    expect(targetOf('IC 405')).toBe('t-c31')
    expect(targetOf('IC 1805')).not.toBe('t-c31')
    expect(sqlite.prepare("SELECT target_id FROM fits_files WHERE id = 'f-heart'").pluck().get()).toBe(targetOf('Heart Nebula'))
    expect(sqlite.prepare("SELECT target_id FROM fits_files WHERE id = 'f-flame'").pluck().get()).toBe('t-c31')

    // The Spindle is M102 (NGC 5866); NGC 3115 is its own target.
    expect(targetOf('NGC 5866')).toBe('t-spindle')
    expect(targetOf('NGC 3115')).not.toBe('t-spindle')

    // The Messier collection lists every Messier target again, M101 among them.
    expect(count("SELECT COUNT(*) AS n FROM collection_memberships WHERE collection_id = 'col-m'")).toBe(110)
    expect(count("SELECT COUNT(*) AS n FROM collection_memberships WHERE collection_id = 'col-m' AND target_id = ?", m101)).toBe(1)
    expect(sqlite.prepare("SELECT value FROM app_settings WHERE key = 'catalogue_seed_version'").pluck().get()).toBe(result.version)
  })

  it('[CAT-006] Given a repaired install, When the app starts again with the same catalogues, Then nothing changes', async () => {
    oldInstall()
    await repairWith(SHIPPED)()
    const before = sqlite.prepare('SELECT id, canonical_name FROM targets ORDER BY id').all()
    const aliases = count('SELECT COUNT(*) AS n FROM target_aliases')
    expect((await repairWith(SHIPPED)()).ran).toBe(false)
    expect(sqlite.prepare('SELECT id, canonical_name FROM targets ORDER BY id').all()).toEqual(before)
    expect(count('SELECT COUNT(*) AS n FROM target_aliases')).toBe(aliases)
  })
})
