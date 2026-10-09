import { describe, it, expect } from 'vitest'
import type { CometStore } from '@astro/application'
import type { CometOrbit } from '@astro/domain'

const ENCKE: CometOrbit = {
  name: '2P/Encke',
  perihelionAt: new Date(Date.UTC(1990, 9, 28) + 0.54502 * 86_400_000),
  q: 0.330886,
  e: 0.8502196,
  inclinationDeg: 11.94524,
  nodeDeg: 334.75006,
  periDeg: 186.23352,
  epoch: '1990-10-06'
}

/**
 * Every CometStore adapter must pass this suite. `make` returns an empty store; `target` names
 * targets that exist, for adapters that tie orbits to the target table.
 */
export function cometStoreContract(adapterName: string, make: () => CometStore | Promise<CometStore>, target: (n: number) => string): void {
  describe(`CometStore contract: ${adapterName}`, () => {
    it('[RIG-011] Given a target with no orbit, When it is read, Then it is not a comet', async () => {
      expect(await (await make()).get(target(1))).toBeNull()
    })

    it('[RIG-011] Given an orbit set for a target, When it is read, Then every element comes back to the millisecond', async () => {
      const store = await make()
      await store.set(target(1), ENCKE)
      expect(await store.get(target(1))).toEqual(ENCKE)
      expect(await store.get(target(2))).toBeNull()
    })

    it('[RIG-011] Given an orbit, When another is set and then null, Then the second replaces it and null unmarks the target', async () => {
      const store = await make()
      await store.set(target(1), ENCKE)
      const later = { ...ENCKE, name: 'C/2099 Z9 (Test)', e: 1, epoch: null }
      await store.set(target(1), later)
      expect(await store.get(target(1))).toEqual(later)
      await store.set(target(1), null)
      expect(await store.get(target(1))).toBeNull()
    })
  })
}
