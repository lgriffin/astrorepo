import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedFitsScan, seedFitsFile } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite
}))

const {
  getCurrentStorageStats,
  captureStorageSnapshot,
  getStorageHistory,
  getGrowthProjection,
  getStorageByTarget,
  getStorageByFilter
} = await import('../../src/main/services/storage-analytics')

describe('StorageAnalyticsService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: Current Storage Statistics', () => {
    // Event: User opens the storage analytics page
    // Action: System queries fits_files table for current totals and breakdowns
    // Response: Returns StorageCurrentStats with totals, by-type, by-target, by-filter
    // State: No mutation

    it('Given an empty database, When current storage stats are fetched, Then all totals are zero', () => {
      const stats = getCurrentStorageStats()

      expect(stats.totalSizeBytes).toBe(0)
      expect(stats.totalFiles).toBe(0)
      expect(stats.byImageType).toHaveLength(0)
      expect(stats.byTarget).toHaveLength(0)
      expect(stats.byFilter).toHaveLength(0)
    })

    it('Given fits_files with various image types, When current stats are fetched, Then breakdowns are correct', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 1000, imageType: 'Light Frame', folderName: 'M31', filter: 'Ha' })
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 2000, imageType: 'Light Frame', folderName: 'M31', filter: 'OIII' })
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 500, imageType: 'Dark Frame', folderName: 'M31', filter: null })
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 300, imageType: 'Flat Frame', folderName: 'M42', filter: 'Ha' })
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 200, imageType: 'Bias Frame', folderName: 'M42', filter: null })

      const stats = getCurrentStorageStats()

      expect(stats.totalSizeBytes).toBe(4000)
      expect(stats.totalFiles).toBe(5)

      // Check image type normalization
      const lightType = stats.byImageType.find((t) => t.type === 'light')
      expect(lightType).toBeDefined()
      expect(lightType!.sizeBytes).toBe(3000)
      expect(lightType!.count).toBe(2)

      const darkType = stats.byImageType.find((t) => t.type === 'dark')
      expect(darkType).toBeDefined()
      expect(darkType!.sizeBytes).toBe(500)

      // Check by target
      const m31 = stats.byTarget.find((t) => t.name === 'M31')
      expect(m31).toBeDefined()
      expect(m31!.sizeBytes).toBe(3500)
      expect(m31!.count).toBe(3)

      // Check by filter
      const ha = stats.byFilter.find((f) => f.filter === 'Ha')
      expect(ha).toBeDefined()
      expect(ha!.sizeBytes).toBe(1300)
      expect(ha!.count).toBe(2)
    })
  })

  describe('EARS: Capture and Retrieve Storage Snapshots', () => {
    // Event: User clicks "Capture Snapshot"
    // Action: System queries fits_files for totals, stores snapshot in storage_snapshots
    // Response: Returns the created StorageSnapshot
    // State: New row inserted into storage_snapshots

    it('Given fits_files with data, When a snapshot is captured, Then it is stored and retrievable', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 5000, imageType: 'Light Frame' })
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 1000, imageType: 'Dark Frame' })

      const snapshot = captureStorageSnapshot()

      expect(snapshot.id).toBeTruthy()
      expect(snapshot.totalFiles).toBe(2)
      expect(snapshot.totalSizeBytes).toBe(6000)
      expect(snapshot.lightsSizeBytes).toBe(5000)
      expect(snapshot.darksSizeBytes).toBe(1000)
      expect(snapshot.flatsSizeBytes).toBe(0)
      expect(snapshot.biasSizeBytes).toBe(0)

      // Verify it's retrievable
      const history = getStorageHistory()
      expect(history).toHaveLength(1)
      expect(history[0].id).toBe(snapshot.id)
      expect(history[0].totalSizeBytes).toBe(6000)
    })
  })

  describe('EARS: Storage Snapshot History', () => {
    // Event: User views snapshot history on analytics page
    // Action: System queries storage_snapshots ordered by date desc
    // Response: Returns StorageSnapshot[] ordered by date descending
    // State: No mutation

    it('Given multiple snapshots, When history is queried, Then snapshots are in date descending order', () => {
      const now = new Date()
      const dates = ['2025-01-01', '2025-01-03', '2025-01-02']

      for (const date of dates) {
        sqlite.prepare(
          `INSERT INTO storage_snapshots (id, snapshot_date, total_files, total_size_bytes,
            lights_size_bytes, darks_size_bytes, flats_size_bytes, bias_size_bytes, other_size_bytes, created_at)
           VALUES (?, ?, 10, 1000, 500, 200, 100, 100, 100, ?)`
        ).run(`snap-${date}`, date, now.toISOString())
      }

      const history = getStorageHistory()
      expect(history).toHaveLength(3)
      expect(history[0].snapshotDate).toBe('2025-01-03')
      expect(history[1].snapshotDate).toBe('2025-01-02')
      expect(history[2].snapshotDate).toBe('2025-01-01')
    })

    it('Given multiple snapshots, When history is queried with a limit, Then only that many snapshots are returned', () => {
      const now = new Date().toISOString()
      for (let i = 0; i < 5; i++) {
        sqlite.prepare(
          `INSERT INTO storage_snapshots (id, snapshot_date, total_files, total_size_bytes,
            lights_size_bytes, darks_size_bytes, flats_size_bytes, bias_size_bytes, other_size_bytes, created_at)
           VALUES (?, ?, 10, 1000, 500, 200, 100, 100, 100, ?)`
        ).run(`snap-${i}`, `2025-01-0${i + 1}`, now)
      }

      const history = getStorageHistory(2)
      expect(history).toHaveLength(2)
    })
  })

  describe('EARS: Growth Projection', () => {
    // Event: User views growth projection on analytics page
    // Action: System performs linear regression on snapshots
    // Response: Returns StorageGrowthProjection with daily/weekly/monthly rates
    // State: No mutation

    it('Given fewer than 2 snapshots, When growth projection is calculated, Then daily rate is zero', () => {
      const proj = getGrowthProjection()

      expect(proj.dailyGrowthBytes).toBe(0)
      expect(proj.weeklyGrowthBytes).toBe(0)
      expect(proj.monthlyGrowthBytes).toBe(0)
      expect(proj.projectedFullDate).toBeNull()
      expect(proj.dataPoints).toBe(0)
    })

    it('Given 2+ snapshots with growth, When projection is calculated, Then daily rate is non-zero', () => {
      const now = new Date().toISOString()

      // Day 1: 1000 bytes, Day 11: 11000 bytes => 1000 bytes/day
      sqlite.prepare(
        `INSERT INTO storage_snapshots (id, snapshot_date, total_files, total_size_bytes,
          lights_size_bytes, darks_size_bytes, flats_size_bytes, bias_size_bytes, other_size_bytes, created_at)
         VALUES (?, ?, 10, ?, 0, 0, 0, 0, 0, ?)`
      ).run('snap-a', '2025-01-01', 1000, now)

      sqlite.prepare(
        `INSERT INTO storage_snapshots (id, snapshot_date, total_files, total_size_bytes,
          lights_size_bytes, darks_size_bytes, flats_size_bytes, bias_size_bytes, other_size_bytes, created_at)
         VALUES (?, ?, 20, ?, 0, 0, 0, 0, 0, ?)`
      ).run('snap-b', '2025-01-11', 11000, now)

      const proj = getGrowthProjection()

      expect(proj.dataPoints).toBe(2)
      expect(proj.dailyGrowthBytes).toBe(1000)
      expect(proj.weeklyGrowthBytes).toBe(7000)
      expect(proj.monthlyGrowthBytes).toBe(30000)
      expect(proj.projectedFullDate).toBeNull()
    })
  })

  describe('EARS: Storage By Target and By Filter', () => {
    // Event: User views breakdown panels on analytics page
    // Action: System groups fits_files by folder_name or filter
    // Response: Returns sorted arrays of name/size/count
    // State: No mutation

    it('Given fits_files with different targets, When getStorageByTarget is called, Then breakdown is accurate', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 3000, folderName: 'M31' })
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 2000, folderName: 'M31' })
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 1000, folderName: 'M42' })
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 500, folderName: null }) // no folder, should be excluded

      const byTarget = getStorageByTarget()

      expect(byTarget).toHaveLength(2)
      expect(byTarget[0].name).toBe('M31')
      expect(byTarget[0].sizeBytes).toBe(5000)
      expect(byTarget[0].fileCount).toBe(2)
      expect(byTarget[1].name).toBe('M42')
      expect(byTarget[1].sizeBytes).toBe(1000)
      expect(byTarget[1].fileCount).toBe(1)
    })

    it('Given fits_files with different filters, When getStorageByFilter is called, Then breakdown is accurate', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 4000, filter: 'Ha' })
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 3000, filter: 'OIII' })
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 2000, filter: 'Ha' })
      seedFitsFile(sqlite, scanId, { fileSizeBytes: 1000, filter: null }) // no filter, should be excluded

      const byFilter = getStorageByFilter()

      expect(byFilter).toHaveLength(2)
      expect(byFilter[0].filter).toBe('Ha')
      expect(byFilter[0].sizeBytes).toBe(6000)
      expect(byFilter[0].fileCount).toBe(2)
      expect(byFilter[1].filter).toBe('OIII')
      expect(byFilter[1].sizeBytes).toBe(3000)
      expect(byFilter[1].fileCount).toBe(1)
    })
  })
})
