import { describe, expect, it } from 'vitest'
import type { SeedCatalogue } from '@astro/domain'
import { InMemoryCatalogueSeeds, InMemoryCatalogueStore } from '@astro/testkit'
import { makeRepairCatalogues } from '../src'

const M33 = { designation: 'M33', name: 'Triangulum Galaxy', type: 'spiral_galaxy', ra: 1.5641, dec: 30.6599, mag: 5.7, size: 68.7, constellation: 'Triangulum', aliases: ['NGC 598'] }
const M101 = { ...M33, designation: 'M101', name: 'Pinwheel Galaxy', ra: 14.0535, dec: 54.3488, constellation: 'Ursa Major', aliases: ['NGC 5457'] }
const MESSIER: SeedCatalogue = { name: 'Messier', abbreviation: 'M', description: 'Messier', totalObjects: 110, objects: [M33, M101] }

let n = 0
const newId = () => `id-${++n}`

describe('Repairing the catalogues', () => {
  it('[CAT-003] [CAT-006] Given a new install, When the catalogues are repaired, Then every object is seeded and the version recorded', async () => {
    const store = new InMemoryCatalogueStore()
    const result = await makeRepairCatalogues({ seeds: new InMemoryCatalogueSeeds([MESSIER], 'v1'), store, newId })()
    expect(result).toEqual({ ran: true, version: 'v1', created: 2, removed: 0, framesMoved: 0, foldersMoved: 0, split: [] })
    expect((await store.installed()).map(t => t.canonicalName)).toEqual(['Triangulum Galaxy', 'Pinwheel Galaxy'])
    expect(await store.version()).toBe('v1')
  })

  it('[CAT-006] Given an install already at the shipped version, When the catalogues are repaired, Then nothing is read or written', async () => {
    const store = new InMemoryCatalogueStore({ version: 'v1', catalogues: [], targets: [] })
    const result = await makeRepairCatalogues({ seeds: new InMemoryCatalogueSeeds([MESSIER], 'v1'), store, newId })()
    expect(result.ran).toBe(false)
    expect(await store.installed()).toEqual([])
  })

  it('[CAT-006] Given no shipped catalogues, When the catalogues are repaired, Then nothing changes', async () => {
    const store = new InMemoryCatalogueStore({ version: 'v0', catalogues: [], targets: [] })
    expect(await makeRepairCatalogues({ seeds: new InMemoryCatalogueSeeds([]), store, newId })()).toMatchObject({ ran: false, created: 0 })
    expect(await store.version()).toBe('v0')
  })

  it('[CAT-004] Given an install where M33 held M101, When it is repaired, Then the split, the frames and folders moved and the old targets removed are counted', async () => {
    const store = new InMemoryCatalogueStore({
      catalogues: [{ name: 'Messier', abbreviation: 'M', description: 'old', totalObjects: 110 }],
      targets: [
        { id: 'm33', canonicalName: 'Triangulum Galaxy', aliases: [{ alias: 'M101', source: 'M' }], entries: [{ catalogue: 'M', designation: 'M33' }] },
        { id: 'old', canonicalName: 'M999', entries: [{ catalogue: 'M', designation: 'M999' }] },
        { id: 'mine', canonicalName: 'M101 project', isCustom: true }
      ],
      frames: [{ id: 'f', targetId: 'm33', objectName: 'M101', folderName: null }, { id: 'g', targetId: 'mine', objectName: 'M101', folderName: null }],
      folders: [{ id: 'h', targetId: 'm33', name: 'Pinwheel Galaxy' }]
    })
    const result = await makeRepairCatalogues({ seeds: new InMemoryCatalogueSeeds([MESSIER], 'v2'), store, newId })()
    expect(result).toEqual({ ran: true, version: 'v2', created: 1, removed: 1, framesMoved: 1, foldersMoved: 1, split: [{ canonicalName: 'Triangulum Galaxy', into: ['M101'] }] })
    const linked = await store.linked(['mine'])
    expect(linked.frames.map(f => f.id)).toEqual(['g'])
  })
})
