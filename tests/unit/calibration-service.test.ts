import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedFitsScan, seedFitsFile } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite
}))

const {
  normalizeImageType,
  getCalibrationLibrary,
  matchCalibrationToLights,
  getLightCalibrationStatus,
  getCalibrationSummary
} = await import('../../src/main/services/calibration')

describe('CalibrationService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: normalizeImageType', () => {
    it('Given null, When normalizeImageType is called, Then returns unknown', () => {
      expect(normalizeImageType(null)).toBe('unknown')
    })

    it('Given "Light Frame", When normalizeImageType is called, Then returns light', () => {
      expect(normalizeImageType('Light Frame')).toBe('light')
    })

    it('Given "Dark Frame", When normalizeImageType is called, Then returns dark', () => {
      expect(normalizeImageType('Dark Frame')).toBe('dark')
    })

    it('Given "Flat Frame", When normalizeImageType is called, Then returns flat', () => {
      expect(normalizeImageType('Flat Frame')).toBe('flat')
    })

    it('Given "Bias Frame", When normalizeImageType is called, Then returns bias', () => {
      expect(normalizeImageType('Bias Frame')).toBe('bias')
    })

    it('Given "Offset Frame", When normalizeImageType is called, Then returns bias', () => {
      expect(normalizeImageType('Offset Frame')).toBe('bias')
    })

    it('Given "LIGHT", When normalizeImageType is called, Then returns light (case-insensitive)', () => {
      expect(normalizeImageType('LIGHT')).toBe('light')
    })

    it('Given "dark", When normalizeImageType is called, Then returns dark (case-insensitive)', () => {
      expect(normalizeImageType('dark')).toBe('dark')
    })

    it('Given empty string, When normalizeImageType is called, Then returns unknown', () => {
      expect(normalizeImageType('')).toBe('unknown')
    })

    it('Given "Science", When normalizeImageType is called, Then returns unknown', () => {
      expect(normalizeImageType('Science')).toBe('unknown')
    })
  })

  describe('EARS: Calibration Library', () => {
    it('Given darks with same params, When getCalibrationLibrary is called, Then groups them together', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { imageType: 'Dark Frame', exposureSec: 300, gain: 100, ccdTemp: -10, xbinning: 1, ybinning: 1 })
      seedFitsFile(sqlite, scanId, { imageType: 'Dark Frame', exposureSec: 300, gain: 100, ccdTemp: -10, xbinning: 1, ybinning: 1 })
      seedFitsFile(sqlite, scanId, { imageType: 'Dark Frame', exposureSec: 300, gain: 100, ccdTemp: -10, xbinning: 1, ybinning: 1 })

      const groups = getCalibrationLibrary()
      expect(groups).toHaveLength(1)
      expect(groups[0].type).toBe('dark')
      expect(groups[0].fileCount).toBe(3)
      expect(groups[0].exposureSec).toBe(300)
      expect(groups[0].gain).toBe(100)
    })

    it('Given darks with different exposure, When getCalibrationLibrary is called, Then creates separate groups', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { imageType: 'Dark Frame', exposureSec: 300, gain: 100, ccdTemp: -10, xbinning: 1, ybinning: 1 })
      seedFitsFile(sqlite, scanId, { imageType: 'Dark Frame', exposureSec: 600, gain: 100, ccdTemp: -10, xbinning: 1, ybinning: 1 })

      const groups = getCalibrationLibrary()
      expect(groups).toHaveLength(2)
    })

    it('Given mixed types, When filtered by type=dark, Then returns only dark groups', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { imageType: 'Dark Frame', exposureSec: 300, gain: 100, ccdTemp: -10, xbinning: 1, ybinning: 1 })
      seedFitsFile(sqlite, scanId, { imageType: 'Flat Frame', filter: 'Ha', gain: 100, xbinning: 1, ybinning: 1 })
      seedFitsFile(sqlite, scanId, { imageType: 'Bias Frame', gain: 100, xbinning: 1, ybinning: 1 })

      const groups = getCalibrationLibrary({ type: 'dark' })
      expect(groups).toHaveLength(1)
      expect(groups[0].type).toBe('dark')
    })

    it('Given flats with different filters, When getCalibrationLibrary is called, Then groups by filter', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { imageType: 'Flat Frame', filter: 'Ha', gain: 100, xbinning: 1, ybinning: 1 })
      seedFitsFile(sqlite, scanId, { imageType: 'Flat Frame', filter: 'Ha', gain: 100, xbinning: 1, ybinning: 1 })
      seedFitsFile(sqlite, scanId, { imageType: 'Flat Frame', filter: 'OIII', gain: 100, xbinning: 1, ybinning: 1 })

      const groups = getCalibrationLibrary()
      const flatGroups = groups.filter(g => g.type === 'flat')
      expect(flatGroups).toHaveLength(2)
      const haGroup = flatGroups.find(g => g.filter === 'Ha')!
      expect(haGroup.fileCount).toBe(2)
    })

    it('Given light frames, When getCalibrationLibrary is called, Then ignores lights', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { imageType: 'Light Frame', exposureSec: 300, gain: 100, ccdTemp: -10 })

      const groups = getCalibrationLibrary()
      expect(groups).toHaveLength(0)
    })
  })

  describe('EARS: Match Calibration to Lights', () => {
    it('Given darks matching light params, When matchCalibrationToLights is called, Then coverage reports matched', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, {
        imageType: 'Light Frame', exposureSec: 300, gain: 100, ccdTemp: -10,
        xbinning: 1, ybinning: 1, filter: 'Ha'
      })
      seedFitsFile(sqlite, scanId, {
        imageType: 'Dark Frame', exposureSec: 300, gain: 100, ccdTemp: -10,
        xbinning: 1, ybinning: 1
      })
      seedFitsFile(sqlite, scanId, {
        imageType: 'Flat Frame', filter: 'Ha', gain: 100,
        xbinning: 1, ybinning: 1
      })
      seedFitsFile(sqlite, scanId, {
        imageType: 'Bias Frame', gain: 100,
        xbinning: 1, ybinning: 1
      })

      const coverage = matchCalibrationToLights()
      expect(coverage.totalLights).toBe(1)
      expect(coverage.fullyCalibrated).toBe(1)
      expect(coverage.darksCoverage).toBe(100)
      expect(coverage.flatsCoverage).toBe(100)
      expect(coverage.biasCoverage).toBe(100)
    })

    it('Given darks at wrong temperature (>2C difference), When matchCalibrationToLights is called, Then darks do not match', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, {
        imageType: 'Light Frame', exposureSec: 300, gain: 100, ccdTemp: -10,
        xbinning: 1, ybinning: 1, filter: 'Ha'
      })
      seedFitsFile(sqlite, scanId, {
        imageType: 'Dark Frame', exposureSec: 300, gain: 100, ccdTemp: -15,
        xbinning: 1, ybinning: 1
      })

      const coverage = matchCalibrationToLights()
      expect(coverage.darksCoverage).toBe(0)
    })

    it('Given darks at close temperature (<=2C difference), When matchCalibrationToLights is called, Then darks match', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, {
        imageType: 'Light Frame', exposureSec: 300, gain: 100, ccdTemp: -10,
        xbinning: 1, ybinning: 1, filter: 'Ha'
      })
      seedFitsFile(sqlite, scanId, {
        imageType: 'Dark Frame', exposureSec: 300, gain: 100, ccdTemp: -11.5,
        xbinning: 1, ybinning: 1
      })

      const coverage = matchCalibrationToLights()
      expect(coverage.darksCoverage).toBe(100)
    })

    it('Given flats with wrong filter, When matchCalibrationToLights is called, Then flats do not match', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, {
        imageType: 'Light Frame', exposureSec: 300, gain: 100, ccdTemp: -10,
        xbinning: 1, ybinning: 1, filter: 'Ha'
      })
      seedFitsFile(sqlite, scanId, {
        imageType: 'Flat Frame', filter: 'OIII', gain: 100,
        xbinning: 1, ybinning: 1
      })

      const coverage = matchCalibrationToLights()
      expect(coverage.flatsCoverage).toBe(0)
    })

    it('Given no lights, When matchCalibrationToLights is called, Then returns zeroes', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, { imageType: 'Dark Frame', exposureSec: 300, gain: 100, ccdTemp: -10, xbinning: 1, ybinning: 1 })

      const coverage = matchCalibrationToLights()
      expect(coverage.totalLights).toBe(0)
    })

    it('Given partial calibration, When matchCalibrationToLights is called, Then reports partially calibrated', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, {
        imageType: 'Light Frame', exposureSec: 300, gain: 100, ccdTemp: -10,
        xbinning: 1, ybinning: 1, filter: 'Ha'
      })
      seedFitsFile(sqlite, scanId, {
        imageType: 'Dark Frame', exposureSec: 300, gain: 100, ccdTemp: -10,
        xbinning: 1, ybinning: 1
      })

      const coverage = matchCalibrationToLights()
      expect(coverage.partiallyCalibrated).toBe(1)
      expect(coverage.fullyCalibrated).toBe(0)
    })
  })

  describe('EARS: Light Calibration Status', () => {
    it('Given matching calibration frames, When getLightCalibrationStatus is called, Then all report matched', () => {
      const scanId = seedFitsScan(sqlite)
      const lightId = seedFitsFile(sqlite, scanId, {
        imageType: 'Light Frame', exposureSec: 300, gain: 100, ccdTemp: -10,
        xbinning: 1, ybinning: 1, filter: 'Ha'
      })
      seedFitsFile(sqlite, scanId, {
        imageType: 'Dark Frame', exposureSec: 300, gain: 100, ccdTemp: -10,
        xbinning: 1, ybinning: 1
      })
      seedFitsFile(sqlite, scanId, {
        imageType: 'Flat Frame', filter: 'Ha', gain: 100,
        xbinning: 1, ybinning: 1
      })
      seedFitsFile(sqlite, scanId, {
        imageType: 'Bias Frame', gain: 100,
        xbinning: 1, ybinning: 1
      })

      const status = getLightCalibrationStatus(lightId)
      expect(status.darks.status).toBe('matched')
      expect(status.darks.matchCount).toBe(1)
      expect(status.flats.status).toBe('matched')
      expect(status.biases.status).toBe('matched')
    })

    it('Given no matching calibration, When getLightCalibrationStatus is called, Then all report missing', () => {
      const scanId = seedFitsScan(sqlite)
      const lightId = seedFitsFile(sqlite, scanId, {
        imageType: 'Light Frame', exposureSec: 300, gain: 100, ccdTemp: -10,
        xbinning: 1, ybinning: 1, filter: 'Ha'
      })

      const status = getLightCalibrationStatus(lightId)
      expect(status.darks.status).toBe('missing')
      expect(status.flats.status).toBe('missing')
      expect(status.biases.status).toBe('missing')
    })

    it('Given non-existent file, When getLightCalibrationStatus is called, Then all report missing', () => {
      const status = getLightCalibrationStatus('nonexistent-id')
      expect(status.darks.status).toBe('missing')
      expect(status.flats.status).toBe('missing')
      expect(status.biases.status).toBe('missing')
    })
  })

  describe('EARS: Calibration Summary', () => {
    it('Given calibration and light frames, When getCalibrationSummary is called, Then counts are accurate', () => {
      const scanId = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scanId, {
        imageType: 'Light Frame', exposureSec: 300, gain: 100, ccdTemp: -10,
        xbinning: 1, ybinning: 1, filter: 'Ha'
      })
      seedFitsFile(sqlite, scanId, {
        imageType: 'Light Frame', exposureSec: 300, gain: 100, ccdTemp: -10,
        xbinning: 1, ybinning: 1, filter: 'OIII'
      })
      seedFitsFile(sqlite, scanId, { imageType: 'Dark Frame', exposureSec: 300, gain: 100, ccdTemp: -10, xbinning: 1, ybinning: 1 })
      seedFitsFile(sqlite, scanId, { imageType: 'Dark Frame', exposureSec: 300, gain: 100, ccdTemp: -10, xbinning: 1, ybinning: 1 })
      seedFitsFile(sqlite, scanId, { imageType: 'Flat Frame', filter: 'Ha', gain: 100, xbinning: 1, ybinning: 1 })
      seedFitsFile(sqlite, scanId, { imageType: 'Bias Frame', gain: 100, xbinning: 1, ybinning: 1 })

      const summary = getCalibrationSummary()
      expect(summary.totalDarks).toBe(2)
      expect(summary.totalFlats).toBe(1)
      expect(summary.totalBiases).toBe(1)
      expect(summary.lightsCovered).toBeGreaterThan(0)
    })

    it('Given no files, When getCalibrationSummary is called, Then all zeroes', () => {
      const summary = getCalibrationSummary()
      expect(summary.totalDarks).toBe(0)
      expect(summary.totalFlats).toBe(0)
      expect(summary.totalBiases).toBe(0)
      expect(summary.lightsCovered).toBe(0)
      expect(summary.lightsUncovered).toBe(0)
    })
  })
})
