import Database from 'better-sqlite3'
import { initFts } from '../../src/main/db/fts'
import { runMigrations } from '../../src/main/db/migrations'

let testSqlite: Database.Database | null = null

export function setupTestDb(): Database.Database {
  testSqlite = new Database(':memory:')
  testSqlite.pragma('journal_mode = WAL')
  testSqlite.pragma('foreign_keys = ON')
  testSqlite.pragma('busy_timeout = 5000')
  runMigrations(testSqlite)
  initFts(testSqlite)
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
    overrides.workflowStage ?? 'not_observed',
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
  ncombine: number | null
  totalExposure: number | null
  software: string | null
  gain: number | null
  ccdTemp: number | null
  xbinning: number | null
  ybinning: number | null
  telescope: string | null
  instrument: string | null
  targetId: string | null
  qualityScore: number | null
  qualityFlag: string | null
  fwhmEstimate: number | null
  noiseLevel: number | null
}> = {}): string {
  const id = overrides.id ?? `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()
  const fileName = overrides.fileName ?? `test_${id}.fits`
  sqlite.prepare(
    `INSERT INTO fits_files (
      id, scan_id, file_path, file_name, file_size_bytes, folder_name, session_folder,
      object_name, image_type, filter, exposure_sec, date_obs, is_stacked,
      ncombine, total_exposure, software,
      gain, ccd_temp, xbinning, ybinning, telescope, instrument, target_id,
      quality_score, quality_flag, fwhm_estimate, noise_level, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    overrides.ncombine ?? null,
    overrides.totalExposure ?? null,
    overrides.software ?? null,
    overrides.gain ?? null,
    overrides.ccdTemp ?? null,
    overrides.xbinning ?? null,
    overrides.ybinning ?? null,
    overrides.telescope ?? null,
    overrides.instrument ?? null,
    overrides.targetId ?? null,
    overrides.qualityScore ?? null,
    overrides.qualityFlag ?? null,
    overrides.fwhmEstimate ?? null,
    overrides.noiseLevel ?? null,
    now
  )
  return id
}

export function seedIntegrationGoal(sqlite: Database.Database, overrides: Partial<{
  id: string
  targetId: string
  filter: string
  goalSeconds: number
}> = {}): string {
  const id = overrides.id ?? `goal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()
  sqlite.prepare(
    `INSERT INTO integration_goals (id, target_id, filter, goal_seconds, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, overrides.targetId ?? 'target-1', overrides.filter ?? 'Ha', overrides.goalSeconds ?? 21600, now, now)
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
