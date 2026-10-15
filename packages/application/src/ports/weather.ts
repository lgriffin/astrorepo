import type { PublicWeatherProvider, Site, WeatherReport } from '@astro/domain'

/**
 * Driven port: one source of weather forecasts (specs/035-clear-skies, WX-003).
 * Adapters: Open-Meteo and MET Norway (public providers), the user's own weatherlink_website
 * service, and a scripted source (testkit).
 */
export interface WeatherSource {
  /** Identifies the source and its address, so a cache never mixes two sources (WX-009). */
  readonly id: string
  /** What the source is called on Home, e.g. "Open-Meteo". */
  readonly name: string
  /**
   * The forecast for the site's next few days. Rejects when the source cannot be reached or
   * answers with something that cannot be read (WX-006).
   */
  forecast(site: Site): Promise<WeatherReport>
}

/** Driven port: which weather sources the user has chosen in Settings → Weather. */
export interface WeatherSettings {
  /** The public provider, or null when the user turned it off. Open-Meteo when nothing is saved. */
  provider(): Promise<PublicWeatherProvider | null>
  /** The address of the user's own weather service as saved, or null when none is. */
  serviceAddress(): Promise<string | null>
}
