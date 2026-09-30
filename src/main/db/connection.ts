import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { initFts } from './fts'
import { runMigrations } from './migrations'

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
  sqlite.pragma('busy_timeout = 5000')
  runMigrations(sqlite)
  try {
    initFts(sqlite)
  } catch {
    console.warn('FTS5 initialization skipped — search will use LIKE fallback')
  }
}

export function getSqlite(): Database.Database {
  if (!sqlite) throw new Error('Database not initialized. Call initDatabase() first.')
  return sqlite
}

export function resetDatabase(): { cleared: boolean } {
  if (!sqlite) throw new Error('Database not initialized')
  sqlite.exec(`
    DELETE FROM jobs;
    DELETE FROM dismissed_suggestions;
    DELETE FROM quarantined_files;
    DELETE FROM file_hashes;
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
    -- The library is gone, so the last scan no longer describes it (the Get set up checklist reads these).
    DELETE FROM app_settings WHERE key IN ('last_library_scan', 'last_library_scan_folder');
  `)
  sqlite.exec('VACUUM')
  return { cleared: true }
}

