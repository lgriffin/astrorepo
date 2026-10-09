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

  describe('SyQon steps', () => {
    it('[HUB-011] Given a SyQon step, When validated, Then the model must be a plain id and Replace it must be said outright', () => {
      const ok = { target_id: 't', step: 'denoise', model: 'prism-essential', overwrite: false, timing: 'now' }
      expect(schemas['jobs:queue-syqon'].parse(ok)).toMatchObject(ok)
      for (const model of ['--overwrite', '../x', 'a b', '']) expect(() => schemas['jobs:queue-syqon'].parse({ ...ok, model })).toThrow()
      expect(() => schemas['jobs:queue-syqon'].parse({ ...ok, overwrite: undefined })).toThrow()
      expect(() => schemas['jobs:queue-syqon'].parse({ ...ok, step: 'stretch' })).toThrow()
      expect(schemas['recipe:syqon'].parse({ target_id: 't' })).toEqual({ target_id: 't' })
    })
  })
})

describe('Other rigs channels (specs/026-other-rigs)', () => {
  it('[RIG-009] Given a stack queued for one filter, When validated, Then the filter is kept trimmed, and an empty or overlong one is refused', () => {
    const base = { target_id: 't1', script: 'Mono_Preprocessing', timing: 'window' }
    expect(schemas['jobs:queue-stack'].parse({ ...base, filter: ' Ha ' }).filter).toBe('Ha')
    expect(schemas['jobs:queue-stack'].parse(base).filter).toBeUndefined()
    expect(() => schemas['jobs:queue-stack'].parse({ ...base, filter: '   ' })).toThrow()
    expect(() => schemas['jobs:queue-stack'].parse({ ...base, filter: 'x'.repeat(41) })).toThrow()
  })

  it('[RIG-011] Given a comet line or null, When validated, Then both pass and an overlong line or a missing target is refused', () => {
    expect(schemas['comet:set-orbit'].parse({ target_id: 't1', line: '0002P  1990 10 28.54502 ...' }).line).toContain('0002P')
    expect(schemas['comet:set-orbit'].parse({ target_id: 't1', line: null }).line).toBeNull()
    expect(() => schemas['comet:set-orbit'].parse({ target_id: 't1', line: 'x'.repeat(401) })).toThrow()
    expect(() => schemas['comet:plan'].parse({})).toThrow()
    expect(schemas['comet:write-positions'].parse({ target_id: 't1' }).target_id).toBe('t1')
  })
})
