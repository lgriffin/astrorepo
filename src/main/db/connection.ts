import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import path from 'path'
import * as schema from './schema'

let db: ReturnType<typeof drizzle> | null = null
let sqlite: Database.Database | null = null

export function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'astrorepo.db')
}

export function initDatabase(): void {
  const dbPath = getDbPath()
  sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  runMigrations(sqlite)
}

export function getDb(): ReturnType<typeof drizzle> {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

export function getSqlite(): Database.Database {
  if (!sqlite) throw new Error('Database not initialized. Call initDatabase() first.')
  return sqlite
}

function runMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS targets (
      id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL UNIQUE,
      object_type TEXT NOT NULL,
      ra_hours REAL,
      dec_degrees REAL,
      magnitude REAL,
      angular_size_arcmin REAL,
      constellation TEXT,
      description TEXT,
      simbad_id TEXT,
      ned_id TEXT,
      workflow_stage TEXT NOT NULL DEFAULT 'planned',
      is_custom INTEGER NOT NULL DEFAULT 0,
      folder_path TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS target_aliases (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      alias TEXT NOT NULL UNIQUE,
      source TEXT
    );

    CREATE TABLE IF NOT EXISTS catalogues (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      abbreviation TEXT NOT NULL UNIQUE,
      description TEXT,
      total_objects INTEGER,
      is_builtin INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalogue_entries (
      id TEXT PRIMARY KEY,
      catalogue_id TEXT NOT NULL REFERENCES catalogues(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      designation TEXT NOT NULL,
      UNIQUE(catalogue_id, designation),
      UNIQUE(catalogue_id, target_id)
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_auto INTEGER NOT NULL DEFAULT 0,
      source_catalogue_id TEXT REFERENCES catalogues(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collection_memberships (
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL,
      PRIMARY KEY (collection_id, target_id)
    );

    CREATE TABLE IF NOT EXISTS observation_sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      observatory_id TEXT REFERENCES observatories(id),
      location_freetext TEXT,
      sky_quality REAL,
      weather TEXT,
      seeing TEXT,
      transparency TEXT,
      moon_phase REAL,
      moon_distance REAL,
      guiding_notes TEXT,
      exposure_strategy TEXT,
      total_frames INTEGER,
      accepted_frames INTEGER,
      rejected_frames INTEGER,
      total_exposure_sec REAL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_targets (
      session_id TEXT NOT NULL REFERENCES observation_sessions(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (session_id, target_id)
    );

    CREATE TABLE IF NOT EXISTS equipment (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      equipment_type TEXT NOT NULL,
      manufacturer TEXT,
      model TEXT,
      serial_number TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_equipment (
      session_id TEXT NOT NULL REFERENCES observation_sessions(id) ON DELETE CASCADE,
      equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      role TEXT,
      PRIMARY KEY (session_id, equipment_id)
    );

    CREATE TABLE IF NOT EXISTS observatories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      altitude_m REAL NOT NULL DEFAULT 0,
      timezone TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS workflow_transitions (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      from_stage TEXT,
      to_stage TEXT NOT NULL,
      transitioned_at TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS target_relationships (
      id TEXT PRIMARY KEY,
      source_target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      related_target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      relationship_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(source_target_id, related_target_id, relationship_type),
      CHECK(source_target_id != related_target_id)
    );

    CREATE TABLE IF NOT EXISTS folder_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      structure TEXT NOT NULL,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_target_alias_alias ON target_aliases(alias);
    CREATE INDEX IF NOT EXISTS idx_target_canonical ON targets(canonical_name);
    CREATE INDEX IF NOT EXISTS idx_target_type ON targets(object_type);
    CREATE INDEX IF NOT EXISTS idx_target_stage ON targets(workflow_stage);
    CREATE INDEX IF NOT EXISTS idx_catalogue_entry_designation ON catalogue_entries(designation);
    CREATE INDEX IF NOT EXISTS idx_catalogue_entry_target ON catalogue_entries(target_id);
    CREATE INDEX IF NOT EXISTS idx_session_date ON observation_sessions(date);
    CREATE INDEX IF NOT EXISTS idx_session_observatory ON observation_sessions(observatory_id);
    CREATE INDEX IF NOT EXISTS idx_collection_membership_target ON collection_memberships(target_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_transition_target ON workflow_transitions(target_id);
    CREATE INDEX IF NOT EXISTS idx_relationship_source ON target_relationships(source_target_id);
    CREATE INDEX IF NOT EXISTS idx_relationship_related ON target_relationships(related_target_id);

    -- Default workflow stages
    INSERT OR IGNORE INTO workflow_stages (id, name, sort_order, is_default) VALUES
      ('ws-01', 'planned', 1, 1),
      ('ws-02', 'scheduled', 2, 1),
      ('ws-03', 'observed', 3, 1),
      ('ws-04', 'raw_captured', 4, 1),
      ('ws-05', 'calibrated', 5, 1),
      ('ws-06', 'registered', 6, 1),
      ('ws-07', 'integrated', 7, 1),
      ('ws-08', 'processing', 8, 1),
      ('ws-09', 'edited', 9, 1),
      ('ws-10', 'published', 10, 1),
      ('ws-11', 'printed', 11, 1),
      ('ws-12', 'archived', 12, 1);

    -- Default Siril folder template
    INSERT OR IGNORE INTO folder_templates (id, name, structure, is_builtin, created_at) VALUES
      ('ft-siril', 'Siril Default', '{"lights":{},"darks":{},"biases":{},"flats":{}}', 1, datetime('now'));
  `)
}

export function createTestDatabase(): { db: ReturnType<typeof drizzle>; sqlite: Database.Database } {
  const testSqlite = new Database(':memory:')
  testSqlite.pragma('journal_mode = WAL')
  testSqlite.pragma('foreign_keys = ON')
  const testDb = drizzle(testSqlite, { schema })
  runMigrations(testSqlite)
  return { db: testDb, sqlite: testSqlite }
}
