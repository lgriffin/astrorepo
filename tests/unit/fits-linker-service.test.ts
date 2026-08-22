import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedTarget, seedFitsScan, seedFitsFile } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite,
  getDb: () => null
}))

const {
  linkFitsFilesToTargets,
  manualLinkFile,
  unlinkFile,
  getLinkingStatus,
  getUnlinkedFiles
} = await import('../../src/main/services/fits-linker')

describe('FitsLinkerService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: Auto-linking by OBJECT header', () => {
    it('Event: FITS file OBJECT matches target canonical_name, Action: linkFitsFilesToTargets, Response: target_id set, State: file linked', () => {
      // Arrange
      const targetId = seedTarget(sqlite, { canonicalName: 'M31' })
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { objectName: 'M31' })

      // Act
      const result = linkFitsFilesToTargets(scanId)

      // Assert
      expect(result.linked).toBe(1)
      expect(result.unlinked).toBe(0)
      const row = sqlite.prepare('SELECT target_id FROM fits_files WHERE scan_id = ?').get(scanId) as { target_id: string | null }
      expect(row.target_id).toBe(targetId)
    })

    it('Event: FITS file OBJECT matches target alias, Action: linkFitsFilesToTargets, Response: target_id set, State: file linked via alias', () => {
      // Arrange
      const targetId = seedTarget(sqlite, { canonicalName: 'Andromeda Galaxy' })
      sqlite.prepare('INSERT INTO target_aliases (id, target_id, alias, source) VALUES (?, ?, ?, ?)').run(
        'alias-1', targetId, 'M31', 'user'
      )
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { objectName: 'M31' })

      // Act
      const result = linkFitsFilesToTargets(scanId)

      // Assert
      expect(result.linked).toBe(1)
      expect(result.unlinked).toBe(0)
      const row = sqlite.prepare('SELECT target_id FROM fits_files WHERE scan_id = ?').get(scanId) as { target_id: string | null }
      expect(row.target_id).toBe(targetId)
    })
  })

  describe('EARS: Auto-linking by folder_name', () => {
    it('Event: FITS file folder_name matches target name, Action: linkFitsFilesToTargets, Response: target_id set, State: file linked by folder', () => {
      // Arrange
      const targetId = seedTarget(sqlite, { canonicalName: 'NGC7000' })
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { folderName: 'NGC7000', objectName: null })

      // Act
      const result = linkFitsFilesToTargets(scanId)

      // Assert
      expect(result.linked).toBe(1)
      expect(result.unlinked).toBe(0)
      const row = sqlite.prepare('SELECT target_id FROM fits_files WHERE scan_id = ?').get(scanId) as { target_id: string | null }
      expect(row.target_id).toBe(targetId)
    })
  })

  describe('EARS: Catalog number normalization', () => {
    it('Event: "NGC7000" in file matches "NGC 7000" target, Action: linkFitsFilesToTargets, Response: fuzzy match works', () => {
      // Arrange
      const targetId = seedTarget(sqlite, { canonicalName: 'NGC 7000' })
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { objectName: 'NGC7000' })

      // Act
      const result = linkFitsFilesToTargets(scanId)

      // Assert
      expect(result.linked).toBe(1)
      const row = sqlite.prepare('SELECT target_id FROM fits_files WHERE scan_id = ?').get(scanId) as { target_id: string | null }
      expect(row.target_id).toBe(targetId)
    })

    it('Event: "NGC 7000" in file matches "NGC7000" target, Action: linkFitsFilesToTargets, Response: fuzzy match works in reverse', () => {
      // Arrange
      const targetId = seedTarget(sqlite, { canonicalName: 'NGC7000' })
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { objectName: 'NGC 7000' })

      // Act
      const result = linkFitsFilesToTargets(scanId)

      // Assert
      expect(result.linked).toBe(1)
      const row = sqlite.prepare('SELECT target_id FROM fits_files WHERE scan_id = ?').get(scanId) as { target_id: string | null }
      expect(row.target_id).toBe(targetId)
    })

    it('Event: "M 42" in file matches "M42" target, Action: linkFitsFilesToTargets, Response: M-prefix normalization works', () => {
      // Arrange
      const targetId = seedTarget(sqlite, { canonicalName: 'M42' })
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { objectName: 'M 42' })

      // Act
      const result = linkFitsFilesToTargets(scanId)

      // Assert
      expect(result.linked).toBe(1)
      const row = sqlite.prepare('SELECT target_id FROM fits_files WHERE scan_id = ?').get(scanId) as { target_id: string | null }
      expect(row.target_id).toBe(targetId)
    })
  })

  describe('EARS: Already linked files not re-linked', () => {
    it('Event: file already has target_id, Action: linkFitsFilesToTargets, Response: file not re-linked, State: original target_id preserved', () => {
      // Arrange
      const target1Id = seedTarget(sqlite, { id: 'target-1', canonicalName: 'M31' })
      seedTarget(sqlite, { id: 'target-2', canonicalName: 'M42' })
      const scanId = seedFitsScan(sqlite)
      const fileId = seedFitsFile(sqlite, scanId, { objectName: 'M42' })

      // Manually set target_id to target-1 (even though object says M42)
      sqlite.prepare('UPDATE fits_files SET target_id = ? WHERE id = ?').run(target1Id, fileId)

      // Act
      const result = linkFitsFilesToTargets(scanId)

      // Assert
      expect(result.linked).toBe(0) // No new links made
      const row = sqlite.prepare('SELECT target_id FROM fits_files WHERE id = ?').get(fileId) as { target_id: string | null }
      expect(row.target_id).toBe(target1Id) // Original preserved, not changed to target-2
    })
  })

  describe('EARS: Manual link and unlink', () => {
    it('Event: manualLinkFile called, Action: updates target_id, Response: returns true, State: file linked', () => {
      // Arrange
      const targetId = seedTarget(sqlite, { canonicalName: 'M31' })
      const scanId = seedFitsScan(sqlite)
      const fileId = seedFitsFile(sqlite, scanId)

      // Act
      const result = manualLinkFile(fileId, targetId)

      // Assert
      expect(result).toBe(true)
      const row = sqlite.prepare('SELECT target_id FROM fits_files WHERE id = ?').get(fileId) as { target_id: string | null }
      expect(row.target_id).toBe(targetId)
    })

    it('Event: unlinkFile called, Action: sets target_id to NULL, Response: returns true, State: file unlinked', () => {
      // Arrange
      const targetId = seedTarget(sqlite, { canonicalName: 'M31' })
      const scanId = seedFitsScan(sqlite)
      const fileId = seedFitsFile(sqlite, scanId)
      sqlite.prepare('UPDATE fits_files SET target_id = ? WHERE id = ?').run(targetId, fileId)

      // Act
      const result = unlinkFile(fileId)

      // Assert
      expect(result).toBe(true)
      const row = sqlite.prepare('SELECT target_id FROM fits_files WHERE id = ?').get(fileId) as { target_id: string | null }
      expect(row.target_id).toBeNull()
    })

    it('Event: manualLinkFile with nonexistent file, Action: no-op, Response: returns false', () => {
      const targetId = seedTarget(sqlite, { canonicalName: 'M31' })
      expect(manualLinkFile('nonexistent', targetId)).toBe(false)
    })

    it('Event: unlinkFile with nonexistent file, Action: no-op, Response: returns false', () => {
      expect(unlinkFile('nonexistent')).toBe(false)
    })
  })

  describe('EARS: getLinkingStatus', () => {
    it('Event: scan has mixed linked and unlinked files, Action: getLinkingStatus, Response: correct counts returned', () => {
      // Arrange
      const target1Id = seedTarget(sqlite, { id: 'target-m31', canonicalName: 'M31' })
      const target2Id = seedTarget(sqlite, { id: 'target-m42', canonicalName: 'M42' })
      const scanId = seedFitsScan(sqlite)
      const file1Id = seedFitsFile(sqlite, scanId, { id: 'file-1', fileName: 'f1.fits', filePath: '/test/f1.fits' })
      const file2Id = seedFitsFile(sqlite, scanId, { id: 'file-2', fileName: 'f2.fits', filePath: '/test/f2.fits' })
      const file3Id = seedFitsFile(sqlite, scanId, { id: 'file-3', fileName: 'f3.fits', filePath: '/test/f3.fits' })
      seedFitsFile(sqlite, scanId, { id: 'file-4', fileName: 'f4.fits', filePath: '/test/f4.fits' })

      sqlite.prepare('UPDATE fits_files SET target_id = ? WHERE id = ?').run(target1Id, file1Id)
      sqlite.prepare('UPDATE fits_files SET target_id = ? WHERE id = ?').run(target1Id, file2Id)
      sqlite.prepare('UPDATE fits_files SET target_id = ? WHERE id = ?').run(target2Id, file3Id)

      // Act
      const status = getLinkingStatus(scanId)

      // Assert
      expect(status.linked).toBe(3)
      expect(status.unlinked).toBe(1)
      expect(status.byTarget['M31']).toBe(2)
      expect(status.byTarget['M42']).toBe(1)
    })
  })

  describe('EARS: getUnlinkedFiles', () => {
    it('Event: scan has unlinked files, Action: getUnlinkedFiles, Response: only unlinked files returned', () => {
      // Arrange
      const targetId = seedTarget(sqlite, { canonicalName: 'M31' })
      const scanId = seedFitsScan(sqlite)
      const file1Id = seedFitsFile(sqlite, scanId, { id: 'file-linked', fileName: 'linked.fits', filePath: '/test/linked.fits' })
      seedFitsFile(sqlite, scanId, { id: 'file-unlinked', fileName: 'unlinked.fits', filePath: '/test/unlinked.fits' })

      sqlite.prepare('UPDATE fits_files SET target_id = ? WHERE id = ?').run(targetId, file1Id)

      // Act
      const unlinked = getUnlinkedFiles(scanId)

      // Assert
      expect(unlinked).toHaveLength(1)
      expect(unlinked[0].id).toBe('file-unlinked')
      expect(unlinked[0].fileName).toBe('unlinked.fits')
    })

    it('Event: pagination requested, Action: getUnlinkedFiles with limit/offset, Response: correct subset returned', () => {
      // Arrange
      const scanId = seedFitsScan(sqlite)
      for (let i = 0; i < 5; i++) {
        seedFitsFile(sqlite, scanId, { id: `file-${i}`, fileName: `file_${i}.fits`, filePath: `/test/file_${i}.fits` })
      }

      // Act
      const page1 = getUnlinkedFiles(scanId, 2, 0)
      const page2 = getUnlinkedFiles(scanId, 2, 2)

      // Assert
      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(2)
    })
  })

  describe('EARS: linkFitsFilesToTargets without scanId', () => {
    it('Event: called without scanId, Action: links all unlinked files across scans, Response: all matching files linked', () => {
      // Arrange
      seedTarget(sqlite, { canonicalName: 'M31' })
      const scan1 = seedFitsScan(sqlite, { id: 'scan-1' })
      const scan2 = seedFitsScan(sqlite, { id: 'scan-2' })
      seedFitsFile(sqlite, scan1, { id: 'f1', fileName: 'f1.fits', filePath: '/a/f1.fits', objectName: 'M31' })
      seedFitsFile(sqlite, scan2, { id: 'f2', fileName: 'f2.fits', filePath: '/b/f2.fits', objectName: 'M31' })

      // Act
      const result = linkFitsFilesToTargets()

      // Assert
      expect(result.linked).toBe(2)
      expect(result.unlinked).toBe(0)
    })
  })

  describe('EARS: Two-pass linking priority', () => {
    it('Event: object_name matches one target and folder_name matches another, Action: linkFitsFilesToTargets, Response: object_name match takes priority', () => {
      // Arrange
      const targetObj = seedTarget(sqlite, { id: 'target-obj', canonicalName: 'M31' })
      seedTarget(sqlite, { id: 'target-folder', canonicalName: 'NGC224' })
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { objectName: 'M31', folderName: 'NGC224' })

      // Act
      const result = linkFitsFilesToTargets(scanId)

      // Assert
      expect(result.linked).toBe(1)
      const row = sqlite.prepare('SELECT target_id FROM fits_files WHERE scan_id = ?').get(scanId) as { target_id: string | null }
      expect(row.target_id).toBe(targetObj) // object_name match wins over folder_name
    })
  })
})
