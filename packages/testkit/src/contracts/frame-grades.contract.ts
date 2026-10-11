import { describe, it, expect } from 'vitest'
import type { FrameGradeStore, FrameMeasurer, GradeLimitsSource } from '@astro/application'
import { DEFAULT_GRADE_LIMITS, MIN_STARS_FOR_SHAPE, type FrameMeasurement, type GradeLimits } from '@astro/domain'
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

export interface FrameMeasurerHarness {
  measurer: FrameMeasurer
  /** A light holding a field of round stars. */
  starfield: string
  /** A light of plain sky with no stars. */
  blank: string
  /** A file that is not an image the measurer reads. */
  notAnImage: string
  /** A path where no file is. */
  missing: string
  /** What the file holds now, to show measuring leaves it as it was. */
  contents(path: string): Promise<string>
}

const plausible = (m: FrameMeasurement) => {
  expect(Number.isInteger(m.starCount)).toBe(true)
  expect(m.starCount).toBeGreaterThanOrEqual(0)
  expect(Number.isFinite(m.background)).toBe(true)
  expect(m.noise).toBeGreaterThanOrEqual(0)
}

/**
 * Every FrameMeasurer adapter must pass this suite. Frame grading relies on: a frame that cannot
 * be measured rejecting with an Error whose message the user can act on (it is saved as the
 * frame's reason), shape figures being null rather than guessed from too few stars, and each of
 * several frames measured at once getting its own answer.
 */
export function frameMeasurerContract(adapterName: string, setup: () => Promise<FrameMeasurerHarness>): void {
  describe(`FrameMeasurer contract: ${adapterName}`, () => {
    it('[NFR-006] [GRD-001] Given a light with stars, When measured, Then its FWHM, eccentricity, star count, background, noise and SNR come back, reading the file only', async () => {
      const h = await setup()
      const before = await h.contents(h.starfield)
      const m = await h.measurer.measure(h.starfield)
      plausible(m)
      expect(m.starCount).toBeGreaterThanOrEqual(MIN_STARS_FOR_SHAPE)
      expect(m.fwhm).toBeGreaterThan(0)
      expect(m.eccentricity).toBeGreaterThanOrEqual(0)
      expect(m.eccentricity).toBeLessThan(1)
      expect(m.snr).toBeGreaterThan(0)
      expect(await h.contents(h.starfield)).toBe(before)
    })

    it('[NFR-006] [GRD-001] Given a light with too few stars, When measured, Then FWHM, eccentricity and SNR are not reported rather than guessed', async () => {
      const h = await setup()
      const m = await h.measurer.measure(h.blank)
      plausible(m)
      expect(m.starCount).toBeLessThan(MIN_STARS_FOR_SHAPE)
      expect([m.fwhm, m.eccentricity, m.snr]).toEqual([null, null, null])
    })

    it('[NFR-006] [GRD-011] Given a file that is not an image or is not there, When measured, Then it is refused with a reason', async () => {
      const h = await setup()
      for (const path of [h.notAnImage, h.missing]) {
        const error = await h.measurer.measure(path).then(() => null, (e: unknown) => e)
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message.length).toBeGreaterThan(0)
      }
    })

    it('[NFR-006] [NFR-014] Given several lights measured at once, one of them broken, When they finish, Then each gets its own answer', async () => {
      const h = await setup()
      const [stars, broken, blank] = await Promise.allSettled([h.measurer.measure(h.starfield), h.measurer.measure(h.notAnImage), h.measurer.measure(h.blank)])
      expect([stars.status, broken.status, blank.status]).toEqual(['fulfilled', 'rejected', 'fulfilled'])
      if (stars.status === 'fulfilled' && blank.status === 'fulfilled') expect(stars.value.starCount).toBeGreaterThan(blank.value.starCount)
    })
  })
}

export interface GradeLimitsHarness {
  source: GradeLimitsSource
  /** Saves these limits as Settings does; null clears the fixed FWHM limit. */
  save(limits: Partial<GradeLimits>): Promise<void>
}

/** Every GradeLimitsSource adapter must pass this suite. `make` starts with nothing saved. */
export function gradeLimitsSourceContract(adapterName: string, make: () => GradeLimitsHarness): void {
  describe(`GradeLimitsSource contract: ${adapterName}`, () => {
    it('[NFR-006] [GRD-003] Given no limits saved, When read, Then the defaults come back with no fixed FWHM limit', async () => {
      expect(await make().source.read()).toEqual(DEFAULT_GRADE_LIMITS)
    })

    it('[NFR-006] [GRD-010] Given limits saved in Settings, When read, Then they are used, with defaults for the rest', async () => {
      const h = make()
      await h.save({ maxEccentricity: 0.5, maxFwhmPixels: 4.5 })
      expect(await h.source.read()).toEqual({ ...DEFAULT_GRADE_LIMITS, maxEccentricity: 0.5, maxFwhmPixels: 4.5 })
    })

    it('[NFR-006] [GRD-010] Given limits changed while the app runs, When read again, Then the next grading uses the new ones, and a cleared FWHM limit is none', async () => {
      const h = make()
      await h.save({ minStarRatio: 0.3, maxFwhmPixels: 4.5 })
      expect(await h.source.read()).toMatchObject({ minStarRatio: 0.3, maxFwhmPixels: 4.5 })
      await h.save({ minStarRatio: 0.7, maxFwhmPixels: null })
      expect(await h.source.read()).toEqual({ ...DEFAULT_GRADE_LIMITS, minStarRatio: 0.7, maxFwhmPixels: null })
    })
  })
}
