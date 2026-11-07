import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { missingForecast, rowLinks, showClearSkies } from '../../src/shared/tonight-card'
import type { ClearSkiesView, NightSkyView, SkyInsightView } from '../../src/shared/types'
import fc from 'fast-check'
import { readCoordinates } from '../../src/shared/coordinates'
import { makeSaveSite } from '@astro/application'
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

  it('[EUX-001] Given a site, or answers still loading, When Home is drawn, Then Tonight (with its sky), Shoot tonight, Clear skies and Coming nights all show', () => {
    expect(homeCards(false, true)).toEqual(SITE_CARDS)
    expect(homeCards(null, null)).toEqual(SITE_CARDS)
    expect(SITE_CARDS).toEqual(['tonight', 'shoot', 'clear-skies', 'coming-nights'])
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

  it('[EUX-003] Given a coordinate with stray signs or marks, When pasted, Then it is refused rather than read in part', () => {
    for (const text of ['53+, 6', '53, 6-', '5-3, 6', '53..1, 6', '53.5°20′N, 6 W', '53°20.5′10″N, 6 W', 'N53 N, 6', '53 x, 6', '1 2 3 4, 5']) {
      expect(readCoordinates(text).ok, text).toBe(false)
    }
  })

  it('[EUX-003] Given a sign that disagrees with its hemisphere letter, When pasted, Then it is refused for latitude and longitude alike', () => {
    for (const text of ['-53 N, 6 E', '53 N, -6 E', '+53 S, 6 E', '53 N, +6 W', '-53 S, 6 E', '53 N, -6 W']) {
      expect(readCoordinates(text).ok, text).toBe(false)
    }
    expect(at('+53 N, +6 E')).toEqual([53, 6])
  })

  it('[EUX-003] Given a value a fraction of a second past the range, When pasted, Then it is refused rather than rounded into range', () => {
    expect(at('90°0′0.001″N, 0')).toContain('Latitude runs from -90')
    expect(at('0, 180°0′0.001″E')).toContain('Longitude runs from -180')
    expect(at('90°0′0″N, 180°0′0″W')).toEqual([90, -180])
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

describe('Saving the site (spec 046)', () => {
  it('[EUX-003] Given a site out of range, When it is saved, Then it is refused and nothing is written', async () => {
    const saved: number[][] = []
    const saveSite = makeSaveSite({ writer: { saveLocation: async (lat, lon) => { saved.push([lat, lon]) } } })
    await expect(saveSite(91, 0)).rejects.toThrow('Latitude runs from -90')
    await expect(saveSite(0, Number.NaN)).rejects.toThrow()
    await expect(saveSite(53.35, -6.26)).resolves.toEqual({ saved: true })
    expect(saved).toEqual([[53.35, -6.26]])
  })
})

const repo = path.resolve(__dirname, '../..')

describe('One Tonight card (spec 046, U2)', () => {
  type Sky = Extract<SkyInsightView, { status: 'ok' }>
  const insight = (cloud: Partial<Sky['cloud']> = {}): SkyInsightView => ({
    status: 'ok',
    night: '2026-11-07',
    faint: 'good',
    faintLabel: 'Good',
    summary: 'A good night for faint targets.',
    dark: null,
    moon: null,
    cloud: { state: 'forecast', headline: 'Clear', cloudPct: 10, detail: '8 h clear of 9 h dark', dew: false, ...cloud },
    sky: null
  })
  const night = (verdict: NightSkyView['verdict']): NightSkyView => ({
    night: '2026-11-07', label: 'Tonight', verdict, headline: '', darkStart: null, darkEnd: null, spellStart: null, spellEnd: null, figures: [], notes: [], warnings: []
  })
  const outlook = (verdicts: NightSkyView['verdict'][], sources: { name: string; problem: string | null }[] = [{ name: 'Open-Meteo', problem: null }]): ClearSkiesView =>
    ({ status: 'ok', nights: verdicts.map(night), sources, credit: null })

  it('[EUX-004] Given Home, When it is drawn, Then tonight’s sky is part of the Tonight card and has no card of its own', () => {
    const home = fs.readFileSync(path.join(repo, 'src/renderer/pages/Dashboard.tsx'), 'utf8')
    const hero = fs.readFileSync(path.join(repo, 'src/renderer/components/cockpit/TonightHero.tsx'), 'utf8')
    expect(home).not.toMatch(/title="Tonight’s sky"|SkyInsightCard/)
    expect(home).toContain('insight={insight === FAILED')
    for (const part of ['<NightStripBar', '<BortleScale', '<CloudFact', 'label="Your sky"', 'FAINT_TONE[sky.faint]']) expect(hero, part).toContain(part)
    // Dark and Moon are each drawn once, the sky's figures under the plan's.
    expect(hero.match(/label="Moon"/g)).toHaveLength(1)
    expect(hero.match(/label=\{DARK_LABEL/g)).toHaveLength(1)
  })

  it('[EUX-005] Given the forecast off or unreadable, When Tonight is drawn, Then the Cloud says so once with the reason and where to fix it', () => {
    expect(missingForecast({ status: 'off', message: 'off' }, null)).toEqual({ headline: 'Forecast off', reason: expect.stringContaining('Settings → Weather'), settings: true })
    expect(missingForecast(null, insight({ state: 'off', cloudPct: null }))?.headline).toBe('Forecast off')
    const failing = outlook(['no-forecast'], [{ name: 'Open-Meteo', problem: 'timed out' }])
    expect(missingForecast(failing, null)).toEqual({ headline: 'Forecast unavailable', reason: 'Open-Meteo could not be used: timed out', settings: true })
    expect(missingForecast(null, insight({ state: 'unavailable', cloudPct: null }))?.reason).toBe('The forecast could not be read just now.')
  })

  it('[EUX-005] Given no forecast reaching tonight yet, When Tonight is drawn, Then the Cloud says why; with a forecast, nothing is missing', () => {
    expect(missingForecast(outlook(['no-forecast']), insight({ cloudPct: null, headline: 'No forecast yet', detail: 'The forecast stops at 23:00.' }))).toEqual({ headline: 'No forecast yet', reason: 'The forecast stops at 23:00.', settings: false })
    expect(missingForecast(outlook(['no-forecast']), null)?.headline).toBe('No forecast yet')
    expect(missingForecast(outlook(['clear']), insight())).toBeNull()
    expect(missingForecast(null, null)).toBeNull()
  })

  it('[EUX-005] Given the forecast off or no night forecast, When Home is drawn, Then Clear skies is left out rather than say it again', () => {
    expect(showClearSkies({ status: 'off', message: 'off' })).toBe(false)
    expect(showClearSkies(outlook(['no-forecast', 'no-forecast', 'no-forecast']))).toBe(false)
    expect(showClearSkies(outlook(['no-forecast', 'clear', 'cloudy']))).toBe(true)
    expect(showClearSkies(null)).toBe(true)
    expect(showClearSkies('failed')).toBe(true)
  })

  it('[EUX-006] Given rows of Home’s lists, When each is drawn, Then its title opens its target and a button stays only for somewhere else to go', () => {
    expect(rowLinks({ targetId: 't-m31', actionLabel: 'Open target' })).toEqual({ titleTo: '/targets/t-m31', button: null })
    expect(rowLinks({ targetId: 't-m31', actionLabel: 'Open the stacking plan', actionTo: '/targets/t-m31?tab=process' })).toEqual({
      titleTo: '/targets/t-m31',
      button: { label: 'Open the stacking plan', to: '/targets/t-m31?tab=process' }
    })
    expect(rowLinks({ targetId: 't-m31', actionLabel: 'Advance stage' }).button).toEqual({ label: 'Advance stage', to: '/targets/t-m31' })
    expect(rowLinks({ targetId: null, actionLabel: null })).toEqual({ titleTo: null, button: null })
    const home = fs.readFileSync(path.join(repo, 'src/renderer/pages/Dashboard.tsx'), 'utf8')
    expect(home).toContain('const { titleTo, button } = rowLinks(rec)')
  })
})
