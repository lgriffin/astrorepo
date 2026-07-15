import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedTarget } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite,
  getDb: () => null
}))

const { searchTargets, getTargetById, createTarget, updateTarget, getAliasesForTarget, addAlias, mergeTargets } = await import('../../src/main/services/target')

describe('TargetService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: Target Creation', () => {
    // Event: User submits a new target with required fields
    // Action: System persists the target to the database
    // Response: Returns a fully populated Target object
    // State: Database contains one new target row with 'planned' workflow stage

    it('Given no targets exist, When a target is created with name and type, Then it returns a Target with a ULID and planned stage', () => {
      const result = createTarget({ canonicalName: 'Andromeda Galaxy', objectType: 'galaxy' })

      expect(result.id).toBeTruthy()
      expect(result.canonicalName).toBe('Andromeda Galaxy')
      expect(result.objectType).toBe('galaxy')
      expect(result.workflowStage).toBe('planned')
      expect(result.isCustom).toBe(true)
      expect(result.createdAt).toBeTruthy()
    })

    it('Given no targets exist, When a target is created with coordinates, Then RA and Dec are persisted', () => {
      const result = createTarget({
        canonicalName: 'Orion Nebula',
        objectType: 'emission_nebula',
        raHours: 5.588,
        decDegrees: -5.39
      })

      expect(result.raHours).toBeCloseTo(5.588, 2)
      expect(result.decDegrees).toBeCloseTo(-5.39, 2)
    })

    it('Given a target with the same name already exists, When creating a duplicate, Then it throws a constraint error', () => {
      createTarget({ canonicalName: 'M31', objectType: 'galaxy' })
      expect(() => createTarget({ canonicalName: 'M31', objectType: 'galaxy' })).toThrow()
    })
  })

  describe('EARS: Target Retrieval', () => {
    // Event: User requests a target by its ID
    // Action: System queries the database for the matching row
    // Response: Returns the Target or null
    // State: No database mutation

    it('Given a target exists, When retrieved by ID, Then it returns the full target object', () => {
      const created = createTarget({ canonicalName: 'Crab Nebula', objectType: 'supernova_remnant' })
      const found = getTargetById(created.id)

      expect(found).not.toBeNull()
      expect(found!.canonicalName).toBe('Crab Nebula')
      expect(found!.objectType).toBe('supernova_remnant')
    })

    it('Given no target exists for the ID, When retrieved, Then it returns null', () => {
      const found = getTargetById('nonexistent-id')
      expect(found).toBeNull()
    })
  })

  describe('EARS: Target Search', () => {
    // Event: User enters a search query
    // Action: System searches FTS5 index, falls back to LIKE on aliases
    // Response: Returns paginated TargetSummary array with total count
    // State: No mutation

    it('Given multiple targets exist, When searching with empty query, Then returns all targets paginated', () => {
      createTarget({ canonicalName: 'Alpha', objectType: 'star' })
      createTarget({ canonicalName: 'Beta', objectType: 'star' })
      createTarget({ canonicalName: 'Gamma', objectType: 'galaxy' })

      const result = searchTargets('', 2, 0)
      expect(result.total).toBe(3)
      expect(result.targets).toHaveLength(2)
    })

    it('Given a target has an alias, When searching by alias text, Then the target appears in results', () => {
      const t = createTarget({ canonicalName: 'Eagle Nebula', objectType: 'emission_nebula' })
      addAlias(t.id, 'M16', 'messier')

      const result = searchTargets('M16')
      expect(result.targets.length).toBeGreaterThanOrEqual(1)
      expect(result.targets.some((s) => s.canonicalName === 'Eagle Nebula')).toBe(true)
    })

    it('Given targets exist, When searching with pagination offset, Then skips earlier results', () => {
      createTarget({ canonicalName: 'Aaa', objectType: 'star' })
      createTarget({ canonicalName: 'Bbb', objectType: 'star' })

      const page2 = searchTargets('', 1, 1)
      expect(page2.targets).toHaveLength(1)
      expect(page2.total).toBe(2)
    })
  })

  describe('EARS: Target Update', () => {
    // Event: User modifies target fields
    // Action: System updates only the specified columns
    // Response: Returns the updated Target
    // State: updated_at timestamp advances

    it('Given a target exists, When updating its notes, Then the notes field is changed and updated_at advances', () => {
      const created = createTarget({ canonicalName: 'Ring Nebula', objectType: 'planetary_nebula' })
      const updated = updateTarget(created.id, { notes: 'Beautiful object' })

      expect(updated!.notes).toBe('Beautiful object')
      expect(updated!.updatedAt >= created.updatedAt).toBe(true)
    })

    it('Given no target exists, When updating by missing ID, Then returns null', () => {
      const result = updateTarget('missing-id', { notes: 'test' })
      expect(result).toBeNull()
    })

    it('Given a target exists, When updating with no fields, Then it returns unchanged target', () => {
      const created = createTarget({ canonicalName: 'Veil Nebula', objectType: 'supernova_remnant' })
      const result = updateTarget(created.id, {})

      expect(result!.canonicalName).toBe('Veil Nebula')
    })
  })

  describe('EARS: Alias Management', () => {
    // Event: User adds an alias to a target
    // Action: System inserts an alias row linked to the target
    // Response: Returns the TargetAlias or null on conflict
    // State: alias is searchable and retrievable

    it('Given a target exists, When an alias is added, Then it appears in the aliases list', () => {
      const t = createTarget({ canonicalName: 'Orion Nebula', objectType: 'emission_nebula' })
      addAlias(t.id, 'M42', 'messier')
      addAlias(t.id, 'NGC 1976', 'ngc')

      const aliases = getAliasesForTarget(t.id)
      expect(aliases).toHaveLength(2)
      expect(aliases.map((a) => a.alias)).toContain('M42')
      expect(aliases.map((a) => a.alias)).toContain('NGC 1976')
    })

    it('Given an alias already exists globally, When adding the same alias to another target, Then returns null', () => {
      const t1 = createTarget({ canonicalName: 'Target A', objectType: 'galaxy' })
      const t2 = createTarget({ canonicalName: 'Target B', objectType: 'galaxy' })
      addAlias(t1.id, 'DuplicateAlias', 'test')

      const result = addAlias(t2.id, 'DuplicateAlias', 'test')
      expect(result).toBeNull()
    })
  })

  describe('EARS: Target Merge', () => {
    // Event: User merges two targets (keep + merge)
    // Action: System transfers all aliases, catalogue entries, sessions, relationships to keep target
    // Response: Returns the consolidated target
    // State: Merge target is deleted, keep target inherits all associations

    it('Given two targets exist, When merged, Then the merge target is deleted and its name becomes an alias', () => {
      const keep = createTarget({ canonicalName: 'NGC 7000', objectType: 'emission_nebula' })
      const merge = createTarget({ canonicalName: 'Caldwell 20', objectType: 'emission_nebula' })

      const result = mergeTargets(keep.id, merge.id)

      expect(result).not.toBeNull()
      expect(result!.canonicalName).toBe('NGC 7000')

      const deleted = getTargetById(merge.id)
      expect(deleted).toBeNull()

      const aliases = getAliasesForTarget(keep.id)
      expect(aliases.some((a) => a.alias === 'Caldwell 20')).toBe(true)
    })

    it('Given the same ID for both keep and merge, When merging, Then returns null', () => {
      const t = createTarget({ canonicalName: 'Self Merge', objectType: 'star' })
      const result = mergeTargets(t.id, t.id)
      expect(result).toBeNull()
    })
  })
})
