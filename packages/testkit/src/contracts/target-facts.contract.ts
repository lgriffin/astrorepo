import { describe, expect, it } from 'vitest'
import type { TargetFacts, TargetFactsSource } from '@astro/application'

/**
 * Every TargetFactsSource adapter must pass this suite. `make` returns a source holding the given
 * targets (own name first, then catalogue designations and aliases, in any order after it).
 */
export function targetFactsContract(adapterName: string, make: (targets: Record<string, TargetFacts>) => TargetFactsSource | Promise<TargetFactsSource>): void {
  describe(`TargetFactsSource contract: ${adapterName}`, () => {
    it('[LRN-008] Given a target with designations and aliases, When its facts are read, Then its own name comes first and every other name is there', async () => {
      const source = await make({ 'target-1': { names: ['Andromeda Galaxy', 'M31', 'NGC 224'], angularSizeArcmin: 178 } })
      const f = await source.facts('target-1')
      expect(f?.names[0]).toBe('Andromeda Galaxy')
      expect([...(f?.names ?? [])].sort()).toEqual(['Andromeda Galaxy', 'M31', 'NGC 224'])
      expect(f?.angularSizeArcmin).toBe(178)
    })

    it('[LRN-009] Given a target with no size and no other names, When its facts are read, Then the size is null and only its name is there', async () => {
      const source = await make({ 'target-2': { names: ['Somewhere'], angularSizeArcmin: null } })
      expect(await source.facts('target-2')).toEqual({ names: ['Somewhere'], angularSizeArcmin: null })
    })

    it('[LRN-008] Given no such target, When its facts are read, Then there are none', async () => {
      const source = await make({})
      expect(await source.facts('nope')).toBeNull()
    })
  })
}
