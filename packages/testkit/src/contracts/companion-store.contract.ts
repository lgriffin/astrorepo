import { describe, it, expect } from 'vitest'
import type { CompanionDevice, CompanionDeviceStore } from '@astro/application'

/** Every CompanionDeviceStore adapter must pass this suite. `make` returns an empty store. */
export function companionStoreContract(adapterName: string, make: () => Promise<CompanionDeviceStore> | CompanionDeviceStore): void {
  const pi: CompanionDevice = {
    id: 'device-pi',
    name: 'Pi by the scope',
    keyHash: 'hash-pi',
    screen: 'follow',
    pairedAt: new Date('2026-10-15T20:00:00Z'),
    lastSeenAt: null
  }
  const tablet: CompanionDevice = { ...pi, id: 'device-tablet', name: 'Tablet', keyHash: 'hash-tablet', pairedAt: new Date('2026-10-15T21:00:00Z') }

  describe(`CompanionDeviceStore contract: ${adapterName}`, () => {
    it('[PI-018] Given an empty store, When companions are added, Then they are listed oldest first with every field intact', async () => {
      const store = await make()
      await store.addCompanion(tablet)
      await store.addCompanion(pi)
      expect(await store.listCompanions()).toEqual([pi, tablet])
    })

    it('[PI-018] Given a paired companion, When it is looked up by its key hash, Then it is found, and an unknown hash finds nothing', async () => {
      const store = await make()
      await store.addCompanion(pi)
      expect(await store.companionByKeyHash('hash-pi')).toEqual(pi)
      expect(await store.companionByKeyHash('hash-other')).toBeNull()
    })

    it('[PI-020] Given a paired companion, When it is removed, Then it is gone and removing it again says so', async () => {
      const store = await make()
      await store.addCompanion(pi)
      await store.addCompanion(tablet)
      expect(await store.removeCompanion('device-pi')).toBe(true)
      expect(await store.listCompanions()).toEqual([tablet])
      expect(await store.companionByKeyHash('hash-pi')).toBeNull()
      expect(await store.removeCompanion('device-pi')).toBe(false)
    })

    it('[PI-021] Given a paired companion, When its screen and last-seen time are set, Then they are kept, and an unknown id changes nothing', async () => {
      const store = await make()
      await store.addCompanion(pi)
      expect(await store.setCompanionScreen('device-pi', 'jobs')).toBe(true)
      await store.markCompanionSeen('device-pi', new Date('2026-10-15T22:00:00Z'))
      expect(await store.setCompanionScreen('device-none', 'sky')).toBe(false)
      await store.markCompanionSeen('device-none', new Date('2026-10-15T22:00:00Z'))
      expect(await store.listCompanions()).toEqual([{ ...pi, screen: 'jobs', lastSeenAt: new Date('2026-10-15T22:00:00Z') }])
    })
  })
}
