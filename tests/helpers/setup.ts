import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../src/main/db/schema'

let testSqlite: Database.Database | null = null

export function setupTestDb(): Database.Database {
  testSqlite = new Database(':memory:')
  testSqlite.pragma('journal_mode = WAL')
  testSqlite.pragma('foreign_keys = ON')
  runMigrations(testSqlite)
  return testSqlite
}

export function teardownTestDb(): void {
  if (testSqlite) {
    testSqlite.close()
    testSqlite = null
  }
}

export function getTestSqlite(): Database.Database {
  if (!testSqlite) throw new Error('Test database not initialized')
  return testSqlite
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
      source TEXT DEFAULT 'manual',
      session_folder TEXT,
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
      target_id TEXT REFERENCES targets(id) ON DELETE SET NULL,
      fwhm_estimate REAL,
      background_level REAL,
      star_count_estimate INTEGER,
      noise_level REAL,
      quality_score REAL,
      quality_flag TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_fits_file_target ON fits_files(target_id);
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

    INSERT OR IGNORE INTO folder_templates (id, name, structure, is_builtin, created_at) VALUES
      ('ft-siril', 'Siril Default', '{"lights":{},"darks":{},"biases":{},"flats":{}}', 1, datetime('now'));
  `)
}

export function seedTarget(sqlite: Database.Database, overrides: Partial<{
  id: string
  canonicalName: string
  objectType: string
  raHours: number | null
  decDegrees: number | null
  magnitude: number | null
  constellation: string | null
  workflowStage: string
}> = {}): string {
  const id = overrides.id ?? `target-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()
  sqlite.prepare(
    `INSERT INTO targets (id, canonical_name, object_type, ra_hours, dec_degrees, magnitude,
      angular_size_arcmin, constellation, description, simbad_id, ned_id,
      workflow_stage, is_custom, folder_path, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, ?, 1, NULL, NULL, ?, ?)`
  ).run(
    id,
    overrides.canonicalName ?? `Target ${id}`,
    overrides.objectType ?? 'galaxy',
    overrides.raHours ?? null,
    overrides.decDegrees ?? null,
    overrides.magnitude ?? null,
    overrides.constellation ?? null,
    overrides.workflowStage ?? 'planned',
    now,
    now
  )
  return id
}

export function seedFitsScan(sqlite: Database.Database, overrides: Partial<{
  id: string
  folderPath: string
  fileCount: number
  totalSizeBytes: number
  status: string
}> = {}): string {
  const id = overrides.id ?? `scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()
  sqlite.prepare(
    `INSERT INTO fits_scans (id, folder_path, file_count, total_size_bytes, status, started_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    overrides.folderPath ?? '/test/fits',
    overrides.fileCount ?? 0,
    overrides.totalSizeBytes ?? 0,
    overrides.status ?? 'completed',
    now,
    now
  )
  return id
}

export function seedFitsFile(sqlite: Database.Database, scanId: string, overrides: Partial<{
  id: string
  fileName: string
  filePath: string
  fileSizeBytes: number
  folderName: string | null
  sessionFolder: string | null
  objectName: string | null
  imageType: string | null
  filter: string | null
  exposureSec: number | null
  dateObs: string | null
  isStacked: boolean
  gain: number | null
  ccdTemp: number | null
  xbinning: number | null
  ybinning: number | null
  telescope: string | null
  instrument: string | null
}> = {}): string {
  const id = overrides.id ?? `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()
  const fileName = overrides.fileName ?? `test_${id}.fits`
  sqlite.prepare(
    `INSERT INTO fits_files (
      id, scan_id, file_path, file_name, file_size_bytes, folder_name, session_folder,
      object_name, image_type, filter, exposure_sec, date_obs, is_stacked,
      gain, ccd_temp, xbinning, ybinning, telescope, instrument, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    scanId,
    overrides.filePath ?? `/test/fits/${fileName}`,
    fileName,
    overrides.fileSizeBytes ?? 1024000,
    overrides.folderName ?? null,
    overrides.sessionFolder ?? null,
    overrides.objectName ?? null,
    overrides.imageType ?? 'Light Frame',
    overrides.filter ?? null,
    overrides.exposureSec ?? null,
    overrides.dateObs ?? null,
    overrides.isStacked ? 1 : 0,
    overrides.gain ?? null,
    overrides.ccdTemp ?? null,
    overrides.xbinning ?? null,
    overrides.ybinning ?? null,
    overrides.telescope ?? null,
    overrides.instrument ?? null,
    now
  )
  return id
}

export function seedEquipment(sqlite: Database.Database, overrides: Partial<{
  id: string
  name: string
  equipmentType: string
}> = {}): string {
  const id = overrides.id ?? `eq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  sqlite.prepare(
    'INSERT INTO equipment (id, name, equipment_type, manufacturer, model, serial_number, notes, is_active, created_at) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 1, ?)'
  ).run(id, overrides.name ?? 'Test Scope', overrides.equipmentType ?? 'telescope', new Date().toISOString())
  return id
}
