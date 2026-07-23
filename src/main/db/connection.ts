import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import path from 'path'
import * as schema from './schema'
import { initFts } from './fts'

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
  try {
    initFts(sqlite)
  } catch {
    console.warn('FTS5 initialization skipped — search will use LIKE fallback')
  }
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
      workflow_stage TEXT NOT NULL DEFAULT 'not_observed',
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
      observatory_id TEXT,
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

    CREATE TABLE IF NOT EXISTS fits_scans (
      id TEXT PRIMARY KEY,
      folder_path TEXT NOT NULL,
      file_count INTEGER NOT NULL DEFAULT 0,
      total_size_bytes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running',
      error_message TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fits_files (
      id TEXT PRIMARY KEY,
      scan_id TEXT NOT NULL REFERENCES fits_scans(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      file_modified_at TEXT,
      folder_name TEXT,
      session_folder TEXT,
      object_name TEXT,
      telescope TEXT,
      instrument TEXT,
      observer TEXT,
      exposure_sec REAL,
      date_obs TEXT,
      filter TEXT,
      gain REAL,
      offset_val REAL,
      ccd_temp REAL,
      xpixsz REAL,
      ypixsz REAL,
      xbinning INTEGER,
      ybinning INTEGER,
      ra TEXT,
      dec TEXT,
      airmass REAL,
      bitpix INTEGER,
      naxis1 INTEGER,
      naxis2 INTEGER,
      bscale REAL,
      bzero REAL,
      image_type TEXT,
      software TEXT,
      is_stacked INTEGER NOT NULL DEFAULT 0,
      ncombine INTEGER,
      total_exposure REAL,
      calstat TEXT,
      pixel_min REAL,
      pixel_max REAL,
      pixel_mean REAL,
      pixel_stddev REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fits_thumbnails (
      file_id TEXT PRIMARY KEY REFERENCES fits_files(id) ON DELETE CASCADE,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fits_headers (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES fits_files(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL,
      value TEXT,
      comment TEXT,
      ordinal INTEGER NOT NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_target_alias_alias ON target_aliases(alias);
    CREATE INDEX IF NOT EXISTS idx_fits_scan_status ON fits_scans(status);
    CREATE INDEX IF NOT EXISTS idx_fits_scan_started ON fits_scans(started_at);
    CREATE INDEX IF NOT EXISTS idx_fits_file_scan ON fits_files(scan_id);
    CREATE INDEX IF NOT EXISTS idx_fits_file_object ON fits_files(object_name);
    CREATE INDEX IF NOT EXISTS idx_fits_file_filter ON fits_files(filter);
    CREATE INDEX IF NOT EXISTS idx_fits_file_date_obs ON fits_files(date_obs);
    CREATE INDEX IF NOT EXISTS idx_fits_file_image_type ON fits_files(image_type);
    CREATE INDEX IF NOT EXISTS idx_fits_file_is_stacked ON fits_files(is_stacked);
    CREATE INDEX IF NOT EXISTS idx_fits_file_folder ON fits_files(folder_name);
    CREATE INDEX IF NOT EXISTS idx_fits_file_session_folder ON fits_files(session_folder);
    CREATE INDEX IF NOT EXISTS idx_fits_header_file ON fits_headers(file_id);
    CREATE INDEX IF NOT EXISTS idx_fits_header_keyword ON fits_headers(keyword);
    CREATE INDEX IF NOT EXISTS idx_target_canonical ON targets(canonical_name);
    CREATE INDEX IF NOT EXISTS idx_target_type ON targets(object_type);
    CREATE INDEX IF NOT EXISTS idx_target_stage ON targets(workflow_stage);
    CREATE INDEX IF NOT EXISTS idx_catalogue_entry_designation ON catalogue_entries(designation);
    CREATE INDEX IF NOT EXISTS idx_catalogue_entry_target ON catalogue_entries(target_id);
    CREATE INDEX IF NOT EXISTS idx_session_date ON observation_sessions(date);
    CREATE INDEX IF NOT EXISTS idx_collection_membership_target ON collection_memberships(target_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_transition_target ON workflow_transitions(target_id);
    CREATE INDEX IF NOT EXISTS idx_relationship_source ON target_relationships(source_target_id);
    CREATE INDEX IF NOT EXISTS idx_relationship_related ON target_relationships(related_target_id);

    -- Default workflow stages
    INSERT OR IGNORE INTO workflow_stages (id, name, sort_order, is_default) VALUES
      ('ws-00', 'not_observed', 0, 1),
      ('ws-04', 'raw_captured', 1, 1),
      ('ws-05', 'calibrated', 2, 1),
      ('ws-06', 'registered', 3, 1),
      ('ws-07', 'integrated', 4, 1),
      ('ws-08', 'processing', 5, 1),
      ('ws-09', 'edited', 6, 1),
      ('ws-10', 'published', 7, 1),
      ('ws-11', 'printed', 8, 1),
      ('ws-12', 'archived', 9, 1);

    -- Default Siril folder template
    CREATE TABLE IF NOT EXISTS storage_snapshots (
      id TEXT PRIMARY KEY,
      snapshot_date TEXT NOT NULL,
      total_files INTEGER NOT NULL,
      total_size_bytes INTEGER NOT NULL,
      lights_size_bytes INTEGER NOT NULL DEFAULT 0,
      darks_size_bytes INTEGER NOT NULL DEFAULT 0,
      flats_size_bytes INTEGER NOT NULL DEFAULT 0,
      bias_size_bytes INTEGER NOT NULL DEFAULT 0,
      other_size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_storage_snapshot_date ON storage_snapshots(snapshot_date);

    INSERT OR IGNORE INTO folder_templates (id, name, structure, is_builtin, created_at) VALUES
      ('ft-siril', 'Siril Default', '{"lights":{},"darks":{},"biases":{},"flats":{}}', 1, datetime('now'));
  `)

  // Migration: add target_id to fits_files
  const hasTargetId = sqlite.prepare("SELECT COUNT(*) as cnt FROM pragma_table_info('fits_files') WHERE name='target_id'").get() as { cnt: number }
  if (hasTargetId.cnt === 0) {
    sqlite.exec(`
      ALTER TABLE fits_files ADD COLUMN target_id TEXT REFERENCES targets(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_fits_file_target ON fits_files(target_id);
    `)
  }

  // Migration: add source and session_folder to observation_sessions
  const hasSource = sqlite.prepare("SELECT COUNT(*) as cnt FROM pragma_table_info('observation_sessions') WHERE name='source'").get() as { cnt: number }
  if (hasSource.cnt === 0) {
    sqlite.exec(`
      ALTER TABLE observation_sessions ADD COLUMN source TEXT DEFAULT 'manual';
      ALTER TABLE observation_sessions ADD COLUMN session_folder TEXT;
    `)
  }

  // Migration: add thumbnail_path to targets
  const hasThumbnailPath = sqlite.prepare("SELECT COUNT(*) as cnt FROM pragma_table_info('targets') WHERE name='thumbnail_path'").get() as { cnt: number }
  if (hasThumbnailPath.cnt === 0) {
    sqlite.exec(`ALTER TABLE targets ADD COLUMN thumbnail_path TEXT`)
  }

  // Migration: remove old workflow stages and update targets that used them
  sqlite.exec(`
    UPDATE targets SET workflow_stage = 'not_observed' WHERE workflow_stage IN ('planned', 'scheduled', 'observed');
    DELETE FROM workflow_stages WHERE name IN ('planned', 'scheduled', 'observed');
  `)

  // Migration: reset raw_captured targets with no FITS data back to not_observed
  sqlite.exec(`
    UPDATE targets SET workflow_stage = 'not_observed'
    WHERE workflow_stage = 'raw_captured'
    AND id NOT IN (SELECT DISTINCT target_id FROM fits_files WHERE target_id IS NOT NULL);
  `)

  // Migration: add target_home_data table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS target_home_data (
      target_id TEXT PRIMARY KEY REFERENCES targets(id) ON DELETE CASCADE,
      raw_files INTEGER NOT NULL DEFAULT 0,
      stacked_files INTEGER NOT NULL DEFAULT 0,
      tif_files INTEGER NOT NULL DEFAULT 0,
      image_files INTEGER NOT NULL DEFAULT 0,
      raw_path TEXT,
      stacked_path TEXT,
      tif_path TEXT,
      images_path TEXT,
      suggested_stage TEXT,
      scanned_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS target_home_folders (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      folder_type TEXT NOT NULL,
      subfolder_name TEXT,
      subfolder_path TEXT NOT NULL,
      file_count INTEGER NOT NULL DEFAULT 0,
      total_size_bytes INTEGER NOT NULL DEFAULT 0,
      scanned_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_home_folders_target ON target_home_folders(target_id);
  `)

  // Migration: add integration_goals table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS integration_goals (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      filter TEXT NOT NULL,
      goal_seconds REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(target_id, filter)
    );
    CREATE INDEX IF NOT EXISTS idx_integration_goal_target ON integration_goals(target_id);
  `)

  // Migration: add quality columns to fits_files
  const hasFwhm = sqlite.prepare("SELECT COUNT(*) as cnt FROM pragma_table_info('fits_files') WHERE name='fwhm_estimate'").get() as { cnt: number }
  if (hasFwhm.cnt === 0) {
    sqlite.exec(`
      ALTER TABLE fits_files ADD COLUMN fwhm_estimate REAL;
      ALTER TABLE fits_files ADD COLUMN background_level REAL;
      ALTER TABLE fits_files ADD COLUMN star_count_estimate INTEGER;
      ALTER TABLE fits_files ADD COLUMN noise_level REAL;
      ALTER TABLE fits_files ADD COLUMN quality_score REAL;
      ALTER TABLE fits_files ADD COLUMN quality_flag TEXT;
    `)
  }
}

export function resetDatabase(): { cleared: boolean } {
  if (!sqlite) throw new Error('Database not initialized')
  sqlite.exec(`
    DELETE FROM fits_headers;
    DELETE FROM fits_thumbnails;
    DELETE FROM fits_files;
    DELETE FROM fits_scans;
    DELETE FROM target_home_folders;
    DELETE FROM target_home_data;
    DELETE FROM workflow_transitions;
    DELETE FROM session_targets;
    DELETE FROM session_equipment;
    DELETE FROM observation_sessions;
    DELETE FROM collection_memberships;
    DELETE FROM collections;
    DELETE FROM catalogue_entries;
    DELETE FROM target_aliases;
    DELETE FROM target_relationships;
    DELETE FROM integration_goals;
    DELETE FROM storage_snapshots;
    DELETE FROM targets;
    DELETE FROM catalogues;
  `)
  sqlite.exec('VACUUM')
  return { cleared: true }
}

export function createTestDatabase(): { db: ReturnType<typeof drizzle>; sqlite: Database.Database } {
  const testSqlite = new Database(':memory:')
  testSqlite.pragma('journal_mode = WAL')
  testSqlite.pragma('foreign_keys = ON')
  const testDb = drizzle(testSqlite, { schema })
  runMigrations(testSqlite)
  return { db: testDb, sqlite: testSqlite }
}
