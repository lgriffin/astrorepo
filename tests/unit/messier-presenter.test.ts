import { describe, expect, it } from 'vitest'
import type { MessierMosaic, MessierTile } from '@astro/application'
import { monthName, objectTypeLabel, toMessierMosaicView, toMessierPictureView, toMessierTileView, toOutlookView } from '../../src/main/adapters/messier-presenter'
import { toMessierGapRecommendation, toNextActionRecommendation } from '../../src/main/adapters/stacking-suggestion-presenter'
import { NAV_ITEMS, locate, messierLink, messierNumberFrom } from '../../src/shared/navigation'
import { mosaicLayout, SAVED_COLUMNS } from '../../src/shared/messier-layout'
import { schemas } from '../../src/main/ipc/schemas'

const tile = (over: Partial<MessierTile> = {}): MessierTile => ({
  number: 51,
  designation: 'M51',
  name: 'Whirlpool Galaxy',
  targetId: 't51',
  objectType: 'spiral_galaxy',
  constellation: 'Canes Venatici',
  magnitude: 8.4,
  state: 'gap',
  integrationSec: 0,
  picture: null,
  outlook: { kind: 'tonight', hours: 2.5, moonSeparationDeg: 40, closesInDays: 9 },
  months: [
    { month: '2026-10', hoursPerNight: 0.5, newMoons: [], inSeason: false },
    { month: '2026-11', hoursPerNight: 3, newMoons: [], inSeason: true }
  ],
  ...over
})

describe('Messier mosaic presenter', () => {
  it('[MES-005] Given each outlook, When presented, Then a few words go on the tile and a sentence or two in its details', () => {
    expect(toOutlookView({ kind: 'tonight', hours: 2.5, moonSeparationDeg: 40, closesInDays: 9 })).toEqual({
      kind: 'tonight',
      short: 'Up tonight · 2 h 30 m',
      long: 'Up for 2 h 30 m above 30° tonight. The moon comes within 40°. Its season closes in 9 days.'
    })
    expect(toOutlookView({ kind: 'tonight', hours: 1, moonSeparationDeg: null, closesInDays: 1 }).long).toBe('Up for 1 h above 30° tonight. The moon is down while it is up. Its season closes in 1 day.')
    expect(toOutlookView({ kind: 'tonight', hours: 1, moonSeparationDeg: null, closesInDays: null }).long).toBe('Up for 1 h above 30° tonight. The moon is down while it is up.')
    expect(toOutlookView({ kind: 'moon', hours: 4 })).toMatchObject({ kind: 'moon', short: 'Up tonight, moon too bright' })
    expect(toOutlookView({ kind: 'moon', hours: 4 }).long).toMatch(/^Up for 4 h above 30° tonight, but the moon is too bright/)
    expect(toOutlookView({ kind: 'later', fromMonth: '2027-01', bestMonth: '2027-04' })).toEqual({ kind: 'later', short: 'From Jan, best Apr', long: 'In season from January, best in April.' })
    expect(toOutlookView({ kind: 'later', fromMonth: '2027-04', bestMonth: '2027-04' })).toEqual({ kind: 'later', short: 'Best in Apr', long: 'In season in April.' })
    expect(toOutlookView({ kind: 'never' })).toEqual({ kind: 'never', short: 'Too low from your site', long: 'It never clears 30° for an hour of darkness from your site in the next 12 months.' })
  })

  it('[MES-007] Given a tile, When presented, Then its type, state, integration, outlook and months read as words', () => {
    const view = toMessierTileView(tile({ state: 'captured', integrationSec: 5400, picture: { name: 'm51.jpg', kind: 'finished' } }))
    expect(view).toMatchObject({
      number: 51,
      designation: 'M51',
      name: 'Whirlpool Galaxy',
      objectType: 'Spiral galaxy',
      constellation: 'Canes Venatici',
      magnitude: 8.4,
      state: 'captured',
      stateLabel: 'Captured, not stacked',
      integration: '1 h 30 m',
      picture: { name: 'm51.jpg', kind: 'finished' }
    })
    expect(view.months).toEqual([
      { month: '2026-10', label: 'Oct', hoursPerNight: 0.5, inSeason: false },
      { month: '2026-11', label: 'Nov', hoursPerNight: 3, inSeason: true }
    ])
    expect(toMessierTileView(tile()).integration).toBeNull()
    expect(toMessierTileView(tile({ outlook: null })).outlook).toBeNull()
    expect(['imaged', 'stacked', 'gap'].map(state => toMessierTileView(tile({ state: state as MessierTile['state'] })).stateLabel)).toEqual(['Imaged', 'Stacked, not finished', 'Not captured yet'])
  })

  it('[MES-007] Given object types and months, When named, Then they read as words', () => {
    expect(objectTypeLabel('globular_cluster')).toBe('Globular cluster')
    expect(objectTypeLabel('HII-region')).toBe('Hii region')
    expect(objectTypeLabel('')).toBe('Unknown type')
    expect(monthName('2027-03')).toBe('March')
    expect(monthName('2027-12')).toBe('December')
    expect(monthName('soon')).toBe('soon')
  })

  it('[MES-006] Given tiles in each state, When presented, Then each says which filters show it', () => {
    expect(toMessierTileView(tile()).shows).toEqual(['all', 'missing', 'gaps', 'tonight'])
    expect(toMessierTileView(tile({ state: 'imaged' })).shows).toEqual(['all'])
    expect(toMessierTileView(tile({ state: 'stacked', outlook: { kind: 'never' } })).shows).toEqual(['all', 'missing'])
  })

  it('[MES-001] Given a mosaic, When presented, Then its night, site, counts and tiles pass through', () => {
    const m: MessierMosaic = { night: '2026-10-14', siteSet: true, catalogued: 1, tiles: [tile()], summary: { total: 110, imaged: 0, stacked: 0, captured: 0, gaps: 1, missingUpTonight: 1 } }
    const view = toMessierMosaicView(m)
    expect(view).toMatchObject({ night: '2026-10-14', siteSet: true, catalogued: 1, summary: m.summary })
    expect(view.tiles[0].designation).toBe('M51')
  })

  it('[MES-003] [MES-004] Given a drawn picture, a failure or none, When presented, Then the window gets a data URL, the reason or nothing', () => {
    expect(toMessierPictureView({ ok: true, name: 'm51.png', kind: 'finished', mime: 'image/png', data: Uint8Array.from([1, 2, 3]), width: 3, height: 1 })).toEqual({
      ok: true,
      src: 'data:image/png;base64,AQID',
      width: 3,
      height: 1,
      name: 'm51.png',
      kind: 'finished'
    })
    expect(toMessierPictureView({ ok: false, error: 'a.jpg: Not decoded.' })).toEqual({ ok: false, error: 'a.jpg: Not decoded.' })
    expect(toMessierPictureView(null)).toBeNull()
  })
})

describe('Messier gaps in Next actions', () => {
  const gap = { kind: 'messier-gap' as const, id: 'messier-gap:t51:2026-10-14', number: 51, designation: 'M51', targetId: 't51', targetName: 'M51 Whirlpool Galaxy', usableHours: 5.25, moonSeparationDeg: null, closesInDays: null }

  it('[MES-008] [MES-013] Given a Messier gap, When presented, Then it says it is a gap up tonight and opens the mosaic on its tile', () => {
    expect(toNextActionRecommendation(gap)).toEqual({
      id: 'messier-gap:t51:2026-10-14',
      category: 'capture',
      priority: 'medium',
      title: 'M51 Whirlpool Galaxy · a Messier gap, up 5 h 15 m above 30° tonight',
      description: 'Nothing captured yet for your Messier mosaic. The moon is down while it is up.',
      targetId: 't51',
      targetName: 'M51 Whirlpool Galaxy',
      actionLabel: 'Open the Messier mosaic',
      actionTo: '/messier?m=51',
      dismissible: false
    })
    const closing = toMessierGapRecommendation({ ...gap, closesInDays: 6, moonSeparationDeg: 35 })
    expect(closing.priority).toBe('high')
    expect(closing.description).toBe('Nothing captured yet for your Messier mosaic. Its season closes in 6 days. The moon comes within 35°.')
  })
})

describe('Finding the mosaic', () => {
  it('[MES-013] Given the map of places, When the mosaic is looked up, Then it is a page under Targets, and its links open a tile only for a number from 1 to 110', () => {
    expect(NAV_ITEMS.find(i => i.id === 'messier')).toMatchObject({ to: '/messier', label: 'Messier mosaic' })
    expect(locate('/messier')).toMatchObject({ place: { label: 'Targets' }, item: { id: 'messier' }, detail: false })
    expect(messierLink()).toBe('/messier')
    expect(messierLink(31)).toBe('/messier?m=31')
    expect(messierNumberFrom('?m=31')).toBe(31)
    expect(messierNumberFrom('?m=1')).toBe(1)
    expect(messierNumberFrom('?m=110')).toBe(110)
    for (const bad of ['', '?m=0', '?m=111', '?m=3.5', '?m=abc', '?m=-4', '?m=1000', '?x=4']) expect(messierNumberFrom(bad)).toBeNull()
  })

  it('[MES-011] Given a picture request from the window, When validated, Then only a whole Messier number from 1 to 110 and a width from 32 to 512 pass', () => {
    expect(schemas['messier:picture'].parse({ number: 31 })).toEqual({ number: 31 })
    expect(schemas['messier:picture'].parse({ number: 110, max_width: 512 })).toEqual({ number: 110, max_width: 512 })
    for (const bad of [{ number: 0 }, { number: 111 }, { number: 2.5 }, { number: '31' }, { number: 31, max_width: 2048 }, { number: 31, max_width: 8 }, { path: '/etc/passwd' }]) {
      expect(() => schemas['messier:picture'].parse(bad)).toThrow()
    }
  })
})

describe('Saving the mosaic as an image', () => {
  it('[MES-009] Given 110 tiles, When laid out, Then they go eleven to a row in ten rows, each square with its label beneath', () => {
    const tiles = Array.from({ length: 110 }, (_, i) => ({ number: i + 1, designation: `M${i + 1}`, name: i === 0 ? 'Crab Nebula' : null }))
    const layout = mosaicLayout(tiles)
    expect(SAVED_COLUMNS).toBe(11)
    expect(layout).toMatchObject({ width: 2200, height: 10 * 234, tile: 200, label: 34 })
    expect(layout.cells[0]).toEqual({ number: 1, x: 0, y: 0, label: 'M1 · Crab Nebula' })
    expect(layout.cells[10]).toEqual({ number: 11, x: 2000, y: 0, label: 'M11' })
    expect(layout.cells[11]).toEqual({ number: 12, x: 0, y: 234, label: 'M12' })
    expect(layout.cells[109]).toEqual({ number: 110, x: 2000, y: 9 * 234, label: 'M110' })
  })

  it('[MES-009] Given a part of the catalogue and other sizes, When laid out, Then the rows round up and the sizes are used', () => {
    const layout = mosaicLayout([{ number: 3, designation: 'M3', name: null }, ...Array.from({ length: 11 }, (_, i) => ({ number: 10 + i, designation: `M${10 + i}`, name: null }))], 100, 20)
    expect(layout).toMatchObject({ width: 1100, height: 240 })
    expect(layout.cells[11]).toMatchObject({ number: 20, x: 0, y: 120 })
    expect(mosaicLayout([])).toMatchObject({ width: 2200, height: 0, cells: [] })
  })
})
