import {
  MET_NORWAY_BASE,
  OPEN_METEO_BASE,
  PUBLIC_WEATHER_PROVIDERS,
  WEATHER_SERVICE_NAME,
  WeatherFeedError,
  metNorwayUrl,
  openMeteoUrl,
  readMetNorway,
  readOpenMeteo,
  readWeatherService,
  weatherServiceForecastUrl,
  type PublicWeatherProvider,
  type Site,
  type WeatherReport
} from '@astro/domain'
import type { WeatherSource } from '@astro/application'

/** Reads JSON from a URL; rejects with a reason a person can read. */
export type JsonGet = (url: string, headers?: Record<string, string>) => Promise<unknown>

/** MET Norway refuses requests that do not say who is asking; the others are sent it too. */
export const WEATHER_USER_AGENT = 'astrorepo (https://github.com/lgriffin/astrorepo)'

/** The most a forecast may weigh; four days of hourly figures is about 100 KB. */
const MAX_BYTES = 5 * 1024 * 1024

/** JSON over HTTP with Node's fetch, given up after `timeoutMs` (WX-006). */
export function httpJson(timeoutMs = 15_000): JsonGet {
  return async (url, headers = {}) => {
    let response: Response
    try {
      response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': WEATHER_USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      throw new Error(timedOut ? `no answer within ${Math.round(timeoutMs / 1000)} s` : `could not be reached (${reason(error)})`, { cause: error })
    }
    if (!response.ok) throw new Error(`answered ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`)
    const text = await response.text()
    if (text.length > MAX_BYTES) throw new WeatherFeedError('sent more than a forecast should hold')
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new WeatherFeedError('did not answer with JSON')
    }
  }
}

function reason(error: unknown): string {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : null
  return cause ?? (error instanceof Error ? error.message : String(error))
}

const nameOf = (id: PublicWeatherProvider) => PUBLIC_WEATHER_PROVIDERS.find(p => p.id === id)?.name ?? id

/** Open-Meteo's free, keyless hourly forecast (https://open-meteo.com). */
export class OpenMeteoSource implements WeatherSource {
  readonly name = nameOf('open-meteo')
  readonly id: string

  constructor(private readonly base = OPEN_METEO_BASE, private readonly get: JsonGet = httpJson()) {
    this.id = `open-meteo:${base}`
  }

  async forecast(site: Site): Promise<WeatherReport> {
    return { hours: readOpenMeteo(await this.get(openMeteoUrl(site, this.base))), nights: [], warnings: [] }
  }
}

/** The Norwegian Meteorological Institute's locationforecast (https://api.met.no), free with a User-Agent. */
export class MetNorwaySource implements WeatherSource {
  readonly name = nameOf('met-norway')
  readonly id: string

  constructor(private readonly base = MET_NORWAY_BASE, private readonly get: JsonGet = httpJson()) {
    this.id = `met-norway:${base}`
  }

  async forecast(site: Site): Promise<WeatherReport> {
    return { hours: readMetNorway(await this.get(metNorwayUrl(site, this.base))), nights: [], warnings: [] }
  }
}

/**
 * The user's own weatherlink_website service: tonight's forecast from the station's models and
 * the warnings in force. The service knows its own station, so no coordinates are sent.
 */
export class WeatherServiceSource implements WeatherSource {
  readonly name = WEATHER_SERVICE_NAME
  readonly id: string

  constructor(private readonly address: string, private readonly get: JsonGet = httpJson()) {
    this.id = `service:${address}`
  }

  async forecast(_site: Site): Promise<WeatherReport> {
    return readWeatherService(await this.get(weatherServiceForecastUrl(this.address)))
  }
}

/** The adapter for a public provider. */
export function publicWeatherSource(provider: PublicWeatherProvider, get: JsonGet = httpJson()): WeatherSource {
  return provider === 'met-norway' ? new MetNorwaySource(MET_NORWAY_BASE, get) : new OpenMeteoSource(OPEN_METEO_BASE, get)
}
