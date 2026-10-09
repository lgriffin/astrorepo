import { describe, expect, it } from 'vitest'
import {
  cometHeliocentric,
  cometMotion,
  cometPosition,
  cometPositionsCsv,
  GAUSS_K,
  midExposure,
  orbitPlanePosition,
  orbitProblem,
  parseMpcComet,
  TT_MINUS_UTC_SEC,
  type CometOrbit
} from '@astro/domain'

const DAY = 86_400_000
const HALLEY = '0001P         1986 02  9.4589  0.574761  0.967482  111.8566   59.0994  162.2516  19860205   4.0  6.0  1P/Halley                                                 98, 1083'

const orbit = (over: Partial<CometOrbit> = {}): CometOrbit => ({
  name: 'Test',
  perihelionAt: new Date('2026-01-01T00:00:00Z'),
  q: 1,
  e: 1,
  inclinationDeg: 0,
  nodeDeg: 0,
  periDeg: 0,
  epoch: null,
  ...over
})

describe('reading an MPC comet line', () => {
  it('[RIG-011] Given an MPC line, When read, Then every element, the epoch and the name come back, the day fraction as a TT instant', () => {
    const parsed = parseMpcComet(HALLEY)
    expect(parsed).toEqual({
      ok: true,
      orbit: {
        name: '1P/Halley',
        perihelionAt: new Date(Date.UTC(1986, 1, 9) + 0.4589 * DAY),
        q: 0.574761,
        e: 0.967482,
        inclinationDeg: 162.2516,
        nodeDeg: 59.0994,
        periDeg: 111.8566,
        epoch: '1986-02-05'
      }
    })
  })

  it('[RIG-011] Given a line whose leading spaces were lost and with no epoch or magnitudes, When read, Then it still reads', () => {
    const parsed = parseMpcComet('CK99Z999  2099 12 31.5  1.5  1.0  10  20  30  C/2099 Z999 (Test)')
    expect(parsed.ok && parsed.orbit).toMatchObject({ name: 'C/2099 Z999 (Test)', q: 1.5, e: 1, periDeg: 10, nodeDeg: 20, inclinationDeg: 30, epoch: null })
    expect(parsed.ok && parsed.orbit.perihelionAt.toISOString()).toBe('2099-12-31T12:00:00.000Z')
  })

  it('[RIG-012] Given lines that are not orbits, When read, Then each says which part is wrong', () => {
    const error = (line: string) => {
      const p = parseMpcComet(line)
      return p.ok ? null : p.error
    }
    expect(error('   ')).toContain('Paste the comet')
    expect(error('C/2023 A3 is lovely')).toContain('does not read as an MPC comet line')
    expect(error('0001P  1986 13  9.4589  0.574761  0.967482  111.8566  59.0994  162.2516')).toContain('is not a date')
    expect(error('0001P  1986 02  9.4589  0  0.967482  111.8566  59.0994  162.2516')).toContain('perihelion distance')
    expect(error('0001P  1986 02  9.4589  0.57  11  111.8566  59.0994  162.2516')).toContain('eccentricity')
    expect(error('0001P  1986 02  9.4589  0.57  0.96  111.8566  59.0994  190')).toContain('inclination')
    expect(error('0001P  1986 02  9.4589  0.57  0.96  400  59.0994  162')).toContain('argument of perihelion')
    expect(error('0001P  1986 02  9.4589  0.57  0.96  40  590  162')).toContain('node')
    expect(orbitProblem(orbit({ perihelionAt: new Date(NaN) }))).toContain('not a date')
  })

  it('[RIG-012] Given perihelion days past the end of their month, When read, Then each is not a date; a leap day and a fractional last day read', () => {
    const read = (date: string) => parseMpcComet(`0001P  ${date}  0.574761  0.967482  111.8566  59.0994  162.2516`)
    const error = (date: string) => {
      const p = read(date)
      return p.ok ? null : p.error
    }
    expect(error('2025 02 31.5')).toContain('is not a date')
    expect(error('2023 02 29.0')).toContain('is not a date')
    expect(error('2025 04 31.2')).toContain('is not a date')
    expect(error('2025 01 32')).toContain('is not a date')
    const leap = read('2024 02 29.25')
    expect(leap.ok && leap.orbit.perihelionAt.toISOString()).toBe('2024-02-29T06:00:00.000Z')
    const last = read('2025 04 30.75')
    expect(last.ok && last.orbit.perihelionAt.toISOString()).toBe('2025-04-30T18:00:00.000Z')
  })
})

describe('the two-body orbit', () => {
  it('[RIG-013] [NFR-020] Given a parabola, When the comet is 90° past perihelion (Barker: 4√2/3k days for q = 1), Then it is at (0, 2q)', () => {
    const p = orbitPlanePosition(1, 1, (4 * Math.SQRT2) / (3 * GAUSS_K))
    expect(p.x).toBeCloseTo(0, 10)
    expect(p.y).toBeCloseTo(2, 10)
    expect(p.r).toBeCloseTo(2, 10)
    const q2 = orbitPlanePosition(2, 1, ((4 * Math.SQRT2) / (3 * GAUSS_K)) * 2 ** 1.5)
    expect(q2.y).toBeCloseTo(4, 9)
    const before = orbitPlanePosition(1, 1, (-4 * Math.SQRT2) / (3 * GAUSS_K))
    expect(before.y).toBeCloseTo(-2, 10)
  })

  it('[RIG-013] [NFR-020] Given a circular orbit at 1 AU, When a quarter and several whole periods pass, Then it is a quarter round, whatever the revolutions', () => {
    const period = (2 * Math.PI) / GAUSS_K
    const quarter = orbitPlanePosition(1, 0, period / 4)
    expect(quarter.x).toBeCloseTo(0, 10)
    expect(quarter.y).toBeCloseTo(1, 10)
    const later = orbitPlanePosition(1, 0, period * 7 + period / 4)
    expect(later.y).toBeCloseTo(1, 8)
  })

  it('[RIG-013] [NFR-020] Given an ellipse with e = 0.5, When the eccentric anomaly is 90°, Then it sits at (−ae, b), Kepler\'s M = E − e sin E', () => {
    const a = 2
    const e = 0.5
    const meanAnomaly = Math.PI / 2 - e
    const dt = meanAnomaly / (GAUSS_K / a ** 1.5)
    const p = orbitPlanePosition(a * (1 - e), e, dt)
    expect(p.x).toBeCloseTo(-a * e, 10)
    expect(p.y).toBeCloseTo(a * Math.sqrt(1 - e * e), 10)
    expect(p.r).toBeCloseTo(a, 10)
  })

  it('[RIG-013] [NFR-020] Given a hyperbola with e = 1.5, When H = 1, Then it matches the hyperbolic Kepler equation M = e sinh H − H', () => {
    const q = 0.5
    const e = 1.5
    const a = q / (e - 1)
    const H = 1
    const dt = (e * Math.sinh(H) - H) / (GAUSS_K / a ** 1.5)
    const p = orbitPlanePosition(q, e, dt)
    expect(p.x).toBeCloseTo(a * (e - Math.cosh(H)), 9)
    expect(p.y).toBeCloseTo(a * Math.sqrt(e * e - 1) * Math.sinh(H), 9)
  })

  it('[RIG-013] [NFR-020] Given orbits either side of parabolic, When solved a month from perihelion, Then positions run on smoothly through e = 1', () => {
    const at = (e: number) => orbitPlanePosition(0.4, e, 30)
    for (const e of [0.9999, 1.0001]) {
      expect(Math.abs(at(e).x - at(1).x)).toBeLessThan(1e-4)
      expect(Math.abs(at(e).y - at(1).y)).toBeLessThan(1e-4)
    }
  })

  it('[RIG-013] Given a comet in the ecliptic at perihelion with ω = 90°, When placed in J2000, Then it lies on the ecliptic\'s +y axis, tilted by the obliquity', () => {
    const c = cometHeliocentric(orbit({ q: 1, e: 0.5, periDeg: 90 }), new Date('2026-01-01T00:00:00Z').getTime())
    const eps = (23.4392911 * Math.PI) / 180
    expect(c.x).toBeCloseTo(0, 10)
    expect(c.y).toBeCloseTo(Math.cos(eps), 10)
    expect(c.z).toBeCloseTo(Math.sin(eps), 10)
  })

  it('[RIG-013] Given a comet and an observer 1 AU behind it, When its position is taken, Then it is where it was when its light left, seen along the line', () => {
    const o = orbit({ q: 1, e: 0, perihelionAt: new Date('2026-01-01T00:00:00Z') })
    const at = new Date(Date.parse('2026-01-01T00:00:00Z') - TT_MINUS_UTC_SEC * 1000)
    const p = cometPosition(o, at, { x: 0, y: 0, z: 0 })
    // From the Sun, a 1 AU circular orbit: the light takes 499 s, in which the comet moves 0.0057°.
    expect(p.distanceAu).toBeCloseTo(1, 10)
    expect(p.raDeg).toBeGreaterThan(359.99)
    expect(p.decDeg).toBeLessThan(0)
    expect(p.decDeg).toBeGreaterThan(-0.01)
  })
})

describe('motion and the positions file', () => {
  it('[RIG-013] Given a light\'s start and exposure, When its middle is taken, Then it is half the exposure later; an unknown exposure is the start', () => {
    expect(midExposure(new Date('2026-01-01T00:00:00Z'), 120).toISOString()).toBe('2026-01-01T00:01:00.000Z')
    expect(midExposure(new Date('2026-01-01T00:00:00Z'), null).toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('[RIG-014] Given positions over two hours due east along the equator, When the motion is taken, Then it is the rate in arc seconds an hour at position angle 90°', () => {
    const m = cometMotion([
      { at: new Date('2026-01-01T02:00:00Z'), raDeg: 10.02, decDeg: 0 },
      { at: new Date('2026-01-01T00:00:00Z'), raDeg: 10, decDeg: 0 }
    ])
    expect(m?.arcsecPerHour).toBeCloseTo(36, 6)
    expect(m?.positionAngleDeg).toBeCloseTo(90, 6)
    expect(m?.spanHours).toBe(2)
    const north = cometMotion([{ at: new Date(0), raDeg: 10, decDeg: 0 }, { at: new Date(3600_000), raDeg: 10, decDeg: -0.01 }])
    expect(north?.positionAngleDeg).toBeCloseTo(180, 6)
    expect(cometMotion([{ at: new Date(0), raDeg: 1, decDeg: 1 }])).toBeNull()
    expect(cometMotion([{ at: new Date(0), raDeg: 1, decDeg: 1 }, { at: new Date(0), raDeg: 2, decDeg: 1 }])).toBeNull()
  })

  it('[RIG-014] Given positions, When the file is written, Then it has a header and one row per light in time order, names quoted when they need it', () => {
    const csv = cometPositionsCsv([
      { frame: 'Light_002.fit', at: new Date('2026-01-01T00:05:00Z'), raDeg: 10.5, decDeg: -5.25 },
      { frame: 'Light, "first".fit', at: new Date('2026-01-01T00:00:00Z'), raDeg: 10.4, decDeg: -5.2 }
    ])
    expect(csv).toBe(
      'frame,date_utc,ra_deg,dec_deg\n' +
        '"Light, ""first"".fit",2026-01-01T00:00:00.000Z,10.400000,-5.200000\n' +
        'Light_002.fit,2026-01-01T00:05:00.000Z,10.500000,-5.250000\n'
    )
  })
})
