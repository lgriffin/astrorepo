import { describe, it, expect } from 'vitest'
import {
  altitudeDeg,
  DEFAULT_PLANNING_POLICY,
  hasWorkLeft,
  isValidSite,
  monthlySeason,
  newMoonWindows,
  nightsFrom,
  peakMoonIllumination,
  planTonight,
  seasonClosing,
  separationDeg,
  siteNightOf,
  suitsNarrowband,
  usableHours,
  type NightSky,
  type SkyTarget
} from '@astro/domain'

const london = { latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 20 }

/** A night whose samples sit at the given sidereal times, with one moon for the whole night. */
function night(lsts: number[], moon = { alt: -10, illum: 0, ra: 0, dec: 0 }, darkness: NightSky['darkness'] = 'astronomical'): NightSky {
  const start = new Date('2026-09-29T20:00:00Z')
  return {
    night: '2026-09-29',
    darkStart: start,
    darkEnd: new Date(start.getTime() + lsts.length * 1800 * 1000),
    darkness,
    stepHours: 0.5,
    samples: lsts.map((lstHours, i) => ({
      at: new Date(start.getTime() + i * 1800 * 1000),
      lstHours,
      moonAltitudeDeg: moon.alt,
      moonIllumination: moon.illum,
      moonRaHours: moon.ra,
      moonDecDeg: moon.dec
    }))
  }
}

const target = (name: string, raHours: number, decDeg: number, extra: Partial<SkyTarget> = {}): SkyTarget => ({
  targetId: `target-${name.toLowerCase().replace(/ /g, '-')}`,
  targetName: name,
  raHours,
  decDeg,
  objectType: 'galaxy',
  integrationSec: 3600,
  goalSec: null,
  hasFinal: false,
  ...extra
})

describe('sky geometry', () => {
  it('[FWD-006] Given a target on the meridian, When its altitude is computed, Then it is 90° minus the gap between latitude and declination', () => {
    expect(altitudeDeg(51.5, 3, 3, 51.5)).toBeCloseTo(90, 6)
    expect(altitudeDeg(51.5, 3, 3, 0)).toBeCloseTo(38.5, 6)
    expect(altitudeDeg(51.5, 15, 3, 0)).toBeCloseTo(-38.5, 6)
  })

  it('[FWD-006] Given two positions, When their separation is computed, Then it is the angle between them on the sky', () => {
    expect(separationDeg(5, 20, 5, 20)).toBeCloseTo(0, 6)
    expect(separationDeg(0, 0, 6, 0)).toBeCloseTo(90, 6)
    expect(separationDeg(1, 89.9, 13, 89.9)).toBeCloseTo(0.2, 6)
  })

  it('[FWD-006] Given a night sampled every half hour, When usable hours are counted, Then only samples at or above 30° count', () => {
    // Dec 0 from 51.5°N peaks at 38.5°: above 30° within about 2.6 h of the meridian.
    const n = night([0, 1, 2, 3, 4, 5, 6, 7, 8].map(h => h + 0.5))
    expect(usableHours(n, london, { raHours: 4.5, decDeg: 0 })).toBe(2.5)
    expect(usableHours(n, london, { raHours: 16, decDeg: 0 })).toBe(0)
  })

  it('[FWD-006] Given darkness that ends ten minutes after the last sample, When usable hours are counted, Then that sample counts for ten minutes, not a whole step', () => {
    const n = night([4, 4.5])
    const short = { ...n, darkEnd: new Date(n.samples[1].at.getTime() + 10 * 60 * 1000) }
    expect(usableHours(short, london, { raHours: 4.25, decDeg: 0 })).toBe(Math.round((0.5 + 10 / 60) * 100) / 100)
  })
})

describe('seasons', () => {
  it('[FWD-001] Given weekly nights, When they are grouped by month, Then each month averages its nights and lists its new moons in order', () => {
    const months = monthlySeason(
      [
        { night: '2026-11-03', hours: 4 },
        { night: '2026-10-06', hours: 2 },
        { night: '2026-10-13', hours: 3 }
      ],
      ['2026-10-10', '2026-11-08']
    )
    expect(months).toEqual([
      { month: '2026-10', hoursPerNight: 2.5, newMoons: ['2026-10-10'] },
      { month: '2026-11', hoursPerNight: 4, newMoons: ['2026-11-08'] }
    ])
  })

  it('[FWD-002] Given a target in season tonight, When a night within 30 days drops below an hour, Then the first such night and the days left are reported', () => {
    const nights = nightsFrom('2026-09-29', 35, 1).map((n, i) => ({ night: n, hours: i < 12 ? 1.5 : 0.5 }))
    expect(seasonClosing(nights)).toEqual({ closesOn: '2026-10-11', daysLeft: 12, hoursTonight: 1.5 })
  })

  it('[FWD-002] Given a target out of season tonight or closing beyond 30 days, When the season is checked, Then nothing is reported', () => {
    const late = nightsFrom('2026-09-29', 35, 1).map((n, i) => ({ night: n, hours: i < 32 ? 2 : 0 }))
    expect(seasonClosing(late)).toBeNull()
    expect(seasonClosing([{ night: '2026-09-29', hours: 0.5 }, { night: '2026-09-30', hours: 0 }])).toBeNull()
    expect(seasonClosing([])).toBeNull()
    expect(seasonClosing(nightsFrom('2026-09-29', 35, 1).map(n => ({ night: n, hours: 3 })))).toBeNull()
  })

  it('[FWD-004] Given new-moon site nights, When dark windows are made, Then each spans three nights either side, across month ends', () => {
    expect(newMoonWindows(['2026-10-10', '2026-12-30'])).toEqual([
      { newMoon: '2026-10-10', start: '2026-10-07', end: '2026-10-13' },
      { newMoon: '2026-12-30', start: '2026-12-27', end: '2027-01-02' }
    ])
  })

  it('[FWD-001] Given a target with a goal, no goal, or a finished image, When work left is judged, Then only unfinished targets have work left', () => {
    expect(hasWorkLeft({ integrationSec: 3600, goalSec: 7200, hasFinal: true })).toBe(true)
    expect(hasWorkLeft({ integrationSec: 7200, goalSec: 7200, hasFinal: false })).toBe(false)
    expect(hasWorkLeft({ integrationSec: 3600, goalSec: null, hasFinal: false })).toBe(true)
    expect(hasWorkLeft({ integrationSec: 3600, goalSec: null, hasFinal: true })).toBe(false)
    expect(hasWorkLeft({ integrationSec: 0, goalSec: null, hasFinal: false })).toBe(false)
  })
})

describe('tonight', () => {
  const lsts = [22, 22.5, 23, 23.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]
  const m31 = target('M 31', 0.71, 41.27)
  const m33 = target('M 33', 1.56, 30.66)
  const ngc7000 = target('NGC 7000', 20.98, 44.33, { objectType: 'emission_nebula' })
  const done = target('M 45', 3.79, 24.12, { goalSec: 3600, integrationSec: 3600 })
  const low = target('M 83', 13.62, -29.87)

  it('[FWD-006] Given a dark moonless night, When tonight is planned, Then targets with work left that are up an hour are listed, most hours first', () => {
    const plan = planTonight(night(lsts), london, [m33, low, done, ngc7000, m31], { hasNarrowbandFilter: false })
    expect(plan.brightMoon).toBe(false)
    expect(plan.choices.map(c => c.targetName)).toEqual(['M 31', 'M 33', 'NGC 7000'])
    expect(plan.choices.every(c => c.moonSeparationDeg === null)).toBe(true)
    expect(plan.darkStart).toEqual(new Date('2026-09-29T20:00:00Z'))
  })

  it('[FWD-006] Given the moon up, When tonight is planned, Then each choice says how close the moon comes while the target is usable', () => {
    const plan = planTonight(night(lsts, { alt: 30, illum: 0.3, ra: 2.5, dec: 15 }), london, [m31], { hasNarrowbandFilter: false })
    expect(plan.choices[0].moonSeparationDeg).toBe(Math.round(separationDeg(0.71, 41.27, 2.5, 15)))
  })

  it('[FWD-005] Given a bright moon and a dual-band filter, When tonight is planned, Then only emission targets remain', () => {
    const plan = planTonight(night(lsts, { alt: 40, illum: 0.9, ra: 2, dec: 10 }), london, [m31, m33, ngc7000], { hasNarrowbandFilter: true })
    expect(plan.brightMoon).toBe(true)
    expect(plan.noFilterForBrightMoon).toBe(false)
    expect(plan.moonIllumination).toBe(0.9)
    expect(plan.choices.map(c => c.targetName)).toEqual(['NGC 7000'])
  })

  it('[FWD-005] Given a bright moon and no such filter, When tonight is planned, Then nothing is suggested and the plan says why', () => {
    const plan = planTonight(night(lsts, { alt: 40, illum: 0.9, ra: 2, dec: 10 }), london, [m31, ngc7000], { hasNarrowbandFilter: false })
    expect(plan.choices).toEqual([])
    expect(plan.noFilterForBrightMoon).toBe(true)
  })

  it('[FWD-005] Given a full moon that stays below the horizon, When tonight is planned, Then it does not count as bright but its phase is still reported', () => {
    const n = night(lsts, { alt: -5, illum: 1, ra: 12, dec: 0 })
    expect(peakMoonIllumination(n)).toBe(0)
    const plan = planTonight(n, london, [m31], { hasNarrowbandFilter: false })
    expect(plan.choices).toHaveLength(1)
    expect(plan).toMatchObject({ brightMoon: false, moonUp: false, moonIllumination: 1 })
  })

  it('[FWD-005] Given a moon just over 60% lit, When tonight is planned, Then it is bright even though it rounds to 60%', () => {
    const plan = planTonight(night(lsts, { alt: 40, illum: 0.604, ra: 2, dec: 10 }), london, [m31], { hasNarrowbandFilter: false })
    expect(plan).toMatchObject({ brightMoon: true, moonUp: true, moonIllumination: 0.6 })
    expect(plan.choices).toEqual([])
  })

  it('[FWD-005] Given object types, When their filter suitability is judged, Then emission, planetary, supernova remnant and molecular cloud suit narrowband', () => {
    expect(['emission_nebula', 'planetary_nebula', 'supernova_remnant', 'molecular_cloud'].every(suitsNarrowband)).toBe(true)
    expect(['galaxy', 'reflection_nebula', 'open_cluster', 'globular_cluster'].some(suitsNarrowband)).toBe(false)
  })

  it('[FWD-008] Given a night with only nautical darkness, When tonight is planned, Then the plan carries that darkness', () => {
    expect(planTonight(night(lsts, undefined, 'nautical'), london, [m31], { hasNarrowbandFilter: false }).darkness).toBe('nautical')
  })
})

describe('site time', () => {
  it('[FWD-006] Given a moment and a longitude, When the site night is found, Then it is the date the local evening began', () => {
    expect(siteNightOf(new Date('2026-09-30T01:00:00Z'), -0.13)).toBe('2026-09-29')
    expect(siteNightOf(new Date('2026-09-29T13:00:00Z'), -0.13)).toBe('2026-09-29')
    expect(siteNightOf(new Date('2026-09-29T11:00:00Z'), -0.13)).toBe('2026-09-28')
    // 20:00 UTC is 06:00 the next morning at 150°E, so still the evening before.
    expect(siteNightOf(new Date('2026-09-29T20:00:00Z'), 150)).toBe('2026-09-29')
  })

  it('[FWD-001] Given a start and a step, When nights are listed, Then they run across month and year ends', () => {
    expect(nightsFrom('2026-12-24', 3, 7)).toEqual(['2026-12-24', '2026-12-31', '2027-01-07'])
  })

  it('[FWD-007] Given site coordinates, When they are validated, Then out-of-range or missing values are rejected', () => {
    expect(isValidSite({ latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 0 })).toBe(true)
    expect(isValidSite({ latitudeDeg: 95, longitudeDeg: 0, elevationM: 0 })).toBe(false)
    expect(isValidSite({ latitudeDeg: Number.NaN, longitudeDeg: 0, elevationM: 0 })).toBe(false)
    expect(isValidSite({ latitudeDeg: 0, longitudeDeg: 181, elevationM: 0 })).toBe(false)
  })

  it('[FWD-005] Given the default policy, When it is read, Then bright means more than 60% lit and usable means 30° for an hour', () => {
    expect(DEFAULT_PLANNING_POLICY).toMatchObject({ minAltitudeDeg: 30, minUsableHours: 1, brightMoonIllumination: 0.6, closingWithinDays: 30 })
  })
})
