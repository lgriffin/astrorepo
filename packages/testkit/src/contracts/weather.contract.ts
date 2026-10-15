import { describe, expect, it } from 'vitest'
import type { WeatherSettings, WeatherSource } from '@astro/application'
import type { PublicWeatherProvider, Site, WeatherReport } from '@astro/domain'

const dublin: Site = { latitudeDeg: 53.35, longitudeDeg: -6.26, elevationM: 20 }
const t0 = Date.parse('2026-10-15T20:00:00Z')

/** What a source is seeded with: a forecast, or a source that cannot be reached or read. */
export type WeatherSeed = WeatherReport | 'unreachable' | 'unreadable'

/** Six clear-then-cloudy hours, as a public provider would give them. */
export const SEED_HOURS: WeatherReport['hours'] = Array.from({ length: 6 }, (_, i) => ({
  at: new Date(t0 + i * 3600_000),
  hours: 1,
  cloudPct: i < 3 ? 10 : 90,
  precipChancePct: i * 10,
  humidityPct: 70 + i,
  temperatureC: 8 - i,
  dewPointC: 2
}))

/** Tonight from the user's service, with one warning. */
export const SEED_SERVICE: Pick<WeatherReport, 'nights' | 'warnings'> = {
  nights: [{ night: '2026-10-15', rainChance: 0.25, frostChance: 0.4, lowC: 1.5, cloudPct: 30, brief: 'Clear early, cloud later.' }],
  warnings: [{ level: 'yellow', headline: 'Wind warning', onset: new Date('2026-10-15T21:00:00Z'), expiry: new Date('2026-10-16T09:00:00Z') }]
}

/**
 * Every WeatherSource adapter must pass this suite. `gives` says which part of a forecast the
 * source answers: hourly figures (a public provider) or a night and warnings (the user's service).
 * `make` returns a source seeded with the forecast, or one that cannot be reached or read.
 */
export function weatherSourceContract(adapterName: string, gives: 'hours' | 'nights', make: (seed: WeatherSeed) => Promise<WeatherSource> | WeatherSource): void {
  const seeded: WeatherReport = gives === 'hours' ? { hours: SEED_HOURS, nights: [], warnings: [] } : { hours: [], ...SEED_SERVICE }

  describe(`WeatherSource contract: ${adapterName}`, () => {
    it('[WX-003] Given a forecast, When the site\'s forecast is asked, Then exactly what the source holds comes back, hours in time order', async () => {
      const source = await make(seeded)
      expect(source.name.trim()).not.toBe('')
      expect(source.id.trim()).not.toBe('')
      const report = await source.forecast(dublin)
      expect(report).toEqual(seeded)
      const times = report.hours.map(h => h.at.getTime())
      expect([...times].sort((a, b) => a - b)).toEqual(times)
    })

    it('[WX-006] Given a source that cannot be reached, When asked, Then it fails with a reason', async () => {
      const source = await make('unreachable')
      await expect(source.forecast(dublin)).rejects.toThrow(/\S/)
    })

    it('[WX-006] Given a source that answers with something unreadable, When asked, Then it fails with a reason, not a forecast', async () => {
      const source = await make('unreadable')
      await expect(source.forecast(dublin)).rejects.toThrow(/\S/)
    })
  })
}

export interface WeatherSettingsSeed {
  /** undefined: nothing saved; null: turned off. */
  provider?: PublicWeatherProvider | null
  address?: string | null
}

/** Every WeatherSettings adapter must pass this suite. `make` returns settings holding the seed. */
export function weatherSettingsContract(adapterName: string, make: (seed: WeatherSettingsSeed) => WeatherSettings): void {
  describe(`WeatherSettings contract: ${adapterName}`, () => {
    it('[WX-003] Given nothing saved, When read, Then Open-Meteo is the forecast and there is no service', async () => {
      const s = make({})
      expect(await s.provider()).toBe('open-meteo')
      expect(await s.serviceAddress()).toBeNull()
    })

    it('[WX-003, WX-004] Given a provider and an address saved, When read, Then both come back', async () => {
      const s = make({ provider: 'met-norway', address: 'http://nas.local:1456' })
      expect(await s.provider()).toBe('met-norway')
      expect(await s.serviceAddress()).toBe('http://nas.local:1456')
    })

    it('[WX-010] Given the public forecast turned off, When read, Then the provider is null', async () => {
      expect(await make({ provider: null }).provider()).toBeNull()
    })
  })
}
