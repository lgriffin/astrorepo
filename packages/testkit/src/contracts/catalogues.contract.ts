import { describe, expect, it } from 'vitest'
import type { CatalogueSeeds, CatalogueStore } from '@astro/application'
import type { CatalogueRepairPlan, SeedCatalogue } from '@astro/domain'
import type { CatalogueInstall } from '../fake-catalogues'

const M33 = { designation: 'M33', name: 'Triangulum Galaxy', type: 'spiral_galaxy', ra: 1.5641, dec: 30.6599, mag: 5.7, size: 68.7, constellation: 'Triangulum', aliases: ['NGC 598'] }

/** Two small catalogues, already in the order of their files' names. */
export const SEED_CATALOGUES: SeedCatalogue[] = [
  { name: 'Messier', abbreviation: 'M', description: 'Messier', totalObjects: 110, objects: [M33] },
  { name: 'NGC', abbreviation: 'NGC', description: 'NGC', totalObjects: 500, objects: [{ ...M33, designation: 'NGC 598', name: 'NGC 598', aliases: ['M33'] }] }
]

/**
 * Every CatalogueSeeds adapter must pass this suite. `make` returns the adapter reading `catalogues`
 * (each built as `version`), or reading nothing at all when `catalogues` is empty.
 */
export function catalogueSeedsContract(adapterName: string, make: (catalogues: SeedCatalogue[], version: string) => CatalogueSeeds): void {
  describe(`CatalogueSeeds contract: ${adapterName}`, () => {
    it('[CAT-003] Given the shipped catalogues, When they are read, Then each comes whole, in order, with the version they were built as', async () => {
      const read = await make(SEED_CATALOGUES, '2026-11-07').read()
      expect(read.version).toBe('2026-11-07')
      expect(read.catalogues.map(c => c.abbreviation)).toEqual(['M', 'NGC'])
      expect(read.catalogues[0]).toEqual(SEED_CATALOGUES[0])
    })

    it('[CAT-003] Given no shipped catalogues, When they are read, Then there are none and no version', async () => {
      expect(await make([], '2026-11-07').read()).toEqual({ version: '', catalogues: [] })
    })
  })
}

/** An install left by the old seeder: M101 folded into M33 by a wrong alias, with frames and folders of both. */
export const MERGED_INSTALL: CatalogueInstall = {
  catalogues: [{ name: 'Messier', abbreviation: 'M', description: 'old', totalObjects: 110 }],
  targets: [
    {
      id: 't-m33',
      canonicalName: 'Triangulum Galaxy',
      aliases: [
        { alias: 'M33', source: 'M' },
        { alias: 'Pinwheel Galaxy', source: 'cross-reference' },
        { alias: 'M101', source: 'M' },
        { alias: 'My Triangulum', source: 'user' }
      ],
      entries: [{ catalogue: 'M', designation: 'M33' }]
    },
    { id: 't-old', canonicalName: 'NGC 18', aliases: [{ alias: 'old name', source: 'cross-reference' }], entries: [] },
    { id: 't-mine', canonicalName: 'My comet', isCustom: true, aliases: [{ alias: 'C/2026 A1', source: 'user' }] }
  ],
  frames: [
    { id: 'f-33', targetId: 't-m33', objectName: 'M33', folderName: 'M33' },
    { id: 'f-101', targetId: 't-m33', objectName: 'M 101', folderName: 'M101' }
  ],
  folders: [{ id: 'h-101', targetId: 't-m33', name: 'M101 Pinwheel' }]
}

const FACTS = { type: 'spiral_galaxy', ra: 14.05, dec: 54.35, mag: 7.9, size: 28.8, constellation: 'Ursa Major' }

/** The repair of MERGED_INSTALL: M101 gets its own target, takes its frame and folder, and the old wrong alias goes. */
export const SPLIT_PLAN: CatalogueRepairPlan = {
  create: [{ id: 't-m101', canonicalName: 'Pinwheel Galaxy', facts: FACTS }],
  update: [{ id: 't-m33', facts: { ...FACTS, ra: 1.56, dec: 30.66, constellation: 'Triangulum' } }],
  aliases: [
    { targetId: 't-m33', alias: 'M33', source: 'M' },
    { targetId: 't-m33', alias: 'NGC 598', source: 'cross-reference' },
    { targetId: 't-m101', alias: 'M101', source: 'M' },
    { targetId: 't-m101', alias: 'NGC 5457', source: 'cross-reference' },
    // The user gave this alias first; it stays theirs.
    { targetId: 't-m101', alias: 'My Triangulum', source: 'cross-reference' }
  ],
  entries: [
    { targetId: 't-m33', catalogue: 'M', designation: 'M33' },
    { targetId: 't-m101', catalogue: 'M', designation: 'M101' }
  ],
  frames: [{ id: 'f-101', targetId: 't-m101' }],
  folders: [{ id: 'h-101', targetId: 't-m101' }],
  remove: ['t-old'],
  split: [{ id: 't-m33', canonicalName: 'Triangulum Galaxy', into: ['M101'] }]
}

/**
 * Every CatalogueStore adapter must pass this suite. `make` returns the adapter over an install
 * holding `install`.
 */
export function catalogueStoreContract(adapterName: string, make: (install: CatalogueInstall) => CatalogueStore): void {
  describe(`CatalogueStore contract: ${adapterName}`, () => {
    it('[CAT-006] Given an install never seeded by version, When its version is read, Then there is none', async () => {
      expect(await make(MERGED_INSTALL).version()).toBeNull()
    })

    it('[CAT-004] Given an install, When its targets are read, Then each comes with its aliases, its built-in entries and whether it is the user\'s', async () => {
      const targets = await make(MERGED_INSTALL).installed()
      const m33 = targets.find(t => t.id === 't-m33')!
      expect(m33.canonicalName).toBe('Triangulum Galaxy')
      expect(m33.isCustom).toBe(false)
      expect(m33.isYours).toBe(true)
      expect(m33.aliases).toEqual(expect.arrayContaining([{ alias: 'Pinwheel Galaxy', source: 'cross-reference' }, { alias: 'My Triangulum', source: 'user' }]))
      expect(m33.entries).toEqual([{ catalogue: 'M', designation: 'M33' }])
      expect(targets.find(t => t.id === 't-old')!.isYours).toBe(false)
      expect(targets.find(t => t.id === 't-mine')).toMatchObject({ isCustom: true, isYours: true })
    })

    it('[CAT-004] Given targets, When what is linked to them is read, Then their frames come with FITS OBJECT and folder, their library folders with their names, and no others', async () => {
      const store = make(MERGED_INSTALL)
      const linked = await store.linked(['t-m33'])
      expect(linked.frames.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
        { id: 'f-101', targetId: 't-m33', name: 'M 101', folderName: 'M101' },
        { id: 'f-33', targetId: 't-m33', name: 'M33', folderName: 'M33' }
      ])
      expect(linked.folders).toEqual([{ id: 'h-101', targetId: 't-m33', name: 'M101 Pinwheel' }])
      expect(await store.linked(['t-old'])).toEqual({ frames: [], folders: [] })
    })

    it('[CAT-004] [CAT-005] Given a repair plan, When it is applied, Then the merged target is split, frames and folders follow, wrong aliases go and the user\'s stay', async () => {
      const store = make(MERGED_INSTALL)
      await store.apply(SPLIT_PLAN, [{ name: 'Messier', abbreviation: 'M', description: 'new', totalObjects: 110 }], 'v2')
      const targets = await store.installed()
      expect(targets.map(t => t.id).sort()).toEqual(['t-m101', 't-m33', 't-mine'])
      const m33 = targets.find(t => t.id === 't-m33')!
      expect(m33.aliases.map(a => a.alias).sort()).toEqual(['M33', 'My Triangulum', 'NGC 598'])
      expect(m33.aliases.find(a => a.alias === 'My Triangulum')!.source).toBe('user')
      const m101 = targets.find(t => t.id === 't-m101')!
      expect(m101.canonicalName).toBe('Pinwheel Galaxy')
      expect(m101.aliases.map(a => a.alias).sort()).toEqual(['M101', 'NGC 5457'])
      expect(m101.entries).toEqual([{ catalogue: 'M', designation: 'M101' }])
      expect(targets.find(t => t.id === 't-mine')!.aliases).toEqual([{ alias: 'C/2026 A1', source: 'user' }])
      const linked = await store.linked(['t-m33', 't-m101'])
      expect(linked.frames.find(f => f.id === 'f-101')!.targetId).toBe('t-m101')
      expect(linked.frames.find(f => f.id === 'f-33')!.targetId).toBe('t-m33')
      expect(linked.folders).toEqual([{ id: 'h-101', targetId: 't-m101', name: 'M101 Pinwheel' }])
      expect(await store.version()).toBe('v2')
    })

    it('[CAT-006] Given a repair applied once, When the same plan is applied again, Then the install is the same', async () => {
      const store = make(MERGED_INSTALL)
      const catalogues = [{ name: 'Messier', abbreviation: 'M', description: 'new', totalObjects: 110 }]
      await store.apply(SPLIT_PLAN, catalogues, 'v2')
      const once = await store.installed()
      await store.apply({ ...SPLIT_PLAN, create: [], remove: [] }, catalogues, 'v2')
      const sort = (ts: typeof once) => ts.map(t => ({ ...t, aliases: [...t.aliases].sort((a, b) => a.alias.localeCompare(b.alias)) })).sort((a, b) => a.id.localeCompare(b.id))
      expect(sort(await store.installed())).toEqual(sort(once))
    })
  })
}
