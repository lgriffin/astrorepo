import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedFitsScan, seedFitsFile, seedTarget, seedIntegrationGoal } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite,
  getDb: () => null
}))

const {
  getStackingSummary, getSubFramesForStacked, getIntegrationProgress,
  getIntegrationGoals, setIntegrationGoal, deleteIntegrationGoal
} = await import('../../src/main/services/stacking')

describe('StackingService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('getStackingSummary', () => {
    it('Given no stacked files, returns empty summary', () => {
      const result = getStackingSummary()
      expect(result.totalStacked).toBe(0)
      expect(result.rows).toHaveLength(0)
      expect(result.totalNcombine).toBe(0)
    })

    it('Given stacked files across targets, returns all with correct aggregates', () => {
      const scanId = seedFitsScan(sqlite)
      const t1 = seedTarget(sqlite, { canonicalName: 'M42' })

      seedFitsFile(sqlite, scanId, {
        targetId: t1, isStacked: true, filter: 'Ha',
        ncombine: 20, totalExposure: 6000, software: 'PixInsight'
      })
      seedFitsFile(sqlite, scanId, {
        targetId: t1, isStacked: true, filter: 'OIII',
        ncombine: 15, totalExposure: 4500, software: 'PixInsight'
      })

      const result = getStackingSummary()
      expect(result.totalStacked).toBe(2)
      expect(result.totalNcombine).toBe(35)
      expect(result.totalIntegrationSec).toBe(10500)
      expect(result.softwareUsed).toEqual(['PixInsight'])
      expect(result.filtersUsed).toEqual(['Ha', 'OIII'])
      expect(result.rows).toHaveLength(2)
      expect(result.rows[0].targetName).toBe('M42')
    })

    it('Given stacked files from different scans, returns all cross-scan', () => {
      const scan1 = seedFitsScan(sqlite, { folderPath: '/scan1' })
      const scan2 = seedFitsScan(sqlite, { folderPath: '/scan2' })
      const t1 = seedTarget(sqlite, { canonicalName: 'NGC 7000' })

      seedFitsFile(sqlite, scan1, { targetId: t1, isStacked: true, ncombine: 10 })
      seedFitsFile(sqlite, scan2, { targetId: t1, isStacked: true, ncombine: 5 })

      const result = getStackingSummary()
      expect(result.totalStacked).toBe(2)
      expect(result.totalNcombine).toBe(15)
    })
  })

  describe('getSubFramesForStacked', () => {
    it('Given a stacked file with matching sub-frames, returns matched frames', () => {
      const scanId = seedFitsScan(sqlite)
      const t1 = seedTarget(sqlite, { canonicalName: 'M31' })

      const stackedId = seedFitsFile(sqlite, scanId, {
        targetId: t1, isStacked: true, filter: 'L',
        sessionFolder: '2024-01-15', ncombine: 5, totalExposure: 1500
      })

      for (let i = 0; i < 5; i++) {
        seedFitsFile(sqlite, scanId, {
          targetId: t1, isStacked: false, filter: 'L',
          sessionFolder: '2024-01-15', imageType: 'Light Frame',
          exposureSec: 300, dateObs: `2024-01-15T2${i}:00:00`
        })
      }

      const result = getSubFramesForStacked(stackedId)
      expect(result).not.toBeNull()
      expect(result!.matchedCount).toBe(5)
      expect(result!.subFrames).toHaveLength(5)
      expect(result!.ncombine).toBe(5)
    })

    it('Given a stacked file with no matching sub-frames, returns empty', () => {
      const scanId = seedFitsScan(sqlite)
      const t1 = seedTarget(sqlite, { canonicalName: 'M33' })

      const stackedId = seedFitsFile(sqlite, scanId, {
        targetId: t1, isStacked: true, filter: 'Ha',
        sessionFolder: '2024-02-01', ncombine: 10
      })

      const result = getSubFramesForStacked(stackedId)
      expect(result).not.toBeNull()
      expect(result!.matchedCount).toBe(0)
      expect(result!.subFrames).toHaveLength(0)
    })

    it('Given matching by object_name when target_id is null, still matches', () => {
      const scanId = seedFitsScan(sqlite)

      const stackedId = seedFitsFile(sqlite, scanId, {
        isStacked: true, objectName: 'M81', filter: 'R',
        sessionFolder: '2024-03-01', ncombine: 3
      })

      for (let i = 0; i < 3; i++) {
        seedFitsFile(sqlite, scanId, {
          isStacked: false, objectName: 'M81', filter: 'R',
          sessionFolder: '2024-03-01', imageType: 'Light Frame',
          exposureSec: 120
        })
      }

      const result = getSubFramesForStacked(stackedId)
      expect(result).not.toBeNull()
      expect(result!.matchedCount).toBe(3)
    })

    it('Given sub-frames with quality data, quality info is included', () => {
      const scanId = seedFitsScan(sqlite)
      const t1 = seedTarget(sqlite, { canonicalName: 'IC 1805' })

      const stackedId = seedFitsFile(sqlite, scanId, {
        targetId: t1, isStacked: true, filter: 'Ha',
        sessionFolder: '2024-04-01', ncombine: 1
      })

      seedFitsFile(sqlite, scanId, {
        targetId: t1, isStacked: false, filter: 'Ha',
        sessionFolder: '2024-04-01', imageType: 'Light Frame',
        qualityScore: 85, qualityFlag: 'good', fwhmEstimate: 2.3, noiseLevel: 45.2
      })

      const result = getSubFramesForStacked(stackedId)
      expect(result!.subFrames[0].qualityScore).toBe(85)
      expect(result!.subFrames[0].qualityFlag).toBe('good')
      expect(result!.subFrames[0].fwhmEstimate).toBeCloseTo(2.3)
      expect(result!.subFrames[0].noiseLevel).toBeCloseTo(45.2)
    })

    it('Given a non-existent file ID, returns null', () => {
      const result = getSubFramesForStacked('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('getIntegrationProgress', () => {
    it('Given targets with light frames, returns per-filter integration', () => {
      const scanId = seedFitsScan(sqlite)
      const t1 = seedTarget(sqlite, { canonicalName: 'M42' })

      for (let i = 0; i < 5; i++) {
        seedFitsFile(sqlite, scanId, {
          targetId: t1, filter: 'Ha', exposureSec: 300,
          imageType: 'Light Frame', isStacked: false
        })
      }
      for (let i = 0; i < 3; i++) {
        seedFitsFile(sqlite, scanId, {
          targetId: t1, filter: 'OIII', exposureSec: 300,
          imageType: 'Light Frame', isStacked: false
        })
      }

      const result = getIntegrationProgress()
      expect(result).toHaveLength(1)
      expect(result[0].targetName).toBe('M42')

      const ha = result[0].filters.find(f => f.filter === 'Ha')
      expect(ha!.integrationSec).toBe(1500)
      expect(ha!.frameCount).toBe(5)

      const oiii = result[0].filters.find(f => f.filter === 'OIII')
      expect(oiii!.integrationSec).toBe(900)
      expect(oiii!.frameCount).toBe(3)
    })

    it('Given a goal is set, percentComplete is calculated', () => {
      const scanId = seedFitsScan(sqlite)
      const t1 = seedTarget(sqlite, { id: 'target-fixed', canonicalName: 'M51' })

      for (let i = 0; i < 5; i++) {
        seedFitsFile(sqlite, scanId, {
          targetId: t1, filter: 'Ha', exposureSec: 300,
          imageType: 'Light Frame', isStacked: false
        })
      }

      seedIntegrationGoal(sqlite, { targetId: t1, filter: 'Ha', goalSeconds: 6000 })

      const result = getIntegrationProgress()
      const ha = result[0].filters.find(f => f.filter === 'Ha')
      expect(ha!.goalSec).toBe(6000)
      expect(ha!.percentComplete).toBe(25)
    })

    it('Given no goal is set, percentComplete is null', () => {
      const scanId = seedFitsScan(sqlite)
      const t1 = seedTarget(sqlite, { canonicalName: 'M101' })

      seedFitsFile(sqlite, scanId, {
        targetId: t1, filter: 'L', exposureSec: 300,
        imageType: 'Light Frame', isStacked: false
      })

      const result = getIntegrationProgress()
      const l = result[0].filters.find(f => f.filter === 'L')
      expect(l!.goalSec).toBeNull()
      expect(l!.percentComplete).toBeNull()
    })
  })

  describe('Integration Goal CRUD', () => {
    it('setIntegrationGoal creates a new goal', () => {
      const t1 = seedTarget(sqlite, { id: 'target-1', canonicalName: 'M81' })
      const goal = setIntegrationGoal(t1, 'Ha', 21600)

      expect(goal.targetId).toBe(t1)
      expect(goal.filter).toBe('Ha')
      expect(goal.goalSeconds).toBe(21600)
      expect(goal.id).toBeTruthy()
    })

    it('setIntegrationGoal upserts on conflict', () => {
      const t1 = seedTarget(sqlite, { id: 'target-2', canonicalName: 'M82' })

      setIntegrationGoal(t1, 'Ha', 21600)
      const updated = setIntegrationGoal(t1, 'Ha', 36000)

      expect(updated.goalSeconds).toBe(36000)
      const goals = getIntegrationGoals(t1)
      expect(goals).toHaveLength(1)
    })

    it('deleteIntegrationGoal removes the goal', () => {
      const t1 = seedTarget(sqlite, { id: 'target-3', canonicalName: 'M83' })
      const goal = setIntegrationGoal(t1, 'OIII', 10800)

      expect(deleteIntegrationGoal(goal.id)).toBe(true)
      expect(getIntegrationGoals(t1)).toHaveLength(0)
    })

    it('getIntegrationGoals returns goals for a specific target', () => {
      const t1 = seedTarget(sqlite, { id: 'target-4', canonicalName: 'M84' })
      const t2 = seedTarget(sqlite, { id: 'target-5', canonicalName: 'M85' })

      setIntegrationGoal(t1, 'Ha', 21600)
      setIntegrationGoal(t1, 'OIII', 10800)
      setIntegrationGoal(t2, 'L', 7200)

      const goals = getIntegrationGoals(t1)
      expect(goals).toHaveLength(2)
      expect(goals.every(g => g.targetId === t1)).toBe(true)
    })
  })
})
