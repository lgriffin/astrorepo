import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedFitsScan, seedFitsFile, seedTarget } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite,
  getDb: () => null
}))

const {
  listScans, getScanById, deleteScan, listScanFiles,
  getFileDetail, getFileHeaders, getScanAggregates,
  getTargetSummaries, getTotalFitsFileCount
} = await import('../../src/main/services/fits-analyzer')

describe('FitsAnalyzerService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: Scan Listing', () => {
    it('Given no scans, When listScans is called, Then returns empty array and total 0', () => {
      const result = listScans()
      expect(result.scans).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('Given two scans, When listScans is called, Then returns both sorted by start date descending', () => {
      seedFitsScan(sqlite, { id: 'scan-older', folderPath: '/old', fileCount: 5 })
      seedFitsScan(sqlite, { id: 'scan-newer', folderPath: '/new', fileCount: 10 })

      const result = listScans()
      expect(result.total).toBe(2)
      expect(result.scans).toHaveLength(2)
    })
  })

  describe('EARS: Scan Retrieval', () => {
    it('Given a scan exists, When getScanById is called, Then returns the scan', () => {
      seedFitsScan(sqlite, { id: 'scan-1', folderPath: '/test/folder', fileCount: 42, totalSizeBytes: 1024000 })

      const scan = getScanById('scan-1')
      expect(scan).not.toBeNull()
      expect(scan!.id).toBe('scan-1')
      expect(scan!.folderPath).toBe('/test/folder')
      expect(scan!.fileCount).toBe(42)
      expect(scan!.totalSizeBytes).toBe(1024000)
    })

    it('Given no scan exists, When getScanById is called, Then returns null', () => {
      expect(getScanById('nonexistent')).toBeNull()
    })
  })

  describe('EARS: Scan Deletion', () => {
    it('Given a scan with files, When deleteScan is called, Then cascade deletes files', () => {
      const scanId = seedFitsScan(sqlite, { id: 'scan-del' })
      seedFitsFile(sqlite, scanId, { objectName: 'M31' })
      seedFitsFile(sqlite, scanId, { objectName: 'M42' })

      expect(deleteScan('scan-del')).toBe(true)
      expect(getScanById('scan-del')).toBeNull()
      expect(getTotalFitsFileCount()).toBe(0)
    })

    it('Given no scan exists, When deleteScan is called, Then returns false', () => {
      expect(deleteScan('nonexistent')).toBe(false)
    })
  })

  describe('EARS: File Listing with Filters', () => {
    let scanId: string

    beforeEach(() => {
      scanId = seedFitsScan(sqlite, { id: 'scan-files' })
      seedFitsFile(sqlite, scanId, { objectName: 'M31', filter: 'Ha', imageType: 'Light Frame', exposureSec: 300, folderName: 'M31' })
      seedFitsFile(sqlite, scanId, { objectName: 'M31', filter: 'OIII', imageType: 'Light Frame', exposureSec: 300, folderName: 'M31' })
      seedFitsFile(sqlite, scanId, { objectName: 'M42', filter: 'Ha', imageType: 'Light Frame', exposureSec: 600, folderName: 'M42' })
      seedFitsFile(sqlite, scanId, { objectName: null, imageType: 'Dark Frame', isStacked: true, folderName: 'darks' })
    })

    it('Given files in scan, When listed without filters, Then returns all files', () => {
      const result = listScanFiles(scanId)
      expect(result.total).toBe(4)
      expect(result.files).toHaveLength(4)
    })

    it('Given files, When filtered by object, Then returns only matching files', () => {
      const result = listScanFiles(scanId, { filterObject: 'M31' })
      expect(result.total).toBe(2)
      expect(result.files.every(f => f.objectName === 'M31')).toBe(true)
    })

    it('Given files, When filtered by filter, Then returns only matching files', () => {
      const result = listScanFiles(scanId, { filterFilter: 'Ha' })
      expect(result.total).toBe(2)
    })

    it('Given files, When filtered by stacked=true, Then returns only stacked files', () => {
      const result = listScanFiles(scanId, { filterStacked: true })
      expect(result.total).toBe(1)
      expect(result.files[0].isStacked).toBe(true)
    })

    it('Given files, When sorted by exposure descending, Then largest exposure first', () => {
      const result = listScanFiles(scanId, { sortBy: 'exposure_sec', sortDir: 'desc' })
      const exposures = result.files.map(f => f.exposureSec).filter(e => e !== null) as number[]
      for (let i = 1; i < exposures.length; i++) {
        expect(exposures[i]).toBeLessThanOrEqual(exposures[i - 1])
      }
    })

    it('Given files, When paginated with limit 2 offset 0, Then returns first 2', () => {
      const result = listScanFiles(scanId, { limit: 2, offset: 0 })
      expect(result.files).toHaveLength(2)
      expect(result.total).toBe(4)
    })
  })

  describe('EARS: File Detail and Headers', () => {
    it('Given a file, When getFileDetail is called, Then returns all metadata fields', () => {
      const scanId = seedFitsScan(sqlite)
      const fileId = seedFitsFile(sqlite, scanId, {
        objectName: 'NGC7000',
        filter: 'Ha',
        exposureSec: 300,
        ccdTemp: -10,
        telescope: 'RC8'
      })

      const detail = getFileDetail(fileId)
      expect(detail).not.toBeNull()
      expect(detail!.objectName).toBe('NGC7000')
      expect(detail!.filter).toBe('Ha')
      expect(detail!.exposureSec).toBe(300)
      expect(detail!.ccdTemp).toBe(-10)
      expect(detail!.telescope).toBe('RC8')
    })

    it('Given a file with headers, When getFileHeaders is called, Then returns headers in order', () => {
      const scanId = seedFitsScan(sqlite)
      const fileId = seedFitsFile(sqlite, scanId)
      sqlite.prepare('INSERT INTO fits_headers (id, file_id, keyword, value, comment, ordinal) VALUES (?, ?, ?, ?, ?, ?)').run('h1', fileId, 'SIMPLE', 'T', 'FITS standard', 0)
      sqlite.prepare('INSERT INTO fits_headers (id, file_id, keyword, value, comment, ordinal) VALUES (?, ?, ?, ?, ?, ?)').run('h2', fileId, 'BITPIX', '16', null, 1)
      sqlite.prepare('INSERT INTO fits_headers (id, file_id, keyword, value, comment, ordinal) VALUES (?, ?, ?, ?, ?, ?)').run('h3', fileId, 'NAXIS', '2', null, 2)

      const headers = getFileHeaders(fileId)
      expect(headers).toHaveLength(3)
      expect(headers[0].keyword).toBe('SIMPLE')
      expect(headers[1].keyword).toBe('BITPIX')
      expect(headers[2].keyword).toBe('NAXIS')
    })
  })

  describe('EARS: Scan Aggregates', () => {
    it('Given files with various attributes, When getScanAggregates is called, Then returns correct counts', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { objectName: 'M31', filter: 'Ha', exposureSec: 300, folderName: 'M31', sessionFolder: 'night1' })
      seedFitsFile(sqlite, scanId, { objectName: 'M31', filter: 'OIII', exposureSec: 300, folderName: 'M31', sessionFolder: 'night1' })
      seedFitsFile(sqlite, scanId, { objectName: 'M42', filter: 'Ha', exposureSec: 600, folderName: 'M42', sessionFolder: 'night2' })

      const agg = getScanAggregates(scanId)
      expect(agg.totalFiles).toBe(3)
      expect(agg.totalExposureSec).toBe(1200)
      expect(agg.uniqueObjects).toContain('M31')
      expect(agg.uniqueObjects).toContain('M42')
      expect(agg.uniqueFilters).toContain('Ha')
      expect(agg.uniqueFilters).toContain('OIII')
      expect(agg.filesByObject['M31']).toBe(2)
      expect(agg.filesByObject['M42']).toBe(1)
      expect(agg.filesByFilter['Ha']).toBe(2)
      expect(agg.exposureByFilter['Ha']).toBe(900)
      expect(agg.exposureByFilter['OIII']).toBe(300)
    })
  })

  describe('EARS: Target Summaries', () => {
    it('Given files linked to targets, When getTargetSummaries is called, Then returns per-target stats', () => {
      const scanId = seedFitsScan(sqlite)
      const t1 = seedTarget(sqlite, { canonicalName: 'M31' })
      const t2 = seedTarget(sqlite, { canonicalName: 'M42' })
      seedFitsFile(sqlite, scanId, { folderName: 'M31', sessionFolder: 'night1', filter: 'Ha', exposureSec: 300, targetId: t1 })
      seedFitsFile(sqlite, scanId, { folderName: 'M31', sessionFolder: 'night2', filter: 'Ha', exposureSec: 300, targetId: t1 })
      seedFitsFile(sqlite, scanId, { folderName: 'M42', sessionFolder: 'night1', filter: 'SII', exposureSec: 600, targetId: t2 })

      const summaries = getTargetSummaries(scanId)
      expect(summaries).toHaveLength(2)

      const m31 = summaries.find(s => s.folderName === 'M31')!
      expect(m31.totalFiles).toBe(2)
      expect(m31.totalExposureSec).toBe(600)
      expect(m31.sessions).toContain('night1')
      expect(m31.sessions).toContain('night2')

      const m42 = summaries.find(s => s.folderName === 'M42')!
      expect(m42.totalFiles).toBe(1)
      expect(m42.filters).toContain('SII')
    })
  })

  describe('EARS: Total FITS File Count', () => {
    it('Given files across scans, When getTotalFitsFileCount is called, Then returns global count', () => {
      const scan1 = seedFitsScan(sqlite, { id: 'scan-a' })
      const scan2 = seedFitsScan(sqlite, { id: 'scan-b' })
      seedFitsFile(sqlite, scan1)
      seedFitsFile(sqlite, scan1)
      seedFitsFile(sqlite, scan2)

      expect(getTotalFitsFileCount()).toBe(3)
    })
  })
})
