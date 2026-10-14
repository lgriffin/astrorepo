import { describe, expect, it } from 'vitest'
import { makePictureGallery, PictureRefusedError } from '@astro/application'
import { InMemoryObjectCatalogue, InMemoryPictureFolder, objectFacts } from '@astro/testkit'
import type { Site } from '@astro/domain'

const DUBLIN: Site = { latitudeDeg: 53.3, longitudeDeg: -6.3, elevationM: 20 }

function world(site: Site | null = DUBLIN) {
  const folder = new InMemoryPictureFolder()
  const catalogue = new InMemoryObjectCatalogue()
    .add(
      objectFacts('t-m31', {
        name: 'Andromeda Galaxy',
        designations: ['M31', 'NGC 224'],
        aliases: ['Great Andromeda Nebula'],
        objectType: 'galaxy',
        constellation: 'Andromeda',
        magnitude: 3.4,
        sizeArcmin: 178,
        raHours: 0.7122,
        decDeg: 41.2689
      })
    )
    .add(objectFacts('t-m42', { name: 'Orion Nebula', designations: ['M42'], objectType: 'emission_nebula', raHours: 5.5908, decDeg: -5.3911 }))
    .add(objectFacts('t-ngc9', { name: 'NGC 9', designations: ['NGC 9'] }))
  const gallery = makePictureGallery({ folder, catalogue, planning: { site: async () => site } })
  return { folder, catalogue, gallery }
}

describe('browsing the gallery', () => {
  it('[GAL-001] [GAL-003] Given pictures under the root, When browsed, Then each comes newest first with the objects its name or folder names', async () => {
    const { folder, gallery } = world()
    folder
      .add('M31.png', { modifiedAt: '2026-10-01T20:00:00Z' })
      .add('M42/final.png', { modifiedAt: '2026-10-03T20:00:00Z' })
      .add('widefield.jpg', { modifiedAt: '2026-10-02T20:00:00Z' })
      .add('NGC9.png', { modifiedAt: '2026-10-02T20:00:00Z' })
    const listing = await gallery.browse()
    expect(listing.root).toBe('/home/images')
    expect(listing.pictures.map(p => [p.name, p.objects])).toEqual([
      ['final.png', [{ objectId: 't-m42', label: 'M42 · Orion Nebula' }]],
      ['NGC9.png', [{ objectId: 't-ngc9', label: 'NGC 9' }]],
      ['widefield.jpg', []],
      ['M31.png', [{ objectId: 't-m31', label: 'M31 · Andromeda Galaxy' }]]
    ])
    expect(listing.pictures[0]).toMatchObject({ path: '/home/images/M42/final.png', folders: ['M42'], sizeBytes: 1000 })
  })

  it('[GAL-001] Given pictures of the same time or none, When browsed, Then they come by name, undated last', async () => {
    const { folder, gallery } = world()
    folder.add('b.png', { modifiedAt: null }).add('c.png').add('a.png').add('d.png', { modifiedAt: null })
    expect((await gallery.browse()).pictures.map(p => p.name)).toEqual(['a.png', 'c.png', 'b.png', 'd.png'])
  })

  it('[GAL-012] Given no images folder, When browsed, Then there is no root and no picture, and a path listed before is refused', async () => {
    const { folder, gallery } = world()
    folder.add('M31.png')
    await gallery.browse()
    folder.rootPath = null
    expect(await gallery.browse()).toEqual({ root: null, pictures: [] })
    await expect(gallery.picture('/home/images/M31.png', 400)).rejects.toThrow(PictureRefusedError)
  })

  it('[GAL-003] Given an object added to the catalogue between visits, When browsed again, Then the catalogue is read afresh and the picture is matched', async () => {
    const { folder, catalogue, gallery } = world()
    folder.add('Cave Nebula.png')
    expect((await gallery.browse()).pictures[0].objects).toEqual([])
    catalogue.add(objectFacts('t-cave', { name: 'Cave Nebula', designations: ['Sh2-155'] }))
    expect((await gallery.browse()).pictures[0].objects).toEqual([{ objectId: 't-cave', label: 'Sh2-155 · Cave Nebula' }])
    expect(catalogue.namesRead).toBe(2)
  })

  it('[GAL-003] Given an object known only by an id, When labelled, Then its id stands in', async () => {
    const { folder, catalogue, gallery } = world()
    catalogue.namedObjects = async () => [{ id: 'bare', designations: [], names: ['Bare Thing'] }, { id: 'nameless', designations: ['M99'], names: [] }]
    folder.add('Bare Thing M99.png')
    expect((await gallery.browse()).pictures[0].objects).toEqual([
      { objectId: 'nameless', label: 'M99' },
      { objectId: 'bare', label: 'Bare Thing' }
    ])
  })
})

describe('a picture’s side panel', () => {
  it('[GAL-002] [GAL-005] [GAL-007] Given M31.png, When opened, Then the panel says what M31 is, when it is highest and how high it gets from the site', async () => {
    const { folder, gallery } = world()
    folder.add('M31.png')
    await gallery.browse()
    const details = await gallery.details('/home/images/M31.png')
    expect(details.readFrom).toBe('file')
    expect(details.unknown).toEqual([])
    expect(details.hasSite).toBe(true)
    expect(details.picture.objects).toEqual([{ objectId: 't-m31', label: 'M31 · Andromeda Galaxy' }])
    expect(details.objects).toHaveLength(1)
    const [m31] = details.objects
    expect(m31.facts.name).toBe('Andromeda Galaxy')
    expect(m31.matched).toBe('M31')
    expect(m31.summary).toBe('A galaxy in Andromeda, magnitude 3.4, 3°, about 6 full moons across.')
    expect(m31.bestMonth).toBe(8)
    expect(m31.highestAltitudeDeg).toBeCloseTo(77.97, 2)
    expect(m31.narrowband).toBe(false)
  })

  it('[GAL-007] Given an emission nebula and no site, When opened, Then it is marked for narrowband and has no altitude', async () => {
    const { folder, gallery } = world(null)
    folder.add('M42/final.png')
    const details = await gallery.details('/home/images/M42/final.png')
    expect(details.readFrom).toBe('folder')
    expect(details.objects[0]).toMatchObject({ narrowband: true, highestAltitudeDeg: null, bestMonth: 11 })
    expect(details.hasSite).toBe(false)
  })

  it('[GAL-007] Given an object without coordinates, When opened, Then it has no month and no altitude', async () => {
    const { folder, gallery } = world()
    folder.add('NGC 9.png')
    expect((await gallery.details('/home/images/NGC 9.png')).objects[0]).toMatchObject({ bestMonth: null, highestAltitudeDeg: null })
  })

  it('[GAL-009] [GAL-010] Given a picture naming no known object, When opened, Then the panel has no object and reports a designation the catalogue does not hold', async () => {
    const { folder, gallery } = world()
    folder.add('NGC 891 final.png').add('widefield.png')
    expect(await gallery.details('/home/images/NGC 891 final.png')).toMatchObject({ readFrom: null, objects: [], unknown: ['NGC 891'] })
    expect(await gallery.details('/home/images/widefield.png')).toMatchObject({ readFrom: null, objects: [], unknown: [] })
  })

  it('[GAL-005] Given an object the catalogue lost between the listing and the panel, When opened, Then it is left out rather than failing', async () => {
    const { folder, catalogue, gallery } = world()
    folder.add('M31 M42.png')
    await gallery.browse()
    catalogue.objects.delete('t-m31')
    expect((await gallery.details('/home/images/M31 M42.png')).objects.map(o => o.facts.id)).toEqual(['t-m42'])
  })

  it('[GAL-011] Given a path the folder never listed, When its panel is asked for, Then it is refused', async () => {
    const { gallery } = world()
    await expect(gallery.details('C:/Windows/system.ini')).rejects.toThrow(PictureRefusedError)
    await expect(gallery.details('C:/Windows/system.ini')).rejects.toThrow(/not in the images folder/)
  })
})

describe('reading a picture', () => {
  it('[NFR-021] Given a listed picture, When read, Then it comes back at the width asked without listing the folder again', async () => {
    const { folder, gallery } = world()
    folder.add('M31.png', { bytes: 'andromeda' })
    await gallery.browse()
    const listings = folder.listings
    const read = await gallery.picture('/home/images/M31.png', 400)
    expect(read).toEqual({ ok: true, data: Buffer.from('andromeda').toString('base64'), mime: 'image/png', width: null, height: null })
    expect(folder.reads).toEqual([{ path: '/home/images/M31.png', maxWidth: 400 }])
    expect(folder.listings).toBe(listings)
  })

  it('[GAL-001] Given a picture added since the gallery was opened, When read, Then the folder is listed again and it is read', async () => {
    const { folder, gallery } = world()
    await gallery.browse()
    folder.add('new.png')
    expect(await gallery.picture('/home/images/new.png', 400)).toMatchObject({ ok: true })
  })

  it('[GAL-013] Given a picture that cannot be read, When read, Then the reason comes back instead of failing', async () => {
    const { folder, gallery } = world()
    folder.add('M31.png')
    folder.failures.set('/home/images/M31.png', 'The file is damaged.')
    expect(await gallery.picture('/home/images/M31.png', 400)).toEqual({ ok: false, error: 'The file is damaged.' })
    folder.read = async () => {
      throw 'plain'
    }
    expect(await gallery.picture('/home/images/M31.png', 400)).toEqual({ ok: false, error: 'plain' })
  })

  it('[GAL-011] Given a path outside the images folder, When read, Then it is refused and nothing is read', async () => {
    const { folder, gallery } = world()
    folder.add('M31.png')
    await expect(gallery.picture('/etc/passwd', 400)).rejects.toThrow(PictureRefusedError)
    expect(folder.reads).toEqual([])
  })
})

describe('reading more about an object', () => {
  it('[GAL-008] Given objects with and without a common name, When a reference is asked for, Then the page is built from the catalogue', async () => {
    const { gallery } = world()
    expect(await gallery.reference('t-m31', 'wikipedia')).toBe('https://en.wikipedia.org/wiki/Special:Search?search=Messier%2031')
    expect(await gallery.reference('t-m31', 'simbad')).toBe('https://simbad.cds.unistra.fr/simbad/sim-id?Ident=M31')
    expect(await gallery.reference('t-ngc9', 'wikipedia')).toBe('https://en.wikipedia.org/wiki/Special:Search?search=NGC%209')
  })

  it('[GAL-008] Given an object with no designation, When a reference is asked for, Then its name is looked up; and an unknown object gives none', async () => {
    const { catalogue, gallery } = world()
    catalogue.add(objectFacts('t-custom', { name: 'Heart Nebula' }))
    expect(await gallery.reference('t-custom', 'simbad')).toBe('https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Heart%20Nebula')
    expect(await gallery.reference('missing', 'simbad')).toBeNull()
  })
})
