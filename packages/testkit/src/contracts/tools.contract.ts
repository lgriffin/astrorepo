import { describe, it, expect } from 'vitest'
import type { StackCatalogue, ToolHub } from '@astro/application'
import { TOOLS, type RecipeTarget, type ToolId } from '@astro/domain'

/** Every ToolHub adapter must pass this suite. `make` returns a Windows hub on which only `installed` exist. */
export function toolHubContract(adapterName: string, make: (installed: ToolId[]) => ToolHub): void {
  describe(`ToolHub contract: ${adapterName}`, () => {
    it('[HUB-001] Given some tools installed, When located, Then every tool comes back once, in catalogue order, found or with where it looked', async () => {
      const statuses = await make(['siril', 'rc-astro']).locate()
      expect(statuses.map(s => s.id)).toEqual(TOOLS.map(t => t.id))
      for (const s of statuses) {
        if (s.id === 'siril' || s.id === 'rc-astro') {
          expect(s.path).toBeTruthy()
          expect(s.source).not.toBeNull()
        } else {
          expect(s).toMatchObject({ path: null, source: null })
          expect(s.looked.length).toBeGreaterThan(0)
        }
      }
    })
  })
}

export interface StackSeed {
  targetId: string
  target: RecipeTarget
  stacks: { path: string; width: number; height: number; modifiedAt: string }[]
}

/** Every StackCatalogue adapter must pass this suite. */
export function stackCatalogueContract(adapterName: string, make: (seed: StackSeed) => StackCatalogue): void {
  const seed: StackSeed = {
    targetId: 'm42',
    target: { name: 'M 42', objectType: 'emission_nebula', raHours: 5.5883, decDeg: -5.391 },
    stacks: [
      { path: '/stacks/M42_old.fit', width: 1920, height: 1080, modifiedAt: '2026-01-10T20:00:00Z' },
      { path: '/stacks/M42_new.fit', width: 3840, height: 2160, modifiedAt: '2026-02-10T20:00:00Z' }
    ]
  }

  describe(`StackCatalogue contract: ${adapterName}`, () => {
    it('[PPR-001] Given a target with two stacks, When read, Then the target is described and its stacks come newest first with their size', async () => {
      const catalogue = make(seed)
      expect(await catalogue.describeTarget('m42')).toEqual(seed.target)
      const stacks = await catalogue.listStacks('m42')
      expect(stacks.map(s => s.path)).toEqual(['/stacks/M42_new.fit', '/stacks/M42_old.fit'])
      expect(stacks[0]).toMatchObject({ width: 3840, height: 2160, colour: true })
      expect(stacks[0].modifiedAt?.toISOString()).toBe('2026-02-10T20:00:00.000Z')
    })

    it('[PPR-001] Given an unknown target, When read, Then nothing comes back', async () => {
      const catalogue = make(seed)
      expect(await catalogue.describeTarget('nope')).toBeNull()
      expect(await catalogue.listStacks('nope')).toEqual([])
      expect(await catalogue.targetOptics('nope')).toBeNull()
    })
  })
}
