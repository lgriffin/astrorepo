import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WEATHER_PROVIDER,
  PUBLIC_WEATHER_PROVIDERS,
  WeatherFeedError,
  metNorwayUrl,
  openMeteoUrl,
  readMetNorway,
  readOpenMeteo,
  readServiceAddress,
  readWeatherService,
  weatherCoordinate,
  weatherServiceForecastUrl
} from '../src'

const dublin = { latitudeDeg: 53.34981, longitudeDeg: -6.26031, elevationM: 20 }
const t0 = Date.parse('2026-10-15T20:00:00Z') / 1000

describe('what is sent to a weather source', () => {
  it('[WX-011] Given coordinates, When sent, Then they are rounded to two decimal places with no negative zero', () => {
    expect(weatherCoordinate(53.34981)).toBe('53.35')
    expect(weatherCoordinate(-6.26031)).toBe('-6.26')
    expect(weatherCoordinate(-0.001)).toBe('0.00')
    expect(weatherCoordinate(0.005)).toBe('0.01')
    expect(weatherCoordinate(-0.004)).toBe('0.00')
    expect(weatherCoordinate(180)).toBe('180.00')
  })

  it('[WX-003, WX-011] Given the site, When the public providers are asked, Then only the rounded latitude and longitude go in the address', () => {
    expect(openMeteoUrl(dublin)).toBe(
      'https://api.open-meteo.com/v1/forecast?latitude=53.35&longitude=-6.26' +
        '&hourly=cloud_cover,precipitation_probability,relative_humidity_2m,temperature_2m,dew_point_2m&forecast_days=4&timeformat=unixtime&timezone=GMT'
    )
    expect(metNorwayUrl(dublin)).toBe('https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=53.35&lon=-6.26')
    expect(openMeteoUrl(dublin, 'http://127.0.0.1:9')).toMatch(/^http:\/\/127\.0\.0\.1:9\/v1\/forecast\?/)
    expect(metNorwayUrl(dublin, 'http://127.0.0.1:9')).toMatch(/^http:\/\/127\.0\.0\.1:9\/weatherapi\//)
    expect(weatherServiceForecastUrl('http://nas.local:1456')).toBe('http://nas.local:1456/api/v1/forecast')
  })

  it('[WX-003] Given the providers, When listed, Then Open-Meteo is the default and MET Norway the other', () => {
    expect(DEFAULT_WEATHER_PROVIDER).toBe('open-meteo')
    expect(PUBLIC_WEATHER_PROVIDERS.map(p => [p.id, p.name])).toEqual([['open-meteo', 'Open-Meteo'], ['met-norway', 'MET Norway']])
  })
})

describe('readServiceAddress', () => {
  it('[WX-004] Given a blank or missing address, When read, Then there is no service', () => {
    expect(readServiceAddress(null)).toBeNull()
    expect(readServiceAddress('   ')).toBeNull()
  })

  it('[WX-004] Given an http or https address, When read, Then it comes back trimmed and without trailing slashes', () => {
    expect(readServiceAddress(' http://nas.local:1456/ ')).toEqual({ address: 'http://nas.local:1456' })
    expect(readServiceAddress('https://weather.example.org/home//')).toEqual({ address: 'https://weather.example.org/home' })
    expect(readServiceAddress('HTTP://192.168.1.20:1456')).toEqual({ address: 'HTTP://192.168.1.20:1456' })
  })

  it('[WX-005] Given an address that is not http or https, When read, Then it is refused with the address it read', () => {
    for (const bad of ['nas.local:1456', 'ftp://nas.local', 'http://', 'http://user:pw@nas.local', 'http://nas local', 'http://nas.local?x=1', 'http://nas.local#top']) {
      const read = readServiceAddress(bad)
      expect(read, bad).toEqual({ problem: `"${bad}" is not an http or https address, such as http://nas.local:1456` })
    }
  })
})

describe('readOpenMeteo', () => {
  it('[WX-003] Given an hourly forecast, When read, Then each hour comes back in time order with its figures', () => {
    const hours = readOpenMeteo({
      hourly: {
        time: [t0 + 3600, t0],
        cloud_cover: [80, 5],
        precipitation_probability: [60, 0],
        relative_humidity_2m: [90, 70],
        temperature_2m: [7.5, 9],
        dew_point_2m: [6, 3.2]
      }
    })
    expect(hours).toEqual([
      { at: new Date(t0 * 1000), hours: 1, cloudPct: 5, precipChancePct: 0, humidityPct: 70, temperatureC: 9, dewPointC: 3.2 },
      { at: new Date((t0 + 3600) * 1000), hours: 1, cloudPct: 80, precipChancePct: 60, humidityPct: 90, temperatureC: 7.5, dewPointC: 6 }
    ])
  })

  it('[WX-006] Given figures out of range, missing or not numbers, When read, Then percentages are held to 0 to 100 and the rest are left empty', () => {
    const [h] = readOpenMeteo({
      hourly: { time: [t0], cloud_cover: [130], precipitation_probability: [-5], relative_humidity_2m: ['high'], temperature_2m: [71], dew_point_2m: [-101] }
    })
    expect(h).toMatchObject({ cloudPct: 100, precipChancePct: 0, humidityPct: null, temperatureC: null, dewPointC: null })
    const [bare] = readOpenMeteo({ hourly: { time: [t0], temperature_2m: [70], dew_point_2m: [-100] } })
    expect(bare).toMatchObject({ cloudPct: null, precipChancePct: null, humidityPct: null, temperatureC: 70, dewPointC: -100 })
  })

  it('[WX-006] Given times that are not numbers or far out of range, When read, Then those hours are skipped', () => {
    const hours = readOpenMeteo({ hourly: { time: ['2026-10-15T20:00', null, 1e12, -1e12, t0], cloud_cover: [1, 2, 3, 4, 5] } })
    expect(hours.map(h => h.cloudPct)).toEqual([5])
  })

  it('[WX-006] Given an answer with no hourly times, When read, Then it fails with a feed error', () => {
    for (const bad of [null, [], 'text', {}, { hourly: null }, { hourly: [] }, { hourly: { time: 'x' } }]) {
      expect(() => readOpenMeteo(bad)).toThrow(WeatherFeedError)
    }
    expect(() => readOpenMeteo({})).toThrow('Open-Meteo sent no hourly forecast')
  })

  it('[WX-006] Given more than sixteen days of hours, When read, Then only the first sixteen days are kept', () => {
    const time = Array.from({ length: 400 }, (_, i) => t0 + i * 3600)
    expect(readOpenMeteo({ hourly: { time } })).toHaveLength(384)
  })
})

const metEntry = (time: string, cloud: number, over: Record<string, unknown> = {}) => ({
  time,
  data: {
    instant: { details: { cloud_area_fraction: cloud, relative_humidity: 80, air_temperature: 6, dew_point_temperature: 3 } },
    ...over
  }
})

describe('readMetNorway', () => {
  it('[WX-003] Given hourly entries then six-hourly ones, When read, Then each covers the time to the next entry', () => {
    const hours = readMetNorway({
      type: 'Feature',
      properties: {
        timeseries: [
          metEntry('2026-10-15T20:00:00Z', 10, { next_1_hours: { details: { probability_of_precipitation: 3 } } }),
          metEntry('2026-10-15T21:00:00Z', 20, { next_1_hours: { details: { probability_of_precipitation: 4 } }, next_6_hours: { details: { probability_of_precipitation: 50 } } }),
          metEntry('2026-10-16T00:00:00Z', 30, { next_6_hours: { details: { probability_of_precipitation: 20 } } }),
          metEntry('2026-10-16T06:00:00Z', 40, { next_6_hours: { details: {} } })
        ]
      }
    })
    expect(hours.map(h => [h.at.toISOString(), h.hours, h.cloudPct, h.precipChancePct])).toEqual([
      ['2026-10-15T20:00:00.000Z', 1, 10, 3],
      ['2026-10-15T21:00:00.000Z', 3, 20, 4],
      ['2026-10-16T00:00:00.000Z', 6, 30, 20],
      ['2026-10-16T06:00:00.000Z', 6, 40, null]
    ])
    expect(hours[0]).toMatchObject({ humidityPct: 80, temperatureC: 6, dewPointC: 3 })
  })

  it('[WX-003] Given the last entry has an hourly part, When read, Then it covers one hour', () => {
    const hours = readMetNorway({ properties: { timeseries: [metEntry('2026-10-15T20:00:00Z', 10, { next_1_hours: { details: {} } })] } })
    expect(hours[0].hours).toBe(1)
  })

  it('[WX-006] Given entries out of order, repeated, malformed or with bad times, When read, Then the readable ones come back in order', () => {
    const hours = readMetNorway({
      properties: {
        timeseries: [
          metEntry('2026-10-15T22:00:00Z', 30),
          null,
          { time: '2026-10-15T23:00:00Z' },
          metEntry('2026-10-15T20:00:00Z', 10),
          metEntry('2026-10-15T20:00:00Z', 15),
          metEntry('2026-13-45T20:00:00Z', 50),
          metEntry('yesterday', 60),
          { time: '2026-10-15T23:00:00Z', data: 'x' },
          metEntry('2026-10-16T09:00:00Z', 70)
        ]
      }
    })
    expect(hours.map(h => [h.cloudPct, h.hours])).toEqual([[10, 1], [15, 2], [30, 6], [70, 6]])
  })

  it('[WX-006] Given figures out of range or missing, When read, Then they are held in range or left empty', () => {
    const [h] = readMetNorway({ properties: { timeseries: [{ time: '2026-10-15T20:00:00Z', data: { instant: { details: { cloud_area_fraction: 101, relative_humidity: -1 } } } }] } })
    expect(h).toMatchObject({ cloudPct: 100, humidityPct: 0, temperatureC: null, dewPointC: null, precipChancePct: null })
    const [none] = readMetNorway({ properties: { timeseries: [{ time: '2026-10-15T20:00:00Z', data: { instant: 'x' } }] } })
    expect(none.cloudPct).toBeNull()
  })

  it('[WX-006] Given an answer with no time series, When read, Then it fails with a feed error', () => {
    for (const bad of [null, 'x', {}, { properties: null }, { properties: { timeseries: {} } }]) {
      expect(() => readMetNorway(bad)).toThrow(WeatherFeedError)
    }
    expect(() => readMetNorway({})).toThrow('MET Norway sent no forecast time series')
  })
})

/** weatherlink_website's GET /api/v1/forecast, as its contract (packages/contracts) describes it. */
const serviceAnswer = (over: { evening?: Record<string, unknown>; payload?: Record<string, unknown>; stale?: boolean; warnings?: unknown } = {}) => ({
  forecast: {
    source: 'spark',
    receivedAt: '2026-10-15T17:05:00.000Z',
    stale: over.stale ?? false,
    payload: {
      station: 'Home',
      timezone: 'Europe/Dublin',
      evening: { date: '2026-10-15', night_min: 2.4, night_min_range: [1, 4], frost_chance: 0.35, rain_next_24h_chance: 0.12, ...over.evening },
      guidance: { ecmwf_ifs025: { night_min: 3, day_max: 13, rain_24h: 0.2 } },
      brief: ' Clear and cold, a touch of frost in sheltered spots. ',
      ...over.payload
    }
  },
  warnings: over.warnings ?? [
    { level: 'yellow', type: 'Wind', headline: 'Status Yellow wind warning for Galway', description: '...', onset: '2026-10-15T21:00:00Z', expiry: '2026-10-16T09:00:00Z', regions: ['EI06'] }
  ]
})

describe('readWeatherService', () => {
  it('[WX-004] Given tonight\'s forecast and a warning, When read, Then the night carries rain, frost, the low and the brief, and the warning its times', () => {
    expect(readWeatherService(serviceAnswer())).toEqual({
      hours: [],
      nights: [{ night: '2026-10-15', rainChance: 0.12, frostChance: 0.35, lowC: 2.4, cloudPct: null, brief: 'Clear and cold, a touch of frost in sheltered spots.' }],
      warnings: [
        { level: 'yellow', headline: 'Status Yellow wind warning for Galway', onset: new Date('2026-10-15T21:00:00Z'), expiry: new Date('2026-10-16T09:00:00Z') }
      ]
    })
  })

  it('[WX-007] Given the service\'s own cloud for the night, or the weather models\' cloud, When read, Then its own wins, else the models\' average is used', () => {
    expect(readWeatherService(serviceAnswer({ evening: { cloud_night: 20 }, payload: { guidance: { a: { cloud_night: 90 } } } })).nights[0].cloudPct).toBe(20)
    const models = { a: { cloud_night: 30 }, b: { cloud_night: 50 }, c: { night_min: 2 }, d: 'x', e: { cloud_night: 'cloudy' } }
    expect(readWeatherService(serviceAnswer({ payload: { guidance: models } })).nights[0].cloudPct).toBe(40)
    expect(readWeatherService(serviceAnswer({ payload: { guidance: null } })).nights[0].cloudPct).toBeNull()
    expect(readWeatherService(serviceAnswer({ payload: { guidance: {} } })).nights[0].cloudPct).toBeNull()
  })

  it('[WX-004] Given a stale forecast from an earlier evening, When read, Then no night is taken from it but the warnings still are', () => {
    const r = readWeatherService(serviceAnswer({ stale: true }))
    expect(r.nights).toEqual([])
    expect(r.warnings).toHaveLength(1)
  })

  it('[WX-004] Given no forecast yet and no warnings fetched, When read, Then the report is empty', () => {
    expect(readWeatherService({ forecast: null, warnings: null })).toEqual({ hours: [], nights: [], warnings: [] })
  })

  it('[WX-006] Given chances and temperatures out of range and a blank brief, When read, Then chances are held to 0 to 1 and the rest left empty', () => {
    const [n] = readWeatherService(serviceAnswer({ evening: { rain_next_24h_chance: 1.4, frost_chance: -0.2, night_min: 'cold' }, payload: { brief: '  ' } })).nights
    expect(n).toMatchObject({ rainChance: 1, frostChance: 0, lowC: null, brief: null })
    const [m] = readWeatherService(serviceAnswer({ evening: { rain_next_24h_chance: null, frost_chance: undefined }, payload: { brief: 42 } })).nights
    expect(m).toMatchObject({ rainChance: null, frostChance: null, brief: null })
  })

  it('[WX-006] Given warnings with unknown levels, no headline or bad times, When read, Then the level is unknown, headline-less ones are skipped and bad times left empty', () => {
    const r = readWeatherService(serviceAnswer({
      warnings: [
        { level: 'purple', headline: ' Fog ', onset: 'soon', expiry: 12 },
        { level: 'red', headline: '   ' },
        { level: 'orange' },
        'x',
        { level: 'red', headline: 'H'.repeat(300), onset: null }
      ]
    }))
    expect(r.warnings).toEqual([
      { level: 'unknown', headline: 'Fog', onset: null, expiry: null },
      { level: 'red', headline: 'H'.repeat(200), onset: null, expiry: null }
    ])
    expect(readWeatherService(serviceAnswer({ warnings: 'none' })).warnings).toEqual([])
  })

  it('[WX-006] Given an answer that is not the forecast endpoint\'s, When read, Then it fails with a feed error', () => {
    for (const bad of [null, [], 'x', {}, { warnings: [] }]) expect(() => readWeatherService(bad)).toThrow('The weather service did not answer with a forecast')
    for (const bad of [{ forecast: 'x' }, { forecast: { payload: {} } }, { forecast: { payload: { evening: { date: '15/10/2026' } } } }, { forecast: { payload: { evening: 'x' } } }]) {
      expect(() => readWeatherService(bad)).toThrow(WeatherFeedError)
    }
    expect(() => readWeatherService({ forecast: { payload: { evening: {} } } })).toThrow('The weather service forecast has no evening date')
  })

  it('[WX-006] Given a very long brief, When read, Then it is cut to a thousand characters', () => {
    expect(readWeatherService(serviceAnswer({ payload: { brief: 'x'.repeat(2000) } })).nights[0].brief).toHaveLength(1000)
  })
})
