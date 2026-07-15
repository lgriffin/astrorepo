import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite,
  getDb: () => null
}))

const { createObservatory, listObservatories, setPrimaryObservatory, getPrimaryObservatory } = await import('../../src/main/services/observatory')

describe('ObservatoryService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: Observatory Creation', () => {
    // Event: User registers a new observatory location
    // Action: System inserts an observatory row; first observatory is auto-set as primary
    // Response: Returns Observatory object
    // State: First observatory is primary, subsequent ones are not

    it('Given no observatories exist, When the first is created, Then it is automatically set as primary', () => {
      const obs = createObservatory({
        name: 'Backyard',
        latitude: 51.4769,
        longitude: -0.0005,
        altitudeM: 11
      })

      expect(obs.id).toBeTruthy()
      expect(obs.name).toBe('Backyard')
      expect(obs.isPrimary).toBe(true)
      expect(obs.latitude).toBeCloseTo(51.4769)
    })

    it('Given one observatory exists, When a second is created, Then the second is not primary', () => {
      createObservatory({ name: 'Primary Site', latitude: 40.0, longitude: -3.0, altitudeM: 800 })
      const second = createObservatory({ name: 'Remote Site', latitude: 28.76, longitude: -17.89, altitudeM: 2400 })

      expect(second.isPrimary).toBe(false)
    })
  })

  describe('EARS: Primary Observatory Management', () => {
    // Event: User selects a different observatory as primary
    // Action: System clears all is_primary flags, then sets the chosen one
    // Response: Returns the updated observatory
    // State: Exactly one observatory is primary at any time

    it('Given two observatories, When the second is set as primary, Then the first loses primary status', () => {
      const first = createObservatory({ name: 'Site A', latitude: 45.0, longitude: 10.0, altitudeM: 100 })
      const second = createObservatory({ name: 'Site B', latitude: 28.76, longitude: -17.89, altitudeM: 2400 })

      expect(first.isPrimary).toBe(true)

      setPrimaryObservatory(second.id)

      const primary = getPrimaryObservatory()
      expect(primary!.name).toBe('Site B')
      expect(primary!.isPrimary).toBe(true)

      const all = listObservatories()
      const nonPrimary = all.filter((o) => !o.isPrimary)
      expect(nonPrimary).toHaveLength(1)
      expect(nonPrimary[0].name).toBe('Site A')
    })
  })

  describe('EARS: Observatory Listing', () => {
    // Event: User views the observatory management page
    // Action: System queries all observatories ordered by name
    // Response: Returns Observatory[] with coordinates and primary status
    // State: No mutation

    it('Given multiple observatories exist, When listed, Then all are returned sorted by name', () => {
      createObservatory({ name: 'Zebra Site', latitude: -33.0, longitude: 18.0, altitudeM: 50 })
      createObservatory({ name: 'Alpha Site', latitude: 45.0, longitude: 10.0, altitudeM: 500 })

      const all = listObservatories()
      expect(all).toHaveLength(2)
      expect(all[0].name).toBe('Alpha Site')
      expect(all[1].name).toBe('Zebra Site')
    })
  })
})
