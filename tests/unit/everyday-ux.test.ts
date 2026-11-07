import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { readCoordinates } from '../../src/shared/coordinates'
import { SITE_CARDS, homeCards, siteMissing } from '../../src/shared/home'

describe('Home asks for the site once (spec 046)', () => {
  it('[EUX-001] Given no site, When Home is drawn with Get set up on show, Then none of the cards that need a site is shown', () => {
    expect(homeCards(true, true)).toEqual([])
  })

  it('[EUX-001] Given no site and Get set up hidden, When Home is drawn, Then one site prompt stands in for those cards', () => {
    expect(homeCards(true, false)).toEqual(['site-prompt'])
  })

  it('[EUX-001] Given no site and Get set up not read yet, When Home is drawn, Then no prompt is shown rather than two', () => {
    expect(homeCards(true, null)).toEqual([])
  })

  it('[EUX-001] Given a site, or answers still loading, When Home is drawn, Then Tonight, Tonight’s sky, Shoot tonight, Clear skies and Coming nights all show', () => {
    expect(homeCards(false, true)).toEqual(SITE_CARDS)
    expect(homeCards(null, null)).toEqual(SITE_CARDS)
    expect(SITE_CARDS).toEqual(['tonight', 'sky', 'shoot', 'clear-skies', 'coming-nights'])
  })

  it('[EUX-001] Given the answers Home reads, When any says no site, Then the site is missing; when one is worked out for a site, it is not', () => {
    expect(siteMissing([null, 'no-site', undefined])).toBe(true)
    expect(siteMissing(['ok', null, null])).toBe(false)
    expect(siteMissing([null, null, null])).toBeNull()
    expect(siteMissing(['ok', 'no-site'])).toBe(true)
  })
})

describe('Pasting coordinates (spec 046)', () => {
  const at = (text: string) => {
    const r = readCoordinates(text)
    return r.ok ? [r.latitude, r.longitude] : r.problem
  }

  it('[EUX-002] Given a pair copied from a map, When pasted, Then latitude and longitude are filled', () => {
    expect(at('53.3498, -6.2603')).toEqual([53.3498, -6.2603])
    expect(at('  53.35,-6.26 ')).toEqual([53.35, -6.26])
    expect(at('53.35 -6.26')).toEqual([53.35, -6.26])
    expect(at('-33.8688; 151.2093')).toEqual([-33.8688, 151.2093])
  })

  it('[EUX-002] Given a map link, When pasted, Then the coordinates after @ are read', () => {
    expect(at('https://www.google.com/maps/place/Dublin/@53.3498,-6.2603,12z/data=x')).toEqual([53.3498, -6.2603])
  })

  it('[EUX-002] Given hemisphere letters or degrees, minutes and seconds, When pasted, Then south and west are negative', () => {
    expect(at('53.35 N, 6.26 W')).toEqual([53.35, -6.26])
    expect(at('53.35°N 6.26°W')).toEqual([53.35, -6.26])
    expect(at('53°20′59″N 6°15′37″W')).toEqual([53.349722, -6.260278])
    expect(at(`53°20'59"N, 6°15'37"W`)).toEqual([53.349722, -6.260278])
    expect(at('33 52 8 S 151 12 33 E')).toEqual([-33.868889, 151.209167])
  })

  it('[EUX-002] Given longitude written first with its letter, When pasted, Then the letters decide which is which', () => {
    expect(at('6.26 W, 53.35 N')).toEqual([53.35, -6.26])
  })

  it('[EUX-003] Given text that is not two coordinates, When pasted, Then it is refused with a problem and nothing is filled', () => {
    for (const text of ['', 'Dublin', '53.35', '1, 2, 3', '53.35 N, 6.26 S', '-53.35 S, 6 E', 'abc, def']) {
      expect(readCoordinates(text).ok, text).toBe(false)
    }
    expect(at('Dublin')).toContain('Paste a latitude and a longitude')
  })

  it('[EUX-003] Given coordinates out of range, When pasted, Then they are refused naming the range', () => {
    expect(at('91, 10')).toContain('Latitude runs from -90')
    expect(at('45, 181')).toContain('Longitude runs from -180')
    expect(at('53°61′0″N 6°0′0″W')).toContain('Minutes and seconds')
  })

  it('[EUX-002] Given any decimal pair in range, When written as "lat, lon" and pasted, Then it reads back the same', () => {
    fc.assert(fc.property(
      fc.double({ min: -90, max: 90, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true }),
      (lat, lon) => {
        const r = readCoordinates(`${lat.toFixed(5)}, ${lon.toFixed(5)}`)
        return r.ok && Math.abs(r.latitude - Number(lat.toFixed(5))) < 1e-9 && Math.abs(r.longitude - Number(lon.toFixed(5))) < 1e-9
      }
    ))
  })

  it('[EUX-003] Given any text at all, When pasted, Then reading it never throws and never gives a value out of range', () => {
    fc.assert(fc.property(fc.string(), text => {
      const r = readCoordinates(text)
      return !r.ok || (Math.abs(r.latitude) <= 90 && Math.abs(r.longitude) <= 180)
    }))
  })
})
