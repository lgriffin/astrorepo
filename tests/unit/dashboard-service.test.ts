import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedTarget, seedEquipment } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite
}))

const { getDashboardStats, getCatalogueProgressStats } = await import('../../src/main/services/dashboard')
const { createSession } = await import('../../src/main/services/session')

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
})
