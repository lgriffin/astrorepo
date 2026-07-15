import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedTarget, seedObservatory } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite,
  getDb: () => null
}))

const { getVisibility, getTonightTargets } = await import('../../src/main/services/ephemeris')

describe('EphemerisService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: Visibility Computation', () => {
    // Event: User requests visibility data for a target at a specific observatory on a given date
    // Action: System computes rise/set/transit times using astronomy-engine and GMST/LST
    // Response: Returns VisibilityData with altitude, azimuth, hours above horizon, moon separation
    // State: No database mutation

    it('Given a target with RA/Dec and an observatory, When visibility is computed, Then it returns altitude and availability', () => {
      const targetId = seedTarget(sqlite, {
        canonicalName: 'Sirius',
        objectType: 'star',
        raHours: 6.752,
        decDegrees: -16.716
      })
      const obsId = seedObservatory(sqlite, {
        latitude: 51.4769,
        longitude: -0.0005,
        altitudeM: 11
      })

      const vis = getVisibility(targetId, obsId, '2025-01-15')

      expect(vis.available).toBe(true)
      expect(vis.hoursAboveHorizon).toBeGreaterThan(0)
      expect(typeof vis.currentAltitude).toBe('number')
      expect(typeof vis.currentAzimuth).toBe('number')
      expect(typeof vis.moonSeparation).toBe('number')
    })

    it('Given a target without coordinates, When visibility is requested, Then it returns unavailable', () => {
      const targetId = seedTarget(sqlite, {
        canonicalName: 'No Coords',
        objectType: 'custom',
        raHours: null,
        decDegrees: null
      })
      const obsId = seedObservatory(sqlite)

      const vis = getVisibility(targetId, obsId, '2025-06-01')

      expect(vis.available).toBe(false)
      expect(vis.hoursAboveHorizon).toBe(0)
    })

    it('Given a nonexistent observatory, When visibility is requested, Then it returns unavailable', () => {
      const targetId = seedTarget(sqlite, {
        canonicalName: 'Test Star',
        objectType: 'star',
        raHours: 12.0,
        decDegrees: 45.0
      })

      const vis = getVisibility(targetId, 'nonexistent-obs', '2025-03-20')

      expect(vis.available).toBe(false)
    })

    it('Given a circumpolar target from a northern observatory, When visibility is computed, Then hours above horizon is 24', () => {
      const targetId = seedTarget(sqlite, {
        canonicalName: 'Polaris',
        objectType: 'star',
        raHours: 2.53,
        decDegrees: 89.26
      })
      const obsId = seedObservatory(sqlite, { latitude: 60.0, longitude: 25.0 })

      const vis = getVisibility(targetId, obsId, '2025-06-15')

      expect(vis.hoursAboveHorizon).toBe(24)
      expect(vis.available).toBe(true)
    })

    it('Given a deep southern target from a northern observatory, When visibility is computed, Then hours is 0', () => {
      const targetId = seedTarget(sqlite, {
        canonicalName: 'South Pole Star',
        objectType: 'star',
        raHours: 12.0,
        decDegrees: -85.0
      })
      const obsId = seedObservatory(sqlite, { latitude: 55.0, longitude: 0.0 })

      const vis = getVisibility(targetId, obsId, '2025-06-15')

      expect(vis.hoursAboveHorizon).toBe(0)
      expect(vis.available).toBe(false)
    })
  })

  describe('EARS: Tonight\'s Targets', () => {
    // Event: User opens planning page for a specific date and observatory
    // Action: System queries all non-completed targets with coordinates, computes visibility for each
    // Response: Returns sorted list of PlannedTarget objects ranked by hours above horizon
    // State: No database mutation

    it('Given several targets with coordinates, When planning tonight, Then returns visible targets sorted by hours', () => {
      seedTarget(sqlite, { canonicalName: 'Visible A', objectType: 'galaxy', raHours: 12.0, decDegrees: 30.0 })
      seedTarget(sqlite, { canonicalName: 'Visible B', objectType: 'galaxy', raHours: 18.0, decDegrees: 50.0 })
      const obsId = seedObservatory(sqlite, { latitude: 45.0, longitude: 10.0 })

      const planned = getTonightTargets(obsId, '2025-03-15')

      expect(planned.length).toBeGreaterThanOrEqual(1)
      for (let i = 1; i < planned.length; i++) {
        expect(planned[i - 1].visibility.hoursAboveHorizon).toBeGreaterThanOrEqual(planned[i].visibility.hoursAboveHorizon)
      }
    })

    it('Given a completed target, When planning tonight, Then it is excluded from results', () => {
      seedTarget(sqlite, {
        canonicalName: 'Done Target',
        objectType: 'galaxy',
        raHours: 12.0,
        decDegrees: 40.0,
        workflowStage: 'published'
      })
      const obsId = seedObservatory(sqlite, { latitude: 45.0, longitude: 10.0 })

      const planned = getTonightTargets(obsId, '2025-06-15')
      expect(planned.every((p) => p.target.canonicalName !== 'Done Target')).toBe(true)
    })

    it('Given a nonexistent observatory, When planning tonight, Then returns empty array', () => {
      seedTarget(sqlite, { canonicalName: 'Any', objectType: 'star', raHours: 6.0, decDegrees: 20.0 })
      const result = getTonightTargets('no-such-obs', '2025-01-01')
      expect(result).toEqual([])
    })
  })
})
