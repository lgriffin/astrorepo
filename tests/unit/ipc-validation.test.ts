import { describe, it, expect } from 'vitest'
import { schemas } from '../../src/main/ipc/schemas'

describe('IPC Zod Validation (Boundary Tests)', () => {
  describe('EARS: Target Search Schema', () => {
    // Event: Renderer sends a targets:search IPC call with various payloads
    // Action: Zod schema validates the input before it reaches the service layer
    // Response: Valid payloads pass, invalid payloads throw ZodError
    // State: No service invocation on invalid input

    it('Given a valid search payload, When validated, Then it passes', () => {
      const result = schemas['targets:search'].parse({ query: 'M42', limit: 10, offset: 0 })
      expect(result.query).toBe('M42')
    })

    it('Given a missing query field, When validated, Then it throws', () => {
      expect(() => schemas['targets:search'].parse({})).toThrow()
    })

    it('Given a negative limit, When validated, Then it throws', () => {
      expect(() => schemas['targets:search'].parse({ query: 'test', limit: -1 })).toThrow()
    })
  })

  describe('EARS: Target Create Schema', () => {
    // Event: Renderer sends targets:create with target data
    // Action: Zod validates required fields and enum constraints
    // Response: Rejects invalid object types, empty names
    // State: Invalid data never reaches createTarget()

    it('Given valid target data, When validated, Then it passes with all fields', () => {
      const result = schemas['targets:create'].parse({
        canonical_name: 'Crab Nebula',
        object_type: 'supernova_remnant',
        ra_hours: 5.575,
        dec_degrees: 22.017
      })
      expect(result.canonical_name).toBe('Crab Nebula')
      expect(result.object_type).toBe('supernova_remnant')
    })

    it('Given an invalid object type, When validated, Then it throws', () => {
      expect(() => schemas['targets:create'].parse({
        canonical_name: 'Test',
        object_type: 'invalid_type'
      })).toThrow()
    })

    it('Given an empty canonical name, When validated, Then it throws', () => {
      expect(() => schemas['targets:create'].parse({
        canonical_name: '',
        object_type: 'galaxy'
      })).toThrow()
    })

    it('Given RA out of range (>24), When validated, Then it throws', () => {
      expect(() => schemas['targets:create'].parse({
        canonical_name: 'Bad RA',
        object_type: 'star',
        ra_hours: 25.0
      })).toThrow()
    })

    it('Given Dec out of range (<-90), When validated, Then it throws', () => {
      expect(() => schemas['targets:create'].parse({
        canonical_name: 'Bad Dec',
        object_type: 'star',
        dec_degrees: -91.0
      })).toThrow()
    })
  })

  describe('EARS: Observatory Create Schema', () => {
    // Event: Renderer sends observatory:create with location data
    // Action: Zod validates latitude/longitude ranges and required fields
    // Response: Rejects coordinates outside valid ranges
    // State: Invalid data never reaches createObservatory()

    it('Given valid observatory data, When validated, Then it passes', () => {
      const result = schemas['observatory:create'].parse({
        name: 'Backyard Observatory',
        latitude: 51.4769,
        longitude: -0.0005,
        altitude_m: 11
      })
      expect(result.name).toBe('Backyard Observatory')
    })

    it('Given latitude > 90, When validated, Then it throws', () => {
      expect(() => schemas['observatory:create'].parse({
        name: 'Bad',
        latitude: 91.0,
        longitude: 0,
        altitude_m: 0
      })).toThrow()
    })

    it('Given longitude > 180, When validated, Then it throws', () => {
      expect(() => schemas['observatory:create'].parse({
        name: 'Bad',
        latitude: 0,
        longitude: 181.0,
        altitude_m: 0
      })).toThrow()
    })

    it('Given altitude above Everest, When validated, Then it throws', () => {
      expect(() => schemas['observatory:create'].parse({
        name: 'Space',
        latitude: 0,
        longitude: 0,
        altitude_m: 10000
      })).toThrow()
    })
  })

  describe('EARS: Session Create Schema', () => {
    // Event: Renderer sends sessions:create with session data
    // Action: Zod validates date format, numeric ranges, array types
    // Response: Rejects invalid moon phase, negative frame counts
    // State: Service layer protected from malformed input

    it('Given valid session data, When validated, Then it passes', () => {
      const result = schemas['sessions:create'].parse({
        date: '2025-06-15',
        sky_quality: 21.5,
        total_frames: 120,
        target_ids: ['t1', 't2']
      })
      expect(result.date).toBe('2025-06-15')
      expect(result.target_ids).toEqual(['t1', 't2'])
    })

    it('Given a missing date, When validated, Then it throws', () => {
      expect(() => schemas['sessions:create'].parse({})).toThrow()
    })

    it('Given negative total_frames, When validated, Then it throws', () => {
      expect(() => schemas['sessions:create'].parse({
        date: '2025-01-01',
        total_frames: -5
      })).toThrow()
    })
  })

  describe('EARS: Planning Schema', () => {
    // Event: Renderer sends planning:tonight with observatory and date
    // Action: Zod validates date format and numeric constraints
    // Response: Rejects invalid date formats, negative altitudes
    // State: Ephemeris computation only runs on valid input

    it('Given valid planning params, When validated, Then it passes', () => {
      const result = schemas['planning:tonight'].parse({
        observatory_id: 'obs-123',
        date: '2025-06-15',
        min_altitude: 20,
        min_hours: 2
      })
      expect(result.date).toBe('2025-06-15')
    })

    it('Given an invalid date format, When validated, Then it throws', () => {
      expect(() => schemas['planning:tonight'].parse({
        observatory_id: 'obs-123',
        date: 'June 15 2025'
      })).toThrow()
    })

    it('Given min_altitude > 90, When validated, Then it throws', () => {
      expect(() => schemas['planning:tonight'].parse({
        observatory_id: 'obs-123',
        date: '2025-06-15',
        min_altitude: 91
      })).toThrow()
    })
  })

  describe('EARS: Relationship Schema', () => {
    // Event: Renderer sends relationships:create with relationship data
    // Action: Zod validates relationship type enum
    // Response: Rejects unknown relationship types
    // State: Database protected from invalid enum values

    it('Given a valid relationship type, When validated, Then it passes', () => {
      const result = schemas['relationships:create'].parse({
        source_target_id: 'src',
        related_target_id: 'rel',
        relationship_type: 'contains'
      })
      expect(result.relationship_type).toBe('contains')
    })

    it('Given an invalid relationship type, When validated, Then it throws', () => {
      expect(() => schemas['relationships:create'].parse({
        source_target_id: 'src',
        related_target_id: 'rel',
        relationship_type: 'is_friends_with'
      })).toThrow()
    })
  })

  describe('EARS: Equipment Schema', () => {
    // Event: Renderer sends equipment:create with equipment data
    // Action: Zod validates equipment type enum
    // Response: Rejects unknown equipment types
    // State: Only valid equipment types reach the database

    it('Given a valid equipment type, When validated, Then it passes', () => {
      const result = schemas['equipment:create'].parse({
        name: 'ZWO ASI2600MC',
        equipment_type: 'camera'
      })
      expect(result.equipment_type).toBe('camera')
    })

    it('Given an unknown equipment type, When validated, Then it throws', () => {
      expect(() => schemas['equipment:create'].parse({
        name: 'Gadget',
        equipment_type: 'phaser'
      })).toThrow()
    })
  })
})
