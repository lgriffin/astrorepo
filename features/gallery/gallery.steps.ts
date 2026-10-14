import { expect } from 'vitest'
import { makePictureGallery, type GalleryListing, type PictureDetails } from '@astro/application'
import { MONTH_NAMES } from '@astro/domain'
import { InMemoryObjectCatalogue, InMemoryPictureFolder, objectFacts } from '@astro/testkit'
import { defineSteps, type DataTable } from '@astro/testkit/bdd'

class Gallery {
  readonly folder = new InMemoryPictureFolder()
  readonly catalogue = new InMemoryObjectCatalogue()
  latitude: number | null = null
  listing: GalleryListing | null = null
  details: PictureDetails | null = null
  refusal: unknown = null

  readonly gallery = makePictureGallery({
    folder: this.folder,
    catalogue: this.catalogue,
    planning: { site: async () => (this.latitude === null ? null : { latitudeDeg: this.latitude, longitudeDeg: 0, elevationM: 0 }) }
  })

  pathOf(name: string): string {
    const found = this.listing?.pictures.find(p => p.name === name)
    if (!found) throw new Error(`The gallery does not show ${name}`)
    return found.path
  }
}

export const gallerySteps = defineSteps(() => new Gallery(), ({ Given, When, Then }) => {
  Given(
    'the catalogue holds {word} {string}, a(n) {word} in {word} at {float} h and {float}°, magnitude {float}, {float}′ across',
    (w, designation: string, name: string, type: string, constellation: string, ra: number, dec: number, magnitude: number, size: number) => {
      w.catalogue.add(objectFacts(`t-${designation}`, { name, designations: [designation], objectType: type, constellation, raHours: ra, decDeg: dec, magnitude, sizeArcmin: size }))
    }
  )
  Given('my site is at latitude {float}°', (w, latitude: number) => {
    w.latitude = latitude
  })
  Given('the images folder holds:', (w, table: DataTable) => {
    for (const row of table.hashes()) w.folder.add(row.picture.trim(), { modifiedAt: `${row.saved.replace(' ', 'T')}:00Z` })
  })
  Given('the images folder holds {string}', (w, picture: string) => {
    w.folder.add(picture)
  })

  When('I open the gallery', async w => {
    w.listing = await w.gallery.browse()
  })
  When('I open the gallery and pick {string}', async (w, name: string) => {
    w.listing = await w.gallery.browse()
    w.details = await w.gallery.details(w.pathOf(name))
  })
  When('I open the gallery and the window asks for {string}', async (w, path: string) => {
    w.listing = await w.gallery.browse()
    try {
      await w.gallery.picture(path, 400)
    } catch (error) {
      w.refusal = error
    }
  })

  Then('the pictures are:', (w, table: DataTable) => {
    expect(w.listing?.pictures.map(p => ({ picture: p.name, shows: p.objects.map(o => o.label).join(', ') }))).toEqual(
      table.hashes().map(r => ({ picture: r.picture.trim(), shows: r.shows.trim() }))
    )
  })
  Then('the side panel shows {string}, read from the file name', (w, name: string) => {
    expect(w.details?.readFrom).toBe('file')
    expect(w.details?.objects.map(o => o.facts.name)).toEqual([name])
  })
  Then('it says {string}', (w, sentence: string) => {
    expect(w.details?.objects[0].summary).toBe(sentence)
  })
  Then('it is highest at midnight in {word} and climbs to {int}° from my site', (w, month: string, altitude: number) => {
    const [o] = w.details!.objects
    expect(MONTH_NAMES[o.bestMonth!]).toBe(month)
    expect(Math.round(o.highestAltitudeDeg!)).toBe(altitude)
  })
  Then('the side panel shows no object', w => {
    expect(w.details?.objects).toEqual([])
  })
  Then('it says {string} is not in the catalogue', (w, designation: string) => {
    expect(w.details?.unknown).toEqual([designation])
  })
  Then('the request is refused because {string}', (w, reason: string) => {
    expect(String((w.refusal as Error)?.message)).toContain(reason)
  })
})
