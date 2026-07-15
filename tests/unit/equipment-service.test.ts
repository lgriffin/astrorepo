import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedTarget, seedEquipment } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite,
  getDb: () => null
}))

const { createEquipment, listEquipment, getUsageHistory } = await import('../../src/main/services/equipment')
const { createSession } = await import('../../src/main/services/session')

describe('EquipmentService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: Equipment Registration', () => {
    // Event: User registers a new piece of equipment
    // Action: System inserts an equipment row
    // Response: Returns Equipment object with generated ID, is_active = true
    // State: Equipment exists in database ready for session association

    it('Given no equipment exists, When a camera is registered, Then it is returned with active status', () => {
      const eq = createEquipment({
        name: 'ZWO ASI2600MC Pro',
        equipmentType: 'camera',
        manufacturer: 'ZWO',
        model: 'ASI2600MC Pro'
      })

      expect(eq.id).toBeTruthy()
      expect(eq.name).toBe('ZWO ASI2600MC Pro')
      expect(eq.equipmentType).toBe('camera')
      expect(eq.manufacturer).toBe('ZWO')
      expect(eq.isActive).toBe(true)
    })
  })

  describe('EARS: Equipment Listing', () => {
    // Event: User views equipment inventory, optionally filtered by type
    // Action: System queries equipment table with optional WHERE clause
    // Response: Returns Equipment[] sorted by name
    // State: No mutation

    it('Given multiple equipment types exist, When listing all, Then all equipment is returned', () => {
      createEquipment({ name: 'Camera A', equipmentType: 'camera' })
      createEquipment({ name: 'Scope B', equipmentType: 'telescope' })
      createEquipment({ name: 'Mount C', equipmentType: 'mount' })

      const all = listEquipment()
      expect(all).toHaveLength(3)
    })

    it('Given multiple equipment types exist, When filtering by camera, Then only cameras are returned', () => {
      createEquipment({ name: 'Camera A', equipmentType: 'camera' })
      createEquipment({ name: 'Scope B', equipmentType: 'telescope' })

      const cameras = listEquipment('camera')
      expect(cameras).toHaveLength(1)
      expect(cameras[0].equipmentType).toBe('camera')
    })
  })

  describe('EARS: Equipment Usage History', () => {
    // Event: User views which sessions used a piece of equipment
    // Action: System joins session_equipment to observation_sessions
    // Response: Returns SessionSummary[] for sessions involving this equipment
    // State: No mutation

    it('Given equipment used in sessions, When usage history is queried, Then linked sessions are returned', () => {
      const eqId = seedEquipment(sqlite, { name: 'Test Camera', equipmentType: 'camera' })
      const tid = seedTarget(sqlite, { canonicalName: 'Usage Target' })

      createSession({ date: '2025-01-01', targetIds: [tid], equipmentIds: [eqId] })
      createSession({ date: '2025-02-01', targetIds: [tid], equipmentIds: [eqId] })
      createSession({ date: '2025-03-01', targetIds: [tid] })

      const history = getUsageHistory(eqId)
      expect(history).toHaveLength(2)
    })

    it('Given equipment with no sessions, When usage history is queried, Then empty array is returned', () => {
      const eqId = seedEquipment(sqlite, { name: 'Unused Scope', equipmentType: 'telescope' })
      expect(getUsageHistory(eqId)).toEqual([])
    })
  })
})
