import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CLEAR_SKY_POLICY,
  forecastAt,
  isClearHour,
  isDewHour,
  judgeNight,
  mergeReports,
  warningsBetween,
  type ForecastHour,
  type NightSky,
  type StationNight,
  type WeatherReport,
  type WeatherWarning
} from '../src'

const HOUR = 3600 * 1000
const NIGHT = '2026-10-15'
const DUSK = Date.parse('2026-10-15T20:00:00Z')

/** A dark window from 20:00 UTC lasting `hours`, sampled every half hour, the moon `lit` (0 to 1). */
function sky(hours = 8, lit = 0): NightSky {
  const samples = []
  for (let ms = DUSK; ms < DUSK + hours * HOUR; ms += HOUR / 2) {
    samples.push({ at: new Date(ms), lstHours: 0, moonAltitudeDeg: -10, moonIllumination: lit, moonRaHours: 0, moonDecDeg: 0 })
  }
  return { night: NIGHT, darkStart: new Date(DUSK), darkEnd: new Date(DUSK + hours * HOUR), darkness: 'astronomical', stepHours: 0.5, samples }
}

const hour = (offsetHours: number, over: Partial<ForecastHour> = {}): ForecastHour => ({
  at: new Date(DUSK + offsetHours * HOUR),
  hours: 1,
  cloudPct: 10,
  precipChancePct: 5,
  humidityPct: 70,
  temperatureC: 8,
  dewPointC: 2,
  ...over
})

/** Hourly forecasts from dusk, one per cloud value given. */
const clouds = (...values: (number | null)[]): ForecastHour[] => values.map((cloudPct, i) => hour(i, { cloudPct }))

const report = (over: Partial<WeatherReport> = {}): WeatherReport => ({ hours: [], nights: [], warnings: [], ...over })

const station = (over: Partial<StationNight> = {}): StationNight => ({
  night: NIGHT,
  rainChance: 0.1,
  frostChance: 0.2,
  lowC: 3,
  cloudPct: null,
  brief: 'A cold, clear night.',
  ...over
})

const warning = (over: Partial<WeatherWarning> = {}): WeatherWarning => ({
  level: 'yellow',
  headline: 'Wind warning',
  onset: new Date('2026-10-15T18:00:00Z'),
  expiry: new Date('2026-10-16T06:00:00Z'),
  ...over
})

describe('forecastAt', () => {
  it('[WX-002] Given periods, When an instant is looked up, Then the first period covering it wins and each period ends before its next hour', () => {
    const first = hour(0, { cloudPct: 1 })
    const overlap = hour(0, { cloudPct: 2, hours: 6 })
    const hours = [first, overlap]
    expect(forecastAt(hours, new Date(DUSK))).toBe(first)
    expect(forecastAt(hours, new Date(DUSK + HOUR - 1))).toBe(first)
    expect(forecastAt(hours, new Date(DUSK + HOUR))).toBe(overlap)
    expect(forecastAt(hours, new Date(DUSK + 6 * HOUR - 1))).toBe(overlap)
    expect(forecastAt(hours, new Date(DUSK + 6 * HOUR))).toBeNull()
    expect(forecastAt(hours, new Date(DUSK - 1))).toBeNull()
  })
})

describe('isClearHour and isDewHour', () => {
  it('[WX-002] Given cloud at 25% or less and rain below 40%, When judged, Then the hour is clear, and any more of either is not', () => {
    expect(isClearHour(hour(0, { cloudPct: 25, precipChancePct: 39 }))).toBe(true)
    expect(isClearHour(hour(0, { cloudPct: 0, precipChancePct: null }))).toBe(true)
    expect(isClearHour(hour(0, { cloudPct: 26, precipChancePct: 0 }))).toBe(false)
    expect(isClearHour(hour(0, { cloudPct: 25, precipChancePct: 40 }))).toBe(false)
    expect(isClearHour(hour(0, { cloudPct: null, precipChancePct: 0 }))).toBe(false)
  })

  it('[WX-008] Given 95% humidity or a dew point within 2 °C, When judged, Then dew is likely, and not at 94% with a 2.1 °C spread', () => {
    expect(isDewHour(hour(0, { humidityPct: 95, temperatureC: null }))).toBe(true)
    expect(isDewHour(hour(0, { humidityPct: 94, temperatureC: 5, dewPointC: 3 }))).toBe(true)
    expect(isDewHour(hour(0, { humidityPct: 94, temperatureC: 5.1, dewPointC: 3 }))).toBe(false)
    expect(isDewHour(hour(0, { humidityPct: null, temperatureC: null, dewPointC: 3 }))).toBe(false)
    expect(isDewHour(hour(0, { humidityPct: null, temperatureC: 3, dewPointC: null }))).toBe(false)
  })
})

describe('judgeNight', () => {
  it('[WX-001, WX-002] Given a night forecast clear throughout, When judged, Then it is clear skies with its hours, cloud, rain and moon', () => {
    const n = judgeNight(NIGHT, sky(8, 0.456), report({ hours: clouds(10, 10, 20, 0, 10, 10, 10, 20).map((h, i) => ({ ...h, precipChancePct: i })) }))
    expect(n).toMatchObject({
      night: NIGHT,
      verdict: 'clear',
      darkHours: 8,
      clearHours: 8,
      cloudPct: 11,
      precipChancePct: 7,
      moonPercent: 46,
      dew: false,
      heldBackByStation: false,
      station: null
    })
    expect(n.darkStart?.toISOString()).toBe('2026-10-15T20:00:00.000Z')
    expect(n.darkEnd?.toISOString()).toBe('2026-10-16T04:00:00.000Z')
    expect(n.longestSpell).toEqual({ start: new Date(DUSK), end: new Date(DUSK + 8 * HOUR), hours: 8 })
  })

  it('[WX-002] Given exactly three quarters of the night clear, When judged, Then it is clear, and a half hour less gives clear spells', () => {
    expect(judgeNight(NIGHT, sky(8), report({ hours: clouds(10, 10, 10, 10, 10, 10, 90, 90) })).verdict).toBe('clear')
    const spells = judgeNight(NIGHT, sky(8), report({ hours: [hour(5, { cloudPct: 10, hours: 0.5 }), ...clouds(10, 10, 10, 10, 10, 90, 90, 90)] }))
    expect(spells.clearHours).toBe(5.5)
    expect(spells.verdict).toBe('clear-spells')
  })

  it('[WX-002] Given a clear stretch, a cloudy hour, then a longer clear stretch, When judged, Then the longest stretch is the one given', () => {
    const n = judgeNight(NIGHT, sky(8), report({ hours: clouds(10, 10, 90, 10, 10, 10, 90, 90) }))
    expect(n.verdict).toBe('clear-spells')
    expect(n.clearHours).toBe(5)
    expect(n.longestSpell).toEqual({ start: new Date(DUSK + 3 * HOUR), end: new Date(DUSK + 6 * HOUR), hours: 3 })
  })

  it('[WX-002] Given two clear stretches of the same length, When judged, Then the earlier one is kept', () => {
    const n = judgeNight(NIGHT, sky(8), report({ hours: clouds(10, 10, 90, 90, 10, 10, 90, 90) }))
    expect(n.longestSpell?.start).toEqual(new Date(DUSK))
    expect(n.longestSpell?.hours).toBe(2)
  })

  it('[WX-002] Given a two-hour clear stretch, When judged, Then it has clear spells, and an hour and a half is cloudy', () => {
    expect(judgeNight(NIGHT, sky(8), report({ hours: clouds(10, 10, 90, 90, 90, 90, 90, 90) })).verdict).toBe('clear-spells')
    const short = judgeNight(NIGHT, sky(8), report({ hours: [hour(1, { cloudPct: 10, hours: 0.5 }), ...clouds(10, 90, 90, 90, 90, 90, 90, 90)] }))
    expect(short.longestSpell?.hours).toBe(1.5)
    expect(short.verdict).toBe('cloudy')
  })

  it('[WX-002] Given an overcast night, When judged, Then it is cloudy with no clear spell', () => {
    const n = judgeNight(NIGHT, sky(8), report({ hours: clouds(80, 90, 100, 100, 100, 100, 90, 80) }))
    expect(n).toMatchObject({ verdict: 'cloudy', clearHours: 0, longestSpell: null, cloudPct: 93 })
  })

  it('[WX-002] Given a forecast hour with no cloud figure, When judged, Then it breaks a clear stretch and is not counted', () => {
    const n = judgeNight(NIGHT, sky(8), report({ hours: clouds(10, 10, null, 10, 10, 10, 10, 10) }))
    expect(n.clearHours).toBe(7)
    expect(n.longestSpell?.hours).toBe(5)
    expect(n.verdict).toBe('clear')
    expect(n.cloudPct).toBe(10)
  })

  it('[WX-002] Given six-hourly forecasts, When judged, Then each covers its six hours', () => {
    const n = judgeNight(NIGHT, sky(8), report({ hours: [hour(-2, { hours: 6, cloudPct: 0 }), hour(4, { hours: 6, cloudPct: 100 })] }))
    expect(n.clearHours).toBe(4)
    expect(n.cloudPct).toBe(50)
    expect(n.verdict).toBe('clear-spells')
  })

  it('[WX-002] Given a dark window ending part way through a half hour, When judged, Then only the dark part counts', () => {
    const s = sky(8)
    const short: NightSky = { ...s, darkEnd: new Date(DUSK + 7.75 * HOUR), samples: [...s.samples, { ...s.samples[0], at: new Date(DUSK + 8 * HOUR) }] }
    const n = judgeNight(NIGHT, short, report({ hours: clouds(10, 10, 10, 10, 10, 10, 10, 10, 10) }))
    expect(n.darkHours).toBe(7.8)
    expect(n.clearHours).toBe(7.8)
    expect(n.longestSpell?.end).toEqual(new Date(DUSK + 7.75 * HOUR))
  })

  it('[WX-007] Given a forecast that covers exactly half the dark window, When judged, Then the night is judged on that half', () => {
    const n = judgeNight(NIGHT, sky(8), report({ hours: clouds(10, 10, 10, 10) }))
    expect(n.verdict).toBe('clear')
    expect(n.clearHours).toBe(4)
  })

  it('[WX-007] Given a forecast covering less than half the night and nothing from the station, When judged, Then there is no forecast yet, not a guess', () => {
    const n = judgeNight(NIGHT, sky(8), report({ hours: [...clouds(10, 10, 10), hour(3, { hours: 0.5 })] }))
    expect(n).toMatchObject({ verdict: 'no-forecast', clearHours: null, longestSpell: null, cloudPct: null, precipChancePct: null, dew: false })
  })

  it('[WX-007] Given no hourly forecast but the station gives the night\'s cloud, When judged, Then the station\'s cloud decides, not "no forecast"', () => {
    const judge = (cloudPct: number) => judgeNight(NIGHT, sky(8), report({ nights: [station({ cloudPct })] }))
    expect(judge(25).verdict).toBe('clear')
    expect(judge(26).verdict).toBe('clear-spells')
    expect(judge(74.6).verdict).toBe('clear-spells')
    expect(judge(75).verdict).toBe('cloudy')
    expect(judge(74.6).cloudPct).toBe(75)
    expect(judge(25).clearHours).toBeNull()
  })

  it('[WX-004] Given a clear forecast and the station giving rain 60%, When judged, Then the night is held back to clear spells, and 59% does not', () => {
    const clear = report({ hours: clouds(10, 10, 10, 10, 10, 10, 10, 10) })
    const held = judgeNight(NIGHT, sky(8), { ...clear, nights: [station({ rainChance: 0.6 })] })
    expect(held.verdict).toBe('clear-spells')
    expect(held.heldBackByStation).toBe(true)
    expect(held.station?.rainChance).toBe(0.6)
    const kept = judgeNight(NIGHT, sky(8), { ...clear, nights: [station({ rainChance: 0.59 })] })
    expect(kept).toMatchObject({ verdict: 'clear', heldBackByStation: false })
    expect(judgeNight(NIGHT, sky(8), { ...clear, nights: [station({ rainChance: null })] }).verdict).toBe('clear')
  })

  it('[WX-004] Given the station\'s forecast for another evening, When a night is judged, Then it is not used for this one', () => {
    const n = judgeNight(NIGHT, sky(8), report({ hours: clouds(10, 10, 10, 10, 10, 10, 10, 10), nights: [station({ night: '2026-10-14', rainChance: 0.9 })] }))
    expect(n).toMatchObject({ verdict: 'clear', station: null, heldBackByStation: false })
  })

  it('[WX-004] Given a cloudy night the station also calls wet, When judged, Then it stays cloudy and is not marked held back', () => {
    const n = judgeNight(NIGHT, sky(8), report({ hours: clouds(90, 90, 90, 90, 90, 90, 90, 90), nights: [station({ rainChance: 0.9 })] }))
    expect(n).toMatchObject({ verdict: 'cloudy', heldBackByStation: false })
  })

  it('[WX-008] Given one humid dark hour, When judged, Then dew is likely, and humid hours outside the dark window do not count', () => {
    const hours = clouds(10, 10, 10, 10, 10, 10, 10, 10)
    hours[3] = { ...hours[3], humidityPct: 96 }
    expect(judgeNight(NIGHT, sky(8), report({ hours })).dew).toBe(true)
    expect(judgeNight(NIGHT, sky(8), report({ hours: [...clouds(10, 10, 10, 10, 10, 10, 10, 10), hour(9, { humidityPct: 99 })] })).dew).toBe(false)
  })

  it('[WX-008] Given a humid dark hour with no cloud figure, When judged, Then dew is still likely', () => {
    const hours = clouds(10, 10, 10, null, 10, 10, 10, 10)
    hours[3] = { ...hours[3], humidityPct: 97 }
    const n = judgeNight(NIGHT, sky(8), report({ hours }))
    expect(n.clearHours).toBe(7)
    expect(n.dew).toBe(true)
  })

  it('[WX-001] Given a night with no dark window, When judged, Then it says so, keeps the station\'s forecast and the warnings of that day', () => {
    const n = judgeNight(NIGHT, null, report({
      hours: clouds(10),
      nights: [station()],
      warnings: [warning(), warning({ headline: 'Earlier', onset: new Date('2026-10-14T00:00:00Z'), expiry: new Date('2026-10-15T12:00:00Z') })]
    }))
    expect(n).toMatchObject({ verdict: 'no-darkness', darkStart: null, darkEnd: null, darkHours: 0, clearHours: null, moonPercent: null, cloudPct: null })
    expect(n.station?.brief).toBe('A cold, clear night.')
    expect(n.warnings.map(w => w.headline)).toEqual(['Wind warning'])
  })

  it('[WX-004] Given warnings before, during and after the dark window, When judged, Then only those in force during it are kept', () => {
    const n = judgeNight(NIGHT, sky(8), report({
      hours: clouds(10, 10, 10, 10, 10, 10, 10, 10),
      warnings: [
        warning({ headline: 'During' }),
        warning({ headline: 'Ended at dusk', onset: new Date(DUSK - 5 * HOUR), expiry: new Date(DUSK) }),
        warning({ headline: 'Starts at dawn', onset: new Date(DUSK + 8 * HOUR), expiry: null })
      ]
    }))
    expect(n.warnings.map(w => w.headline)).toEqual(['During'])
  })

  it('[WX-002] Given a custom policy, When judged, Then its thresholds are used', () => {
    const strict = { ...DEFAULT_CLEAR_SKY_POLICY, clearCloudPct: 5 }
    expect(judgeNight(NIGHT, sky(8), report({ hours: clouds(10, 10, 10, 10, 10, 10, 10, 10) }), strict).verdict).toBe('cloudy')
  })
})

describe('warningsBetween', () => {
  it('[WX-004] Given open-ended warnings, When filtered, Then a missing onset or expiry counts as always in force on that side', () => {
    const from = new Date(DUSK)
    const to = new Date(DUSK + HOUR)
    const kept = warningsBetween([
      warning({ headline: 'no onset', onset: null, expiry: new Date(DUSK + 1) }),
      warning({ headline: 'no expiry', onset: new Date(DUSK + HOUR - 1), expiry: null }),
      warning({ headline: 'no times', onset: null, expiry: null }),
      warning({ headline: 'starts at the end', onset: to, expiry: null }),
      warning({ headline: 'ends at the start', onset: null, expiry: from })
    ], from, to)
    expect(kept.map(w => w.headline)).toEqual(['no onset', 'no expiry', 'no times'])
  })
})

describe('mergeReports', () => {
  it('[WX-003, WX-006] Given several reports, When merged, Then hours keep source order, the first source\'s night wins and a repeated warning is kept once', () => {
    const a = report({ hours: [hour(0, { cloudPct: 1 })], nights: [station({ brief: 'first' })], warnings: [warning()] })
    const b = report({
      hours: [hour(0, { cloudPct: 2 })],
      nights: [station({ brief: 'second' }), station({ night: '2026-10-16', brief: 'other night' })],
      warnings: [warning(), warning({ level: 'orange' })]
    })
    const merged = mergeReports([a, b])
    expect(merged.hours.map(h => h.cloudPct)).toEqual([1, 2])
    expect(merged.nights.map(n => n.brief)).toEqual(['first', 'other night'])
    expect(merged.warnings.map(w => w.level)).toEqual(['yellow', 'orange'])
    expect(mergeReports([])).toEqual(report())
  })

  it('[WX-004] Given warnings that differ only in onset or expiry, When merged, Then both are kept', () => {
    const merged = mergeReports([report({ warnings: [warning(), warning({ onset: null }), warning({ expiry: null }), warning({ headline: 'Rain' })] })])
    expect(merged.warnings).toHaveLength(4)
  })
})
