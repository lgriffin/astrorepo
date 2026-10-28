import { describe, expect, it } from 'vitest'
import { AXIAL_TILT_DEG, TWILIGHT_DEPTHS, darknessAt, dayOfYear, lowestSunDepth, solarDeclination, tonightSky } from '@astro/domain'

describe('The Sun through the year', () => {
  it('[LRN-015] Given dates, When counted, Then 1 January is day 1 and leap years run to 366', () => {
    expect(dayOfYear('2026-01-01')).toBe(1)
    expect(dayOfYear('2026-02-01')).toBe(32)
    expect(dayOfYear('2026-12-31')).toBe(365)
    expect(dayOfYear('2028-12-31')).toBe(366)
  })

  it('[LRN-015] Given the solstices and an equinox, When the Sun’s declination is worked out, Then it is ±23.44° and about 0°', () => {
    expect(solarDeclination(172)).toBeCloseTo(AXIAL_TILT_DEG, 2)
    expect(solarDeclination(355)).toBeCloseTo(-AXIAL_TILT_DEG, 2)
    expect(Math.abs(solarDeclination(80))).toBeLessThan(1)
    expect(solarDeclination(0)).toBeCloseTo(-AXIAL_TILT_DEG * Math.cos(((2 * Math.PI) / 365) * 10), 10)
  })

  it('[LRN-015] Given a latitude and a day, When the Sun is at its lowest, Then its depth is 90° less |latitude + declination|', () => {
    expect(lowestSunDepth(53.3, 172)).toBeCloseTo(90 - 53.3 - solarDeclination(172), 10)
    expect(lowestSunDepth(-33.9, 355)).toBeCloseTo(90 - Math.abs(-33.9 + solarDeclination(355)), 10)
    expect(lowestSunDepth(0, 80)).toBeCloseTo(90 - Math.abs(solarDeclination(80)), 10)
    // The midnight sun: the Sun stays up.
    expect(lowestSunDepth(70, 172)).toBeLessThan(0)
  })

  it('[LRN-015] Given depths either side of 6°, 12° and 18°, When judged, Then each stage of twilight ends at its depth', () => {
    expect(TWILIGHT_DEPTHS).toEqual({ civil: 6, nautical: 12, astronomical: 18 })
    expect(darknessAt(18)).toBe('full')
    expect(darknessAt(17.99)).toBe('nautical')
    expect(darknessAt(12)).toBe('nautical')
    expect(darknessAt(11.99)).toBe('civil')
    expect(darknessAt(6)).toBe('civil')
    expect(darknessAt(5.99)).toBe('none')
    expect(darknessAt(-3)).toBe('none')
  })
})

describe('Tonight’s darkness', () => {
  it('[LRN-015] [LRN-016] Given Dublin at midsummer, When worked out, Then the night is nautical and full darkness returns at the end of July', () => {
    const t = tonightSky(53.3, '2026-06-21')
    expect(t.lowestSunDeg).toBeCloseTo(13.3, 1)
    expect(t.darkness).toBe('nautical')
    expect(t.fullDarkReturns).toBe('2026-07-30')
    expect(t.fullDarkEnds).toBeNull()
    expect(t.latitudeDeg).toBe(53.3)
    expect(t.night).toBe('2026-06-21')
  })

  it('[LRN-016] Given Dublin in autumn, When worked out, Then the night is fully dark until mid May', () => {
    const t = tonightSky(53.3, '2026-10-28')
    expect(t.lowestSunDeg).toBeCloseTo(50.7, 1)
    expect(t.darkness).toBe('full')
    expect(t.fullDarkEnds).toBe('2027-05-15')
    expect(t.fullDarkReturns).toBeNull()
  })

  it('[LRN-016] Given places where it never changes, When worked out, Then no change is named', () => {
    const sydney = tonightSky(-33.9, '2026-12-21')
    expect(sydney.darkness).toBe('full')
    expect(sydney.fullDarkEnds).toBeNull()
    expect(sydney.fullDarkReturns).toBeNull()
    expect(tonightSky(0, '2026-03-20').fullDarkEnds).toBeNull()
  })

  it('[LRN-015] [LRN-016] Given the far north at midsummer, When worked out, Then twilight lasts all night or the Sun stays up', () => {
    expect(tonightSky(58, '2026-06-21').darkness).toBe('civil')
    expect(tonightSky(62, '2026-06-21').darkness).toBe('none')
    const north = tonightSky(70, '2026-06-21')
    expect(north.darkness).toBe('none')
    expect(north.lowestSunDeg).toBeLessThan(0)
    expect(north.fullDarkReturns).toBe('2026-09-16')
  })
})
