import { describe, expect, it } from 'vitest'
import { MessierRefusedError, NIGHT_SKY_CACHE, TILE_PICTURE_CACHE, makeListNextActions, makeMessierMosaic } from '@astro/application'
import type { MessierObject } from '@astro/application'
import type { NightSky, PictureCandidate, Site } from '@astro/domain'
import {
  FakeEphemeris,
  FakeTilePictures,
  FixedClock,
  InMemoryFrameCatalogue,
  InMemoryMessierCatalogue,
  InMemoryPlanningSettings,
  messierObject,
  stackAt,
  subs,
  target
} from '@astro/testkit'

const london = { latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 20 }

const finished = (path: string, modified = '2026-03-01T00:00:00Z'): PictureCandidate => ({ path, kind: 'finished', colour: null, modifiedAt: new Date(modified) })
const master = (path: string, colour = true, modified = '2026-02-01T00:00:00Z'): PictureCandidate => ({ path, kind: 'master', colour, modifiedAt: new Date(modified) })

/**
 * Six objects from London at the end of September: M31 high all night, M13 in the evening, M83
 * never above 30°, M87 a spring galaxy, M1 rising after midnight, M42 with no catalogue position.
 */
function setup(now = '2026-09-29T15:00:00Z') {
  const messier = new InMemoryMessierCatalogue().add(
    messierObject(87, { targetId: 'target-m-87', name: 'Virgo A', raHours: 12.51, decDeg: 12.39 }),
    messierObject(31, { targetId: 'target-m-31', name: 'Andromeda Galaxy', raHours: 0.71, decDeg: 41.27, constellation: 'Andromeda', magnitude: 3.4 }),
    messierObject(13, { targetId: 'target-m-13', name: 'Great Hercules Cluster', objectType: 'globular_cluster', raHours: 16.69, decDeg: 36.46 }),
    messierObject(83, { targetId: 'target-m-83', raHours: 13.62, decDeg: -29.87 }),
    messierObject(1, { targetId: 'target-m-1', name: 'Crab Nebula', objectType: 'supernova_remnant', raHours: 5.58, decDeg: 22.01 }),
    messierObject(42, { targetId: 'target-m-42', name: 'Orion Nebula', objectType: 'emission_nebula', raHours: null, decDeg: null })
  )
  const frames = new InMemoryFrameCatalogue()
    .add(target('M 31', { subs: subs(24, 300, '2026-09-20T21:00:00Z'), finalCount: 1 }))
    .add(target('M 13', { subs: subs(12, 300, '2026-08-01T21:00:00Z'), stacks: [stackAt('2026-08-02T10:00:00Z')] }))
    .add(target('M 1', { subs: subs(6, 300, '2026-09-25T01:00:00Z') }))
  const pictures = new FakeTilePictures()
  const settings = new InMemoryPlanningSettings(london, true)
  const ephemeris = new FakeEphemeris()
  const clock = new FixedClock(new Date(now))
  const mosaic = makeMessierMosaic({ messier, frames, pictures, settings, ephemeris, clock })
  return { messier, frames, pictures, settings, ephemeris, clock, mosaic }
}

describe('The Messier mosaic', () => {
  it('[MES-001] [MES-002] Given objects with finished images, stacks, lights and nothing, When the mosaic is put together, Then the tiles come in Messier order with their states, integration and first picture', async () => {
    const { mosaic, messier } = setup()
    messier.picture('target-m-31', finished('/img/m31.jpg'), master('/fits/m31.fit')).picture('target-m-13', master('/fits/m13.fit', false))
    const m = await mosaic.mosaic()
    expect(m.tiles.map(t => [t.number, t.state])).toEqual([
      [1, 'captured'],
      [13, 'stacked'],
      [31, 'imaged'],
      [42, 'gap'],
      [83, 'gap'],
      [87, 'gap']
    ])
    expect(m.catalogued).toBe(6)
    expect(m.summary).toMatchObject({ total: 110, imaged: 1, stacked: 1, captured: 1, gaps: 3 })
    const m31 = m.tiles.find(t => t.number === 31)!
    expect(m31).toMatchObject({ designation: 'M31', name: 'Andromeda Galaxy', targetId: 'target-m-31', constellation: 'Andromeda', magnitude: 3.4, integrationSec: 7200, picture: { name: 'm31.jpg', kind: 'finished' } })
    expect(m.tiles.find(t => t.number === 13)!.picture).toEqual({ name: 'm13.fit', kind: 'master' })
    expect(m.tiles.find(t => t.number === 87)).toMatchObject({ picture: null, integrationSec: 0 })
  })

  it('[MES-002] Given a finished image in an object’s folder that no scan has counted yet, When put together, Then the tile is imaged', async () => {
    const { mosaic, messier } = setup()
    messier.picture('target-m-1', finished('C:\\images\\M1\\crab.png'))
    const m1 = (await mosaic.mosaic()).tiles.find(t => t.number === 1)!
    expect(m1).toMatchObject({ state: 'imaged', picture: { name: 'crab.png', kind: 'finished' } })
  })

  it('[MES-002] Given a scan that counted a finished image since deleted, When put together, Then the tile is not imaged but stacked or captured from its frames', async () => {
    const { mosaic, frames } = setup()
    frames.add(target('M 87', { subs: subs(12, 300, '2026-04-01T21:00:00Z'), stacks: [stackAt('2026-04-02T10:00:00Z')], finalCount: 2 }))
    const m = await mosaic.mosaic()
    expect(m.tiles.find(t => t.number === 31)).toMatchObject({ state: 'captured', picture: null })
    expect(m.tiles.find(t => t.number === 87)).toMatchObject({ state: 'stacked', picture: null })
    expect(m.summary.imaged).toBe(0)
  })

  it('[MES-010] Given no site, When put together, Then every tile has its state and picture but no outlook, and no sky is worked out', async () => {
    const { mosaic, settings, ephemeris, messier } = setup()
    settings.setSite(null)
    messier.picture('target-m-31', finished('/img/m31.jpg'))
    const m = await mosaic.mosaic()
    expect(m).toMatchObject({ siteSet: false, night: null })
    expect(m.tiles.every(t => t.outlook === null && t.months.length === 0)).toBe(true)
    expect(m.tiles.find(t => t.number === 31)!.picture).not.toBeNull()
    expect(m.summary.missingUpTonight).toBe(0)
    expect(ephemeris.nightsRequested).toEqual([])
  })

  it('[MES-005] Given the site, When put together, Then each object says whether it is up tonight, in season later, or never, with 12 months of usable hours', async () => {
    const { mosaic } = setup()
    const m = await mosaic.mosaic()
    expect(m).toMatchObject({ siteSet: true, night: '2026-09-29' })
    const tile = (n: number) => m.tiles.find(t => t.number === n)!
    expect(tile(31).outlook).toMatchObject({ kind: 'tonight', moonSeparationDeg: null, closesInDays: null })
    expect((tile(31).outlook as { hours: number }).hours).toBeGreaterThan(6)
    expect(tile(83).outlook).toEqual({ kind: 'never' })
    const m87 = tile(87).outlook
    expect(m87?.kind).toBe('later')
    expect(m87?.kind === 'later' && m87.fromMonth < m87.bestMonth).toBe(true)
    expect(['2027-03', '2027-04', '2027-05']).toContain(m87?.kind === 'later' && m87.bestMonth)
    expect(tile(42).outlook).toBeNull()
    expect(tile(31).months).toHaveLength(12)
    expect(tile(31).months[0].month).toBe('2026-09')
    for (const t of m.tiles) for (const month of t.months) expect(month.inSeason).toBe(month.hoursPerNight >= 1)
    expect(m.summary.missingUpTonight).toBe(m.tiles.filter(t => t.state !== 'imaged' && t.outlook?.kind === 'tonight').length)
  })

  it('[MES-005] Given an object whose season closes within the month, When put together, Then its outlook says in how many days', async () => {
    // M13 from London: in the evening sky at the end of September, gone within weeks.
    const { mosaic } = setup()
    const m13 = (await mosaic.mosaic()).tiles.find(t => t.number === 13)!.outlook
    expect(m13?.kind).toBe('tonight')
    expect(m13?.kind === 'tonight' && m13.closesInDays).toBeGreaterThan(0)
    expect(m13?.kind === 'tonight' && m13.closesInDays).toBeLessThanOrEqual(30)
  })

  it('[MES-005] Given a bright moon tonight and no narrowband filter, When put together, Then objects up tonight are held back by the moon, and with a filter a nebula is not', async () => {
    const { mosaic, ephemeris, settings } = setup()
    ephemeris.setMoon('2026-09-29', { altitudeDeg: 40, illumination: 0.95, raHours: 10, decDeg: 10 })
    settings.setNarrowband(false)
    const tile = async (n: number) => (await mosaic.mosaic()).tiles.find(t => t.number === n)!.outlook
    expect((await tile(31))?.kind).toBe('moon')
    expect((await tile(1))?.kind).toBe('moon')
    settings.setNarrowband(true)
    expect((await tile(31))?.kind).toBe('moon')
    const crab = await tile(1)
    expect(crab?.kind).toBe('tonight')
    expect(crab?.kind === 'tonight' && crab.moonSeparationDeg).toBeGreaterThan(0)
  })

  it('[MES-005] Given the afternoon after a night’s darkness has ended, When put together, Then the coming night is the one described', async () => {
    const { mosaic } = setup('2026-09-30T05:00:00Z')
    expect((await mosaic.mosaic()).night).toBe('2026-09-30')
  })
})

describe('A tile’s picture', () => {
  it('[MES-003] Given finished images and masters, When a tile’s picture is drawn, Then the first in order is drawn as it is, at the width asked', async () => {
    const { mosaic, messier, pictures } = setup()
    messier.picture('target-m-31', master('/fits/m31.fit'), finished('/img/old.png', '2025-01-01T00:00:00Z'), finished('/img/m31.jpg'))
    pictures.add('/img/m31.jpg', { width: 2000, height: 1000 })
    const drawn = await mosaic.picture(31, 200)
    expect(drawn).toMatchObject({ ok: true, name: 'm31.jpg', kind: 'finished', mime: 'image/jpeg', width: 200, height: 100 })
    expect(pictures.asked).toEqual([{ path: '/img/m31.jpg', maxWidth: 200, stretch: false }])
  })

  it('[MES-003] Given only a master, When drawn, Then it is auto-stretched', async () => {
    const { mosaic, messier, pictures } = setup()
    messier.picture('target-m-13', master('/fits/m13.fit', false))
    pictures.add('/fits/m13.fit', { width: 100, height: 100 })
    expect(await mosaic.picture(13)).toMatchObject({ ok: true, kind: 'master', mime: 'image/png' })
    expect(pictures.asked[0]).toEqual({ path: '/fits/m13.fit', maxWidth: 256, stretch: true })
  })

  it('[MES-003] Given widths outside the range, When drawn, Then they are kept between 32 and 512 pixels', async () => {
    const { mosaic, messier, pictures } = setup()
    messier.picture('target-m-31', finished('/img/m31.png'))
    pictures.add('/img/m31.png', { width: 4000, height: 4000 })
    await mosaic.picture(31, 5)
    await mosaic.picture(31, 9000)
    await mosaic.picture(31, Number.NaN)
    await mosaic.picture(31, 100.4)
    expect(pictures.asked.map(a => a.maxWidth)).toEqual([32, 512, 100])
  })

  it('[MES-004] Given an image that cannot be drawn, When drawn, Then the next is tried, and when none draws the tile says why for each', async () => {
    const { mosaic, messier, pictures } = setup()
    messier.picture('target-m-31', finished('/img/m31.tif'), finished('/img/m31.jpg', '2026-05-01T00:00:00Z'), master('/fits/m31.fit'))
    pictures.failures.set('/img/m31.jpg', 'JPEG images are drawn by the desktop app only.')
    pictures.add('/fits/m31.fit', { width: 50, height: 50 })
    expect(await mosaic.picture(31)).toMatchObject({ ok: true, name: 'm31.fit', kind: 'master' })
    expect(pictures.asked.map(a => a.path)).toEqual(['/img/m31.jpg', '/img/m31.tif', '/fits/m31.fit'])
    pictures.failures.set('/fits/m31.fit', 'The header is truncated.')
    const { mosaic: fresh, messier: m2, pictures: p2 } = setup()
    m2.picture('target-m-31', finished('/img/a.jpg'), master('/fits/b.fit'))
    p2.failures.set('/img/a.jpg', 'Not decoded.')
    p2.failures.set('/fits/b.fit', 'The header is truncated.')
    expect(await fresh.picture(31)).toEqual({ ok: false, error: 'a.jpg: Not decoded. b.fit: The header is truncated.' })
  })

  it('[MES-003] Given an object with no image or not in the catalogue, When drawn, Then there is nothing to show and nothing is read', async () => {
    const { mosaic, pictures } = setup()
    expect(await mosaic.picture(87)).toBeNull()
    expect(await mosaic.picture(100)).toBeNull()
    expect(pictures.asked).toEqual([])
  })

  it.each([0, 111, 1.5, -3, Number.NaN])('[MES-011] Given the Messier number %s, When its picture is asked for, Then it is refused without reading the catalogue or any file', async n => {
    const { mosaic, messier, pictures } = setup()
    await expect(mosaic.picture(n)).rejects.toThrow(MessierRefusedError)
    await expect(mosaic.picture(n)).rejects.toThrow(/they run from 1 to 110/)
    expect(messier.asked).toEqual([])
    expect(pictures.asked).toEqual([])
  })

  it('[MES-012] Given a picture already drawn, When asked again, Then it is not drawn again until the file changes or the width differs', async () => {
    const { mosaic, messier, pictures } = setup()
    messier.picture('target-m-31', finished('/img/m31.png', '2026-03-01T00:00:00Z'))
    pictures.add('/img/m31.png', { width: 400, height: 400 })
    await mosaic.picture(31, 200)
    await mosaic.picture(31, 200)
    expect(pictures.asked).toHaveLength(1)
    await mosaic.picture(31, 100)
    expect(pictures.asked).toHaveLength(2)
    messier.images.set('target-m-31', [finished('/img/m31.png', '2026-04-01T00:00:00Z')])
    await mosaic.picture(31, 200)
    expect(pictures.asked).toHaveLength(3)
    messier.images.set('target-m-31', [{ ...finished('/img/m31.png'), modifiedAt: null }])
    await mosaic.picture(31, 200)
    await mosaic.picture(31, 200)
    expect(pictures.asked).toHaveLength(4)
  })

  it('[MES-012] Given more pictures than are kept, When the oldest is asked for again, Then it is drawn again and the newest is not', async () => {
    const { mosaic, messier, pictures } = setup()
    messier.picture('target-m-31', finished('/img/m31.png'))
    pictures.add('/img/m31.png', { width: 4000, height: 4000 })
    for (let w = 32; w < 32 + TILE_PICTURE_CACHE + 1; w++) await mosaic.picture(31, w)
    expect(pictures.asked).toHaveLength(TILE_PICTURE_CACHE + 1)
    await mosaic.picture(31, 32 + TILE_PICTURE_CACHE)
    expect(pictures.asked).toHaveLength(TILE_PICTURE_CACHE + 1)
    await mosaic.picture(31, 32)
    expect(pictures.asked).toHaveLength(TILE_PICTURE_CACHE + 2)
  })

  it('[MES-012] Given many tiles asking at once, When drawn, Then one picture is drawn at a time, and a failure does not stop the next', async () => {
    const { mosaic, messier, pictures } = setup()
    let inFlight = 0
    let most = 0
    const draw = pictures.draw.bind(pictures)
    pictures.draw = async (path, options) => {
      inFlight++
      most = Math.max(most, inFlight)
      await new Promise(resolve => setTimeout(resolve, 2))
      inFlight--
      return draw(path, options)
    }
    for (const n of [1, 13, 31]) {
      messier.picture(`target-m-${n}`, finished(`/img/m${n}.png`))
      if (n !== 13) pictures.add(`/img/m${n}.png`, { width: 10, height: 10 })
    }
    const drawn = await Promise.all([1, 13, 31].map(n => mosaic.picture(n)))
    expect(drawn.map(d => d?.ok)).toEqual([true, false, true])
    expect(most).toBe(1)
  })
})

describe('Messier gaps tonight', () => {
  it('[MES-008] Given uncaptured objects up tonight, When the gaps are asked for, Then only those come, best first, with their names, up to the limit', async () => {
    const { mosaic, messier } = setup()
    messier.add(messierObject(29, { targetId: 'target-m-29', name: 'Cooling Tower', objectType: 'open_cluster', raHours: 20.4, decDeg: 38.52 }))
    const gaps = await mosaic.gapsTonight()
    expect(gaps.map(g => g.number)).toEqual([29])
    expect(gaps[0]).toMatchObject({ designation: 'M29', targetId: 'target-m-29', targetName: 'M29 Cooling Tower' })
    expect(gaps[0].usableHours).toBeGreaterThan(1)
    messier.add(messierObject(39, { targetId: 'target-m-39', raHours: 21.53, decDeg: 48.43 }), messierObject(52, { targetId: 'target-m-52', raHours: 23.41, decDeg: 61.59 }))
    expect((await mosaic.gapsTonight(2)).length).toBe(2)
    expect((await mosaic.gapsTonight()).map(g => g.targetName).sort()).toEqual(['M29 Cooling Tower', 'M39', 'M52'])
    expect(await mosaic.gapsTonight(0)).toEqual([])
  })

  it('[MES-008] Given a gap whose finished image is already in its folder, When the gaps are asked for, Then it is left out and the next one takes its place', async () => {
    const { mosaic, messier } = setup()
    messier.add(messierObject(29, { targetId: 'target-m-29', raHours: 20.4, decDeg: 38.52 }), messierObject(39, { targetId: 'target-m-39', raHours: 21.53, decDeg: 48.43 }))
    messier.picture('target-m-39', finished('/img/m39.jpg')).picture('target-m-29', master('/fits/m29.fit'))
    expect((await mosaic.gapsTonight(1)).map(g => g.number)).toEqual([29])
  })

  it('[MES-008] Given no site, When the gaps are asked for, Then there are none and no sky is worked out', async () => {
    const { mosaic, settings, ephemeris } = setup()
    settings.setSite(null)
    expect(await mosaic.gapsTonight()).toEqual([])
    expect(ephemeris.nightsRequested).toEqual([])
  })

  it('[MES-008] Given the gaps for Next actions, When they are asked for, Then only tonight and the closing-season nights are worked out', async () => {
    const { mosaic, ephemeris } = setup()
    await mosaic.gapsTonight()
    expect(new Set(ephemeris.nightsRequested).size).toBe(35)
  })

  it('[MES-008] Given Next actions with the Messier gaps wired in, When listed, Then the gaps come before stacking, and a failure is reported without hiding the rest', async () => {
    const { mosaic, messier } = setup()
    messier.add(messierObject(29, { targetId: 'target-m-29', raHours: 20.4, decDeg: 38.52 }))
    const errors: unknown[] = []
    const stacking = async () => [{ kind: 'ready-to-stack' as const, id: 'r', targetId: 't', targetName: 'M 42', integrationSec: 7200, subCount: 24, nights: 2 }]
    const noPlan = async () => ({ status: 'no-site' as const })
    const actions = await makeListNextActions({ listStackingSuggestions: stacking, planForward: noPlan, listMessierGaps: () => mosaic.gapsTonight(3) })()
    expect(actions.map(a => a.kind)).toEqual(['messier-gap', 'stack'])
    const planErrors: unknown[] = []
    const failing = await makeListNextActions({ listStackingSuggestions: stacking, planForward: noPlan, listMessierGaps: () => Promise.reject(new Error('sky')), onPlanError: e => planErrors.push(e), onMessierError: e => errors.push(e) })()
    expect(failing.map(a => a.kind)).toEqual(['stack'])
    expect(errors).toEqual([new Error('sky')])
    expect(planErrors).toEqual([])
  })

  it('[MES-008] Given forward planning that fails, When Next actions are listed, Then no Messier gap claims to be up tonight and stacking still shows', async () => {
    const { mosaic, messier } = setup()
    messier.add(messierObject(29, { targetId: 'target-m-29', raHours: 20.4, decDeg: 38.52 }))
    expect((await mosaic.gapsTonight(3)).length).toBeGreaterThan(0)
    const planErrors: unknown[] = []
    const stacking = async () => [{ kind: 'ready-to-stack' as const, id: 'r', targetId: 't', targetName: 'M 42', integrationSec: 7200, subCount: 24, nights: 2 }]
    const actions = await makeListNextActions({ listStackingSuggestions: stacking, planForward: () => Promise.reject(new Error('ephemeris down')), listMessierGaps: () => mosaic.gapsTonight(3), onPlanError: e => planErrors.push(e) })()
    expect(actions.map(a => a.kind)).toEqual(['stack'])
    expect(planErrors).toHaveLength(1)
  })

  it('[MES-008] Given Home asking again for the same night and site, When the gaps are listed, Then no night sky is worked out again, and a new site works them out afresh', async () => {
    const { mosaic, ephemeris, settings, messier } = setup()
    messier.add(messierObject(29, { targetId: 'target-m-29', raHours: 20.4, decDeg: 38.52 }))
    const first = await mosaic.gapsTonight(3)
    const asked = ephemeris.nightsRequested.length
    expect(await mosaic.gapsTonight(3)).toEqual(first)
    expect(ephemeris.nightsRequested.length).toBe(asked)
    await mosaic.mosaic()
    const afterMosaic = ephemeris.nightsRequested.length
    await mosaic.mosaic()
    expect(ephemeris.nightsRequested.length).toBe(afterMosaic)
    settings.setSite({ latitudeDeg: 40.4, longitudeDeg: -3.7, elevationM: 650 })
    await mosaic.gapsTonight(3)
    expect(ephemeris.nightsRequested.length).toBeGreaterThan(afterMosaic)
  })
})

describe('The Messier mosaic, at its edges', () => {
  it('[MES-001] Given a catalogue that lists its objects out of order, When put together, Then the tiles still come in Messier order', async () => {
    const { messier, frames, pictures, settings, ephemeris, clock } = setup()
    const reversed = { objects: async (): Promise<MessierObject[]> => (await messier.objects()).reverse(), pictures: (id: string) => messier.pictures(id) }
    const m = await makeMessierMosaic({ messier: reversed, frames, pictures, settings, ephemeris, clock }).mosaic()
    expect(m.tiles.map(t => t.number)).toEqual([1, 13, 31, 42, 83, 87])
  })

  it('[MES-011] Given M 110 and M 1, the ends of the catalogue, When their pictures are asked for, Then neither is refused', async () => {
    const { mosaic, messier } = setup()
    messier.add(messierObject(110, { targetId: 'target-m-110', raHours: 0.67, decDeg: 41.69 }))
    await expect(mosaic.picture(110)).resolves.toBeNull()
    await expect(mosaic.picture(1)).resolves.toBeNull()
  })

  it('[MES-012] Given more pictures than are kept, When the second oldest is asked for again, Then it is still kept and not drawn again', async () => {
    const { mosaic, messier, pictures } = setup()
    messier.picture('target-m-31', finished('/img/m31.png'))
    pictures.add('/img/m31.png', { width: 4000, height: 4000 })
    for (let w = 32; w < 32 + TILE_PICTURE_CACHE + 1; w++) await mosaic.picture(31, w)
    await mosaic.picture(31, 33)
    expect(pictures.asked).toHaveLength(TILE_PICTURE_CACHE + 1)
  })

  it('[MES-005] Given the same night and site, When put together twice, Then each outlook is worked out once and reused, positioned or not', async () => {
    const { mosaic } = setup()
    const first = await mosaic.mosaic()
    const second = await mosaic.mosaic()
    for (const n of [31, 42, 87]) {
      expect(second.tiles.find(t => t.number === n)!.outlook).toBe(first.tiles.find(t => t.number === n)!.outlook)
      expect(second.tiles.find(t => t.number === n)!.months).toBe(first.tiles.find(t => t.number === n)!.months)
    }
  })

  it('[MES-005] Given the moon lit exactly to the bright-moon limit tonight, When put together, Then a galaxy is not held back by it, and just past the limit it is', async () => {
    const at = (illumination: number) => {
      const s = setup()
      s.ephemeris.setMoon('2026-09-29', { altitudeDeg: 40, illumination, raHours: 18, decDeg: -20 })
      return s.mosaic.mosaic()
    }
    expect((await at(0.6)).tiles.find(t => t.number === 31)!.outlook?.kind).toBe('tonight')
    expect((await at(0.61)).tiles.find(t => t.number === 31)!.outlook?.kind).toBe('moon')
  })

  it('[MES-007] Given a month whose nights average exactly the usable minimum, When put together, Then that month counts as in season', async () => {
    const { mosaic, messier } = setup()
    messier.add(messierObject(26, { targetId: 'target-m-26', raHours: 6, decDeg: -8 }))
    const november = (await mosaic.mosaic()).tiles.find(t => t.number === 26)!.months.find(m => m.month === '2026-11')!
    expect(november).toMatchObject({ hoursPerNight: 1, inSeason: true })
  })

  it('[MES-008] Given a night sky that failed to be worked out, When the gaps are listed again, Then it is worked out afresh rather than failing again', async () => {
    const { messier, frames, pictures, settings, clock } = setup()
    let failures = 1
    const ephemeris = new FakeEphemeris()
    const nightSky = ephemeris.nightSky.bind(ephemeris)
    ephemeris.nightSky = async (site: Site, night: string): Promise<NightSky | null> => {
      if (failures > 0) {
        failures--
        throw new Error('ephemeris down')
      }
      return nightSky(site, night)
    }
    const mosaic = makeMessierMosaic({ messier, frames, pictures, settings, ephemeris, clock })
    await expect(mosaic.gapsTonight(3)).rejects.toThrow('ephemeris down')
    await expect(mosaic.gapsTonight(3)).resolves.toBeInstanceOf(Array)
  })

  it(`[MES-008] Given Home refreshed day after day, When ${NIGHT_SKY_CACHE} nights have been worked out, Then all of them are still kept`, async () => {
    const { mosaic, clock, ephemeris } = setup()
    const day = (n: number) => clock.set(new Date(Date.parse('2026-09-29T15:00:00Z') + n * 24 * 3600 * 1000).toISOString())
    let d = 0
    for (; new Set(ephemeris.nightsRequested).size < NIGHT_SKY_CACHE; d++) {
      day(d)
      await mosaic.gapsTonight(3)
    }
    expect(new Set(ephemeris.nightsRequested).size).toBe(NIGHT_SKY_CACHE)
    const asked = ephemeris.nightsRequested.length
    day(0)
    await mosaic.gapsTonight(3)
    expect(ephemeris.nightsRequested.length).toBe(asked)
    day(d)
    await mosaic.gapsTonight(3)
    day(0)
    await mosaic.gapsTonight(3)
    expect(ephemeris.nightsRequested.slice(asked)).toContain('2026-09-29')
  })
})
