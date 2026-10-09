import type Database from 'better-sqlite3'

/**
 * The one schema source. Production (connection.ts) and tests (tests/helpers/setup.ts) both run it,
 * so the test schema can never drift from the real one. No Electron import, so it runs anywhere.
 */
export function runMigrations(sqlite: Database.Database): void {
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

  // Versioned migrations — run once per schema version bump
  const version = getSchemaVersion(sqlite)

  if (version < 1) {
    sqlite.exec(`
      UPDATE targets SET workflow_stage = 'not_observed' WHERE workflow_stage IN ('planned', 'scheduled', 'observed');
      DELETE FROM workflow_stages WHERE name IN ('planned', 'scheduled', 'observed');
      UPDATE targets SET workflow_stage = 'not_observed'
      WHERE workflow_stage = 'raw_captured'
      AND id NOT IN (SELECT DISTINCT target_id FROM fits_files WHERE target_id IS NOT NULL);
    `)
    setSchemaVersion(sqlite, 1)
  }

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

  // Migration: add equipment profile columns
  const hasFocalLength = sqlite.prepare("SELECT COUNT(*) as cnt FROM pragma_table_info('equipment') WHERE name='focal_length_mm'").get() as { cnt: number }
  if (hasFocalLength.cnt === 0) {
    sqlite.exec(`
      ALTER TABLE equipment ADD COLUMN focal_length_mm REAL;
      ALTER TABLE equipment ADD COLUMN aperture_mm REAL;
      ALTER TABLE equipment ADD COLUMN sensor_width_mm REAL;
      ALTER TABLE equipment ADD COLUMN sensor_height_mm REAL;
      ALTER TABLE equipment ADD COLUMN pixel_size_um REAL;
      ALTER TABLE equipment ADD COLUMN sensor_width_px INTEGER;
      ALTER TABLE equipment ADD COLUMN sensor_height_px INTEGER;
      ALTER TABLE equipment ADD COLUMN reducer_factor REAL;
    `)
  }

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

  // Migration: cockpit suggestions the user set aside, until the target's data changes (DSC-008)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS dismissed_suggestions (
      suggestion_id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      dismissed_at TEXT NOT NULL
    );
  `)

  // Migration: files a scan could not read, kept with the reason instead of skipped (ING-006)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS quarantined_files (
      file_path TEXT PRIMARY KEY,
      folder_path TEXT NOT NULL,
      error TEXT NOT NULL,
      size_bytes INTEGER,
      modified_at TEXT,
      quarantined_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quarantined_folder ON quarantined_files(folder_path);
  `)

  // Migration: content hashes for duplicate finding, reused while size and mtime hold (ING-003, ING-008)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS file_hashes (
      file_path TEXT PRIMARY KEY,
      size_bytes INTEGER NOT NULL,
      modified_at TEXT NOT NULL,
      quick_key TEXT NOT NULL,
      full_hash TEXT,
      hashed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_file_hashes_full ON file_hashes(full_hash);
  `)

  // Migration: confirmed Siril and Siril_Scripts runs, queued for the run window (JOB-001)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      title TEXT NOT NULL,
      timing TEXT NOT NULL,
      state TEXT NOT NULL,
      command TEXT NOT NULL,
      prepare TEXT,
      space_dir TEXT NOT NULL,
      needed_bytes INTEGER NOT NULL,
      queued_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      exit_code INTEGER,
      note TEXT,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
  `)

  // Migration: how far a stack run step by step got, so it can carry on (PRV-003)
  const hasProgress = sqlite.prepare("SELECT COUNT(*) as cnt FROM pragma_table_info('jobs') WHERE name='progress'").get() as { cnt: number }
  if (hasProgress.cnt === 0) sqlite.exec('ALTER TABLE jobs ADD COLUMN progress TEXT')

  // Migration: each light's measurement and the user's keep or reject (GRD-001, GRD-005).
  // Keyed by path so a rescan keeps them; size and modified time tell a stale measurement.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS frame_grades (
      file_path TEXT PRIMARY KEY,
      size_bytes INTEGER,
      modified_at TEXT,
      fwhm REAL,
      eccentricity REAL,
      star_count INTEGER,
      background REAL,
      noise REAL,
      snr REAL,
      measure_error TEXT,
      measured_at TEXT,
      override TEXT,
      override_at TEXT
    );
  `)

  // Migration: whether an override was made on the frame or by leaving out its night (ADV-008)
  const hasOverrideBy = sqlite.prepare("SELECT COUNT(*) as cnt FROM pragma_table_info('frame_grades') WHERE name='override_by'").get() as { cnt: number }
  if (hasOverrideBy.cnt === 0) sqlite.exec('ALTER TABLE frame_grades ADD COLUMN override_by TEXT')

  // Migration: targets archived, where and how, and what removing intermediates freed (ARC-010)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS target_archives (
      target_id TEXT PRIMARY KEY,
      archived_at TEXT NOT NULL,
      mode TEXT NOT NULL,
      archive_path TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      copied_bytes INTEGER NOT NULL,
      removed TEXT NOT NULL DEFAULT '[]',
      freed_bytes INTEGER NOT NULL DEFAULT 0
    );
  `)
}

function getSchemaVersion(db: Database.Database): number {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'schema_version'").get() as { value: string } | undefined
  return row ? parseInt(row.value, 10) : 0
}

function setSchemaVersion(db: Database.Database, version: number): void {
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', ?)").run(String(version))
}
