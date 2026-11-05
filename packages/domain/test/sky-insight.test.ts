import { describe, expect, it } from 'vitest'
import {
  BORTLE_CLASSES,
  bortleFromSqm,
  cloudInsight,
  darkInsight,
  faintTargets,
  hoursText,
  insightSummary,
  moonInDark,
  moonPhaseName,
  readSkyQuality,
  skyInsight,
  type CloudInsight,
  type NightOutlook,
  type NightSky,
  type SkyQuality
} from '../src'

const HOUR = 3600 * 1000
const DUSK = Date.parse('2026-11-05T18:00:00Z')

/** A dark window from 18:00 UTC lasting `hours`, sampled each half hour; `moonUp(i)` says whether the Moon is up at sample i. */
function sky(opts: { hours?: number; lit?: number | ((i: number) => number); moonUp?: (i: number) => boolean; darkness?: NightSky['darkness']; dusk?: number } = {}): NightSky {
  const hours = opts.hours ?? 10
  const dusk = opts.dusk ?? DUSK
  const samples = []
  for (let i = 0; i < hours * 2; i++) {
    const lit = typeof opts.lit === 'function' ? opts.lit(i) : opts.lit ?? 0.1
    samples.push({ at: new Date(dusk + i * HOUR / 2), lstHours: 0, moonAltitudeDeg: opts.moonUp?.(i) ? 20 : -20, moonIllumination: lit, moonRaHours: 0, moonDecDeg: 0 })
  }
  return { night: new Date(dusk).toISOString().slice(0, 10), darkStart: new Date(dusk), darkEnd: new Date(dusk + hours * HOUR), darkness: opts.darkness ?? 'astronomical', stepHours: 0.5, samples }
}

function outlook(over: Partial<NightOutlook> = {}): NightOutlook {
  return {
    night: '2026-11-05',
    verdict: 'clear',
    darkStart: new Date(DUSK),
    darkEnd: new Date(DUSK + 10 * HOUR),
    darkHours: 10,
    clearHours: 9,
    longestSpell: { start: new Date(DUSK), end: new Date(DUSK + 9 * HOUR), hours: 9 },
    cloudPct: 12,
    precipChancePct: 5,
    dew: false,
    moonPercent: 10,
    station: null,
    heldBackByStation: false,
    warnings: [],
    ...over
  }
}

const rural: SkyQuality = { bortle: 3, name: 'Rural sky', sqm: null, from: 'class' }
const city: SkyQuality = { bortle: 8, name: 'City sky', sqm: null, from: 'class' }

describe('Your sky on the Bortle scale', () => {
  it('[NSI-003] Given the scale, When it is read, Then there are nine classes darkest first, named as Wikipedia names them', () => {
    expect(BORTLE_CLASSES.map(c => c.bortle)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(BORTLE_CLASSES[2].name).toBe('Rural sky')
    expect(BORTLE_CLASSES[8].name).toBe('Inner-city sky')
  })

  it('[NSI-003] Given a class saved and no reading, When the sky is read, Then the class and its name come back', () => {
    expect(readSkyQuality({ bortle: ' 4 ', sqm: null })).toEqual({ bortle: 4, name: 'Rural/suburban transition', sqm: null, from: 'class' })
  })

  it('[NSI-004] Given readings on the edges of the ranges, When the class is worked out, Then each falls in the darker class at its lower bound', () => {
    expect(bortleFromSqm(22)).toBe(1)
    expect(bortleFromSqm(21.99)).toBe(1)
    expect(bortleFromSqm(21.9)).toBe(2)
    expect(bortleFromSqm(21.8)).toBe(3)
    expect(bortleFromSqm(21)).toBe(4)
    expect(bortleFromSqm(19.5)).toBe(5)
    expect(bortleFromSqm(19)).toBe(6)
    expect(bortleFromSqm(18.5)).toBe(7)
    expect(bortleFromSqm(17)).toBe(8)
  })

  it('[NSI-004] Given a reading and a class, When the sky is read, Then the measured reading wins', () => {
    expect(readSkyQuality({ bortle: '6', sqm: '21.82' })).toEqual({ bortle: 3, name: 'Rural sky', sqm: 21.82, from: 'reading' })
  })

  it('[NSI-004] Given a reading out of range or not a number, When the sky is read, Then the class is used instead, and with no valid class it is unknown', () => {
    expect(readSkyQuality({ bortle: '5', sqm: '35' })?.from).toBe('class')
    expect(readSkyQuality({ bortle: '5', sqm: 'dark' })?.bortle).toBe(5)
    expect(readSkyQuality({ bortle: '0', sqm: null })).toBeNull()
    expect(readSkyQuality({ bortle: '4.5', sqm: '' })).toBeNull()
    expect(readSkyQuality({ bortle: null, sqm: null })).toBeNull()
  })
})

describe('Darkness and the Moon tonight', () => {
  it('[NSI-001] Given tonight 10 h dark and last night 9 h 48 min, When darkness is read, Then it is 10 h, 12 min longer', () => {
    const d = darkInsight(sky({ hours: 10 }), sky({ hours: 9.8, dusk: DUSK - 24 * HOUR }))
    expect(d.hours).toBe(10)
    expect(d.changeMinutes).toBe(12)
    expect(d.darkness).toBe('astronomical')
  })

  it('[NSI-001] Given last night had no dark window, When darkness is read, Then the change is not known', () => {
    expect(darkInsight(sky(), null).changeMinutes).toBeNull()
  })

  it('[NSI-002] Given the Moon up for the last two hours of a 10 h dark, When it is read, Then it is up 2 h from 02:00, leaving 8 h without it', () => {
    const m = moonInDark(sky({ moonUp: i => i >= 16, lit: 0.1 }), sky({ lit: 0.18, dusk: DUSK - 24 * HOUR }))
    expect(m.upHours).toBe(2)
    expect(m.moonFreeHours).toBe(8)
    expect(m.upFrom?.toISOString()).toBe('2026-11-06T02:00:00.000Z')
    expect(m.upTo?.toISOString()).toBe('2026-11-06T04:00:00.000Z')
    expect(m.percent).toBe(10)
    expect(m.trend).toBe('waning')
  })

  it('[NSI-002] Given no last night, When the trend is read, Then tonight’s first and last samples tell it, and a flat Moon has none', () => {
    expect(moonInDark(sky({ lit: i => 0.3 + i * 0.001 }), null).trend).toBe('waxing')
    expect(moonInDark(sky({ lit: 0.3 }), null).trend).toBeNull()
    expect(moonInDark(sky({ moonUp: () => false }), null).upFrom).toBeNull()
  })

  it('[NSI-002] Given the lit share and trend, When the phase is named, Then it reads as people say it', () => {
    expect(moonPhaseName(1, 'waxing')).toBe('New moon')
    expect(moonPhaseName(99, null)).toBe('Full moon')
    expect(moonPhaseName(10, 'waning')).toBe('Waning crescent')
    expect(moonPhaseName(50, 'waxing')).toBe('First quarter')
    expect(moonPhaseName(50, 'waning')).toBe('Last quarter')
    expect(moonPhaseName(50, null)).toBe('Quarter moon')
    expect(moonPhaseName(70, 'waxing')).toBe('Waxing gibbous')
    expect(moonPhaseName(30, null)).toBe('Crescent moon')
    expect(moonPhaseName(70, null)).toBe('Gibbous moon')
  })

  it('[NSI-001] Given hours, When they are written, Then they read as hours and minutes', () => {
    expect(hoursText(9.67)).toBe('9 h 40 min')
    expect(hoursText(0.75)).toBe('45 min')
    expect(hoursText(2)).toBe('2 h')
  })
})

describe('Tonight for faint targets', () => {
  const dark = darkInsight(sky(), null)
  const moonless = moonInDark(sky(), null)
  const clear = cloudInsight(outlook())

  it('[NSI-005] Given tonight’s outlook, When the cloud is read, Then its verdict, cover, clear hours, spell and dew come straight from it', () => {
    expect(clear).toEqual({ state: 'forecast', verdict: 'clear', cloudPct: 12, clearHours: 9, spell: outlook().longestSpell, dew: false })
  })

  it('[NSI-006] Given a clear, moonless, astronomically dark night under a rural sky, When it is rated, Then it is good', () => {
    expect(faintTargets(dark, moonless, clear, rural)).toBe('good')
    expect(insightSummary('good', dark, moonless, clear, rural)).toBe('A good night for faint galaxies and nebulae: 10 h of dark without the Moon, forecast clear.')
  })

  it('[NSI-006] Given the same night under a city sky or only nautical dark, When it is rated, Then it is only possible, and the sentence says why', () => {
    expect(faintTargets(dark, moonless, clear, city)).toBe('possible')
    expect(insightSummary('possible', dark, moonless, clear, city)).toBe('Possible for faint targets: a bright Bortle 8 sky.')
    const nautical = darkInsight(sky({ darkness: 'nautical' }), null)
    expect(faintTargets(nautical, moonless, clear, rural)).toBe('possible')
    expect(insightSummary('possible', nautical, moonless, clear, rural)).toContain('the sky only gets nautically dark')
  })

  it('[NSI-006] Given a cloudy night or the Moon up nearly all the dark, When it is rated, Then it is poor', () => {
    const cloudy = cloudInsight(outlook({ verdict: 'cloudy' }))
    expect(faintTargets(dark, moonless, cloudy, rural)).toBe('poor')
    expect(insightSummary('poor', dark, moonless, cloudy, rural)).toMatch(/^Cloud is forecast/)
    const bright = moonInDark(sky({ moonUp: i => i >= 1, lit: 0.95 }), null)
    expect(faintTargets(dark, bright, clear, rural)).toBe('poor')
    expect(insightSummary('poor', dark, bright, clear, rural)).toMatch(/^The Moon is up for nearly all/)
  })

  it('[NSI-007] Given clear spells and only two moonless hours, When it is summed up, Then both reasons are named', () => {
    const spells: CloudInsight = cloudInsight(outlook({ verdict: 'clear-spells', longestSpell: { start: new Date(DUSK), end: new Date(DUSK + 3 * HOUR), hours: 3 } }))
    const short = moonInDark(sky({ moonUp: i => i >= 4 }), null)
    expect(faintTargets(dark, short, spells, rural)).toBe('possible')
    expect(insightSummary('possible', dark, short, spells, rural)).toBe('Possible for faint targets: clear for 3 h at best, only 2 h of dark without the Moon.')
  })

  it('[NSI-008] Given the forecast turned off or not readable, When the night is rated, Then it is rated without the cloud and the sentence says the cloud is not known', () => {
    for (const state of ['off', 'unavailable'] as const) {
      const c = cloudInsight(state)
      expect(c).toEqual({ state })
      expect(faintTargets(dark, moonless, c, rural)).toBe('possible')
      expect(insightSummary('possible', dark, moonless, c, rural)).toBe('Possible for faint targets: the cloud is not known.')
    }
  })

  it('[NSI-006] Given no dark window tonight, When the insight is built, Then there is no proper dark and no moon tile', () => {
    const i = skyInsight({ night: '2026-06-21', sky: null, previous: null, outlook: 'off', quality: rural })
    expect(i.faint).toBe('none')
    expect(i.dark).toBeNull()
    expect(i.moon).toBeNull()
    expect(i.summary).toMatch(/^No proper dark tonight/)
    expect(i.sky).toEqual(rural)
  })

  it('[NSI-001] [NSI-002] [NSI-005] Given a full night, When the insight is built, Then every part is there', () => {
    const i = skyInsight({ night: '2026-11-05', sky: sky(), previous: sky({ dusk: DUSK - 24 * HOUR, lit: 0.15 }), outlook: outlook(), quality: null })
    expect(i.dark?.hours).toBe(10)
    expect(i.moon?.trend).toBe('waning')
    expect(i.cloud.state).toBe('forecast')
    expect(i.faint).toBe('good')
  })
})
