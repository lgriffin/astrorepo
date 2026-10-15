import type Database from 'better-sqlite3'
import type { WeatherSettings } from '@astro/application'
import { DEFAULT_WEATHER_PROVIDER, PUBLIC_WEATHER_PROVIDERS, type PublicWeatherProvider } from '@astro/domain'
import { settingReader } from './shared/app-settings'

/** Settings keys Settings → Weather writes. */
export const WEATHER_KEYS = { provider: 'weather_provider', service: 'weather_service_address' } as const

/** What the provider key holds when the user turned the public forecast off. */
export const WEATHER_PROVIDER_OFF = 'none'

/** WeatherSettings over the app_settings table. */
export class SqliteWeatherSettings implements WeatherSettings {
  constructor(private readonly db: Database.Database) {}

  private read(key: string): string | null {
    const value = settingReader(this.db)(key)?.trim()
    return value ? value : null
  }

  /** Open-Meteo when nothing (or something unknown) is saved; null when turned off. */
  async provider(): Promise<PublicWeatherProvider | null> {
    const value = this.read(WEATHER_KEYS.provider)
    if (value === WEATHER_PROVIDER_OFF) return null
    return PUBLIC_WEATHER_PROVIDERS.find(p => p.id === value)?.id ?? DEFAULT_WEATHER_PROVIDER
  }

  async serviceAddress(): Promise<string | null> {
    return this.read(WEATHER_KEYS.service)
  }
}
