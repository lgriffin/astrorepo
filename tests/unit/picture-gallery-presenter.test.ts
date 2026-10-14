import path from 'path'
import { describe, expect, it } from 'vitest'
import type { GalleryEntry, ObjectPanel, PictureDetails } from '@astro/application'
import { objectFacts } from '@astro/testkit'
import { bestPlacedText, fromSiteText, savedDay, toDetailsView, toGalleryView, toPictureData } from '../../src/main/adapters/picture-gallery-presenter'

const entry = (overrides: Partial<GalleryEntry> = {}): GalleryEntry => ({
  path: path.join('/home', 'images', 'M42', 'final.png'),
  name: 'final.png',
  folders: ['M42'],
  sizeBytes: 2.5 * 1024 * 1024,
  modifiedAt: new Date(2026, 9, 1, 20, 0),
  objects: [{ objectId: 't-m42', label: 'M42 · Orion Nebula' }],
  ...overrides
})

const panel = (overrides: Partial<ObjectPanel> = {}): ObjectPanel => ({
  facts: objectFacts('t-m42', {
    name: 'Orion Nebula',
    designations: ['M42', 'NGC 1976'],
    aliases: ['Great Orion Nebula'],
    objectType: 'emission_nebula',
    constellation: 'Orion',
    magnitude: 4,
    sizeArcmin: 85,
    raHours: 5.5908,
    decDeg: -5.3911,
    collections: [{ id: 'c1', name: 'Messier' }],
    stage: 'raw_captured',
    data: { lightFrames: 1240, integrationSec: 4 * 3600 + 30 * 60, nights: 3, lastNight: '2026-02-10', masters: 2, hasMosaicPlan: true }
  }),
  matched: 'M42',
  summary: 'An emission nebula in Orion, magnitude 4, 1.4°, about 3 full moons across.',
  bestMonth: 11,
  highestAltitudeDeg: 31.3,
  narrowband: true,
  ...overrides
})

const details = (overrides: Partial<PictureDetails> = {}): PictureDetails => ({
  picture: entry(),
  readFrom: 'folder',
  objects: [panel()],
  unknown: [],
  hasSite: true,
  ...overrides
})

describe('picture gallery presenter', () => {
  it('[GAL-001] Given a listing, When shown, Then each picture has its folder, size, day and captions', () => {
    const view = toGalleryView({ root: '/home/images', pictures: [entry(), entry({ path: '/home/images/a.png', name: 'a.png', folders: [], modifiedAt: null, objects: [] })] })
    expect(view.root).toBe('/home/images')
    expect(view.pictures[0]).toEqual({
      path: entry().path,
      name: 'final.png',
      folder: 'M42',
      folderPath: path.join('/home', 'images', 'M42'),
      size: '2.5 MB',
      savedAt: new Date(2026, 9, 1, 20, 0).toISOString(),
      saved: '1 Oct 2026',
      objects: [{ id: 't-m42', label: 'M42 · Orion Nebula' }]
    })
    expect(view.pictures[1]).toMatchObject({ folder: '', saved: null, savedAt: null, objects: [] })
    expect(toGalleryView({ root: null, pictures: [] })).toEqual({ root: null, pictures: [] })
  })

  it('[GAL-001] Given days across the year, When shown, Then each reads day, short month and year', () => {
    expect(savedDay(new Date(2026, 0, 9))).toBe('9 Jan 2026')
    expect(savedDay(new Date(2025, 11, 31))).toBe('31 Dec 2025')
  })

  it('[GAL-005] [GAL-006] [GAL-007] [GAL-008] Given an object with frames, When its panel is shown, Then its facts, data, placing and links come out in words', () => {
    const view = toDetailsView(details())
    expect(view.readFrom).toBe('Read from the folder it is in, M42.')
    const [o] = view.objects
    expect(o).toMatchObject({
      id: 't-m42',
      name: 'Orion Nebula',
      designations: 'M42, NGC 1976',
      matched: 'M42',
      bestPlaced: 'Highest at midnight in December.',
      fromSite: 'Climbs to 31° from your site.',
      needsSite: false,
      noData: false,
      hasMosaicPlan: true,
      collections: [{ id: 'c1', name: 'Messier' }]
    })
    expect(o.facts).toEqual([
      { label: 'Type', value: 'Emission nebula' },
      { label: 'Constellation', value: 'Orion' },
      { label: 'Magnitude', value: '4' },
      { label: 'Size', value: '1.4°' },
      { label: 'Position', value: '5h 35m, −5° 23′' },
      { label: 'Also known as', value: 'Great Orion Nebula' }
    ])
    expect(o.data).toEqual([
      { label: 'Light frames', value: '1,240' },
      { label: 'Integration', value: '4 h 30 m' },
      { label: 'Nights', value: '3, last on 2026-02-10' },
      { label: 'Masters', value: '2' },
      { label: 'Stage', value: 'Raw captured' }
    ])
    expect(o.filterHint).toBe('Emission nebula: a dual-band or narrowband filter suits it, even under a bright moon.')
  })

  it('[GAL-005] [GAL-006] [GAL-007] Given an object with little known and no frames, When shown without a site, Then only what is known appears and the site is asked for', () => {
    const bare = panel({
      facts: objectFacts('t-x', { name: 'NGC 9', designations: ['NGC 9'], decDeg: 23.8, sizeArcmin: 1.54, data: { lightFrames: 0, integrationSec: 0, nights: 0, lastNight: null, masters: 1, hasMosaicPlan: false } }),
      bestMonth: null,
      highestAltitudeDeg: null,
      narrowband: false
    })
    const [o] = toDetailsView(details({ objects: [bare], hasSite: false, readFrom: 'file' })).objects
    expect(o.facts).toEqual([{ label: 'Type', value: 'Object' }, { label: 'Size', value: '1.5′' }])
    expect(o.data).toEqual([{ label: 'Stage', value: 'Not observed' }, { label: 'Masters', value: '1' }])
    expect(o).toMatchObject({ noData: true, bestPlaced: null, fromSite: null, needsSite: true, filterHint: null, description: null })
    const noMasters = panel({ facts: objectFacts('t-y', { data: { lightFrames: 0, integrationSec: 0, nights: 0, lastNight: null, masters: 0, hasMosaicPlan: false } }) })
    expect(toDetailsView(details({ objects: [noMasters] })).objects[0].data).toEqual([{ label: 'Stage', value: 'Not observed' }])
  })

  it('[GAL-007] Given an object without a declination and no site, When shown, Then no site is asked for', () => {
    const [o] = toDetailsView(details({ objects: [panel({ facts: objectFacts('t-z') })], hasSite: false })).objects
    expect(o.needsSite).toBe(false)
  })

  it('[GAL-006] Given frames without a known night, When shown, Then the nights are a bare count', () => {
    const p = panel()
    p.facts.data = { ...p.facts.data, nights: 0, lastNight: null }
    expect(toDetailsView(details({ objects: [p] })).objects[0].data[2]).toEqual({ label: 'Nights', value: '0' })
  })

  it('[GAL-009] Given where the objects were read from, When shown, Then it says the file name, the folder, or nothing', () => {
    expect(toDetailsView(details({ readFrom: 'file' })).readFrom).toBe('Read from the file name.')
    expect(toDetailsView(details({ readFrom: 'folder', picture: entry({ folders: ['Nebulae', 'M42'] }) })).readFrom).toBe('Read from the folder it is in, Nebulae / M42.')
    expect(toDetailsView(details({ readFrom: 'folder', picture: entry({ folders: [] }) })).readFrom).toBe('Read from the folder it is in.')
    expect(toDetailsView(details({ readFrom: null, objects: [], unknown: ['NGC 891'] }))).toMatchObject({ readFrom: null, objects: [], unknown: ['NGC 891'] })
  })

  it('[GAL-007] Given altitudes and months, When put in words, Then low objects are flagged and ones that never rise say so', () => {
    expect(bestPlacedText(0)).toBe('Highest at midnight in January.')
    expect(bestPlacedText(null)).toBeNull()
    expect(fromSiteText(null)).toBeNull()
    expect(fromSiteText(-23)).toBe('Never rises from your site.')
    expect(fromSiteText(0)).toBe('Never rises from your site.')
    expect(fromSiteText(12.4)).toBe('Climbs only to 12° from your site, low in the murk.')
    expect(fromSiteText(20)).toBe('Climbs to 20° from your site.')
  })

  it('[GAL-013] [NFR-021] Given a read picture or a failure, When sent, Then it is a data address or the reason', () => {
    expect(toPictureData({ ok: true, data: 'QUJD', mime: 'image/jpeg', width: 10, height: 5 })).toEqual({ ok: true, src: 'data:image/jpeg;base64,QUJD', width: 10, height: 5 })
    expect(toPictureData({ ok: false, error: 'The file is damaged.' })).toEqual({ ok: false, error: 'The file is damaged.' })
  })
})
