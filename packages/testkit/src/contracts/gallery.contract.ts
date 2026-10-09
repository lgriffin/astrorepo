import { describe, it, expect } from 'vitest'
import type { GalleryCatalogue, PaletteStore } from '@astro/application'

/** One indexed FITS file: a light sub or a stacked master. */
export interface SeedGalleryFile {
  id: string
  name: string
  targetId: string
  kind: 'light' | 'master'
  filter: string | null
  /** A colour sensor's light (BAYERPAT) or a three-channel master. */
  colour: boolean
  exposureSec: number
  modifiedAt: string
}

/** A finished image in the target's images folder. */
export interface SeedFinished {
  targetId: string
  name: string
  modifiedAt: string
}

export interface SeedObject {
  catalogue: 'M' | 'NGC' | 'IC' | 'C'
  designation: string
  name: string
  raHours: number
  decDeg: number
  sizeArcmin: number | null
}

export interface GallerySeed {
  files: SeedGalleryFile[]
  finished: SeedFinished[]
  objects: SeedObject[]
}

export interface GalleryHarness {
  catalogue: GalleryCatalogue
  palettes: PaletteStore
  /** Where a seeded master (by name) is found. */
  masterPath(name: string): string
  /** Where a seeded finished image (by target and name) is found. */
  finishedPath(targetId: string, name: string): string
}

/** Every GalleryCatalogue and PaletteStore adapter must pass this suite. */
export function galleryContract(adapterName: string, setup: (seed: GallerySeed) => Promise<GalleryHarness>): void {
  const seed: GallerySeed = {
    files: [
      { id: 'l1', name: 'Light_Ha_001.fit', targetId: 'm42', kind: 'light', filter: 'Ha', colour: false, exposureSec: 300, modifiedAt: '2026-01-10T21:00:00Z' },
      { id: 'l2', name: 'Light_Ha_002.fit', targetId: 'm42', kind: 'light', filter: 'Ha', colour: false, exposureSec: 300, modifiedAt: '2026-01-10T21:05:00Z' },
      { id: 'l3', name: 'Light_OIII_001.fit', targetId: 'm42', kind: 'light', filter: 'OIII', colour: false, exposureSec: 600, modifiedAt: '2026-01-11T21:00:00Z' },
      { id: 'l4', name: 'Light_001.fit', targetId: 'm31', kind: 'light', filter: null, colour: true, exposureSec: 10, modifiedAt: '2026-01-12T21:00:00Z' },
      { id: 'm1', name: 'master_Ha.fit', targetId: 'm42', kind: 'master', filter: 'Ha', colour: false, exposureSec: 300, modifiedAt: '2026-02-01T10:00:00Z' },
      { id: 'm2', name: 'master_OIII.fit', targetId: 'm42', kind: 'master', filter: 'OIII', colour: false, exposureSec: 600, modifiedAt: '2026-02-03T10:00:00Z' },
      { id: 'm3', name: 'm31_stack.fit', targetId: 'm31', kind: 'master', filter: null, colour: true, exposureSec: 10, modifiedAt: '2026-02-02T10:00:00Z' }
    ],
    finished: [
      { targetId: 'm42', name: 'm42_final.png', modifiedAt: '2026-03-01T10:00:00Z' },
      { targetId: 'm42', name: 'm42_v2.fits', modifiedAt: '2026-03-05T10:00:00Z' }
    ],
    objects: [
      { catalogue: 'M', designation: 'M42', name: 'Orion Nebula', raHours: 5.5881, decDeg: -5.3911, sizeArcmin: 85 },
      { catalogue: 'NGC', designation: 'NGC 1977', name: 'NGC 1977', raHours: 5.5917, decDeg: -4.8333, sizeArcmin: 20 },
      { catalogue: 'IC', designation: 'IC 434', name: 'Horsehead Nebula', raHours: 5.6847, decDeg: -2.4583, sizeArcmin: 60 },
      { catalogue: 'C', designation: 'C14', name: 'Double Cluster', raHours: 2.35, decDeg: 57.1333, sizeArcmin: 60 }
    ]
  }
  const at = new Date('2026-10-01T08:00:00Z')

  describe(`Gallery contract: ${adapterName}`, () => {
    it('[INS-001] Given an indexed file, When looked up by id, Then its path and name come back, and an unknown id gives nothing', async () => {
      const h = await setup(seed)
      expect(await h.catalogue.fileById('m1')).toEqual({ path: h.masterPath('master_Ha.fit'), name: 'master_Ha.fit' })
      expect(await h.catalogue.fileById('nope')).toBeNull()
    })

    it('[INS-007] Given a target with masters and finished images, When listed, Then its masters come newest first, then its finished images, and no other target’s', async () => {
      const h = await setup(seed)
      const images = await h.catalogue.targetImages('m42')
      expect(images.map(i => [i.kind, i.path])).toEqual([
        ['master', h.masterPath('master_OIII.fit')],
        ['master', h.masterPath('master_Ha.fit')],
        ['finished', h.finishedPath('m42', 'm42_v2.fits')],
        ['finished', h.finishedPath('m42', 'm42_final.png')]
      ])
      expect(images[0]).toMatchObject({ name: 'master_OIII.fit', filter: 'OIII', colour: false })
      expect(images[2]).toMatchObject({ name: 'm42_v2.fits', filter: null })
      expect((await h.catalogue.targetImages('m31')).map(i => i.name)).toEqual(['m31_stack.fit'])
      expect((await h.catalogue.targetImages('m31'))[0].colour).toBe(true)
    })

    it('[INS-004] Given a target’s lights, When integration is asked for, Then it comes per filter with whether the sensor was colour', async () => {
      const h = await setup(seed)
      const sorted = (await h.catalogue.filterIntegration('m42')).sort((a, b) => String(a.filter).localeCompare(String(b.filter)))
      expect(sorted).toEqual([
        { filter: 'Ha', colour: false, seconds: 600 },
        { filter: 'OIII', colour: false, seconds: 600 }
      ])
      expect(await h.catalogue.filterIntegration('m31')).toEqual([{ filter: null, colour: true, seconds: 10 }])
    })

    it('[INS-010] Given the catalogues, When objects are asked for, Then Messier, NGC and IC come back in degrees, and others do not', async () => {
      const h = await setup(seed)
      const objects = await h.catalogue.catalogueObjects()
      expect(objects.map(o => o.designation).sort()).toEqual(['IC 434', 'M42', 'NGC 1977'])
      const m42 = objects.find(o => o.designation === 'M42')!
      expect(m42).toMatchObject({ name: 'Orion Nebula', sizeArcmin: 85 })
      expect(m42.raDeg).toBeCloseTo(5.5881 * 15, 6)
      expect(m42.decDeg).toBeCloseTo(-5.3911, 6)
      expect(objects.find(o => o.designation === 'NGC 1977')?.name).toBeNull()
    })

    it('[INS-006] Given a palette chosen for a target, When read back, Then it is that target’s alone, and clearing it leaves none', async () => {
      const h = await setup(seed)
      expect(await h.palettes.chosen('m42')).toBeNull()
      await h.palettes.choose('m42', 'SHO', at)
      await h.palettes.choose('m42', 'HOO', at)
      expect(await h.palettes.chosen('m42')).toBe('HOO')
      expect(await h.palettes.chosen('m31')).toBeNull()
      await h.palettes.choose('m42', null, at)
      expect(await h.palettes.chosen('m42')).toBeNull()
    })
  })
}
