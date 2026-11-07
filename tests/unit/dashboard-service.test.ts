import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedTarget, seedEquipment, seedFitsScan, seedFitsFile } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite
}))

const { getDashboardStats, getCatalogueProgressStats } = await import('../../src/main/services/dashboard')
const { createSession } = await import('../../src/main/services/session')
const { getInsightsSummary } = await import('../../src/main/services/insights')

describe('DashboardService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: Dashboard Statistics Aggregation', () => {
    // Event: User opens the dashboard page
    // Action: System runs aggregate queries across targets, sessions, and equipment
    // Response: Returns DashboardStats with totals, breakdowns, and rankings
    // State: No mutation

    it('Given an empty database, When dashboard stats are fetched, Then all counts are zero', () => {
      const stats = getDashboardStats()

      expect(stats.totalTargets).toBe(0)
      expect(stats.completedTargets).toBe(0)
      expect(stats.inProgressTargets).toBe(0)
      expect(stats.plannedTargets).toBe(0)
      expect(stats.observationNights).toBe(0)
      expect(stats.totalExposureSec).toBe(0)
    })

    it('Given targets at various stages, When stats are fetched, Then stage counts are accurate', () => {
      seedTarget(sqlite, { canonicalName: 'Planned A', workflowStage: 'not_observed' })
      seedTarget(sqlite, { canonicalName: 'Planned B', workflowStage: 'not_observed' })
      seedTarget(sqlite, { canonicalName: 'Processing C', workflowStage: 'processing' })
      seedTarget(sqlite, { canonicalName: 'Published D', workflowStage: 'published' })
      seedTarget(sqlite, { canonicalName: 'Archived E', workflowStage: 'archived' })

      const stats = getDashboardStats()

      expect(stats.totalTargets).toBe(5)
      expect(stats.plannedTargets).toBe(2)
      expect(stats.inProgressTargets).toBe(1)
      expect(stats.completedTargets).toBe(2)
    })

    it('Given targets of different types, When stats are fetched, Then objectsByType breakdown is correct', () => {
      seedTarget(sqlite, { canonicalName: 'Galaxy 1', objectType: 'galaxy' })
      seedTarget(sqlite, { canonicalName: 'Galaxy 2', objectType: 'galaxy' })
      seedTarget(sqlite, { canonicalName: 'Nebula 1', objectType: 'emission_nebula' })

      const stats = getDashboardStats()

      expect(stats.objectsByType['galaxy']).toBe(2)
      expect(stats.objectsByType['emission_nebula']).toBe(1)
    })

    it('Given sessions with exposure data, When stats are fetched, Then total exposure is summed', () => {
      const tid = seedTarget(sqlite, { canonicalName: 'Exposure Target' })

      createSession({ date: '2025-01-01', totalExposureSec: 3600, targetIds: [tid] })
      createSession({ date: '2025-01-02', totalExposureSec: 7200, targetIds: [tid] })

      const stats = getDashboardStats()

      expect(stats.observationNights).toBe(2)
      expect(stats.totalExposureSec).toBe(10800)
    })

    it('Given equipment used across sessions, When stats are fetched, Then most used equipment is ranked', () => {
      const eq1 = seedEquipment(sqlite, { name: 'Primary Camera', equipmentType: 'camera' })
      const eq2 = seedEquipment(sqlite, { name: 'Backup Camera', equipmentType: 'camera' })
      const tid = seedTarget(sqlite, { canonicalName: 'Equip Target' })

      createSession({ date: '2025-01-01', targetIds: [tid], equipmentIds: [eq1] })
      createSession({ date: '2025-01-02', targetIds: [tid], equipmentIds: [eq1] })
      createSession({ date: '2025-01-03', targetIds: [tid], equipmentIds: [eq2] })

      const stats = getDashboardStats()

      expect(stats.mostUsedEquipment.length).toBeGreaterThanOrEqual(1)
      expect(stats.mostUsedEquipment[0].name).toBe('Primary Camera')
      expect(stats.mostUsedEquipment[0].sessionCount).toBe(2)
    })
  })

  describe('EARS: Catalogue Progress', () => {
    // Event: User views catalogue completion statistics
    // Action: System aggregates completed vs total targets per catalogue
    // Response: Returns CatalogueProgress[] with counts
    // State: No mutation

    it('Given a catalogue with targets, When progress is queried, Then completion stats reflect workflow stages', () => {
      const now = new Date().toISOString()

      sqlite.prepare('INSERT INTO catalogues (id, name, abbreviation, description, total_objects, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)').run('cat-1', 'Messier', 'M', 'Messier catalogue', 110, now)

      const t1 = seedTarget(sqlite, { canonicalName: 'M1', workflowStage: 'published' })
      const t2 = seedTarget(sqlite, { canonicalName: 'M2', workflowStage: 'not_observed' })

      sqlite.prepare('INSERT INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, ?, ?, ?)').run('ce-1', 'cat-1', t1, 'M1')
      sqlite.prepare('INSERT INTO catalogue_entries (id, catalogue_id, target_id, designation) VALUES (?, ?, ?, ?)').run('ce-2', 'cat-1', t2, 'M2')

      const progress = getCatalogueProgressStats()
      expect(progress).toHaveLength(1)
      expect(progress[0].catalogueName).toBe('Messier')
      expect(progress[0].total).toBe(2)
      expect(progress[0].completed).toBe(1)
    })
  })

  describe('Honest numbers (spec 046, U3)', () => {
    it('[EUX-007] Given catalogue entries nobody has touched, When totals are fetched, Then they are not counted as targets, planned or by type', () => {
      seedTarget(sqlite, { canonicalName: 'M 1', objectType: 'supernova_remnant', isCustom: false })
      seedTarget(sqlite, { canonicalName: 'M 2', objectType: 'globular_cluster', isCustom: false })
      seedTarget(sqlite, { canonicalName: 'Mine', objectType: 'galaxy' })
      seedTarget(sqlite, { canonicalName: 'M 42', objectType: 'emission_nebula', isCustom: false, workflowStage: 'processing' })

      const stats = getDashboardStats()

      expect(stats.totalTargets).toBe(2)
      expect(stats.plannedTargets).toBe(1)
      expect(stats.inProgressTargets).toBe(1)
      expect(stats.objectsByType).toEqual({ galaxy: 1, emission_nebula: 1 })
    })

    it('[EUX-007] Given a catalogue entry with your light frames, When totals are fetched, Then it counts as yours', () => {
      const id = seedTarget(sqlite, { canonicalName: 'M 31', isCustom: false })
      seedFitsFile(sqlite, seedFitsScan(sqlite), { targetId: id, imageType: 'Light', dateObs: '2025-01-01T21:00:00' })
      expect(getDashboardStats().totalTargets).toBe(1)
    })

    it('[EUX-008] Given a night both logged and imaged, another only imaged and a dark frame, When nights are counted, Then each night counts once and darks do not', () => {
      const scan = seedFitsScan(sqlite)
      createSession({ date: '2025-01-01', totalExposureSec: 3600, targetIds: [] })
      seedFitsFile(sqlite, scan, { imageType: 'Light', dateObs: '2025-01-01T21:00:00' })
      seedFitsFile(sqlite, scan, { imageType: 'LIGHT', dateObs: '2025-01-03T22:00:00' })
      seedFitsFile(sqlite, scan, { imageType: 'Dark', dateObs: '2025-01-05T22:00:00' })

      expect(getDashboardStats().observationNights).toBe(2)
      expect(getInsightsSummary().totalNights).toBe(2)
    })

    it('[EUX-008] Given a night logged on its evening with frames either side of midnight, When nights are counted, Then it is one night', () => {
      const scan = seedFitsScan(sqlite)
      createSession({ date: '2025-01-01', totalExposureSec: 3600, targetIds: [] })
      seedFitsFile(sqlite, scan, { imageType: 'Light', dateObs: '2025-01-01T21:00:00' })
      seedFitsFile(sqlite, scan, { imageType: 'Light', dateObs: '2025-01-02T02:30:00.250Z' })
      expect(getDashboardStats().observationNights).toBe(1)
    })

    it('[EUX-008] Given calibration frames whose type also says light, When nights are counted, Then they add no night', () => {
      const scan = seedFitsScan(sqlite)
      seedFitsFile(sqlite, scan, { imageType: 'Flat Light', dateObs: '2025-02-01T21:00:00' })
      seedFitsFile(sqlite, scan, { imageType: 'Dark Light', dateObs: '2025-02-03T21:00:00' })
      seedFitsFile(sqlite, scan, { imageType: null, dateObs: '2025-02-05T21:00:00' })
      expect(getInsightsSummary().totalNights).toBe(1)
    })
  })
})
