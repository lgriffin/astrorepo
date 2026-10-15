import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { WeatherFeedError, readMetNorway, readOpenMeteo, readServiceAddress, readWeatherService, type ForecastHour, type WeatherReport } from '@astro/domain'
import { FUZZ_TEST_TIMEOUT_MS, fuzzParams, mutatedText, textish, withinBudget } from './fuzz-config'

const t0 = 1792094400
const SEEDS = [
  JSON.stringify({ hourly: { time: [t0, t0 + 3600], cloud_cover: [5, 90], precipitation_probability: [0, 60], relative_humidity_2m: [80, 95], temperature_2m: [8, 7], dew_point_2m: [3, 6] } }),
  JSON.stringify({ properties: { timeseries: [{ time: '2026-10-15T20:00:00Z', data: { instant: { details: { cloud_area_fraction: 10, relative_humidity: 80 } }, next_1_hours: { details: { probability_of_precipitation: 3 } } } }] } }),
  JSON.stringify({
    forecast: { stale: false, payload: { evening: { date: '2026-10-15', night_min: 2, frost_chance: 0.3, rain_next_24h_chance: 0.1 }, guidance: { a: { cloud_night: 40 } }, brief: 'Clear' } },
    warnings: [{ level: 'yellow', headline: 'Wind', onset: '2026-10-15T21:00:00Z', expiry: null }]
  })
]
const PIECES = ['{', '}', '[', ']', '"', ':', ',', 'null', '-1e308', '1e308', 'NaN', '__proto__', 'hourly', 'time', 'cloud_cover', 'timeseries', 'forecast', 'evening', 'date', 'warnings', '"2026-13-45T25:61:00Z"']

/** Every figure a reader returns is in range, and every hour has a real time and a positive length. */
function inRange(hours: ForecastHour[]): void {
  for (const h of hours) {
    expect(Number.isFinite(h.at.getTime())).toBe(true)
    expect(h.hours).toBeGreaterThan(0)
    expect(h.hours).toBeLessThanOrEqual(6)
    for (const p of [h.cloudPct, h.precipChancePct, h.humidityPct]) if (p !== null) expect(p >= 0 && p <= 100).toBe(true)
    for (const c of [h.temperatureC, h.dewPointC]) if (c !== null) expect(c >= -100 && c <= 70).toBe(true)
  }
  const times = hours.map(h => h.at.getTime())
  expect([...times].sort((a, b) => a - b)).toEqual(times)
}

function serviceInRange(r: WeatherReport): void {
  expect(r.hours).toEqual([])
  for (const n of r.nights) {
    expect(n.night).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    for (const c of [n.rainChance, n.frostChance]) if (c !== null) expect(c >= 0 && c <= 1).toBe(true)
    if (n.cloudPct !== null) expect(n.cloudPct >= 0 && n.cloudPct <= 100).toBe(true)
  }
  for (const w of r.warnings) expect(w.headline.trim()).not.toBe('')
}

/** Runs a reader on text parsed as JSON: its result, or a WeatherFeedError, and nothing else. */
function read<T>(text: string, reader: (json: unknown) => T, check: (out: T) => void): void {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  try {
    check(reader(json))
  } catch (error) {
    if (!(error instanceof WeatherFeedError)) throw error
  }
}

describe('Weather feed fuzz', () => {
  it('[FUZ-001, FUZ-003, WX-006] Given any answer from a weather source, When each reader reads it, Then figures come back in range or the reader fails with a feed error, in budget', () => {
    fc.assert(
      fc.property(fc.oneof(textish(300), mutatedText(SEEDS, PIECES), fc.json().map(String)), text => {
        withinBudget('weather feeds', () => {
          read(text, readOpenMeteo, inRange)
          read(text, readMetNorway, inRange)
          read(text, readWeatherService, serviceInRange)
        })
      }),
      fuzzParams()
    )
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-001, WX-005] Given any text as a service address, When read, Then it is no service, a clean http address, or refused', () => {
    fc.assert(
      fc.property(fc.oneof(textish(80), mutatedText(['http://nas.local:1456', 'https://example.org/weather/'], ['/', ':', '@', '?', '#', ' ', 'http', 's'])), text => {
        const r = readServiceAddress(text)
        if (r === null) expect(text.trim()).toBe('')
        else if ('address' in r) {
          expect(r.address).toMatch(/^https?:\/\/[^\s/?#@]+/i)
          expect(r.address.endsWith('/')).toBe(false)
        } else expect(r.problem).toContain('is not an http or https address')
      }),
      fuzzParams()
    )
  }, FUZZ_TEST_TIMEOUT_MS)
})
