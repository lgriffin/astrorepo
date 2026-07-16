import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedFitsScan, seedFitsFile } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite,
  getDb: () => null
}))

vi.mock('../../src/main/fits/parser', () => ({
  parseFitsHeaders: () => ({ headers: [{ keyword: 'SIMPLE' }], headerMap: new Map() })
}))

vi.mock('../../src/main/fits/quality', () => ({
  estimateBackground: () => 1500,
  estimateNoise: () => 45,
  estimateFwhm: () => 3.2,
  estimateStarCount: () => 150
}))

const { analyzeFileQuality, getQualityMetrics, getSessionQualityReport, analyzeScanQuality } =
  await import('../../src/main/services/quality')

describe('QualityService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: analyzeFileQuality', () => {
    it('Given a missing file, When analyzeFileQuality is called, Then returns null', () => {
      const result = analyzeFileQuality('nonexistent-id')
      expect(result).toBeNull()
    })

    it('Given a file without naxis dimensions, When analyzeFileQuality is called, Then returns null', () => {
      const scanId = seedFitsScan(sqlite)
      const fileId = seedFitsFile(sqlite, scanId, { objectName: 'M31' })
      // naxis1 and naxis2 are null by default in seedFitsFile
      const result = analyzeFileQuality(fileId)
      expect(result).toBeNull()
    })

    it('Given a file with valid dimensions, When analyzeFileQuality is called, Then returns metrics and updates DB', () => {
      const scanId = seedFitsScan(sqlite)
      const fileId = seedFitsFile(sqlite, scanId, { objectName: 'M31' })
      // Set required dimensions in DB
      sqlite.prepare('UPDATE fits_files SET bitpix = 16, naxis1 = 1024, naxis2 = 768, bscale = 1, bzero = 0 WHERE id = ?').run(fileId)

      const result = analyzeFileQuality(fileId)
      expect(result).not.toBeNull()
      expect(result!.fileId).toBe(fileId)
      expect(result!.fwhmEstimate).toBe(3.2)
      expect(result!.backgroundLevel).toBe(1500)
      expect(result!.noiseLevel).toBe(45)
      expect(result!.starCountEstimate).toBe(150)
      expect(result!.qualityScore).toBeGreaterThan(0)
      expect(result!.qualityScore).toBeLessThanOrEqual(100)
      expect(['good', 'warning', 'reject']).toContain(result!.qualityFlag)

      // Verify DB was updated
      const row = sqlite.prepare('SELECT fwhm_estimate, quality_score, quality_flag FROM fits_files WHERE id = ?').get(fileId) as {
        fwhm_estimate: number
        quality_score: number
        quality_flag: string
      }
      expect(row.fwhm_estimate).toBe(3.2)
      expect(row.quality_score).toBeGreaterThan(0)
      expect(row.quality_flag).toBeTruthy()
    })
  })

  describe('EARS: getQualityMetrics', () => {
    it('Given a file without metrics, When getQualityMetrics is called, Then returns null', () => {
      const scanId = seedFitsScan(sqlite)
      const fileId = seedFitsFile(sqlite, scanId)
      const result = getQualityMetrics(fileId)
      expect(result).toBeNull()
    })

    it('Given a nonexistent file, When getQualityMetrics is called, Then returns null', () => {
      const result = getQualityMetrics('nonexistent-id')
      expect(result).toBeNull()
    })

    it('Given a file with metrics set in DB, When getQualityMetrics is called, Then returns metrics', () => {
      const scanId = seedFitsScan(sqlite)
      const fileId = seedFitsFile(sqlite, scanId)
      sqlite.prepare(`
        UPDATE fits_files SET
          fwhm_estimate = 2.8,
          background_level = 1200,
          noise_level = 35,
          star_count_estimate = 200,
          quality_score = 85,
          quality_flag = 'good'
        WHERE id = ?
      `).run(fileId)

      const result = getQualityMetrics(fileId)
      expect(result).not.toBeNull()
      expect(result!.fileId).toBe(fileId)
      expect(result!.fwhmEstimate).toBe(2.8)
      expect(result!.backgroundLevel).toBe(1200)
      expect(result!.noiseLevel).toBe(35)
      expect(result!.starCountEstimate).toBe(200)
      expect(result!.qualityScore).toBe(85)
      expect(result!.qualityFlag).toBe('good')
    })
  })

  describe('EARS: getSessionQualityReport', () => {
    it('Given files in a folder with metrics, When getSessionQualityReport is called, Then aggregates correctly', () => {
      const scanId = seedFitsScan(sqlite)
      const f1 = seedFitsFile(sqlite, scanId, { folderName: 'M31', sessionFolder: 'night1' })
      const f2 = seedFitsFile(sqlite, scanId, { folderName: 'M31', sessionFolder: 'night1' })
      const f3 = seedFitsFile(sqlite, scanId, { folderName: 'M31', sessionFolder: 'night1' })

      // Set metrics for files
      sqlite.prepare("UPDATE fits_files SET fwhm_estimate = 2.5, background_level = 1000, noise_level = 30, star_count_estimate = 150, quality_score = 80, quality_flag = 'good' WHERE id = ?").run(f1)
      sqlite.prepare("UPDATE fits_files SET fwhm_estimate = 3.0, background_level = 1100, noise_level = 35, star_count_estimate = 140, quality_score = 75, quality_flag = 'good' WHERE id = ?").run(f2)
      sqlite.prepare("UPDATE fits_files SET fwhm_estimate = 2.8, background_level = 1050, noise_level = 32, star_count_estimate = 160, quality_score = 78, quality_flag = 'good' WHERE id = ?").run(f3)

      const report = getSessionQualityReport(scanId, 'M31')
      expect(report.folderName).toBe('M31')
      expect(report.sessionFolder).toBe('night1')
      expect(report.totalFiles).toBe(3)
      expect(report.analyzedFiles).toBe(3)
      expect(report.medianFwhm).toBe(2.8)
      expect(report.medianNoise).toBe(32)
      expect(report.medianBackground).toBe(1050)
      expect(report.medianStarCount).toBe(150)
      expect(report.files).toHaveLength(3)
    })

    it('Given no files in folder, When getSessionQualityReport is called, Then returns empty report', () => {
      const scanId = seedFitsScan(sqlite)
      const report = getSessionQualityReport(scanId, 'NonExistent')
      expect(report.totalFiles).toBe(0)
      expect(report.analyzedFiles).toBe(0)
      expect(report.medianFwhm).toBeNull()
      expect(report.files).toHaveLength(0)
    })

    it('Given files with outliers, When getSessionQualityReport is called, Then counts outliers', () => {
      const scanId = seedFitsScan(sqlite)
      // Seed 5 normal files and 1 outlier
      for (let i = 0; i < 5; i++) {
        const fId = seedFitsFile(sqlite, scanId, { folderName: 'NGC7000' })
        sqlite.prepare("UPDATE fits_files SET fwhm_estimate = ?, background_level = 1000, noise_level = 30, star_count_estimate = 150, quality_score = 80, quality_flag = 'good' WHERE id = ?")
          .run(2.5 + i * 0.1, fId)
      }
      // Add outlier with very high FWHM
      const outlierId = seedFitsFile(sqlite, scanId, { folderName: 'NGC7000' })
      sqlite.prepare("UPDATE fits_files SET fwhm_estimate = 15.0, background_level = 1000, noise_level = 30, star_count_estimate = 150, quality_score = 30, quality_flag = 'reject' WHERE id = ?")
        .run(outlierId)

      const report = getSessionQualityReport(scanId, 'NGC7000')
      expect(report.totalFiles).toBe(6)
      expect(report.outlierCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('EARS: analyzeScanQuality', () => {
    it('Given a scan with light frames, When analyzeScanQuality is called, Then processes all light frames', () => {
      const scanId = seedFitsScan(sqlite)
      const f1 = seedFitsFile(sqlite, scanId, { imageType: 'Light Frame', objectName: 'M31' })
      const f2 = seedFitsFile(sqlite, scanId, { imageType: 'Light Frame', objectName: 'M31' })
      seedFitsFile(sqlite, scanId, { imageType: 'Dark Frame' }) // should be skipped

      // Set dimensions so analyze can proceed
      sqlite.prepare('UPDATE fits_files SET bitpix = 16, naxis1 = 512, naxis2 = 512, bscale = 1, bzero = 0 WHERE id IN (?, ?)').run(f1, f2)

      const result = analyzeScanQuality(scanId)
      expect(result.analyzed).toBe(2)
      expect(result.failed).toBe(0)
    })

    it('Given an empty scan, When analyzeScanQuality is called, Then returns zero counts', () => {
      const scanId = seedFitsScan(sqlite)
      const result = analyzeScanQuality(scanId)
      expect(result.analyzed).toBe(0)
      expect(result.failed).toBe(0)
    })
  })
})
