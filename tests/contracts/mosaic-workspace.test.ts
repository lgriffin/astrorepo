import { afterEach, describe, expect, it } from 'vitest'
import { layoutGrid } from '@astro/domain'
import { gridDefinition, InMemoryMosaicAssignmentStore, InMemoryMosaicWorkspaceStore } from '@astro/testkit'
import { mosaicAssignmentStoreContract, mosaicWorkspaceStoreContract } from '@astro/testkit/contracts/mosaic-workspace.contract'
import { SqliteMosaicAssignmentStore, SqliteMosaicWorkspaceStore } from '../../src/main/adapters/sqlite-mosaic-workspace'
import { seedTarget, setupTestDb, teardownTestDb } from '../helpers/setup'

afterEach(() => teardownTestDb())

mosaicWorkspaceStoreContract('in-memory', () => new InMemoryMosaicWorkspaceStore())

mosaicWorkspaceStoreContract('SQLite', () => {
  const db = setupTestDb()
  seedTarget(db, { id: 'm31', canonicalName: 'M 31' })
  return new SqliteMosaicWorkspaceStore(db)
})

mosaicAssignmentStoreContract('in-memory', () => new InMemoryMosaicAssignmentStore())

mosaicAssignmentStoreContract('SQLite', () => {
  const db = setupTestDb()
  const insert = db.prepare("INSERT INTO mosaic_workspaces (id, name, target_id, status, created_at) VALUES (?, ?, NULL, 'active', '2026-10-25T20:00:00Z')")
  insert.run('w1', 'One')
  insert.run('w2', 'Two')
  return new SqliteMosaicAssignmentStore(db)
})

describe('SqliteMosaicWorkspaceStore', () => {
  it('[MO-001] Given a workspace started from a target, When the target is deleted, Then the workspace and its revisions are kept without it', async () => {
    const db = setupTestDb()
    seedTarget(db, { id: 'm31', canonicalName: 'M 31' })
    const store = new SqliteMosaicWorkspaceStore(db)
    const grid = gridDefinition()
    const made = await store.create({ name: 'M 31', targetId: 'm31', createdAt: new Date('2026-10-25T20:00:00Z') }, { grid, panels: layoutGrid(grid), note: null, savedAt: new Date('2026-10-25T20:00:00Z') })
    db.prepare('DELETE FROM targets WHERE id = ?').run('m31')
    expect((await store.get(made.id))?.targetId).toBeNull()
    expect((await store.revision(made.id, 1))?.panels).toHaveLength(4)
  })
})
