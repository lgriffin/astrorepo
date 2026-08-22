import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { ulid } from 'ulid'
import { setupTestDb, teardownTestDb } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => '/tmp'
  }
}))

const { initFts, rebuildFtsIndex } = await import('../../src/main/db/fts')

describe('Catalogue Seed Loading (Integration)', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
    initFts(sqlite)
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: Seed Ingestion Pipeline', () => {
    // Event: Application starts with an empty database and seed JSON files on disk
    // Action: System reads JSON, creates catalogues, resolves cross-references, creates targets/aliases
    // Response: Database populated with targets, aliases, catalogue entries
    // State: FTS index rebuilt, catalogues marked as builtin

    it('Given an empty database, When seed data is loaded for a single catalogue, Then targets and catalogue entries are created', () => {
      const seed = {
        catalogue: { name: 'TestCat', abbreviation: 'TC', description: 'Test', totalObjects: 3 },
        objects: [
          { designation: 'TC1', name: 'Alpha Nebula', type: 'emission_nebula', ra: 5.5, dec: -5.4, mag: 4.0, size: 60.0, constellation: 'Orion', aliases: ['NGC 9999'] },
          { designation: 'TC2', name: 'Beta Cluster', type: 'open_cluster', ra: 6.1, dec: 24.0, mag: 5.5, size: 30.0, constellation: 'Gemini', aliases: [] },
          { designation: 'TC3', name: 'Gamma Galaxy', type: 'galaxy', ra: 12.5, dec: 12.3, mag: 9.8, size: 11.0, constellation: 'Virgo', aliases: ['PGC 12345'] }
        ]
      }

      loadSeedDirect(sqlite, seed)
      rebuildFtsIndex(sqlite)

      const targets = sqlite.prepare('SELECT COUNT(*) as cnt FROM targets').get() as { cnt: number }
      expect(targets.cnt).toBe(3)

      const entries = sqlite.prepare('SELECT COUNT(*) as cnt FROM catalogue_entries').get() as { cnt: number }
      expect(entries.cnt).toBe(3)

      const cats = sqlite.prepare('SELECT * FROM catalogues WHERE abbreviation = ?').get('TC') as Record<string, unknown>
      expect(cats).toBeTruthy()
      expect(cats.is_builtin).toBe(1)
    })

    it('Given an object has aliases, When seed data is loaded, Then aliases are persisted and linked', () => {
      const seed = {
        catalogue: { name: 'AliasCat', abbreviation: 'AC', description: 'Test', totalObjects: 1 },
        objects: [
          { designation: 'AC1', name: 'Test Nebula', type: 'emission_nebula', ra: 5.0, dec: -5.0, mag: 4.0, size: 60.0, constellation: 'Orion', aliases: ['NGC 1234', 'Sh2-100'] }
        ]
      }

      loadSeedDirect(sqlite, seed)

      const aliases = sqlite.prepare('SELECT alias FROM target_aliases').all() as { alias: string }[]
      const aliasNames = aliases.map((a) => a.alias)
      expect(aliasNames).toContain('AC1')
      expect(aliasNames).toContain('NGC 1234')
      expect(aliasNames).toContain('Sh2-100')
    })
  })

  describe('EARS: Cross-Catalogue Deduplication', () => {
    // Event: A second catalogue is loaded that references the same physical object
    // Action: System detects existing target by name or alias match
    // Response: No duplicate target is created; a new catalogue entry links to the existing target
    // State: One target row with entries from both catalogues

    it('Given a target already exists by canonical name, When a second catalogue references it, Then it links to the same target', () => {
      const seed1 = {
        catalogue: { name: 'Cat1', abbreviation: 'C1', description: '', totalObjects: 1 },
        objects: [
          { designation: 'C1-001', name: 'Orion Nebula', type: 'emission_nebula', ra: 5.588, dec: -5.39, mag: 4.0, size: 65.0, constellation: 'Orion', aliases: ['M42'] }
        ]
      }
      const seed2 = {
        catalogue: { name: 'Cat2', abbreviation: 'C2', description: '', totalObjects: 1 },
        objects: [
          { designation: 'C2-042', name: 'Orion Nebula', type: 'emission_nebula', ra: 5.588, dec: -5.39, mag: 4.0, size: 65.0, constellation: 'Orion', aliases: ['NGC 1976'] }
        ]
      }

      loadSeedDirect(sqlite, seed1)
      loadSeedDirect(sqlite, seed2)

      const targets = sqlite.prepare('SELECT COUNT(*) as cnt FROM targets WHERE canonical_name = ?').get('Orion Nebula') as { cnt: number }
      expect(targets.cnt).toBe(1)

      const entries = sqlite.prepare('SELECT COUNT(*) as cnt FROM catalogue_entries').get() as { cnt: number }
      expect(entries.cnt).toBe(2)
    })

    it('Given a target exists with an alias, When a new catalogue references that alias as its name, Then it links to the existing target', () => {
      const seed1 = {
        catalogue: { name: 'FirstCat', abbreviation: 'FC', description: '', totalObjects: 1 },
        objects: [
          { designation: 'FC-1', name: 'North America Nebula', type: 'emission_nebula', ra: 20.98, dec: 44.53, mag: 4.0, size: 120.0, constellation: 'Cygnus', aliases: ['NGC7000'] }
        ]
      }

      loadSeedDirect(sqlite, seed1)

      const seed2 = {
        catalogue: { name: 'SecondCat', abbreviation: 'SC', description: '', totalObjects: 1 },
        objects: [
          { designation: 'SC-1', name: 'NGC7000', type: 'emission_nebula', ra: 20.98, dec: 44.53, mag: 4.0, size: 120.0, constellation: 'Cygnus', aliases: ['C20'] }
        ]
      }

      loadSeedDirect(sqlite, seed2)

      const targets = sqlite.prepare('SELECT COUNT(*) as cnt FROM targets').get() as { cnt: number }
      expect(targets.cnt).toBe(1)
    })
  })

  describe('EARS: FTS Index Integration', () => {
    // Event: Seed data is loaded and FTS index is rebuilt
    // Action: FTS5 virtual table is populated from targets and aliases
    // Response: Full-text search queries return matching targets
    // State: FTS index consistent with current target data

    it('Given targets are seeded, When FTS index is rebuilt, Then searching by name returns results', () => {
      const seed = {
        catalogue: { name: 'FTSCat', abbreviation: 'FT', description: '', totalObjects: 2 },
        objects: [
          { designation: 'FT1', name: 'Eagle Nebula', type: 'emission_nebula', ra: 18.31, dec: -13.78, mag: 6.0, size: 35.0, constellation: 'Serpens', aliases: ['M16'] },
          { designation: 'FT2', name: 'Swan Nebula', type: 'emission_nebula', ra: 18.34, dec: -16.18, mag: 6.0, size: 46.0, constellation: 'Sagittarius', aliases: ['M17'] }
        ]
      }

      loadSeedDirect(sqlite, seed)
      rebuildFtsIndex(sqlite)

      const results = sqlite.prepare("SELECT * FROM targets_fts WHERE targets_fts MATCH '\"Eagle\"*'").all()
      expect(results.length).toBeGreaterThanOrEqual(1)
    })
  })
})

function loadSeedDirect(sqlite: Database.Database, seed: {
  catalogue: { name: string; abbreviation: string; description: string; totalObjects: number }
  objects: Array<{
    designation: string; name: string; type: string; ra: number | null; dec: number | null
    mag: number | null; size: number | null; constellation: string; aliases: string[]
  }>
}): void {
  const now = new Date().toISOString()

  const catId = ulid()
  sqlite.prepare(
    'INSERT INTO catalogues (id, name, abbreviation, description, total_objects, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
  ).run(catId, seed.catalogue.name, seed.catalogue.abbreviation, seed.catalogue.description, seed.catalogue.totalObjects, now)

  for (const obj of seed.objects) {
    let targetId: string | null = null

    const existingByName = sqlite.prepare(
      `SELECT t.id FROM targets t LEFT JOIN target_aliases ta ON ta.target_id = t.id WHERE t.canonical_name = ? OR ta.alias = ? LIMIT 1`
    ).get(obj.name, obj.name) as { id: string } | undefined

    if (existingByName) {
      targetId = existingByName.id
    }

    if (!targetId) {
      for (const alias of obj.aliases) {
        const existingByAlias = sqlite.prepare(
          `SELECT t.id FROM targets t LEFT JOIN target_aliases ta ON ta.target_id = t.id WHERE t.canonical_name = ? OR ta.alias = ? LIMIT 1`
        ).get(alias, alias) as { id: string } | undefined
        if (existingByAlias) {
          targetId = existingByAlias.id
          break
        }
      }
    }

    if (!targetId) {
      targetId = ulid()
      sqlite.prepare(
        `INSERT OR IGNORE INTO targets (id, canonical_name, object_type, ra_hours, dec_degrees, magnitude,
          angular_size_arcmin, constellation, description, simbad_id, ned_id, workflow_stage, is_custom,
          folder_path, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'not_observed', 0, NULL, NULL, ?, ?)`
      ).run(targetId, obj.name, obj.type, obj.ra, obj.dec, obj.mag, obj.size, obj.constellation, now, now)
    }

    sqlite.prepare('INSERT OR IGNORE INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, ?, ?, ?)')
      .run(ulid(), catId, targetId, obj.designation)

    if (obj.designation !== obj.name) {
      sqlite.prepare('INSERT OR IGNORE INTO target_aliases (id, target_id, alias, source) VALUES (?, ?, ?, ?)')
        .run(ulid(), targetId, obj.designation, seed.catalogue.abbreviation)
    }
    for (const alias of obj.aliases) {
      sqlite.prepare('INSERT OR IGNORE INTO target_aliases (id, target_id, alias, source) VALUES (?, ?, ?, ?)')
        .run(ulid(), targetId, alias, 'cross-reference')
    }
  }
}
