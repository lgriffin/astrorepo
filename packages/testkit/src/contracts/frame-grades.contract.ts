import { describe, it, expect } from 'vitest'
import type { FrameGradeStore } from '@astro/application'
import { measurement } from '../fake-grading'

export interface SeedLight {
  fileId: string
  path: string
  targetId: string
  capturedAt: string
  filter: string | null
}

/** Every FrameGradeStore adapter must pass this suite. `setup` indexes these lights for their targets. */
export function frameGradeStoreContract(adapterName: string, setup: (lights: SeedLight[]) => Promise<FrameGradeStore>): void {
  const at = new Date('2026-10-01T08:00:00Z')
  const seed: SeedLight[] = [
    { fileId: 'b', path: '/data/m42/Light_002.fit', targetId: 'm42', capturedAt: '2026-01-10T21:05:00Z', filter: 'L' },
    { fileId: 'a', path: '/data/m42/Light_001.fit', targetId: 'm42', capturedAt: '2026-01-10T21:00:00Z', filter: 'L' },
    { fileId: 'c', path: '/data/m31/Light_001.fit', targetId: 'm31', capturedAt: '2026-01-11T21:00:00Z', filter: null }
  ]

  describe(`FrameGradeStore contract: ${adapterName}`, () => {
    it('[GRD-001] Given a target with lights, When they are listed, Then only its own come back, oldest first, not yet measured', async () => {
      const store = await setup(seed)
      const lights = await store.lightsOf('m42')
      expect(lights.map(l => l.fileId)).toEqual(['a', 'b'])
      expect(lights[0]).toMatchObject({ path: '/data/m42/Light_001.fit', filter: 'L', measurement: null, measureError: null, override: null })
      expect(lights[0].capturedAt?.toISOString()).toBe('2026-01-10T21:00:00.000Z')
    })

    it('[GRD-001] Given a measurement is saved, When the lights are listed, Then it comes back as saved', async () => {
      const store = await setup(seed)
      const m = measurement({ fwhm: 2.5, eccentricity: 0.42, starCount: 321, snr: 33.5 })
      await store.saveMeasurement('a', { measurement: m }, at)
      expect((await store.lightsOf('m42'))[0].measurement).toEqual(m)
    })

    it('[GRD-011] Given a frame that could not be measured, When listed, Then it has the reason and no measurement', async () => {
      const store = await setup(seed)
      await store.saveMeasurement('a', { measurement: measurement() }, at)
      await store.saveMeasurement('a', { error: 'The pixel data is truncated.' }, at)
      expect((await store.lightsOf('m42'))[0]).toMatchObject({ measurement: null, measureError: 'The pixel data is truncated.' })
    })

    it('[GRD-005] Given the user rejects a frame and later clears it, When listed, Then the override comes and goes, and the measurement stays', async () => {
      const store = await setup(seed)
      await store.saveMeasurement('b', { measurement: measurement() }, at)
      await store.setOverride('b', 'reject', at)
      expect((await store.lightsOf('m42'))[1]).toMatchObject({ override: 'reject', measurement: measurement() })
      await store.setOverride('b', null, at)
      expect((await store.lightsOf('m42'))[1].override).toBeNull()
    })

    it('[GRD-005] Given an override before any measurement, When listed, Then the frame is overridden and still unmeasured', async () => {
      const store = await setup(seed)
      await store.setOverride('c', 'keep', at)
      expect((await store.lightsOf('m31'))[0]).toMatchObject({ override: 'keep', measurement: null })
    })

    it('[GRD-007] Given paths from a source folder, When lights are looked up by path, Then known ones come back in the order asked, then the rest of their targets', async () => {
      const store = await setup(seed)
      const found = await store.lightsAlongside(['/data/m31/Light_001.fit', '/nowhere/x.fit', '/data/m42/Light_002.fit'])
      expect(found.map(l => l.fileId)).toEqual(['c', 'b', 'a'])
    })

    it('[GRD-007] Given one light of a target, When looked up, Then its target\'s other lights come along and other targets do not', async () => {
      const store = await setup(seed)
      expect((await store.lightsAlongside(['/data/m42/Light_001.fit'])).map(l => l.fileId)).toEqual(['a', 'b'])
    })

    it('[ADV-008] Given a night left out, When used again, Then only frames it left out come back and a hand-made choice stays', async () => {
      const store = await setup(seed)
      await store.setOverride('a', 'keep', at)
      expect(await store.setNightLeftOut(['a', 'b'], true, at)).toBe(1)
      expect((await store.lightsOf('m42')).map(l => [l.fileId, l.override, l.overrideBy])).toEqual([['a', 'keep', 'frame'], ['b', 'reject', 'night']])
      expect((await store.lightsOf('m31'))[0].override).toBeNull()
      expect(await store.setNightLeftOut(['a', 'b'], false, at)).toBe(1)
      expect((await store.lightsOf('m42')).map(l => [l.fileId, l.override])).toEqual([['a', 'keep'], ['b', null]])
    })

    it('[ADV-008] Given a night with a frame the index no longer holds, When it is left out, Then it fails and nothing changes', async () => {
      const store = await setup(seed)
      await expect(store.setNightLeftOut(['b', 'gone'], true, at)).rejects.toThrow(/no longer in the index/)
      expect((await store.lightsOf('m42')).every(l => l.override === null)).toBe(true)
    })

    it('[GRD-005] Given a frame the index no longer holds, When it is overridden, Then it fails with a reason', async () => {
      const store = await setup(seed)
      await expect(store.setOverride('gone', 'keep', at)).rejects.toThrow(/no longer in the index/)
    })
  })
}
