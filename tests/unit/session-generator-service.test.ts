import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedFitsScan, seedFitsFile, seedTarget } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite
}))

const {
  previewAutoSessions,
  generateSessions,
  getAutoSessionStatus
} = await import('../../src/main/services/session-generator')

describe('SessionGeneratorService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: Preview Auto Sessions', () => {
    it('Given files in one folder+session, When previewAutoSessions is called, Then returns one preview', () => {
      const scanId = seedFitsScan(sqlite, { id: 'scan-1' })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M31',
        sessionFolder: '2025-01-15',
        objectName: 'M31',
        imageType: 'Light Frame',
        exposureSec: 300,
        filter: 'Ha',
        dateObs: '2025-01-15T20:00:00'
      })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M31',
        sessionFolder: '2025-01-15',
        objectName: 'M31',
        imageType: 'Light Frame',
        exposureSec: 300,
        filter: 'OIII',
        dateObs: '2025-01-15T21:00:00'
      })

      const previews = previewAutoSessions('scan-1')
      expect(previews).toHaveLength(1)
      expect(previews[0].folderName).toBe('M31')
      expect(previews[0].sessionFolder).toBe('2025-01-15')
      expect(previews[0].lightCount).toBe(2)
      expect(previews[0].totalExposureSec).toBe(600)
      expect(previews[0].date).toBe('2025-01-15')
      expect(previews[0].filters).toContain('Ha')
      expect(previews[0].filters).toContain('OIII')
      expect(previews[0].existingSessionId).toBeNull()
    })

    it('Given files across multiple sessions, When previewAutoSessions is called, Then returns one per session', () => {
      const scanId = seedFitsScan(sqlite, { id: 'scan-multi' })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M31',
        sessionFolder: '2025-01-15',
        imageType: 'Light Frame',
        exposureSec: 300,
        dateObs: '2025-01-15T20:00:00'
      })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M31',
        sessionFolder: '2025-01-16',
        imageType: 'Light Frame',
        exposureSec: 300,
        dateObs: '2025-01-16T20:00:00'
      })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M42',
        sessionFolder: '2025-01-15',
        imageType: 'Light Frame',
        exposureSec: 600,
        dateObs: '2025-01-15T22:00:00'
      })

      const previews = previewAutoSessions('scan-multi')
      expect(previews).toHaveLength(3)
      const folders = previews.map((p) => `${p.folderName}/${p.sessionFolder}`)
      expect(folders).toContain('M31/2025-01-15')
      expect(folders).toContain('M31/2025-01-16')
      expect(folders).toContain('M42/2025-01-15')
    })

    it('Given files without DATE-OBS, When previewAutoSessions is called, Then extracts date from session folder', () => {
      const scanId = seedFitsScan(sqlite, { id: 'scan-nodate' })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M31',
        sessionFolder: '2025-01-15',
        imageType: 'Light Frame',
        exposureSec: 300,
        dateObs: null
      })

      const previews = previewAutoSessions('scan-nodate')
      expect(previews).toHaveLength(1)
      expect(previews[0].date).toBe('2025-01-15')
    })

    it('Given only dark frames, When previewAutoSessions is called, Then returns zero light count', () => {
      const scanId = seedFitsScan(sqlite, { id: 'scan-darks' })
      seedFitsFile(sqlite, scanId, {
        folderName: 'darks',
        sessionFolder: '2025-01-15',
        imageType: 'Dark Frame',
        exposureSec: 300,
        dateObs: '2025-01-15T20:00:00'
      })

      const previews = previewAutoSessions('scan-darks')
      expect(previews).toHaveLength(1)
      expect(previews[0].lightCount).toBe(0)
      expect(previews[0].totalExposureSec).toBe(0)
    })

    it('Given a matching target in the database, When previewAutoSessions is called, Then links the target', () => {
      const scanId = seedFitsScan(sqlite, { id: 'scan-target' })
      const targetId = seedTarget(sqlite, { canonicalName: 'M31', objectType: 'galaxy' })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M31',
        sessionFolder: '2025-01-15',
        objectName: 'M31',
        imageType: 'Light Frame',
        exposureSec: 300
      })

      const previews = previewAutoSessions('scan-target')
      expect(previews).toHaveLength(1)
      expect(previews[0].targetId).toBe(targetId)
      expect(previews[0].targetName).toBe('M31')
    })
  })

  describe('EARS: Generate Sessions', () => {
    it('Given preview entries, When generateSessions is called, Then creates sessions with correct dates and frame counts', () => {
      const scanId = seedFitsScan(sqlite, { id: 'scan-gen' })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M31',
        sessionFolder: '2025-01-15',
        objectName: 'M31',
        imageType: 'Light Frame',
        exposureSec: 300,
        filter: 'Ha',
        dateObs: '2025-01-15T20:00:00'
      })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M31',
        sessionFolder: '2025-01-15',
        objectName: 'M31',
        imageType: 'Light Frame',
        exposureSec: 300,
        filter: 'OIII',
        dateObs: '2025-01-15T21:00:00'
      })

      const result = generateSessions('scan-gen')
      expect(result.created).toBe(1)
      expect(result.skipped).toBe(0)
      expect(result.sessions).toHaveLength(1)
      expect(result.sessions[0].date).toBe('2025-01-15')
      expect(result.sessions[0].folderName).toBe('M31')

      // Verify the session in the database
      const session = sqlite.prepare('SELECT * FROM observation_sessions WHERE id = ?').get(result.sessions[0].id) as Record<string, unknown>
      expect(session.total_frames).toBe(2)
      expect(session.total_exposure_sec).toBe(600)
      expect(session.source).toBe('auto_fits')
      expect(session.session_folder).toBe('2025-01-15')
    })

    it('Given existing sessions, When generateSessions is called without overwrite, Then skips existing', () => {
      const scanId = seedFitsScan(sqlite, { id: 'scan-dup' })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M31',
        sessionFolder: '2025-01-15',
        imageType: 'Light Frame',
        exposureSec: 300,
        dateObs: '2025-01-15T20:00:00'
      })

      // Generate once
      const firstResult = generateSessions('scan-dup')
      expect(firstResult.created).toBe(1)

      // Generate again - should skip
      const secondResult = generateSessions('scan-dup')
      expect(secondResult.created).toBe(0)
      expect(secondResult.skipped).toBe(1)

      // Only one session should exist
      const count = sqlite.prepare('SELECT COUNT(*) as cnt FROM observation_sessions WHERE session_folder = ?').get('2025-01-15') as { cnt: number }
      expect(count.cnt).toBe(1)
    })

    it('Given existing sessions, When generateSessions is called with overwrite=true, Then replaces existing', () => {
      const scanId = seedFitsScan(sqlite, { id: 'scan-overwrite' })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M31',
        sessionFolder: '2025-01-15',
        imageType: 'Light Frame',
        exposureSec: 300,
        dateObs: '2025-01-15T20:00:00'
      })

      // Generate once
      const firstResult = generateSessions('scan-overwrite')
      const firstId = firstResult.sessions[0].id

      // Generate again with overwrite
      const secondResult = generateSessions('scan-overwrite', { overwrite: true })
      expect(secondResult.created).toBe(1)
      expect(secondResult.skipped).toBe(0)

      // The new session should have a different ID
      expect(secondResult.sessions[0].id).not.toBe(firstId)

      // Only one session should exist
      const count = sqlite.prepare('SELECT COUNT(*) as cnt FROM observation_sessions WHERE session_folder = ?').get('2025-01-15') as { cnt: number }
      expect(count.cnt).toBe(1)
    })

    it('Given generated sessions, When checked, Then all have source auto_fits', () => {
      const scanId = seedFitsScan(sqlite, { id: 'scan-source' })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M42',
        sessionFolder: '2025-02-10',
        imageType: 'Light Frame',
        exposureSec: 600,
        dateObs: '2025-02-10T19:00:00'
      })

      generateSessions('scan-source')

      const sessions = sqlite.prepare(
        "SELECT source FROM observation_sessions WHERE source = 'auto_fits'"
      ).all() as Array<{ source: string }>
      expect(sessions).toHaveLength(1)
      expect(sessions[0].source).toBe('auto_fits')
    })

    it('Given a target exists, When generateSessions is called, Then links the target via session_targets', () => {
      const scanId = seedFitsScan(sqlite, { id: 'scan-link' })
      const targetId = seedTarget(sqlite, { canonicalName: 'M42', objectType: 'emission_nebula' })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M42',
        sessionFolder: '2025-02-10',
        objectName: 'M42',
        imageType: 'Light Frame',
        exposureSec: 600,
        dateObs: '2025-02-10T19:00:00'
      })

      const result = generateSessions('scan-link')
      expect(result.created).toBe(1)

      const link = sqlite.prepare(
        'SELECT * FROM session_targets WHERE session_id = ? AND target_id = ?'
      ).get(result.sessions[0].id, targetId) as Record<string, unknown> | undefined
      expect(link).toBeDefined()
      expect(link!.is_primary).toBe(1)
    })
  })

  describe('EARS: Date Extraction from Session Folder Names', () => {
    it.each([
      ['2025-01-15', '2025-01-15'],
      ['20250115', '2025-01-15'],
      ['Night_2025-01-15', '2025-01-15'],
      ['session_2025_03_22', '2025-03-22'],
      ['2025-12-31_extra', '2025-12-31']
    ])('Given session folder "%s", When date is extracted, Then returns "%s"', (folderName, expectedDate) => {
      const scanId = seedFitsScan(sqlite, { id: `scan-date-${folderName}` })
      seedFitsFile(sqlite, scanId, {
        folderName: 'Target',
        sessionFolder: folderName,
        imageType: 'Light Frame',
        exposureSec: 300,
        dateObs: null
      })

      const previews = previewAutoSessions(`scan-date-${folderName}`)
      expect(previews).toHaveLength(1)
      expect(previews[0].date).toBe(expectedDate)
    })
  })

  describe('EARS: Auto Session Status', () => {
    it('Given a mix of existing and pending sessions, When getAutoSessionStatus is called, Then returns correct counts', () => {
      const scanId = seedFitsScan(sqlite, { id: 'scan-status' })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M31',
        sessionFolder: '2025-01-15',
        imageType: 'Light Frame',
        exposureSec: 300,
        dateObs: '2025-01-15T20:00:00'
      })
      seedFitsFile(sqlite, scanId, {
        folderName: 'M42',
        sessionFolder: '2025-01-16',
        imageType: 'Light Frame',
        exposureSec: 600,
        dateObs: '2025-01-16T20:00:00'
      })

      // Generate session for M31 only
      const now = new Date().toISOString()
      sqlite.prepare(
        `INSERT INTO observation_sessions (id, date, total_frames, total_exposure_sec, source, session_folder, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('existing-session-1', '2025-01-15', 1, 300, 'auto_fits', '2025-01-15', now, now)

      const status = getAutoSessionStatus('scan-status')
      expect(status.total).toBe(2)
      expect(status.existing).toBe(1)
      expect(status.pending).toBe(1)
    })
  })
})
