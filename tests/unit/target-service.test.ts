import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite
}))

const { searchTargets, getTargetById, createTarget, updateTarget, getAliasesForTarget, addAlias, mergeTargets } = await import('../../src/main/services/target')
const { batchDeleteTargets } = await import('../../src/main/services/batch')
const { SqliteExperimentStore } = await import('../../src/main/adapters/sqlite-experiments')
const { SqliteJobStore } = await import('../../src/main/adapters/sqlite-jobs')

const newExperiment = (targetId: string, number: number) => ({
  targetId,
  number,
  name: `Test ${number}`,
  objective: '',
  input: { path: `D:/${targetId}/result.fit`, sizeBytes: 1, modifiedAt: null, sha256: 'h' },
  variants: [{ letter: 'A' as const, parameters: { profile: 'galaxy' as const, quality: 'normal' as const }, outputLabel: `X-exp${number}-A`, outputDir: `D:/x/processed/X-exp${number}-A` }],
  createdAt: new Date('2026-10-26T09:00:00Z')
})
const newJob = (targetId: string) => ({
  kind: 'post-process' as const,
  targetId,
  title: 'Experiment Test 1, variant A',
  timing: 'window' as const,
  command: { program: 'bash', args: [], cwd: 'D:/x' },
  prepare: null,
  spaceDir: 'D:/x',
  neededBytes: 1
})

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
    // State: Database contains one new target row with 'not_observed' workflow stage

    it('Given no targets exist, When a target is created with name and type, Then it returns a Target with a ULID and not_observed stage', () => {
      const result = createTarget({ canonicalName: 'Andromeda Galaxy', objectType: 'galaxy' })

      expect(result.id).toBeTruthy()
      expect(result.canonicalName).toBe('Andromeda Galaxy')
      expect(result.objectType).toBe('galaxy')
      expect(result.workflowStage).toBe('not_observed')
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

    it('[LF-020] Given catalogue targets, When searching only yours, Then a target counts once a file, folder, night, stage, hand entry or own collection points at it, and a catalogue collection does not', () => {
      const now = '2026-10-26T00:00:00Z'
      const add = (id: string, over = '') =>
        sqlite.prepare(`INSERT INTO targets (id, canonical_name, object_type, created_at, updated_at${over ? ', ' + over.split('=')[0] : ''}) VALUES (?, ?, 'galaxy', ?, ?${over ? ', ?' : ''})`)
          .run(...[id, `T ${id}`, now, now, ...(over ? [over.split('=')[1]] : [])])
      for (const id of ['plain', 'filed', 'homed', 'logged', 'mine-col', 'cat-col']) add(id)
      add('staged', "workflow_stage=stacked")
      add('foldered', 'folder_path=D:/astro/x')
      createTarget({ canonicalName: 'By hand', objectType: 'galaxy' })

      sqlite.prepare(`INSERT INTO fits_scans (id, folder_path, started_at, created_at) VALUES ('s1', 'D:/', ?, ?)`).run(now, now)
      sqlite.prepare(`INSERT INTO fits_files (id, scan_id, file_path, file_name, file_size_bytes, target_id, created_at) VALUES ('f1', 's1', 'D:/a.fit', 'a.fit', 1, 'filed', ?)`).run(now)
      sqlite.prepare(`INSERT INTO target_home_folders (id, target_id, folder_type, subfolder_path, scanned_at) VALUES ('h1', 'homed', 'lights', 'D:/h', ?)`).run(now)
      sqlite.prepare(`INSERT INTO observation_sessions (id, date, created_at, updated_at) VALUES ('n1', '2026-10-25', ?, ?)`).run(now, now)
      sqlite.prepare(`INSERT INTO session_targets (session_id, target_id) VALUES ('n1', 'logged')`).run()
      sqlite.prepare(`INSERT INTO collections (id, name, is_auto, created_at, updated_at) VALUES ('c1', 'Winter', 0, ?, ?), ('c2', 'Messier', 1, ?, ?)`).run(now, now, now, now)
      sqlite.prepare(`INSERT INTO collection_memberships (collection_id, target_id, added_at) VALUES ('c1', 'mine-col', ?), ('c2', 'cat-col', ?)`).run(now, now)

      const mine = searchTargets('', 50, 0, { scope: 'mine' })
      expect(mine.targets.map(t => t.canonicalName).sort()).toEqual(['By hand', 'T filed', 'T foldered', 'T homed', 'T logged', 'T mine-col', 'T staged'])
      expect(mine.total).toBe(7)
      expect(searchTargets('', 50, 0, { scope: 'all' }).total).toBe(9)
      // The scope holds for a typed search too, by name and by alias.
      expect(searchTargets('T', 50, 0, { scope: 'mine' }).targets.every(t => t.canonicalName !== 'T plain')).toBe(true)
      addAlias('plain', 'NGC 1', 'ngc')
      expect(searchTargets('NGC 1', 50, 0, { scope: 'mine' }).total).toBe(0)
      expect(searchTargets('NGC 1', 50, 0, { scope: 'all' }).total).toBe(1)
      // Logged nights are looked up by target, so that lookup has its own index.
      expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_session_targets_target'").get()).toBeTruthy()
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

    it('Given mixed types, When filtering by object_type, Then only matching targets are returned', () => {
      createTarget({ canonicalName: 'M31', objectType: 'galaxy' })
      createTarget({ canonicalName: 'M42', objectType: 'emission_nebula' })
      createTarget({ canonicalName: 'M51', objectType: 'galaxy' })

      const result = searchTargets('', 50, 0, { objectType: 'galaxy' })
      expect(result.total).toBe(2)
      expect(result.targets.every(t => t.objectType === 'galaxy')).toBe(true)
    })

    it('Given targets at different stages, When filtering by workflow_stage, Then only matching targets are returned', () => {
      const t1 = createTarget({ canonicalName: 'Staged1', objectType: 'star' })
      createTarget({ canonicalName: 'Staged2', objectType: 'star' })

      updateTarget(t1.id, { workflowStage: 'raw_captured' })

      const result = searchTargets('', 50, 0, { workflowStage: 'raw_captured' })
      expect(result.total).toBe(1)
      expect(result.targets[0].canonicalName).toBe('Staged1')
    })

    it('Given targets with aliases, When searching by alias with filters, Then filters apply to alias fallback results', () => {
      const t1 = createTarget({ canonicalName: 'Eagle Nebula', objectType: 'emission_nebula' })
      const t2 = createTarget({ canonicalName: 'Andromeda Galaxy', objectType: 'galaxy' })
      addAlias(t1.id, 'M16', 'messier')
      addAlias(t2.id, 'M31', 'messier')

      const result = searchTargets('M', 50, 0, { objectType: 'galaxy' })
      expect(result.targets.every(t => t.objectType === 'galaxy')).toBe(true)
      expect(result.targets.some(t => t.canonicalName === 'Andromeda Galaxy')).toBe(true)
      expect(result.targets.some(t => t.canonicalName === 'Eagle Nebula')).toBe(false)
    })

    it('Given targets exist, When sorting by name desc, Then results are in reverse alphabetical order', () => {
      createTarget({ canonicalName: 'Alpha', objectType: 'star' })
      createTarget({ canonicalName: 'Zeta', objectType: 'star' })

      const result = searchTargets('', 50, 0, { sortBy: 'name', sortDir: 'desc' })
      expect(result.targets[0].canonicalName).toBe('Zeta')
      expect(result.targets[1].canonicalName).toBe('Alpha')
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

    it('[PE-003] Given experiments and jobs on both targets, When merged, Then they follow the kept target, merged experiments numbered after its own', async () => {
      const keep = createTarget({ canonicalName: 'NGC 7000', objectType: 'emission_nebula' })
      const merge = createTarget({ canonicalName: 'Caldwell 20', objectType: 'emission_nebula' })
      const store = new SqliteExperimentStore(sqlite)
      await store.create(newExperiment(keep.id, 1))
      await store.create(newExperiment(merge.id, 1))
      await store.create(newExperiment(merge.id, 2))
      const job = await new SqliteJobStore(sqlite).add(newJob(merge.id), new Date())
      mergeTargets(keep.id, merge.id)
      expect((await store.list(keep.id)).map(e => [e.name, e.number])).toEqual([['Test 2', 3], ['Test 1', 2], ['Test 1', 1]])
      expect((await new SqliteJobStore(sqlite).get(job.id))?.targetId).toBe(keep.id)
    })

    it('Given the same ID for both keep and merge, When merging, Then returns null', () => {
      const t = createTarget({ canonicalName: 'Self Merge', objectType: 'star' })
      const result = mergeTargets(t.id, t.id)
      expect(result).toBeNull()
    })
  })

  describe('EARS: Target Delete', () => {
    it('[PE-003] Given a target with queued and finished jobs, When deleted, Then its queued jobs are cancelled and its experiments go with it', async () => {
      const t = createTarget({ canonicalName: 'M 31', objectType: 'galaxy' })
      const jobs = new SqliteJobStore(sqlite)
      const queued = await jobs.add(newJob(t.id), new Date())
      const done = await jobs.add(newJob(t.id), new Date())
      await jobs.update(done.id, { state: 'succeeded' })
      await new SqliteExperimentStore(sqlite).create(newExperiment(t.id, 1))
      expect(batchDeleteTargets([t.id])).toEqual({ succeeded: 1, failed: 0 })
      expect(await jobs.get(queued.id)).toMatchObject({ state: 'cancelled', note: 'Its target was deleted.' })
      expect((await jobs.get(done.id))?.state).toBe('succeeded')
      expect(await new SqliteExperimentStore(sqlite).list(t.id)).toEqual([])
    })
  })
})
