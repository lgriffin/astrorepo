import { describe, it, expect } from 'vitest'
import type { ObjectCatalogue, PictureFolder } from '@astro/application'

/** A file under the gallery's root, by its path relative to the root ("M42/final.png"). */
export interface SeedPicture {
  relative: string
  bytes: string
  modifiedAt: string
}

export interface PictureFolderSeed {
  /** False when no home folder is set. */
  hasRoot: boolean
  files: SeedPicture[]
}

export interface PictureFolderHarness {
  folder: PictureFolder
  root: string | null
  pathOf(relative: string): string
}

/** Every PictureFolder adapter must pass this suite. */
export function pictureFolderContract(adapterName: string, setup: (seed: PictureFolderSeed) => Promise<PictureFolderHarness>): void {
  const files: SeedPicture[] = [
    { relative: 'M31.png', bytes: 'andromeda', modifiedAt: '2026-10-01T20:00:00Z' },
    { relative: 'M42/final.png', bytes: 'orion', modifiedAt: '2026-09-01T20:00:00Z' },
    { relative: 'M42/v1/older.JPG', bytes: 'orion v1', modifiedAt: '2026-08-01T20:00:00Z' },
    { relative: 'NGC7000.tif', bytes: 'tiff', modifiedAt: '2026-08-01T20:00:00Z' },
    { relative: 'notes.txt', bytes: 'text', modifiedAt: '2026-08-01T20:00:00Z' },
    { relative: '.thumbs/M31.png', bytes: 'hidden', modifiedAt: '2026-08-01T20:00:00Z' }
  ]

  describe(`PictureFolder contract: ${adapterName}`, () => {
    it('[GAL-001] Given PNG, JPEG and other files under the root, When listed, Then every PNG and JPEG comes back with its folders, size and time, and nothing else', async () => {
      const h = await setup({ hasRoot: true, files })
      expect(await h.folder.root()).toBe(h.root)
      const listed = (await h.folder.list()).sort((a, b) => a.path.localeCompare(b.path))
      expect(listed.map(p => [p.path, p.name, p.folders])).toEqual([
        [h.pathOf('M31.png'), 'M31.png', []],
        [h.pathOf('M42/final.png'), 'final.png', ['M42']],
        [h.pathOf('M42/v1/older.JPG'), 'older.JPG', ['M42', 'v1']]
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
      const m31 = listed.find(p => p.name === 'M31.png')!
      expect(m31.sizeBytes).toBe('andromeda'.length)
      expect(m31.modifiedAt?.toISOString()).toBe('2026-10-01T20:00:00.000Z')
    })

    it('[GAL-012] Given no home folder, When listed, Then there is no root and nothing is listed', async () => {
      const h = await setup({ hasRoot: false, files: [] })
      expect(await h.folder.root()).toBeNull()
      expect(await h.folder.list()).toEqual([])
    })

    it('[NFR-021] Given a listed PNG, When read, Then its bytes come back as base64 with its type', async () => {
      const h = await setup({ hasRoot: true, files })
      const picture = await h.folder.read(h.pathOf('M31.png'), 400)
      expect(picture.mime).toBe('image/png')
      expect(Buffer.from(picture.data, 'base64').toString()).toBe('andromeda')
      expect((await h.folder.read(h.pathOf('M42/v1/older.JPG'), 400)).mime).toBe('image/jpeg')
    })

    it('[GAL-013] Given a picture gone from disk, When read, Then the read fails with a reason', async () => {
      const h = await setup({ hasRoot: true, files })
      await expect(h.folder.read(h.pathOf('gone.png'), 400)).rejects.toThrow(/no longer there/)
    })
  })
}

/** An object of the catalogue as the contract seeds it. */
export interface SeedCatalogueObject {
  id: string
  /** Its canonical name: a common name, or a designation for an object that has none. */
  name: string
  entries: { catalogue: 'M' | 'NGC' | 'IC' | 'C' | 'Sh2'; designation: string }[]
  aliases: string[]
  objectType: string
  constellation: string | null
  magnitude: number | null
  sizeArcmin: number | null
  raHours: number | null
  decDeg: number | null
  stage: string
  collections: string[]
}

export interface ObjectCatalogueSeed {
  objects: SeedCatalogueObject[]
  /** Light frames: the target, DATE-OBS (UTC) and the exposure. */
  lights: { targetId: string; dateObs: string; exposureSec: number }[]
  /** Stacked masters, one per entry. */
  masters: string[]
  /** Targets with a saved mosaic plan. */
  mosaics: string[]
}

/** Every ObjectCatalogue adapter must pass this suite. */
export function objectCatalogueContract(adapterName: string, setup: (seed: ObjectCatalogueSeed) => Promise<ObjectCatalogue>): void {
  const seed: ObjectCatalogueSeed = {
    objects: [
      {
        id: 't-m31', name: 'Andromeda Galaxy', entries: [{ catalogue: 'NGC', designation: 'NGC 224' }, { catalogue: 'M', designation: 'M31' }],
        aliases: ['Great Andromeda Nebula', 'NGC 224'], objectType: 'galaxy', constellation: 'Andromeda', magnitude: 3.4, sizeArcmin: 178,
        raHours: 0.7122, decDeg: 41.2689, stage: 'raw_captured', collections: ['Messier']
      },
      {
        id: 't-ngc9', name: 'NGC 9', entries: [{ catalogue: 'NGC', designation: 'NGC 9' }], aliases: [], objectType: 'galaxy',
        constellation: 'Pegasus', magnitude: 13.5, sizeArcmin: 1.5, raHours: 0.1489, decDeg: 23.8167, stage: 'not_observed', collections: []
      }
    ],
    lights: [
      { targetId: 't-m31', dateObs: '2026-09-20T21:00:00', exposureSec: 300 },
      { targetId: 't-m31', dateObs: '2026-09-21T02:00:00', exposureSec: 300 },
      { targetId: 't-m31', dateObs: '2026-09-25T22:00:00', exposureSec: 120 }
    ],
    masters: ['t-m31'],
    mosaics: ['t-m31']
  }

  describe(`ObjectCatalogue contract: ${adapterName}`, () => {
    it('[GAL-003] Given objects with catalogue entries and aliases, When named, Then designations come in catalogue order and names hold the common name and other aliases, not designations', async () => {
      const catalogue = await setup(seed)
      const named = (await catalogue.namedObjects()).sort((a, b) => a.id.localeCompare(b.id))
      expect(named).toEqual([
        { id: 't-m31', designations: ['M31', 'NGC 224'], names: ['Andromeda Galaxy', 'Great Andromeda Nebula'] },
        { id: 't-ngc9', designations: ['NGC 9'], names: [] }
      ])
    })

    it('[GAL-005] [GAL-006] Given an object with frames, a master, a mosaic plan and a collection, When its facts are read, Then the catalogue facts and the user’s data come back', async () => {
      const catalogue = await setup(seed)
      expect(await catalogue.objectFacts('t-m31')).toEqual({
        id: 't-m31',
        name: 'Andromeda Galaxy',
        objectType: 'galaxy',
        constellation: 'Andromeda',
        magnitude: 3.4,
        sizeArcmin: 178,
        raHours: 0.7122,
        decDeg: 41.2689,
        description: null,
        designations: ['M31', 'NGC 224'],
        aliases: ['Great Andromeda Nebula'],
        collections: [{ id: expect.any(String), name: 'Messier' }],
        stage: 'raw_captured',
        data: { lightFrames: 3, integrationSec: 720, nights: 2, lastNight: '2026-09-25', masters: 1, hasMosaicPlan: true }
      })
    })

    it('[GAL-006] Given an object without frames, When its facts are read, Then its data is empty; and an unknown object has no facts', async () => {
      const catalogue = await setup(seed)
      expect((await catalogue.objectFacts('t-ngc9'))?.data).toEqual({ lightFrames: 0, integrationSec: 0, nights: 0, lastNight: null, masters: 0, hasMosaicPlan: false })
      expect((await catalogue.objectFacts('t-ngc9'))?.aliases).toEqual([])
      expect(await catalogue.objectFacts('nope')).toBeNull()
    })
  })
}
