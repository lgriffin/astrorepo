import { describe, expect, it } from 'vitest'
import { makeClearSkies, makeDescribeSkyInsight, type ClearSkies, type SkyInsightAnswer } from '../src'
import { FakeEphemeris, FakeWeatherSource, FixedClock, InMemoryPlanningSettings, InMemorySkyQualitySettings, InMemoryWeatherSettings } from '@astro/testkit'
import type { Site } from '@astro/domain'

const HOUR = 3600 * 1000
const greenwich: Site = { latitudeDeg: 51.48, longitudeDeg: 0, elevationM: 0 }

class World {
  readonly planning = new InMemoryPlanningSettings(greenwich)
  readonly quality = new InMemorySkyQualitySettings('3')
  readonly weather = new InMemoryWeatherSettings()
  readonly ephemeris = new FakeEphemeris(10)
  readonly clock = new FixedClock(new Date('2026-11-05T15:00:00Z'))
  readonly openMeteo = new FakeWeatherSource('Open-Meteo').answer({
    hours: Array.from({ length: 48 }, (_, i) => ({
      at: new Date(Date.parse('2026-11-05T12:00:00Z') + i * HOUR),
      hours: 1,
      cloudPct: 5,
      precipChancePct: 0,
      humidityPct: 60,
      temperatureC: 6,
      dewPointC: 0
    }))
  })
  clearSkies: ClearSkies = makeClearSkies({
    planning: this.planning,
    weather: this.weather,
    ephemeris: this.ephemeris,
    clock: this.clock,
    publicSource: () => this.openMeteo,
    serviceSource: () => this.openMeteo
  })

  run(): Promise<SkyInsightAnswer> {
    return makeDescribeSkyInsight({ planning: this.planning, quality: this.quality, ephemeris: this.ephemeris, clock: this.clock, clearSkies: () => this.clearSkies() })()
  }
}

const ok = (a: SkyInsightAnswer) => {
  if (a.status !== 'ok') throw new Error(`no insight: ${a.status}`)
  return a.insight
}

describe('Tonight’s sky at a glance', () => {
  it('[NSI-001] [NSI-002] [NSI-003] [NSI-005] Given a clear moonless night at a rural site, When the insight is read, Then it has tonight’s darkness against last night, the Moon, the cloud and the sky, and it is good for faint targets', async () => {
    const w = new World()
    w.ephemeris.setMoon('2026-11-05', { altitudeDeg: -10, illumination: 0.1, raHours: 0, decDeg: 0 })
    w.ephemeris.setMoon('2026-11-04', { altitudeDeg: -10, illumination: 0.18, raHours: 0, decDeg: 0 })
    const i = ok(await w.run())
    expect(i.night).toBe('2026-11-05')
    expect(i.dark?.hours).toBe(10)
    expect(i.dark?.changeMinutes).toBe(0)
    expect(i.moon).toMatchObject({ percent: 10, trend: 'waning', upHours: 0, moonFreeHours: 10 })
    expect(i.cloud).toMatchObject({ state: 'forecast', verdict: 'clear', cloudPct: 5 })
    expect(i.sky).toMatchObject({ bortle: 3, name: 'Rural sky', from: 'class' })
    expect(i.faint).toBe('good')
    expect(w.ephemeris.nightsRequested).toContain('2026-11-04')
  })

  it('[NSI-008] Given the forecast turned off, When the insight is read, Then darkness, Moon and sky still show and the cloud says it is off', async () => {
    const w = new World()
    w.weather.setProvider(null)
    const i = ok(await w.run())
    expect(i.cloud).toEqual({ state: 'off' })
    expect(i.dark).not.toBeNull()
    expect(i.moon).not.toBeNull()
    expect(i.faint).toBe('possible')
  })

  it('[NSI-008] Given the forecast fails, When the insight is read, Then the cloud is unavailable and the rest still shows', async () => {
    const w = new World()
    w.clearSkies = () => Promise.reject(new Error('network down'))
    const i = ok(await w.run())
    expect(i.cloud).toEqual({ state: 'unavailable' })
    expect(i.dark?.hours).toBe(10)
  })

  it('[NSI-008] Given every weather source fails, When the insight is read, Then the forecast is unavailable and the night is not called cloudy', async () => {
    const w = new World()
    w.openMeteo.fail('timed out')
    const i = ok(await w.run())
    expect(i.cloud).toEqual({ state: 'unavailable' })
    expect(i.faint).toBe('possible')
  })

  it('[NSI-005] Given a forecast that stops before tonight’s dark, When the insight is read, Then tonight has no forecast yet', async () => {
    const w = new World()
    w.openMeteo.answer({ hours: [] })
    expect(ok(await w.run()).cloud).toMatchObject({ state: 'forecast', verdict: 'no-forecast' })
  })

  it('[NSI-009] Given the site is not set, When the insight is read, Then it says so and asks nothing else', async () => {
    const w = new World()
    w.planning.setSite(null)
    expect(await w.run()).toEqual({ status: 'no-site' })
    expect(w.ephemeris.nightsRequested).toEqual([])
  })

  it('[NSI-004] Given a meter reading of 19.2, When the insight is read, Then the sky is Bortle 6 from the reading', async () => {
    const w = new World()
    w.quality.set({ sqm: '19.2' })
    expect(ok(await w.run()).sky).toEqual({ bortle: 6, name: 'Bright suburban sky', sqm: 19.2, from: 'reading' })
  })

  it('[NSI-005] Given an outlook whose nights do not include tonight, When the insight is read, Then tonight’s cloud is unavailable rather than another night’s', async () => {
    const w = new World()
    const real = await w.clearSkies()
    if (real.status !== 'ok') throw new Error('no outlook')
    w.clearSkies = async () => ({ ...real, nights: real.nights.filter(n => n.night !== '2026-11-05') })
    expect(ok(await w.run()).cloud).toEqual({ state: 'unavailable' })
  })

  it('[NSI-001] Given tonight and last night, When the insight is read, Then the ephemeris is asked once for each', async () => {
    const w = new World()
    w.clearSkies = async () => ({ status: 'off' })
    await w.run()
    expect([...w.ephemeris.nightsRequested].sort()).toEqual(['2026-11-04', '2026-11-05'])
  })
})
