import { describe, expect, it } from 'vitest'
import type { MosaicAssignmentStore, MosaicWorkspaceStore } from '@astro/application'
import { layoutGrid } from '@astro/domain'
import { gridDefinition } from '../fake-mosaic-workspace'

const at = (iso: string) => new Date(iso)

/**
 * Every MosaicWorkspaceStore adapter must pass this suite. `make` returns an empty store in which
 * the target 'm31' exists.
 */
export function mosaicWorkspaceStoreContract(adapterName: string, make: () => MosaicWorkspaceStore): void {
  describe(`MosaicWorkspaceStore contract: ${adapterName}`, () => {
    const grid = gridDefinition({ rows: 2, columns: 3, positionAngleDeg: 12.5, field: { widthDeg: 0.72, heightDeg: 1.28, source: 'equipment', label: 'Seestar S50' } })

    it('[MO-001] Given a new workspace, When read back, Then its revision 1 keeps the grid as defined and every panel with its footprint', async () => {
      const store = make()
      const panels = layoutGrid(grid)
      const made = await store.create({ name: 'M 31 mosaic', targetId: 'm31', createdAt: at('2026-10-25T20:00:00Z') }, { grid, panels, note: 'first', savedAt: at('2026-10-25T20:00:00Z') })
      expect(made).toMatchObject({ name: 'M 31 mosaic', targetId: 'm31', status: 'active', latestRevision: 1 })
      expect(await store.get(made.id)).toEqual(made)
      const first = await store.revision(made.id, 1)
      expect(first).toEqual({ workspaceId: made.id, revision: 1, grid, panels, note: 'first', savedAt: at('2026-10-25T20:00:00Z') })
      expect(await store.revision(made.id, 2)).toBeNull()
      expect(await store.get('nope')).toBeNull()
    })

    it('[MO-002, MO-010] Given a second revision, When read, Then both revisions are kept as saved and the latest moves on', async () => {
      const store = make()
      const made = await store.create({ name: 'Veil', targetId: null, createdAt: at('2026-10-25T20:00:00Z') }, { grid, panels: layoutGrid(grid), note: null, savedAt: at('2026-10-25T20:00:00Z') })
      const turned = { ...grid, positionAngleDeg: 40 }
      await store.addRevision({ workspaceId: made.id, revision: 2, grid: turned, panels: layoutGrid(turned), note: 'turned', savedAt: at('2026-10-25T21:00:00Z') })
      expect((await store.get(made.id))?.latestRevision).toBe(2)
      const all = await store.revisions(made.id)
      expect(all.map(r => [r.revision, r.grid.positionAngleDeg, r.note])).toEqual([[1, 12.5, null], [2, 40, 'turned']])
      expect(all[0].panels).toEqual(layoutGrid(grid))
      expect(await store.history(made.id)).toEqual([
        { revision: 1, savedAt: at('2026-10-25T20:00:00Z'), note: null, rows: 2, columns: 3 },
        { revision: 2, savedAt: at('2026-10-25T21:00:00Z'), note: 'turned', rows: 2, columns: 3 }
      ])
      expect(await store.history('nope')).toEqual([])
    })

    it('[MO-010] Given a revision number that does not follow the latest, When added, Then it is refused and nothing changes', async () => {
      const store = make()
      const made = await store.create({ name: 'Veil', targetId: null, createdAt: at('2026-10-25T20:00:00Z') }, { grid, panels: layoutGrid(grid), note: null, savedAt: at('2026-10-25T20:00:00Z') })
      await expect(store.addRevision({ workspaceId: made.id, revision: 1, grid, panels: [], note: null, savedAt: at('2026-10-25T21:00:00Z') })).rejects.toThrow()
      await expect(store.addRevision({ workspaceId: made.id, revision: 3, grid, panels: [], note: null, savedAt: at('2026-10-25T21:00:00Z') })).rejects.toThrow()
      await expect(store.addRevision({ workspaceId: 'nope', revision: 2, grid, panels: [], note: null, savedAt: at('2026-10-25T21:00:00Z') })).rejects.toThrow()
      expect((await store.revisions(made.id)).map(r => r.revision)).toEqual([1])
    })

    it('[MO-001] Given several workspaces, When listed, renamed and archived, Then they come newest first with the change kept', async () => {
      const store = make()
      const older = await store.create({ name: 'A', targetId: null, createdAt: at('2026-10-20T20:00:00Z') }, { grid, panels: layoutGrid(grid), note: null, savedAt: at('2026-10-20T20:00:00Z') })
      const newer = await store.create({ name: 'B', targetId: 'm31', createdAt: at('2026-10-25T20:00:00Z') }, { grid, panels: layoutGrid(grid), note: null, savedAt: at('2026-10-25T20:00:00Z') })
      await store.update(older.id, { name: 'A renamed', status: 'archived' })
      expect((await store.list()).map(w => [w.id, w.name, w.status])).toEqual([[newer.id, 'B', 'active'], [older.id, 'A renamed', 'archived']])
    })
  })
}

/**
 * Every MosaicAssignmentStore adapter must pass this suite. `make` returns an empty store in which
 * workspaces 'w1' and 'w2' exist.
 */
export function mosaicAssignmentStoreContract(adapterName: string, make: () => MosaicAssignmentStore): void {
  describe(`MosaicAssignmentStore contract: ${adapterName}`, () => {
    it('[MO-009] Given overrides on two workspaces, When set, replaced and cleared, Then each workspace keeps one per capture as last said', async () => {
      const store = make()
      await store.set('w1', { captureId: '/a.fit', action: 'assign', panelId: 'R1C2', reason: 'by eye', revision: 1, at: at('2026-10-25T20:00:00Z') })
      await store.set('w1', { captureId: '/b.fit', action: 'exclude', panelId: null, reason: null, revision: 1, at: at('2026-10-25T20:01:00Z') })
      await store.set('w2', { captureId: '/a.fit', action: 'exclude', panelId: null, reason: 'trailed', revision: 3, at: at('2026-10-25T20:02:00Z') })
      await store.set('w1', { captureId: '/a.fit', action: 'assign', panelId: 'R2C2', reason: null, revision: 2, at: at('2026-10-25T21:00:00Z') })
      expect(await store.overrides('w1')).toEqual([
        { captureId: '/a.fit', action: 'assign', panelId: 'R2C2', reason: null, revision: 2, at: at('2026-10-25T21:00:00Z') },
        { captureId: '/b.fit', action: 'exclude', panelId: null, reason: null, revision: 1, at: at('2026-10-25T20:01:00Z') }
      ])
      await store.clear('w1', '/b.fit')
      await store.clear('w1', '/never.fit')
      expect((await store.overrides('w1')).map(o => o.captureId)).toEqual(['/a.fit'])
      expect((await store.overrides('w2')).map(o => o.reason)).toEqual(['trailed'])
      expect(await store.overrides('nope')).toEqual([])
    })
  })
}
