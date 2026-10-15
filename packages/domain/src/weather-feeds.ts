import type { Site } from './sky'
import type { ForecastHour, StationNight, WarningLevel, WeatherReport, WeatherWarning } from './clear-skies'

/**
 * Reading what weather sources answer (specs/036-clear-skies, WX-003, WX-006, WX-011). Each feed
 * is untrusted JSON: a reader returns hours, nights and warnings in range, or throws
 * WeatherFeedError, and nothing else.
 */

export class WeatherFeedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WeatherFeedError'
  }
}

export type PublicWeatherProvider = 'open-meteo' | 'met-norway'

export const PUBLIC_WEATHER_PROVIDERS: { id: PublicWeatherProvider; name: string; site: string }[] = [
  { id: 'open-meteo', name: 'Open-Meteo', site: 'https://open-meteo.com' },
  { id: 'met-norway', name: 'MET Norway', site: 'https://api.met.no' }
]

/** The provider used when none is saved: Open-Meteo, free and keyless, with the main weather models behind it. */
export const DEFAULT_WEATHER_PROVIDER: PublicWeatherProvider = 'open-meteo'

/** The name the user's own weather service is shown under. */
export const WEATHER_SERVICE_NAME = 'Your weather service'

export const OPEN_METEO_BASE = 'https://api.open-meteo.com'
export const MET_NORWAY_BASE = 'https://api.met.no'

/** Hours of hourly forecast asked for: enough for three nights from any time of day. */
const FORECAST_DAYS = 4

/** A coordinate as sent to a weather source: two decimal places, about a kilometre (WX-011). */
export function weatherCoordinate(deg: number): string {
  const rounded = Math.round(deg * 100) / 100
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(2)
}

export function openMeteoUrl(site: Site, base = OPEN_METEO_BASE): string {
  const hourly = 'cloud_cover,precipitation_probability,relative_humidity_2m,temperature_2m,dew_point_2m'
  return `${base}/v1/forecast?latitude=${weatherCoordinate(site.latitudeDeg)}&longitude=${weatherCoordinate(site.longitudeDeg)}` +
    `&hourly=${hourly}&forecast_days=${FORECAST_DAYS}&timeformat=unixtime&timezone=GMT`
}

export function metNorwayUrl(site: Site, base = MET_NORWAY_BASE): string {
  return `${base}/weatherapi/locationforecast/2.0/complete?lat=${weatherCoordinate(site.latitudeDeg)}&lon=${weatherCoordinate(site.longitudeDeg)}`
}

/** The forecast endpoint of the user's weatherlink_website service. */
export function weatherServiceForecastUrl(address: string): string {
  return `${address}/api/v1/forecast`
}

const ADDRESS = /^https?:\/\/[^\s/?#@]+(?:\/[^\s?#]*)?$/i

/**
 * The saved address of the user's weather service (WX-005): null when blank, the address without
 * a trailing slash when it is http or https, or why it cannot be used.
 */
export function readServiceAddress(raw: string | null): { address: string } | { problem: string } | null {
  const text = raw?.trim() ?? ''
  if (text === '') return null
  if (!ADDRESS.test(text)) return { problem: `"${text}" is not an http or https address, such as http://nas.local:1456` }
  return { address: text.replace(/\/+$/, '') }
}

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const clamp = (v: number | null, lo: number, hi: number): number | null => (v === null ? null : Math.min(hi, Math.max(lo, v)))
const pct = (v: unknown) => clamp(num(v), 0, 100)
const chance = (v: unknown) => clamp(num(v), 0, 1)
/** A temperature in °C, or null for anything no thermometer on Earth reads. */
const celsius = (v: unknown) => {
  const n = num(v)
  return n !== null && n >= -100 && n <= 70 ? n : null
}

const MAX_HOURS = 24 * 16

/** Open-Meteo's hourly forecast (`timeformat=unixtime`), in time order. */
export function readOpenMeteo(json: unknown): ForecastHour[] {
  const hourly = isObject(json) ? json.hourly : undefined
  if (!isObject(hourly) || !Array.isArray(hourly.time)) throw new WeatherFeedError('Open-Meteo sent no hourly forecast')
  const column = (name: string): unknown[] => (Array.isArray(hourly[name]) ? (hourly[name] as unknown[]) : [])
  const [cloud, precip, humidity, temp, dew] = ['cloud_cover', 'precipitation_probability', 'relative_humidity_2m', 'temperature_2m', 'dew_point_2m'].map(column)
  const out: ForecastHour[] = []
  for (const [i, t] of hourly.time.slice(0, MAX_HOURS).entries()) {
    const seconds = num(t)
    if (seconds === null || Math.abs(seconds) > 1e11) continue
    out.push({
      at: new Date(seconds * 1000),
      hours: 1,
      cloudPct: pct(cloud[i]),
      precipChancePct: pct(precip[i]),
      humidityPct: pct(humidity[i]),
      temperatureC: celsius(temp[i]),
      dewPointC: celsius(dew[i])
    })
  }
  return inTimeOrder(out)
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/

function instant(v: unknown): Date | null {
  if (typeof v !== 'string' || !ISO_INSTANT.test(v)) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** MET Norway's locationforecast 2.0 `complete`: hourly for about two and a half days, then six-hourly. */
export function readMetNorway(json: unknown): ForecastHour[] {
  const properties = isObject(json) ? json.properties : undefined
  const series = isObject(properties) ? properties.timeseries : undefined
  if (!Array.isArray(series)) throw new WeatherFeedError('MET Norway sent no forecast time series')
  const rows: { at: Date; data: Json }[] = []
  for (const entry of series.slice(0, MAX_HOURS)) {
    if (!isObject(entry) || !isObject(entry.data)) continue
    const at = instant(entry.time)
    if (at) rows.push({ at, data: entry.data })
  }
  rows.sort((a, b) => a.at.getTime() - b.at.getTime())
  const details = (o: unknown): Json => (isObject(o) && isObject(o.details) ? o.details : {})
  return rows.map((r, i) => {
    const now = details(r.data.instant)
    const next1 = details(r.data.next_1_hours)
    const next6 = details(r.data.next_6_hours)
    const gap = i + 1 < rows.length ? (rows[i + 1].at.getTime() - r.at.getTime()) / 3600_000 : isObject(r.data.next_1_hours) ? 1 : 6
    return {
      at: r.at,
      hours: Math.min(6, Math.max(1, gap)),
      cloudPct: pct(now.cloud_area_fraction),
      precipChancePct: pct(next1.probability_of_precipitation ?? next6.probability_of_precipitation),
      humidityPct: pct(now.relative_humidity),
      temperatureC: celsius(now.air_temperature),
      dewPointC: celsius(now.dew_point_temperature)
    }
  })
}

const NIGHT = /^\d{4}-\d{2}-\d{2}$/
const LEVELS: WarningLevel[] = ['yellow', 'orange', 'red']

function serviceWarning(w: unknown): WeatherWarning | null {
  if (!isObject(w) || typeof w.headline !== 'string' || w.headline.trim() === '') return null
  const level = LEVELS.find(l => l === w.level) ?? 'unknown'
  const when = (v: unknown) => (typeof v === 'string' ? (Number.isNaN(Date.parse(v)) ? null : new Date(v)) : null)
  return { level, headline: w.headline.trim().slice(0, 200), onset: when(w.onset), expiry: when(w.expiry) }
}

/** The night's cloud cover from the service: its own `cloud_night`, else the weather models' average. */
function serviceCloud(evening: Json, guidance: unknown): number | null {
  const own = pct(evening.cloud_night)
  if (own !== null) return own
  if (!isObject(guidance)) return null
  const said = Object.values(guidance).map(m => (isObject(m) ? pct(m.cloud_night) : null)).filter((v): v is number => v !== null)
  return said.length > 0 ? said.reduce((a, b) => a + b, 0) / said.length : null
}

/**
 * The user's weatherlink_website `GET /api/v1/forecast`: tonight's forecast from the station's own
 * models (chance of rain, of frost, the low) and the weather warnings in force. A forecast the
 * service marks stale is from an earlier evening, so it is left out.
 */
export function readWeatherService(json: unknown): WeatherReport {
  if (!isObject(json) || !('forecast' in json)) throw new WeatherFeedError('The weather service did not answer with a forecast')
  const nights: StationNight[] = []
  const forecast = json.forecast
  if (forecast !== null) {
    const payload = isObject(forecast) ? forecast.payload : undefined
    const evening = isObject(payload) ? payload.evening : undefined
    if (!isObject(payload) || !isObject(evening) || typeof evening.date !== 'string' || !NIGHT.test(evening.date)) {
      throw new WeatherFeedError('The weather service forecast has no evening date')
    }
    if (isObject(forecast) && forecast.stale !== true) {
      nights.push({
        night: evening.date,
        rainChance: chance(evening.rain_next_24h_chance),
        frostChance: chance(evening.frost_chance),
        lowC: celsius(evening.night_min),
        cloudPct: serviceCloud(evening, payload.guidance),
        brief: typeof payload.brief === 'string' && payload.brief.trim() !== '' ? payload.brief.trim().slice(0, 1000) : null
      })
    }
  }
  const warnings = Array.isArray(json.warnings) ? json.warnings.map(serviceWarning).filter((w): w is WeatherWarning => w !== null) : []
  return { hours: [], nights, warnings }
}

function inTimeOrder(hours: ForecastHour[]): ForecastHour[] {
  return hours.sort((a, b) => a.at.getTime() - b.at.getTime())
}
