import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { judgeNight, type ForecastHour, type NightSky, type SkyVerdict } from '../../src'
import { propertyParams } from './arbitraries'

const HOUR = 3600 * 1000
const DUSK = Date.parse('2026-10-15T20:00:00Z')
const RANK: Record<SkyVerdict, number> = { cloudy: 0, 'clear-spells': 1, clear: 2, 'no-forecast': -1, 'no-darkness': -1 }

function sky(halfHours: number): NightSky {
  const samples = Array.from({ length: halfHours }, (_, i) => ({
    at: new Date(DUSK + (i * HOUR) / 2), lstHours: 0, moonAltitudeDeg: 0, moonIllumination: 0.5, moonRaHours: 0, moonDecDeg: 0
  }))
  return { night: '2026-10-15', darkStart: new Date(DUSK), darkEnd: new Date(DUSK + (halfHours * HOUR) / 2), darkness: 'astronomical', stepHours: 0.5, samples }
}

const forecast = (clouds: (number | null)[], rain: number[]): ForecastHour[] =>
  clouds.map((cloudPct, i) => ({ at: new Date(DUSK + i * HOUR), hours: 1, cloudPct, precipChancePct: rain[i] ?? 0, humidityPct: 50, temperatureC: 10, dewPointC: 0 }))

const night = fc.integer({ min: 2, max: 28 }).chain(halfHours =>
  fc.record({
    halfHours: fc.constant(halfHours),
    clouds: fc.array(fc.option(fc.integer({ min: 0, max: 100 }), { nil: null, freq: 8 }), { minLength: 0, maxLength: Math.ceil(halfHours / 2) + 1 }),
    rain: fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 15, maxLength: 15 })
  })
)

describe('clear skies properties', () => {
  it('[WX-002] Given any forecast, When a night is judged, Then clear hours and the longest spell fit inside the dark window and cloud stays 0 to 100', () => {
    fc.assert(
      fc.property(night, ({ halfHours, clouds, rain }) => {
        const n = judgeNight('2026-10-15', sky(halfHours), { hours: forecast(clouds, rain), nights: [], warnings: [] })
        if (n.clearHours !== null) {
          expect(n.clearHours).toBeLessThanOrEqual(n.darkHours)
          expect(n.longestSpell?.hours ?? 0).toBeLessThanOrEqual(n.clearHours + 0.05)
        }
        if (n.cloudPct !== null) expect(n.cloudPct >= 0 && n.cloudPct <= 100).toBe(true)
        if (n.verdict === 'clear') expect(n.clearHours).toBeGreaterThan(0)
        if (n.verdict === 'clear-spells') expect(n.longestSpell?.hours ?? 0).toBeGreaterThanOrEqual(2)
      }),
      propertyParams()
    )
  })

  it('[WX-002] Given any forecast, When every hour\'s cloud is lowered, Then the night never reads worse', () => {
    fc.assert(
      fc.property(night, fc.integer({ min: 0, max: 100 }), ({ halfHours, clouds, rain }, drop) => {
        const report = (cs: (number | null)[]) => ({ hours: forecast(cs, rain), nights: [], warnings: [] })
        const before = judgeNight('2026-10-15', sky(halfHours), report(clouds))
        const after = judgeNight('2026-10-15', sky(halfHours), report(clouds.map(c => (c === null ? null : Math.max(0, c - drop)))))
        expect(after.verdict === 'no-forecast').toBe(before.verdict === 'no-forecast')
        expect(RANK[after.verdict]).toBeGreaterThanOrEqual(RANK[before.verdict])
      }),
      propertyParams()
    )
  })
})
