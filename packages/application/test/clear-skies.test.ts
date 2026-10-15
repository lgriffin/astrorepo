import { describe, expect, it } from 'vitest'
import { makeClearSkies, makeWeatherCache, CLEAR_SKIES_NIGHTS, type ClearSkiesOutlook, type WeatherSource } from '../src'
import { FakeEphemeris, FakeWeatherSource, FixedClock, InMemoryPlanningSettings, InMemoryWeatherSettings } from '@astro/testkit'
import type { ForecastHour, PublicWeatherProvider, Site, WeatherReport } from '@astro/domain'

const HOUR = 3600 * 1000
const greenwich: Site = { latitudeDeg: 51.48, longitudeDeg: 0, elevationM: 0 }

/** Hourly forecasts at one cloud cover from 18:00 UTC on the first night for `count` hours. */
function hourly(cloudPct: number, from = '2026-10-15T18:00:00Z', count = 72): ForecastHour[] {
  return Array.from({ length: count }, (_, i) => ({
    at: new Date(Date.parse(from) + i * HOUR),
    hours: 1,
    cloudPct,
    precipChancePct: 0,
    humidityPct: 60,
    temperatureC: 8,
    dewPointC: 1
  }))
}

class World {
  readonly planning = new InMemoryPlanningSettings(greenwich)
  readonly weather = new InMemoryWeatherSettings()
  readonly ephemeris = new FakeEphemeris()
  readonly clock = new FixedClock(new Date('2026-10-15T15:00:00Z'))
  readonly openMeteo = new FakeWeatherSource('Open-Meteo')
  readonly metNorway = new FakeWeatherSource('MET Norway')
  readonly services = new Map<string, FakeWeatherSource>()
  readonly built: string[] = []

  service(address: string): FakeWeatherSource {
    let s = this.services.get(address)
    if (!s) {
      s = new FakeWeatherSource('Your weather service', `service:${address}`)
      this.services.set(address, s)
    }
    return s
  }

  run(): Promise<ClearSkiesOutlook> {
    return makeClearSkies({
      planning: this.planning,
      weather: this.weather,
      ephemeris: this.ephemeris,
      clock: this.clock,
      publicSource: (p: PublicWeatherProvider) => {
        this.built.push(p)
        return p === 'met-norway' ? this.metNorway : this.openMeteo
      },
      serviceSource: address => {
        this.built.push(address)
        return this.service(address)
      }
    })()
  }
}

const ok = (o: ClearSkiesOutlook) => {
  if (o.status !== 'ok') throw new Error(`no outlook: ${o.status}`)
  return o
}

describe('makeClearSkies', () => {
  it('[WX-010] Given no site, When the outlook is asked, Then it says so and asks no weather source', async () => {
    const w = new World()
    w.planning.setSite(null)
    expect(await w.run()).toEqual({ status: 'no-site' })
    expect(w.built).toEqual([])
    expect(w.ephemeris.nightsRequested).toEqual([])
  })

  it('[WX-010] Given the public forecast turned off and no service, When the outlook is asked, Then it says weather is off and asks no source', async () => {
    const w = new World()
    w.weather.setProvider(null).setServiceAddress('  ')
    expect(await w.run()).toEqual({ status: 'off' })
    expect(w.built).toEqual([])
  })

  it('[WX-001] Given a clear forecast, When the outlook is asked in the afternoon, Then tonight and the next two nights are clear skies', async () => {
    const w = new World()
    w.openMeteo.answer({ hours: hourly(5) })
    const o = ok(await w.run())
    expect(CLEAR_SKIES_NIGHTS).toBe(3)
    expect(o.nights.map(n => [n.night, n.verdict])).toEqual([
      ['2026-10-15', 'clear'],
      ['2026-10-16', 'clear'],
      ['2026-10-17', 'clear']
    ])
    expect(o.site).toEqual(greenwich)
    expect(o.sources).toEqual([{ name: 'Open-Meteo', problem: null }])
    expect(w.openMeteo.sitesAsked).toEqual([greenwich])
  })

  it('[WX-001] Given the morning after a night\'s darkness ended, When the outlook is asked, Then it starts from the coming evening', async () => {
    const w = new World()
    w.clock.set('2026-10-16T05:00:00Z')
    w.openMeteo.answer({ hours: hourly(5) })
    expect(ok(await w.run()).nights.map(n => n.night)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18'])
  })

  it('[WX-003] Given MET Norway chosen, When the outlook is asked, Then MET Norway is asked and Open-Meteo is not', async () => {
    const w = new World()
    w.weather.setProvider('met-norway')
    w.metNorway.answer({ hours: hourly(90) })
    const o = ok(await w.run())
    expect(w.built).toEqual(['met-norway'])
    expect(o.sources).toEqual([{ name: 'MET Norway', problem: null }])
    expect(o.nights[0].verdict).toBe('cloudy')
    expect(w.openMeteo.sitesAsked).toEqual([])
  })

  it('[WX-004] Given the user\'s service too, When the outlook is asked, Then both are asked and the service\'s rain holds back tonight', async () => {
    const w = new World()
    w.weather.setServiceAddress('http://nas.local:1456/')
    w.openMeteo.answer({ hours: hourly(5) })
    w.service('http://nas.local:1456').answer({
      nights: [{ night: '2026-10-15', rainChance: 0.7, frostChance: 0.1, lowC: 4, cloudPct: null, brief: null }]
    })
    const o = ok(await w.run())
    expect(w.built).toEqual(['open-meteo', 'http://nas.local:1456'])
    expect(o.sources).toEqual([{ name: 'Open-Meteo', problem: null }, { name: 'Your weather service', problem: null }])
    expect(o.nights.map(n => n.verdict)).toEqual(['clear-spells', 'clear', 'clear'])
    expect(o.nights[0].heldBackByStation).toBe(true)
  })

  it('[WX-004, WX-007] Given only the user\'s service, giving tonight\'s cloud, When the outlook is asked, Then tonight is judged from it and later nights have no forecast', async () => {
    const w = new World()
    w.weather.setProvider(null).setServiceAddress('http://nas.local:1456')
    w.service('http://nas.local:1456').answer({ nights: [{ night: '2026-10-15', rainChance: 0.1, frostChance: 0.6, lowC: -1, cloudPct: 10, brief: null }] })
    const o = ok(await w.run())
    expect(o.sources).toEqual([{ name: 'Your weather service', problem: null }])
    expect(o.nights.map(n => n.verdict)).toEqual(['clear', 'no-forecast', 'no-forecast'])
  })

  it('[WX-006] Given the public provider fails, When the outlook is asked, Then it is named with why and the service\'s night still counts', async () => {
    const w = new World()
    w.weather.setServiceAddress('http://nas.local:1456')
    w.openMeteo.fail('could not be reached (ENOTFOUND)')
    w.service('http://nas.local:1456').answer({ nights: [{ night: '2026-10-15', rainChance: 0, frostChance: 0, lowC: 1, cloudPct: 90, brief: null }] })
    const o = ok(await w.run())
    expect(o.sources).toEqual([
      { name: 'Open-Meteo', problem: 'could not be reached (ENOTFOUND)' },
      { name: 'Your weather service', problem: null }
    ])
    expect(o.nights[0].verdict).toBe('cloudy')
  })

  it('[WX-006] Given a source failing with no reason or a very long one, When the outlook is asked, Then a reason is still given and kept short', async () => {
    const w = new World()
    w.openMeteo.fail('   ')
    expect(ok(await w.run()).sources[0].problem).toBe('it gave no reason')
    w.openMeteo.fail('x'.repeat(500))
    expect(ok(await w.run()).sources[0].problem).toHaveLength(200)
    const odd: WeatherSource = { id: 'odd', name: 'Odd', forecast: () => Promise.reject('plain text') }
    const o = await makeClearSkies({ planning: w.planning, weather: w.weather, ephemeris: w.ephemeris, clock: w.clock, publicSource: () => odd, serviceSource: () => odd })()
    expect(ok(o).sources).toEqual([{ name: 'Odd', problem: 'plain text' }])
  })

  it('[WX-005] Given a service address that is not http or https, When the outlook is asked, Then it is not called and the problem is named', async () => {
    const w = new World()
    w.weather.setServiceAddress('nas.local:1456')
    w.openMeteo.answer({ hours: hourly(5) })
    const o = ok(await w.run())
    expect(w.built).toEqual(['open-meteo'])
    expect(o.sources[1]).toEqual({ name: 'Your weather service', problem: '"nas.local:1456" is not an http or https address, such as http://nas.local:1456' })
    expect(o.nights[0].verdict).toBe('clear')
  })

  it('[WX-001] Given a night with no dark window, When the outlook is asked, Then that night says so', async () => {
    const w = new World()
    w.ephemeris.noDarkness('2026-10-16')
    w.openMeteo.answer({ hours: hourly(5) })
    expect(ok(await w.run()).nights.map(n => n.verdict)).toEqual(['clear', 'no-darkness', 'clear'])
  })
})

describe('makeWeatherCache', () => {
  const report = (cloudPct: number): WeatherReport => ({ hours: hourly(cloudPct, '2026-10-15T18:00:00Z', 1), nights: [], warnings: [] })

  it('[WX-009] Given an answer, When asked again within the time kept, Then the source is not asked again, and is after it', async () => {
    let now = 0
    const cache = makeWeatherCache(() => now, 30 * 60_000)
    const fake = new FakeWeatherSource('Open-Meteo').answer(report(5))
    const cached = cache(fake)
    expect(cached.id).toBe(fake.id)
    expect(cached.name).toBe('Open-Meteo')
    await cached.forecast(greenwich)
    now = 30 * 60_000 - 1
    await cache(fake).forecast(greenwich)
    expect(fake.sitesAsked).toHaveLength(1)
    now = 30 * 60_000
    await cache(fake).forecast(greenwich)
    expect(fake.sitesAsked).toHaveLength(2)
  })

  it('[WX-009] Given two callers at once, When both ask, Then they share one request', async () => {
    const cache = makeWeatherCache(() => 0, 60_000)
    const fake = new FakeWeatherSource('Open-Meteo').answer(report(5))
    const [a, b] = await Promise.all([cache(fake).forecast(greenwich), cache(fake).forecast(greenwich)])
    expect(a).toBe(b)
    expect(fake.sitesAsked).toHaveLength(1)
  })

  it('[WX-009] Given a different site, source or service address, When asked, Then each is asked afresh', async () => {
    const cache = makeWeatherCache(() => 0, 60_000)
    const a = new FakeWeatherSource('Your weather service', 'service:http://a').answer(report(5))
    const b = new FakeWeatherSource('Your weather service', 'service:http://b').answer(report(6))
    await cache(a).forecast(greenwich)
    await cache(a).forecast({ ...greenwich, latitudeDeg: 51.5 })
    // Within the rounding sent to the source, the site is the same one.
    await cache(a).forecast({ ...greenwich, latitudeDeg: 51.4801 })
    const answer = await cache(b).forecast(greenwich)
    expect(a.sitesAsked).toHaveLength(2)
    expect(answer.hours[0].cloudPct).toBe(6)
  })

  it('[WX-009] Given a request that failed, When asked again, Then the failure is not kept and the source is asked again', async () => {
    const cache = makeWeatherCache(() => 0, 60_000)
    const fake = new FakeWeatherSource('Open-Meteo').fail('could not be reached')
    await expect(cache(fake).forecast(greenwich)).rejects.toThrow('could not be reached')
    fake.answer(report(5))
    expect((await cache(fake).forecast(greenwich)).hours).toHaveLength(1)
    expect(fake.sitesAsked).toHaveLength(2)
  })

  it('[WX-009] Given a failure that settles after a newer request replaced it, When it settles, Then the newer answer is kept', async () => {
    let now = 0
    const cache = makeWeatherCache(() => now, 1000)
    let rejectFirst: (e: Error) => void = () => undefined
    let calls = 0
    const slow: WeatherSource = {
      id: 'slow',
      name: 'Slow',
      forecast: () => {
        calls++
        return calls === 1 ? new Promise<WeatherReport>((_, reject) => { rejectFirst = reject }) : Promise.resolve(report(7))
      }
    }
    const first = cache(slow).forecast(greenwich)
    now = 1000
    await cache(slow).forecast(greenwich)
    rejectFirst(new Error('late failure'))
    await expect(first).rejects.toThrow('late failure')
    await cache(slow).forecast(greenwich)
    expect(calls).toBe(2)
  })
})
