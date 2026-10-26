import { describe, expect, it } from 'vitest'
import type { ProjectSources, ProjectStore } from '@astro/application'
import { DEFAULT_RULES, type CompletionRule } from '@astro/domain'

const at = (iso: string) => new Date(iso)

const base = { kind: 'custom' as const, rule: DEFAULT_RULES.custom, window: null, catalogueId: null, collectionId: null, workspaceId: null }

/**
 * Every ProjectStore adapter must pass this suite. `make` returns an empty store in which the
 * targets 'm31', 'm42' and 'm81' exist.
 */
export function projectStoreContract(adapterName: string, make: () => ProjectStore): void {
  describe(`ProjectStore contract: ${adapterName}`, () => {
    it('[AP-001] Given a new project, When read back, Then it is active with its rule, window and targets in order', async () => {
      const store = make()
      const rule: CompletionRule = { integration: { kind: 'per filter', goals: [{ filter: 'Ha', seconds: 7200 }] }, coverage: false, stacked: true, processed: false, published: false }
      const made = await store.create({ ...base, name: 'Winter', kind: 'seasonal', rule, window: { start: '2026-11-01', end: '2027-02-28' }, targetIds: ['m42', 'm31'], createdAt: at('2026-10-26T09:00:00Z') })
      expect(made).toMatchObject({ name: 'Winter', kind: 'seasonal', status: 'active', rule, window: { start: '2026-11-01', end: '2027-02-28' }, targetIds: ['m42', 'm31'] })
      expect(made.updatedAt).toEqual(at('2026-10-26T09:00:00Z'))
      expect(await store.get(made.id)).toEqual(made)
      expect(await store.get('nope')).toBeNull()
    })

    it('[AP-001] Given a project, When targets are added, Then new ones follow in order and ones it has are not repeated', async () => {
      const store = make()
      const made = await store.create({ ...base, name: 'Mine', targetIds: ['m31'], createdAt: at('2026-10-26T09:00:00Z') })
      await store.addTargets(made.id, ['m81', 'm31', 'm42'], at('2026-10-26T10:00:00Z'))
      const after = await store.get(made.id)
      expect(after?.targetIds).toEqual(['m31', 'm81', 'm42'])
      expect(after?.updatedAt).toEqual(at('2026-10-26T10:00:00Z'))
      await store.removeTarget(made.id, 'm81', at('2026-10-26T11:00:00Z'))
      expect((await store.get(made.id))?.targetIds).toEqual(['m31', 'm42'])
    })

    it('[AP-011] Given a target taken out, When read back, Then the removal is remembered until the target is added again', async () => {
      const store = make()
      const made = await store.create({ ...base, name: 'Mine', targetIds: ['m31', 'm42'], createdAt: at('2026-10-26T09:00:00Z') })
      expect(made.removedTargetIds).toEqual([])
      await store.removeTarget(made.id, 'm42', at('2026-10-26T10:00:00Z'))
      await store.removeTarget(made.id, 'm81', at('2026-10-26T10:30:00Z'))
      expect(await store.get(made.id)).toMatchObject({ targetIds: ['m31'], removedTargetIds: ['m42'], updatedAt: at('2026-10-26T10:00:00Z') })
      await store.addTargets(made.id, ['m42'], at('2026-10-26T11:00:00Z'))
      expect(await store.get(made.id)).toMatchObject({ targetIds: ['m31', 'm42'], removedTargetIds: [] })
    })

    it('[AP-001] Given several projects, When renamed, paused and given a new rule, Then they list newest first with the change kept', async () => {
      const store = make()
      const older = await store.create({ ...base, name: 'A', targetIds: [], createdAt: at('2026-10-20T09:00:00Z') })
      const newer = await store.create({ ...base, name: 'B', targetIds: [], createdAt: at('2026-10-26T09:00:00Z') })
      await store.update(older.id, { name: 'A renamed', status: 'paused', rule: DEFAULT_RULES.seasonal, window: { start: '2026-12-01', end: '2026-12-31' } }, at('2026-10-27T09:00:00Z'))
      const list = await store.list()
      expect(list.map(p => [p.id, p.name, p.status])).toEqual([[newer.id, 'B', 'active'], [older.id, 'A renamed', 'paused']])
      expect(list[1]).toMatchObject({ rule: DEFAULT_RULES.seasonal, window: { start: '2026-12-01', end: '2026-12-31' }, updatedAt: at('2026-10-27T09:00:00Z') })
      await store.update(older.id, { status: 'archived' }, at('2026-10-28T09:00:00Z'))
      expect(await store.get(older.id)).toMatchObject({ name: 'A renamed', status: 'archived', rule: DEFAULT_RULES.seasonal })
    })
  })
}

export interface SourcesFixture {
  names: Record<string, string>
  catalogues: { id: string; name: string; entries: { targetId: string; designation: string }[] }[]
  collections: { id: string; name: string; targetIds: string[] }[]
}

/** Every ProjectSources adapter must pass this suite; `make` holds exactly the fixture. */
export function projectSourcesContract(adapterName: string, make: (fixture: SourcesFixture) => ProjectSources): void {
  describe(`ProjectSources contract: ${adapterName}`, () => {
    const fixture: SourcesFixture = {
      names: { m1: 'M 1', m2: 'M 2', m10: 'M 10', m31: 'M 31' },
      catalogues: [{ id: 'messier', name: 'Messier', entries: [{ targetId: 'm10', designation: 'M10' }, { targetId: 'm2', designation: 'M2' }, { targetId: 'm1', designation: 'M1' }] }],
      // Added in this order, not id order, and possibly in one batch at one time.
      collections: [{ id: 'fav', name: 'Favourites', targetIds: ['m31', 'm1', 'm10'] }]
    }

    it('[AP-001] Given catalogues and collections, When listed, Then each comes with its size and its targets in order', async () => {
      const sources = make(fixture)
      expect(await sources.catalogues()).toEqual([{ id: 'messier', name: 'Messier', size: 3 }])
      expect(await sources.catalogueTargets('messier')).toEqual(['m1', 'm2', 'm10'])
      expect(await sources.collections()).toEqual([{ id: 'fav', name: 'Favourites', size: 3 }])
      expect(await sources.collectionTargets('fav')).toEqual(['m31', 'm1', 'm10'])
    })

    it('[AP-001] Given unknown ids, When asked, Then nothing is found rather than an error', async () => {
      const sources = make(fixture)
      expect(await sources.catalogueTargets('nope')).toEqual([])
      expect(await sources.collectionTargets('nope')).toEqual([])
      expect(await sources.targetNames(['m31', 'nope', 'm31'])).toEqual(new Map([['m31', 'M 31']]))
    })
  })
}
