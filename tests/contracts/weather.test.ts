import { afterEach, describe, expect, it } from 'vitest'
import { FakeWeatherSource, InMemoryWeatherSettings } from '@astro/testkit'
import {
  SEED_HOURS,
  SEED_SERVICE,
  weatherSettingsContract,
  weatherSourceContract,
  type WeatherSeed
} from '@astro/testkit/contracts/weather.contract'
import type { WeatherReport } from '@astro/domain'
import {
  MetNorwaySource,
  OpenMeteoSource,
  WEATHER_USER_AGENT,
  WeatherServiceSource,
  httpJson,
  publicWeatherSource
} from '../../src/main/adapters/http-weather'
import { SqliteWeatherSettings, WEATHER_KEYS, WEATHER_PROVIDER_OFF } from '../../src/main/adapters/sqlite-weather-settings'
import { TestHttpServer, deadHttpAddress } from '../helpers/http-server'
import { setupTestDb, teardownTestDb } from '../helpers/setup'

const servers: TestHttpServer[] = []
afterEach(async () => {
  for (const s of servers.splice(0)) await s.stop()
  teardownTestDb()
})

async function serve(body: unknown): Promise<{ server: TestHttpServer; base: string }> {
  const server = new TestHttpServer().answer(body)
  servers.push(server)
  return { server, base: await server.start() }
}

const site = { latitudeDeg: 53.34981, longitudeDeg: -6.26031, elevationM: 20 }

/** The seed as Open-Meteo's hourly JSON. */
const openMeteoJson = (r: WeatherReport) => ({
  latitude: 53.35,
  longitude: -6.26,
  hourly_units: { time: 'unixtime' },
  hourly: {
    time: r.hours.map(h => h.at.getTime() / 1000),
    cloud_cover: r.hours.map(h => h.cloudPct),
    precipitation_probability: r.hours.map(h => h.precipChancePct),
    relative_humidity_2m: r.hours.map(h => h.humidityPct),
    temperature_2m: r.hours.map(h => h.temperatureC),
    dew_point_2m: r.hours.map(h => h.dewPointC)
  }
})

/** The seed as MET Norway's locationforecast 2.0 `complete` JSON. */
const metNorwayJson = (r: WeatherReport) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-6.26, 53.35, 20] },
  properties: {
    meta: { updated_at: '2026-10-15T18:00:00Z' },
    timeseries: r.hours.map(h => ({
      time: h.at.toISOString().replace('.000Z', 'Z'),
      data: {
        instant: {
          details: {
            air_temperature: h.temperatureC,
            cloud_area_fraction: h.cloudPct,
            dew_point_temperature: h.dewPointC,
            relative_humidity: h.humidityPct
          }
        },
        next_1_hours: { summary: { symbol_code: 'clearsky_night' }, details: { probability_of_precipitation: h.precipChancePct } }
      }
    }))
  }
})

/** The seed as weatherlink_website's GET /api/v1/forecast. */
const serviceJson = (r: WeatherReport) => {
  const n = r.nights[0]
  return {
    forecast: {
      source: 'spark',
      receivedAt: '2026-10-15T17:00:00.000Z',
      stale: false,
      payload: {
        evening: { date: n.night, night_min: n.lowC, night_min_range: [0, 3], frost_chance: n.frostChance, rain_next_24h_chance: n.rainChance, cloud_night: n.cloudPct },
        brief: n.brief
      }
    },
    warnings: r.warnings.map(w => ({
      level: w.level,
      type: 'Wind',
      headline: w.headline,
      description: '',
      onset: w.onset?.toISOString() ?? null,
      expiry: w.expiry?.toISOString() ?? null,
      regions: []
    }))
  }
}

/** A source over the test server: the seed encoded as the provider sends it, a dead port, or text that is not JSON. */
async function overHttp(seed: WeatherSeed, encode: (r: WeatherReport) => unknown, build: (base: string) => import('@astro/application').WeatherSource) {
  if (seed === 'unreachable') return build(await deadHttpAddress())
  const { base } = await serve(seed === 'unreadable' ? { body: '<html>Bad gateway</html>', contentType: 'text/html' } : encode(seed))
  return build(base)
}

const fake = (name: string) => (seed: WeatherSeed) => {
  const source = new FakeWeatherSource(name)
  if (seed === 'unreachable') return source.fail('could not be reached')
  if (seed === 'unreadable') return source.fail('did not answer with JSON')
  return source.answer(seed)
}

weatherSourceContract('scripted forecast', 'hours', fake('Open-Meteo'))
weatherSourceContract('scripted service', 'nights', fake('Your weather service'))
weatherSourceContract('Open-Meteo', 'hours', seed => overHttp(seed, openMeteoJson, base => new OpenMeteoSource(base)))
weatherSourceContract('MET Norway', 'hours', seed => overHttp(seed, metNorwayJson, base => new MetNorwaySource(base)))
weatherSourceContract('weatherlink_website', 'nights', seed => overHttp(seed, serviceJson, base => new WeatherServiceSource(base)))

weatherSettingsContract('in-memory', seed =>
  new InMemoryWeatherSettings(seed.provider === undefined ? 'open-meteo' : seed.provider, seed.address ?? null)
)
weatherSettingsContract('SQLite', seed => {
  const db = setupTestDb()
  const set = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
  if (seed.provider !== undefined) set.run(WEATHER_KEYS.provider, seed.provider ?? WEATHER_PROVIDER_OFF)
  if (seed.address) set.run(WEATHER_KEYS.service, seed.address)
  return new SqliteWeatherSettings(db)
})

describe('SQLite weather settings', () => {
  it('[WX-003] Given a provider the app does not know or a blank one, When read, Then Open-Meteo is used, and a blank address is no service', async () => {
    const db = setupTestDb()
    const set = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
    set.run(WEATHER_KEYS.provider, 'weather-underground')
    set.run(WEATHER_KEYS.service, '   ')
    const s = new SqliteWeatherSettings(db)
    expect(await s.provider()).toBe('open-meteo')
    expect(await s.serviceAddress()).toBeNull()
    set.run(WEATHER_KEYS.provider, '  ')
    expect(await s.provider()).toBe('open-meteo')
    set.run(WEATHER_KEYS.service, ' http://nas.local:1456 ')
    expect(await s.serviceAddress()).toBe('http://nas.local:1456')
  })
})

describe('HTTP weather sources', () => {
  it('[WX-011] Given the site, When the public providers are asked, Then only the rounded coordinates are sent, with the app named as the caller', async () => {
    const om = await serve(openMeteoJson({ hours: SEED_HOURS, nights: [], warnings: [] }))
    await new OpenMeteoSource(om.base).forecast(site)
    expect(om.server.seen[0].url).toContain('latitude=53.35&longitude=-6.26&')
    expect(om.server.seen[0].url).not.toMatch(/elevation|altitude|53\.349/)
    expect(om.server.seen[0].headers['user-agent']).toBe(WEATHER_USER_AGENT)
    const met = await serve(metNorwayJson({ hours: SEED_HOURS, nights: [], warnings: [] }))
    await new MetNorwaySource(met.base).forecast(site)
    expect(met.server.seen[0].url).toBe('/weatherapi/locationforecast/2.0/complete?lat=53.35&lon=-6.26')
    expect(met.server.seen[0].headers['user-agent']).toBe(WEATHER_USER_AGENT)
  })

  it('[WX-011] Given the user\'s service, When asked, Then it is sent no coordinates', async () => {
    const svc = await serve(serviceJson({ hours: [], ...SEED_SERVICE }))
    await new WeatherServiceSource(svc.base).forecast(site)
    expect(svc.server.seen.map(r => r.url)).toEqual(['/api/v1/forecast'])
  })

  it('[WX-006] Given an error status, When asked, Then it fails naming the status', async () => {
    const { base } = await serve({ status: 503, body: 'down' })
    await expect(new OpenMeteoSource(base).forecast(site)).rejects.toThrow('answered 503 Service Unavailable')
  })

  it('[WX-006] Given a server that does not answer in time, When asked, Then it fails saying how long it waited', async () => {
    const { base } = await serve({ body: '{}', delayMs: 2000 })
    await expect(httpJson(50)(`${base}/slow`)).rejects.toThrow('no answer within 0 s')
    await expect(httpJson(1000)(`${base}/slow`)).rejects.toThrow('no answer within 1 s')
  })

  it('[WX-006] Given a server that sends its headers then stops part way through the body, When asked, Then it fails saying how long it waited', async () => {
    const { base } = await serve({ body: '{"hourly": {"time": [', stall: true })
    await expect(httpJson(300)(`${base}/stalls`)).rejects.toThrow('no answer within 0 s')
  })

  it('[WX-006] Given an error status, When the body is never read, Then the failure still names the status', async () => {
    const { base } = await serve({ status: 404, body: 'not here', stall: true })
    await expect(httpJson(2000)(`${base}/missing`)).rejects.toThrow('answered 404 Not Found')
  })

  it('[WX-006] Given a dead address, When asked, Then it fails saying it could not be reached', async () => {
    await expect(httpJson()(`${await deadHttpAddress()}/x`)).rejects.toThrow(/^could not be reached \(.+\)$/)
  })

  it('[WX-006] Given an answer far larger than a forecast, When asked, Then it is refused', async () => {
    const { base } = await serve({ body: `"${'x'.repeat(5 * 1024 * 1024)}"` })
    await expect(httpJson()(`${base}/big`)).rejects.toThrow('sent more than a forecast should hold')
  })

  it('[WX-006] Given JSON the provider would not send, When read, Then it fails with the reader\'s reason', async () => {
    const { base } = await serve({ hourly: null })
    await expect(new OpenMeteoSource(base).forecast(site)).rejects.toThrow('Open-Meteo sent no hourly forecast')
  })

  it('[WX-003] Given a provider chosen, When its source is built, Then it is that provider\'s, at its public address', async () => {
    const seen: string[] = []
    const get = async (url: string) => {
      seen.push(url)
      return url.includes('open-meteo') ? openMeteoJson({ hours: SEED_HOURS, nights: [], warnings: [] }) : metNorwayJson({ hours: SEED_HOURS, nights: [], warnings: [] })
    }
    const om = publicWeatherSource('open-meteo', get)
    const met = publicWeatherSource('met-norway', get)
    expect([om.name, met.name]).toEqual(['Open-Meteo', 'MET Norway'])
    expect(om.id).not.toBe(met.id)
    expect((await om.forecast(site)).hours).toEqual(SEED_HOURS)
    expect((await met.forecast(site)).hours).toEqual(SEED_HOURS)
    expect(seen.map(u => u.split('?')[0])).toEqual(['https://api.open-meteo.com/v1/forecast', 'https://api.met.no/weatherapi/locationforecast/2.0/complete'])
    expect(new WeatherServiceSource('http://a').id).not.toBe(new WeatherServiceSource('http://b').id)
  })
})
