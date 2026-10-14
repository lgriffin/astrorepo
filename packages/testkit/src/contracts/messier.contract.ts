import { describe, it, expect } from 'vitest'
import type { MessierCatalogue, TilePictures } from '@astro/application'

/** A Messier entry in the seeded catalogues. */
export interface SeedMessier {
  designation: string
  targetId: string
  name: string
  objectType: string
  constellation: string | null
  magnitude: number | null
  raHours: number | null
  decDeg: number | null
}

/** An image a target has: a finished file in its own images folder, or a stacked master in the index. */
export interface SeedPicture {
  targetId: string
  name: string
  kind: 'finished' | 'master'
  /** For a master: three channels. */
  colour?: boolean
  modifiedAt: string
  /** The file is in the index but gone from disk. */
  gone?: boolean
}

export interface MessierSeed {
  messier: SeedMessier[]
  /** Entries of other catalogues, which are never Messier objects. */
  others: { catalogue: 'NGC' | 'C'; designation: string; targetId: string }[]
  pictures: SeedPicture[]
}

export interface MessierHarness {
  catalogue: MessierCatalogue
  /** Where a seeded image is found. */
  pathOf(picture: Pick<SeedPicture, 'targetId' | 'name' | 'kind'>): string
}

/** Every MessierCatalogue adapter must pass this suite. */
export function messierCatalogueContract(adapterName: string, setup: (seed: MessierSeed) => Promise<MessierHarness>): void {
  const seed: MessierSeed = {
    messier: [
      { designation: 'M42', targetId: 'orion', name: 'Orion Nebula', objectType: 'emission_nebula', constellation: 'Orion', magnitude: 4, raHours: 5.5881, decDeg: -5.3911 },
      { designation: 'M2', targetId: 'm2', name: 'M2', objectType: 'globular_cluster', constellation: 'Aquarius', magnitude: 6.5, raHours: 21.5575, decDeg: -0.8233 },
      { designation: 'M 13', targetId: 'm13', name: 'Great Hercules Cluster', objectType: 'globular_cluster', constellation: null, magnitude: null, raHours: null, decDeg: null }
    ],
    others: [
      { catalogue: 'NGC', designation: 'NGC 1977', targetId: 'ngc1977' },
      { catalogue: 'C', designation: 'C14', targetId: 'c14' }
    ],
    pictures: [
      { targetId: 'orion', name: 'orion_final.jpg', kind: 'finished', modifiedAt: '2026-03-01T10:00:00Z' },
      { targetId: 'orion', name: 'orion_rc.tif', kind: 'finished', modifiedAt: '2026-03-02T10:00:00Z' },
      { targetId: 'orion', name: 'master_rgb.fit', kind: 'master', colour: true, modifiedAt: '2026-02-01T10:00:00Z' },
      { targetId: 'orion', name: 'master_old.fit', kind: 'master', colour: false, modifiedAt: '2026-01-01T10:00:00Z', gone: true },
      { targetId: 'm2', name: 'm2_stack.fit', kind: 'master', colour: false, modifiedAt: '2026-02-03T10:00:00Z' }
    ]
  }

  describe(`MessierCatalogue contract: ${adapterName}`, () => {
    it('[MES-001] Given the seeded catalogues, When the Messier objects are listed, Then each comes once by number with its target, and no other catalogue’s entries', async () => {
      const h = await setup(seed)
      const objects = await h.catalogue.objects()
      expect(objects.map(o => [o.number, o.designation, o.targetId])).toEqual([
        [2, 'M2', 'm2'],
        [13, 'M 13', 'm13'],
        [42, 'M42', 'orion']
      ])
      expect(objects[2]).toEqual({
        number: 42,
        designation: 'M42',
        targetId: 'orion',
        name: 'Orion Nebula',
        objectType: 'emission_nebula',
        constellation: 'Orion',
        magnitude: 4,
        raHours: 5.5881,
        decDeg: -5.3911
      })
    })

    it('[MES-001] Given an object named only by its designation or with no position, When listed, Then its name and position are null', async () => {
      const h = await setup(seed)
      const objects = await h.catalogue.objects()
      expect(objects[0].name).toBeNull()
      expect(objects[1]).toMatchObject({ name: 'Great Hercules Cluster', raHours: null, decDeg: null, constellation: null, magnitude: null })
    })

    it('[MES-003] Given a target’s finished images and masters, When its pictures are listed, Then each comes with its kind, colour and time, and a master gone from disk is left out', async () => {
      const h = await setup(seed)
      const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path)
      const pictures = (await h.catalogue.pictures('orion')).sort(byPath)
      expect(pictures).toEqual(
        [
          { path: h.pathOf({ targetId: 'orion', name: 'orion_final.jpg', kind: 'finished' }), kind: 'finished', colour: null, modifiedAt: new Date('2026-03-01T10:00:00Z') },
          { path: h.pathOf({ targetId: 'orion', name: 'orion_rc.tif', kind: 'finished' }), kind: 'finished', colour: null, modifiedAt: new Date('2026-03-02T10:00:00Z') },
          { path: h.pathOf({ targetId: 'orion', name: 'master_rgb.fit', kind: 'master' }), kind: 'master', colour: true, modifiedAt: new Date('2026-02-01T10:00:00Z') }
        ].sort(byPath)
      )
      expect(await h.catalogue.pictures('m2')).toEqual([
        { path: h.pathOf({ targetId: 'm2', name: 'm2_stack.fit', kind: 'master' }), kind: 'master', colour: false, modifiedAt: new Date('2026-02-03T10:00:00Z') }
      ])
    })

    it('[MES-002] Given a target with no images, When its pictures are listed, Then there are none', async () => {
      const h = await setup(seed)
      expect(await h.catalogue.pictures('m13')).toEqual([])
      expect(await h.catalogue.pictures('no-such-target')).toEqual([])
    })
  })
}

/** An image file the suite draws: a finished PNG or a linear FITS master. */
export interface SeedTileImage {
  name: string
  width: number
  height: number
}

export interface TilePicturesHarness {
  pictures: TilePictures
  path(name: string): string
  /** A path to a file that does not exist. */
  missing: string
}

/** Every TilePictures adapter must pass this suite. */
export function tilePicturesContract(adapterName: string, setup: (images: SeedTileImage[]) => Promise<TilePicturesHarness>): void {
  const images: SeedTileImage[] = [
    { name: 'final.png', width: 40, height: 20 },
    { name: 'master.fit', width: 30, height: 30 },
    { name: 'small.png', width: 8, height: 6 }
  ]
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

  describe(`TilePictures contract: ${adapterName}`, () => {
    it('[MES-003] Given a finished PNG wider than asked, When drawn, Then a PNG at most that wide comes back with its shape kept', async () => {
      const h = await setup(images)
      const p = await h.pictures.draw(h.path('final.png'), { maxWidth: 10, stretch: false })
      expect(p.mime).toBe('image/png')
      expect([...p.data.subarray(0, 8)]).toEqual(PNG)
      expect(p.width).toBeLessThanOrEqual(10)
      expect(p.width / p.height).toBeCloseTo(2, 0)
    })

    it('[MES-003] Given a FITS master, When drawn stretched, Then a PNG at most the width asked comes back', async () => {
      const h = await setup(images)
      const p = await h.pictures.draw(h.path('master.fit'), { maxWidth: 16, stretch: true })
      expect(p.mime).toBe('image/png')
      expect(p.width).toBeLessThanOrEqual(16)
      expect(p.height).toBe(p.width)
    })

    it('[MES-003] Given an image narrower than asked, When drawn, Then it keeps its own size', async () => {
      const h = await setup(images)
      const p = await h.pictures.draw(h.path('small.png'), { maxWidth: 64, stretch: false })
      expect([p.width, p.height]).toEqual([8, 6])
    })

    it('[MES-004] Given a file that is gone or of a format the mosaic does not draw, When drawn, Then it fails with a reason', async () => {
      const h = await setup(images)
      await expect(h.pictures.draw(h.missing, { maxWidth: 64, stretch: false })).rejects.toThrow()
      await expect(h.pictures.draw(h.path('notes.txt'), { maxWidth: 64, stretch: false })).rejects.toThrow(/JPEG, PNG, TIFF and FITS/)
    })
  })
}
