import {
  DEFAULT_CLEAR_SKY_POLICY,
  WEATHER_SERVICE_NAME,
  judgeNight,
  mergeReports,
  nightsFrom,
  readServiceAddress,
  weatherCoordinate,
  type ClearSkyPolicy,
  type NightOutlook,
  type NightSky,
  type PublicWeatherProvider,
  type Site,
  type WeatherReport
} from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { Ephemeris, PlanningSettings } from '../ports/sky'
import type { WeatherSettings, WeatherSource } from '../ports/weather'
import { tonightAt } from './plan-forward'

export interface ClearSkiesDeps {
  planning: PlanningSettings
  weather: WeatherSettings
  ephemeris: Ephemeris
  clock: Clock
  /** The adapter for a public provider (the composition root wraps it in the cache). */
  publicSource: (provider: PublicWeatherProvider) => WeatherSource
  /** The adapter for the user's own weather service at an address. */
  serviceSource: (address: string) => WeatherSource
}

/** One source asked for the outlook, and what went wrong with it, if anything (WX-006, WX-005). */
export interface WeatherSourceStatus {
  name: string
  problem: string | null
}

export type ClearSkiesOutlook =
  | { status: 'no-site' }
  | { status: 'off' }
  | { status: 'ok'; site: Site; nights: NightOutlook[]; sources: WeatherSourceStatus[] }

export type ClearSkies = () => Promise<ClearSkiesOutlook>

/** Nights shown on Home: tonight and the two after it (WX-001). */
export const CLEAR_SKIES_NIGHTS = 3

/** The longest reason shown for a source that failed. */
const MAX_PROBLEM = 200

const problemOf = (error: unknown): string => {
  const text = error instanceof Error ? error.message : String(error)
  return (text.trim() || 'it gave no reason').slice(0, MAX_PROBLEM)
}

/**
 * The next nights' skies from the user's site (WX-001 to WX-011): every chosen source is asked at
 * once, a source that fails is named and the others still count, and each night's dark window is
 * judged against what they said together, the public provider first.
 */
export function makeClearSkies(
  deps: ClearSkiesDeps,
  policy: ClearSkyPolicy = DEFAULT_CLEAR_SKY_POLICY,
  nightCount: number = CLEAR_SKIES_NIGHTS
): ClearSkies {
  return async () => {
    const site = await deps.planning.site()
    if (!site) return { status: 'no-site' }
    const [provider, saved] = await Promise.all([deps.weather.provider(), deps.weather.serviceAddress()])
    const address = readServiceAddress(saved)
    if (provider === null && address === null) return { status: 'off' }

    const asked: { name: string; source: WeatherSource | null; problem: string | null }[] = []
    if (provider !== null) {
      const source = deps.publicSource(provider)
      asked.push({ name: source.name, source, problem: null })
    }
    if (address && 'address' in address) asked.push({ name: WEATHER_SERVICE_NAME, source: deps.serviceSource(address.address), problem: null })
    if (address && 'problem' in address) asked.push({ name: WEATHER_SERVICE_NAME, source: null, problem: address.problem })

    const answers = await Promise.allSettled(asked.map(a => (a.source ? a.source.forecast(site) : Promise.reject(new Error(a.problem ?? '')))))
    const reports: WeatherReport[] = []
    const sources: WeatherSourceStatus[] = answers.map((answer, i) => {
      if (answer.status === 'fulfilled') {
        reports.push(answer.value)
        return { name: asked[i].name, problem: null }
      }
      return { name: asked[i].name, problem: asked[i].problem ?? problemOf(answer.reason) }
    })
    const report = mergeReports(reports)

    const skyOn = (night: string): Promise<NightSky | null> => deps.ephemeris.nightSky(site, night)
    const tonight = await tonightAt(deps.clock.now(), site, skyOn)
    const nights = await Promise.all(nightsFrom(tonight, nightCount, 1).map(async night => judgeNight(night, await skyOn(night), report, policy)))
    return { status: 'ok', site, nights, sources }
  }
}

/**
 * Keeps each source's answer for a site for `ttlMs` (WX-009): one request at a time per source and
 * site, a failure kept for no one, and a different source, address or site asked afresh.
 */
export function makeWeatherCache(now: () => number, ttlMs: number): (source: WeatherSource) => WeatherSource {
  const kept = new Map<string, { at: number; report: Promise<WeatherReport> }>()
  return source => ({
    id: source.id,
    name: source.name,
    forecast(site: Site): Promise<WeatherReport> {
      const key = `${source.id}|${weatherCoordinate(site.latitudeDeg)}|${weatherCoordinate(site.longitudeDeg)}`
      const t = now()
      const hit = kept.get(key)
      if (hit && t - hit.at < ttlMs) return hit.report
      const report = source.forecast(site)
      const entry = { at: t, report }
      kept.set(key, entry)
      report.catch(() => {
        if (kept.get(key) === entry) kept.delete(key)
      })
      return report
    }
  })
}
