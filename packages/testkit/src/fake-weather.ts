import type { PublicWeatherProvider, Site, WeatherReport } from '@astro/domain'
import type { WeatherSettings, WeatherSource } from '@astro/application'

const EMPTY: WeatherReport = { hours: [], nights: [], warnings: [] }

/** A weather source that answers with what a test gives it, or fails, and counts its calls. */
export class FakeWeatherSource implements WeatherSource {
  private report: WeatherReport = EMPTY
  private failure: Error | null = null
  readonly sitesAsked: Site[] = []

  constructor(readonly name = 'Scripted weather', readonly id = `fake:${name}`) {}

  answer(report: Partial<WeatherReport>): this {
    this.report = { ...EMPTY, ...report }
    this.failure = null
    return this
  }

  fail(message: string): this {
    this.failure = new Error(message)
    return this
  }

  async forecast(site: Site): Promise<WeatherReport> {
    this.sitesAsked.push(site)
    if (this.failure) throw this.failure
    return {
      hours: this.report.hours.map(h => ({ ...h, at: new Date(h.at) })),
      nights: this.report.nights.map(n => ({ ...n })),
      warnings: this.report.warnings.map(w => ({ ...w }))
    }
  }
}

/** Weather settings held in memory: Open-Meteo and no service unless a test says otherwise. */
export class InMemoryWeatherSettings implements WeatherSettings {
  constructor(
    private chosen: PublicWeatherProvider | null = 'open-meteo',
    private address: string | null = null
  ) {}

  setProvider(provider: PublicWeatherProvider | null): this {
    this.chosen = provider
    return this
  }

  setServiceAddress(address: string | null): this {
    this.address = address
    return this
  }

  async provider(): Promise<PublicWeatherProvider | null> {
    return this.chosen
  }

  async serviceAddress(): Promise<string | null> {
    return this.address
  }
}
