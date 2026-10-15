import { describe, expect, it } from 'vitest'
import type { NightOutlook } from '@astro/domain'
import { HEADLINES, WEATHER_NO_SITE_MESSAGE, WEATHER_OFF_MESSAGE, nightLabel, toClearSkiesView, toNightSkyView } from '../../src/main/adapters/weather-presenter'

const night = (over: Partial<NightOutlook> = {}): NightOutlook => ({
  night: '2026-10-16',
  verdict: 'clear',
  darkStart: new Date('2026-10-16T19:40:00Z'),
  darkEnd: new Date('2026-10-17T05:10:00Z'),
  darkHours: 9.5,
  clearHours: 8,
  longestSpell: { start: new Date('2026-10-16T20:00:00Z'), end: new Date('2026-10-17T04:00:00Z'), hours: 8 },
  cloudPct: 12,
  precipChancePct: 5,
  dew: false,
  moonPercent: 34,
  station: null,
  heldBackByStation: false,
  warnings: [],
  ...over
})

const site = { latitudeDeg: 53.35, longitudeDeg: -6.26, elevationM: 0 }

describe('weather presenter', () => {
  it('[WX-001] Given a clear night, When shown, Then it reads "Clear skies" with its dark window, cloud, rain, clear hours and moon', () => {
    expect(toNightSkyView(night(), 1)).toEqual({
      night: '2026-10-16',
      label: 'Fri 16 Oct',
      verdict: 'clear',
      headline: 'Clear skies',
      darkStart: '2026-10-16T19:40:00.000Z',
      darkEnd: '2026-10-17T05:10:00.000Z',
      spellStart: null,
      spellEnd: null,
      figures: ['Cloud 12%', 'Rain 5%', '8 h clear of 9 h 30 m dark', 'Moon 34% lit'],
      notes: [],
      warnings: []
    })
  })

  it('[WX-001] Given each verdict, When shown, Then its headline is the one Home uses, and the first night is "Tonight"', () => {
    expect(HEADLINES).toEqual({ clear: 'Clear skies', 'clear-spells': 'Clear spells', cloudy: 'Cloudy', 'no-forecast': 'No forecast yet', 'no-darkness': 'No dark window' })
    expect(nightLabel('2026-10-15', 0)).toBe('Tonight')
    expect(nightLabel('2026-10-18', 2)).toBe('Sun 18 Oct')
  })

  it('[WX-001] Given a night with clear spells, When shown, Then the longest clear stretch is given', () => {
    const v = toNightSkyView(night({ verdict: 'clear-spells' }), 0)
    expect([v.label, v.headline, v.spellStart, v.spellEnd]).toEqual(['Tonight', 'Clear spells', '2026-10-16T20:00:00.000Z', '2026-10-17T04:00:00.000Z'])
    expect(toNightSkyView(night({ verdict: 'clear-spells', longestSpell: null }), 0).spellStart).toBeNull()
  })

  it('[WX-004, WX-008] Given the service held a clear night back, dew and a warning, When shown, Then each is said in words', () => {
    const v = toNightSkyView(
      night({
        verdict: 'clear-spells',
        heldBackByStation: true,
        dew: true,
        station: { night: '2026-10-16', rainChance: 0.65, frostChance: 0.3, lowC: -0.6, cloudPct: 40.4, brief: null },
        warnings: [
          { level: 'orange', headline: 'Wind warning for Galway', onset: null, expiry: null },
          { level: 'unknown', headline: 'Fog', onset: null, expiry: null }
        ]
      }),
      0
    )
    expect(v.notes).toEqual([
      'The forecast is clear, but your weather service gives rain a 65% chance.',
      'Your weather service: rain 65%, frost 30%, low -1 °C, cloud 40%.',
      'Dew likely: keep the dew heater on.'
    ])
    expect(v.warnings).toEqual([
      { level: 'orange', text: 'Orange warning: Wind warning for Galway' },
      { level: 'unknown', text: 'Weather warning: Fog' }
    ])
  })

  it('[WX-004] Given a service night with nothing to say, When shown, Then no service line is added', () => {
    const v = toNightSkyView(night({ station: { night: '2026-10-16', rainChance: null, frostChance: null, lowC: null, cloudPct: null, brief: 'x' } }), 0)
    expect(v.notes).toEqual([])
  })

  it('[WX-007] Given a night with no forecast and one with no dark window, When shown, Then they have no figures but the moon where known', () => {
    const none = toNightSkyView(night({ verdict: 'no-forecast', clearHours: null, cloudPct: null, precipChancePct: null, longestSpell: null }), 2)
    expect([none.headline, none.figures]).toEqual(['No forecast yet', ['Moon 34% lit']])
    const light = toNightSkyView(night({ verdict: 'no-darkness', darkStart: null, darkEnd: null, darkHours: 0, clearHours: 0, cloudPct: null, precipChancePct: null, moonPercent: null }), 1)
    expect([light.headline, light.darkStart, light.figures]).toEqual(['No dark window', null, []])
  })

  it('[WX-010] Given no site or the weather turned off, When shown, Then each says what to set', () => {
    expect(toClearSkiesView({ status: 'no-site' })).toEqual({ status: 'no-site', message: WEATHER_NO_SITE_MESSAGE })
    expect(toClearSkiesView({ status: 'off' })).toEqual({ status: 'off', message: WEATHER_OFF_MESSAGE })
  })

  it('[WX-003, WX-006] Given the sources asked, When shown, Then those that answered are credited and those that failed keep their reason', () => {
    const view = toClearSkiesView({
      status: 'ok',
      site,
      nights: [night()],
      sources: [{ name: 'Open-Meteo', problem: null }, { name: 'Your weather service', problem: 'could not be reached' }]
    })
    expect(view).toMatchObject({ status: 'ok', credit: 'Forecast from Open-Meteo', sources: [{ name: 'Open-Meteo', problem: null }, { name: 'Your weather service', problem: 'could not be reached' }] })
    const both = toClearSkiesView({ status: 'ok', site, nights: [], sources: [{ name: 'MET Norway', problem: null }, { name: 'Your weather service', problem: null }] })
    expect(both).toMatchObject({ credit: 'Forecast from MET Norway and your weather service' })
    const none = toClearSkiesView({ status: 'ok', site, nights: [], sources: [{ name: 'Open-Meteo', problem: 'answered 500' }] })
    expect(none).toMatchObject({ credit: null })
  })
})
