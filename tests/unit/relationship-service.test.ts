import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedTarget } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite
}))

const { createRelationship, listRelationships, deleteRelationship } = await import('../../src/main/services/relationship')

describe('RelationshipService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: Relationship Creation', () => {
    // Event: User establishes a relationship between two targets
    // Action: System inserts a target_relationships row
    // Response: Returns the TargetRelationship object
    // State: Both targets are now linked with the specified relationship type

    it('Given two targets, When a contains relationship is created, Then it is persisted', () => {
      const parent = seedTarget(sqlite, { canonicalName: 'Orion Molecular Cloud', objectType: 'molecular_cloud' })
      const child = seedTarget(sqlite, { canonicalName: 'Horsehead Nebula', objectType: 'dark_nebula' })

      const rel = createRelationship(parent, child, 'contains')

      expect(rel.id).toBeTruthy()
      expect(rel.sourceTargetId).toBe(parent)
      expect(rel.relatedTargetId).toBe(child)
      expect(rel.relationshipType).toBe('contains')
    })

    it('Given a self-referencing relationship, When creation is attempted, Then it throws', () => {
      const tid = seedTarget(sqlite, { canonicalName: 'Self' })
      expect(() => createRelationship(tid, tid, 'nearby')).toThrow()
    })
  })

  describe('EARS: Relationship Listing with Reciprocal Labels', () => {
    // Event: User views relationships for a target
    // Action: System queries relationships where target is source or related, computing inverse labels
    // Response: Returns RelationshipWithTarget[] with display type reflecting perspective
    // State: No mutation

    it('Given A contains B, When listing from B perspective, Then displayType is "contained in"', () => {
      const a = seedTarget(sqlite, { canonicalName: 'Parent Region' })
      const b = seedTarget(sqlite, { canonicalName: 'Child Object' })
      createRelationship(a, b, 'contains')

      const fromB = listRelationships(b)
      expect(fromB).toHaveLength(1)
      expect(fromB[0].displayType).toBe('contained in')
      expect(fromB[0].relatedTarget.canonicalName).toBe('Parent Region')
    })

    it('Given A is nearby B, When listing from either perspective, Then displayType is "nearby"', () => {
      const a = seedTarget(sqlite, { canonicalName: 'Near A' })
      const b = seedTarget(sqlite, { canonicalName: 'Near B' })
      createRelationship(a, b, 'nearby')

      const fromA = listRelationships(a)
      expect(fromA[0].displayType).toBe('nearby')

      const fromB = listRelationships(b)
      expect(fromB[0].displayType).toBe('nearby')
    })
  })

  describe('EARS: Relationship Deletion', () => {
    // Event: User removes a relationship
    // Action: System deletes the relationship row
    // Response: Returns true if deleted, false if not found
    // State: Relationship no longer exists in either target's list

    it('Given a relationship exists, When deleted, Then it no longer appears in listings', () => {
      const a = seedTarget(sqlite, { canonicalName: 'Del A' })
      const b = seedTarget(sqlite, { canonicalName: 'Del B' })
      const rel = createRelationship(a, b, 'nearby')

      expect(deleteRelationship(rel.id)).toBe(true)
      expect(listRelationships(a)).toHaveLength(0)
    })

    it('Given a nonexistent relationship ID, When deletion is attempted, Then returns false', () => {
      expect(deleteRelationship('no-such-rel')).toBe(false)
    })
  })
})
