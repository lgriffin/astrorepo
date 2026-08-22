import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedTarget } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite
}))

const { createCollection, listCollections, getCollectionWithTargets, addTargetToCollection, removeTargetFromCollection } = await import('../../src/main/services/collection')

describe('CollectionService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: Collection Creation', () => {
    // Event: User creates a new collection
    // Action: System inserts a collection row
    // Response: Returns the Collection object with auto-generated ID
    // State: Collection exists in database with is_auto = false

    it('Given no collections exist, When a collection is created, Then it is returned with the provided name', () => {
      const coll = createCollection('Winter Targets', 'Best objects for winter imaging')

      expect(coll.id).toBeTruthy()
      expect(coll.name).toBe('Winter Targets')
      expect(coll.description).toBe('Best objects for winter imaging')
      expect(coll.isAuto).toBe(false)
    })
  })

  describe('EARS: Collection Listing with Stats', () => {
    // Event: User views the collections page
    // Action: System queries collections with completion stats via LEFT JOIN
    // Response: Returns CollectionWithStats[] with completed/total counts
    // State: No mutation

    it('Given a collection with targets at various stages, When listed, Then completion stats are accurate', () => {
      const coll = createCollection('Galaxy Season')
      const t1 = seedTarget(sqlite, { canonicalName: 'M31', workflowStage: 'published' })
      const t2 = seedTarget(sqlite, { canonicalName: 'M33', workflowStage: 'processing' })
      const t3 = seedTarget(sqlite, { canonicalName: 'M51', workflowStage: 'archived' })

      addTargetToCollection(coll.id, t1)
      addTargetToCollection(coll.id, t2)
      addTargetToCollection(coll.id, t3)

      const collections = listCollections()
      const found = collections.find((c) => c.name === 'Galaxy Season')!

      expect(found.total).toBe(3)
      expect(found.completed).toBe(2)
    })
  })

  describe('EARS: Collection with Targets Detail', () => {
    // Event: User opens a collection detail view
    // Action: System fetches the collection, its targets, and completion stats
    // Response: Returns collection metadata, paginated TargetSummary[], and counts
    // State: No mutation

    it('Given a collection with targets, When detailed view is fetched, Then targets and stats are returned', () => {
      const coll = createCollection('Test Collection')
      const t1 = seedTarget(sqlite, { canonicalName: 'Target A' })
      const t2 = seedTarget(sqlite, { canonicalName: 'Target B' })
      addTargetToCollection(coll.id, t1)
      addTargetToCollection(coll.id, t2)

      const detail = getCollectionWithTargets(coll.id)

      expect(detail).not.toBeNull()
      expect(detail!.collection.name).toBe('Test Collection')
      expect(detail!.targets).toHaveLength(2)
      expect(detail!.total).toBe(2)
    })

    it('Given a nonexistent collection, When detail is fetched, Then returns null', () => {
      expect(getCollectionWithTargets('nonexistent')).toBeNull()
    })
  })

  describe('EARS: Target Membership', () => {
    // Event: User adds/removes a target from a collection
    // Action: System inserts/deletes collection_memberships row
    // Response: Returns success boolean
    // State: Membership relationship created/destroyed

    it('Given a collection and target, When target is added then removed, Then membership is gone', () => {
      const coll = createCollection('Temp')
      const tid = seedTarget(sqlite, { canonicalName: 'Removable' })

      expect(addTargetToCollection(coll.id, tid)).toBe(true)

      let detail = getCollectionWithTargets(coll.id)
      expect(detail!.targets).toHaveLength(1)

      expect(removeTargetFromCollection(coll.id, tid)).toBe(true)

      detail = getCollectionWithTargets(coll.id)
      expect(detail!.targets).toHaveLength(0)
    })

    it('Given a target already in a collection, When added again, Then it does not duplicate', () => {
      const coll = createCollection('NoDups')
      const tid = seedTarget(sqlite, { canonicalName: 'Unique' })

      addTargetToCollection(coll.id, tid)
      addTargetToCollection(coll.id, tid)

      const detail = getCollectionWithTargets(coll.id)
      expect(detail!.targets).toHaveLength(1)
    })
  })
})
