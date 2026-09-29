import { describe, it, expect } from 'vitest'
import type { DismissalStore } from '@astro/application'
import type { Dismissal } from '@astro/domain'

/** Every DismissalStore adapter must pass this suite. `make` returns an empty store. */
export function dismissalStoreContract(adapterName: string, make: () => Promise<DismissalStore> | DismissalStore): void {
  const first: Dismissal = {
    suggestionId: 'ready-to-stack:target-m81',
    targetId: 'target-m81',
    fingerprint: '10|100|2026-03-01T21:00:00.000Z|0|-|0|0',
    dismissedAt: new Date('2026-09-29T20:00:00Z')
  }

  describe(`DismissalStore contract: ${adapterName}`, () => {
    it('[NFR-006] Given an empty store, When a dismissal is saved, Then it is listed with every field intact', async () => {
      const store = await make()
      await store.saveDismissal(first)
      expect(await store.listDismissals()).toEqual([first])
    })

    it('[NFR-006] Given a saved dismissal, When the same suggestion is dismissed again, Then only the newer one is kept', async () => {
      const store = await make()
      await store.saveDismissal(first)
      const again = { ...first, fingerprint: 'changed', dismissedAt: new Date('2026-09-30T20:00:00Z') }
      await store.saveDismissal(again)
      expect(await store.listDismissals()).toEqual([again])
    })
  })
}
