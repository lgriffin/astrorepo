import { expect } from 'vitest'
import { makeClearSkies, type ClearSkiesOutlook } from '@astro/application'
import type { ForecastHour } from '@astro/domain'
import { FakeEphemeris, FakeWeatherSource, FixedClock, InMemoryPlanningSettings, InMemoryWeatherSettings } from '@astro/testkit'
import { defineSteps, type DataTable } from '@astro/testkit/bdd'
import { toClearSkiesView } from '../../src/main/adapters/weather-presenter'
import type { ClearSkiesView } from '../../src/shared/types'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const HOUR = 3600 * 1000

const hour = (at: number, cloudPct: number): ForecastHour => ({
  at: new Date(at), hours: 1, cloudPct, precipChancePct: 0, humidityPct: 60, temperatureC: 8, dewPointC: 1
})

/** 20:00 UTC on the night's date: dusk on the meridian with the fake ephemeris's eight dark hours. */
const dusk = (night: string) => Date.parse(`${night}T20:00:00Z`)

class Home {
  readonly planning = new InMemoryPlanningSettings()
  readonly weather = new InMemoryWeatherSettings()
  readonly ephemeris = new FakeEphemeris(8)
  readonly clock = new FixedClock()
  readonly forecast = new FakeWeatherSource('Open-Meteo')
  readonly service = new FakeWeatherSource('Your weather service')
  readonly called: string[] = []
  outlook: ClearSkiesOutlook | null = null
  view: ClearSkiesView | null = null
}

const ok = (w: Home) => {
  if (w.view?.status !== 'ok') throw new Error(`Home shows no nights: ${w.view?.status}`)
  return w.view
}

export const weatherSteps = defineSteps(() => new Home(), ({ Given, When, Then }) => {
  Given('my site is on the Greenwich meridian', w => { w.planning.setSite({ latitudeDeg: 51.48, longitudeDeg: 0, elevationM: 0 }) })
  Given('it is {int}:{int} UTC on {int} {word} {int}', (w, h: number, m: number, day: number, month: string, year: number) => {
    w.clock.set(new Date(Date.UTC(year, MONTHS.indexOf(month), day, h, m)).toISOString())
  })
  Given('each night is dark from 20:00 to 04:00 UTC', () => undefined)

  Given('the forecast gives this cloud cover, hour by hour from dusk:', (w, table: DataTable) => {
    const hours = table.hashes().flatMap(row => row['cloud by hour'].split(',').map((c, i) => hour(dusk(row.night) + i * HOUR, Number(c))))
    w.forecast.answer({ hours })
  })
  Given('the forecast gives {int}% cloud all night, every night', (w, cloud: number) => {
    w.forecast.answer({ hours: Array.from({ length: 96 }, (_, i) => hour(Date.parse('2026-10-15T12:00:00Z') + i * HOUR, cloud)) })
  })
  Given('the forecast cannot be reached', w => { w.forecast.fail('could not be reached (ENOTFOUND)') })
  Given('the public forecast is turned off', w => { w.weather.setProvider(null) })
  Given('my weather service is at {string}', (w, address: string) => { w.weather.setServiceAddress(address) })
  Given('my weather service gives tonight a {int}% chance of rain and a {int}% chance of frost', (w, rain: number, frost: number) => {
    w.service.answer({ nights: [{ night: '2026-10-15', rainChance: rain / 100, frostChance: frost / 100, lowC: 2, cloudPct: null, brief: null }] })
  })
  Given('my weather service gives tonight {int}% cloud', (w, cloud: number) => {
    w.service.answer({ nights: [{ night: '2026-10-15', rainChance: 0.05, frostChance: 0.1, lowC: 4, cloudPct: cloud, brief: null }] })
  })

  When('I open Home', async w => {
    w.outlook = await makeClearSkies({
      planning: w.planning,
      weather: w.weather,
      ephemeris: w.ephemeris,
      clock: w.clock,
      publicSource: p => {
        w.called.push(p)
        return w.forecast
      },
      serviceSource: address => {
        w.called.push(address)
        return w.service
      }
    })()
    w.view = toClearSkiesView(w.outlook)
  })

  Then('the nights read:', (w, table: DataTable) => {
    expect(ok(w).nights.map(n => [n.night, n.headline])).toEqual(table.rows())
  })
  Then('the clear spell on {word} runs from {int}:{int} to {int}:{int} UTC', (w, night: string, h1: number, m1: number, h2: number, m2: number) => {
    const n = ok(w).nights.find(x => x.night === night)
    const clock = (iso: string | null | undefined) => iso?.slice(11, 16)
    const pad = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    expect([clock(n?.spellStart), clock(n?.spellEnd)]).toEqual([pad(h1, m1), pad(h2, m2)])
  })
  Then('tonight says {string}', (w, text: string) => { expect(ok(w).nights[0].notes).toContain(text) })
  Then('tonight reads {string}', (w, text: string) => { expect(ok(w).nights[0].headline).toBe(text) })
  Then('Home says {string}', (w, text: string) => {
    expect(ok(w).sources.filter(s => s.problem !== null).map(s => `${s.name} could not be used: ${s.problem}`)).toContain(text)
    expect(w.called).not.toContain('nas.local:1456')
  })
  Then('Home says the weather is off', w => {
    expect(w.view?.status).toBe('off')
    expect(w.called).toEqual([])
  })
})
