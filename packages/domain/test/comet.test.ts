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

describe('a frame name with a carriage return', () => {
  it('[RIG-014, FUZ-006] Given a light whose name holds a carriage return, When the positions file is written, Then the name is quoted so the row does not break', () => {
    const csv = cometPositionsCsv([{ frame: 'cr\r.fit', at: new Date('2024-01-01T00:00:00Z'), raDeg: 1, decDeg: 2 }])
    expect(csv.split('\n')[1]).toBe('"cr\r.fit",2024-01-01T00:00:00.000Z,1.000000,2.000000')
  })

  it('[RIG-014] Given a light whose name holds a line feed, When the positions file is written, Then the name is quoted', () => {
    const csv = cometPositionsCsv([{ frame: 'a\nb.fit', at: new Date('2024-01-01T00:00:00Z'), raDeg: 1, decDeg: 2 }])
    expect(csv).toBe('frame,date_utc,ra_deg,dec_deg\n"a\nb.fit",2024-01-01T00:00:00.000Z,1.000000,2.000000\n')
  })

  it('[RIG-014] Given two lights at the same time, When the file is written, Then they are in name order', () => {
    const at = new Date('2024-01-01T00:00:00Z')
    const csv = cometPositionsCsv([
      { frame: 'b.fit', at, raDeg: 1, decDeg: 2 },
      { frame: 'a.fit', at, raDeg: 3, decDeg: 4 }
    ])
    expect(csv.split('\n').slice(1, 3).map(l => l.split(',')[0])).toEqual(['a.fit', 'b.fit'])
  })
})

describe('reading an MPC comet line, edge by edge', () => {
  const read = (line: string) => parseMpcComet(line)
  const error = (line: string) => {
    const p = read(line)
    return p.ok ? null : p.error
  }
  const els = (q: string, e: string, peri: string, node: string, inc: string) => `0001P  1986 02  9.5  ${q}  ${e}  ${peri}  ${node}  ${inc}`

  it('[RIG-012] Given an empty line or one that does not read, When read, Then the whole sentence says what to paste', () => {
    expect(error('')).toBe('Paste the comet’s line from the Minor Planet Center’s comet elements (CometEls.txt).')
    expect(error('\t \n')).toBe('Paste the comet’s line from the Minor Planet Center’s comet elements (CometEls.txt).')
    expect(error('hello')).toBe(
      'This does not read as an MPC comet line: it should give the perihelion year, month and day, then q, e, the argument of perihelion, the node and the inclination.'
    )
    expect(error('1986 02 9.5 0.5 0.9 10 20')).toContain('does not read as an MPC comet line')
  })

  it('[RIG-012] Given perihelion months and days just outside the calendar, When read, Then each is refused as not a date', () => {
    expect(error('0001P  1986 00  9.5  0.5  0.9  10  20  30')).toBe('The perihelion date 1986 00 9.5 is not a date.')
    expect(error('0001P  1986 13  9.5  0.5  0.9  10  20  30')).toBe('The perihelion date 1986 13 9.5 is not a date.')
    expect(error('0001P  1986 02  0.5  0.5  0.9  10  20  30')).toBe('The perihelion date 1986 02 0.5 is not a date.')
    const first = read('0001P  1986 01  1.0  0.5  0.9  10  20  30')
    expect(first.ok && first.orbit.perihelionAt.toISOString()).toBe('1986-01-01T00:00:00.000Z')
    const december = read('0001P  1986 12  31.0  0.5  0.9  10  20  30')
    expect(december.ok && december.orbit.perihelionAt.toISOString()).toBe('1986-12-31T00:00:00.000Z')
  })

  it('[RIG-011] Given lines with no name, or no name and no designation, When read, Then the designation names it, else "Comet"', () => {
    const designated = read('0001P  1986 02  9.5  0.5  0.9  10  20  30   ')
    expect(designated.ok && designated.orbit.name).toBe('0001P')
    const bare = read('1986 02  9.5  0.5  0.9  10  20  30')
    expect(bare.ok && bare.orbit).toMatchObject({ name: 'Comet', q: 0.5, e: 0.9, periDeg: 10, nodeDeg: 20, inclinationDeg: 30, epoch: null })
    const named = read('0001P  1986 02  9.5  0.5  0.9  10  20  30  20000101  4.0  6.0  1P/Halley  98, 1083   ')
    expect(named.ok && [named.orbit.name, named.orbit.epoch]).toEqual(['1P/Halley', '2000-01-01'])
  })

  it('[RIG-012] Given elements at and just past their limits, When read, Then those at the limit read and those past it are refused with the value', () => {
    expect(read(els('100', '0.9', '10', '20', '30')).ok).toBe(true)
    expect(error(els('100.5', '0.9', '10', '20', '30'))).toBe('The perihelion distance q (100.5) should be a positive number of AU.')
    expect(error(els('-0.5', '0.9', '10', '20', '30'))).toBe('The perihelion distance q (-0.5) should be a positive number of AU.')
    expect(read(els('0.5', '0', '10', '20', '30')).ok).toBe(true)
    expect(read(els('0.5', '10', '10', '20', '30')).ok).toBe(true)
    expect(error(els('0.5', '10.5', '10', '20', '30'))).toBe('The eccentricity e (10.5) should be between 0 and 10.')
    expect(error(els('0.5', '-0.1', '10', '20', '30'))).toBe('The eccentricity e (-0.1) should be between 0 and 10.')
    expect(read(els('0.5', '0.9', '10', '20', '0')).ok).toBe(true)
    expect(read(els('0.5', '0.9', '10', '20', '180')).ok).toBe(true)
    expect(error(els('0.5', '0.9', '10', '20', '180.5'))).toBe('The inclination (180.5°) should be between 0° and 180°.')
    expect(error(els('0.5', '0.9', '10', '20', '-1'))).toBe('The inclination (-1°) should be between 0° and 180°.')
    expect(read(els('0.5', '0.9', '0', '0', '30')).ok).toBe(true)
    expect(read(els('0.5', '0.9', '360', '360', '30')).ok).toBe(true)
    expect(error(els('0.5', '0.9', '360.5', '20', '30'))).toBe('The argument of perihelion (360.5°) should be between 0° and 360°.')
    expect(error(els('0.5', '0.9', '-1', '20', '30'))).toBe('The argument of perihelion (-1°) should be between 0° and 360°.')
    expect(error(els('0.5', '0.9', '10', '360.5', '30'))).toBe('The node (360.5°) should be between 0° and 360°.')
    expect(error(els('0.5', '0.9', '10', '-1', '30'))).toBe('The node (-1°) should be between 0° and 360°.')
    expect(orbitProblem(orbit({ perihelionAt: new Date(NaN) }))).toBe('The perihelion date is not a date.')
    expect(orbitProblem(orbit({ q: NaN }))).toContain('perihelion distance')
    expect(orbitProblem(orbit({ e: NaN }))).toContain('eccentricity')
    expect(orbitProblem(orbit({ inclinationDeg: NaN }))).toContain('inclination')
    expect(orbitProblem(orbit())).toBeNull()
  })
})

/** Kepler's equation solved the classical way, to check the universal-variable solver against. */
function classical(q: number, e: number, dtDays: number): { x: number; y: number } {
  if (e < 1) {
    const a = q / (1 - e)
    const M = (GAUSS_K / a ** 1.5) * dtDays
    let E = M
    for (let i = 0; i < 200; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    return { x: a * (Math.cos(E) - e), y: a * Math.sqrt(1 - e * e) * Math.sin(E) }
  }
  const a = q / (e - 1)
  const M = (GAUSS_K / a ** 1.5) * dtDays
  let H = Math.asinh(M / e)
  for (let i = 0; i < 200; i++) H -= (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1)
  return { x: a * (e - Math.cosh(H)), y: a * Math.sqrt(e * e - 1) * Math.sinh(H) }
}

describe('the two-body orbit, to the last digits', () => {
  it('[RIG-013] [NFR-020] Given near-parabolic and moderate orbits either side of perihelion, When solved, Then they match the classical Kepler solution to 1e-9 AU', () => {
    const cases: [number, number, number][] = [
      [0.4, 0.999, 30],
      [0.4, 0.999, -45],
      [0.4, 1.001, 30],
      [0.4, 1.001, -60],
      [1.2, 0.98, 200],
      [1.2, 1.02, 200],
      [0.6, 0.3, 50],
      [0.6, 0.3, -120],
      [2, 3, 400],
      [0.3, 0.7, 10]
    ]
    for (const [q, e, dt] of cases) {
      const p = orbitPlanePosition(q, e, dt)
      const c = classical(q, e, dt)
      expect(p.x).toBeCloseTo(c.x, 9)
      expect(p.y).toBeCloseTo(c.y, 9)
      expect(p.r).toBeCloseTo(Math.hypot(c.x, c.y), 9)
    }
  })

  it('[RIG-013] [NFR-020] Given an ellipse several revolutions past perihelion, When solved, Then it is where the classical solution puts it', () => {
    const [q, e] = [0.6, 0.3]
    const period = (2 * Math.PI) / (GAUSS_K / (q / (1 - e)) ** 1.5)
    for (const n of [3.3, -2.6, 100.25]) {
      const p = orbitPlanePosition(q, e, n * period)
      const c = classical(q, e, n * period)
      expect(p.x).toBeCloseTo(c.x, 8)
      expect(p.y).toBeCloseTo(c.y, 8)
    }
  })

  it('[RIG-013] [NFR-020] Given orbits so near parabolic that the series are used, When solved, Then they match the classical solution', () => {
    for (const [e, dt] of [[0.9999, 30], [1.0001, 30], [0.9995, -80], [1.0005, 80]] as const) {
      const p = orbitPlanePosition(0.4, e, dt)
      const c = classical(0.4, e, dt)
      expect(Math.abs(p.x - c.x)).toBeLessThan(1e-8)
      expect(Math.abs(p.y - c.y)).toBeLessThan(1e-8)
    }
  })

  it('[RIG-013] Given a comet with every angle set, When placed in J2000, Then it matches rotating the orbit plane by ω, i, Ω and the obliquity', () => {
    const o = orbit({ q: 0.8, e: 0.6, inclinationDeg: 37, nodeDeg: 123, periDeg: 211 })
    const t = new Date('2026-01-01T00:00:00Z').getTime() + 40 * DAY
    const { x, y } = orbitPlanePosition(0.8, 0.6, 40)
    const r = Math.PI / 180
    const rz = (a: number, v: number[]) => [Math.cos(a) * v[0] - Math.sin(a) * v[1], Math.sin(a) * v[0] + Math.cos(a) * v[1], v[2]]
    const rx = (a: number, v: number[]) => [v[0], Math.cos(a) * v[1] - Math.sin(a) * v[2], Math.sin(a) * v[1] + Math.cos(a) * v[2]]
    const ecl = rz(123 * r, rx(37 * r, rz(211 * r, [x, y, 0])))
    const eq = rx(23.4392911 * r, ecl)
    const c = cometHeliocentric(o, t)
    expect(c.x).toBeCloseTo(eq[0], 12)
    expect(c.y).toBeCloseTo(eq[1], 12)
    expect(c.z).toBeCloseTo(eq[2], 12)
  })

  it('[RIG-013] Given a comet on a 1 AU circle seen from the Sun, When its position is taken, Then it is exactly where it was 499 seconds of light earlier', () => {
    const o = orbit({ q: 1, e: 0, perihelionAt: new Date('2026-01-01T00:00:00Z') })
    const at = new Date(Date.parse('2026-01-01T00:00:00Z') - TT_MINUS_UTC_SEC * 1000)
    const p = cometPosition(o, at, { x: 0, y: 0, z: 0 })
    const theta = GAUSS_K / 173.1446326846693
    const eps = (23.4392911 * Math.PI) / 180
    const ra = (Math.atan2(-Math.sin(theta) * Math.cos(eps), Math.cos(theta)) * 180) / Math.PI + 360
    const dec = (Math.asin(-Math.sin(theta) * Math.sin(eps)) * 180) / Math.PI
    expect(p.raDeg).toBeCloseTo(ra, 9)
    expect(p.decDeg).toBeCloseTo(dec, 9)
    expect(p.distanceAu).toBeCloseTo(1, 12)
  })

  it('[RIG-013] Given an observer away from the Sun, When the comet is placed, Then the direction and distance are from the observer', () => {
    const o = orbit({ q: 1, e: 0 })
    const at = new Date(Date.parse('2026-01-01T00:00:00Z') - TT_MINUS_UTC_SEC * 1000)
    // The comet is near (1, 0, 0); an observer at (0, -1, 0) sees it along +x, +y at 45°.
    const p = cometPosition(o, at, { x: 0, y: -1, z: 0.5 })
    expect(p.raDeg).toBeGreaterThan(44)
    expect(p.raDeg).toBeLessThan(46)
    expect(p.decDeg).toBeLessThan(-19)
    expect(p.decDeg).toBeGreaterThan(-21)
    expect(p.distanceAu).toBeCloseTo(1.5, 2)
  })
})

describe('motion edges', () => {
  it('[RIG-014] Given positions moving west, or not moving at all, When the motion is taken, Then the angle is 270° and a still comet moves 0″', () => {
    const west = cometMotion([
      { at: new Date(0), raDeg: 10, decDeg: 0 },
      { at: new Date(3600_000), raDeg: 9.99, decDeg: 0 }
    ])
    expect(west?.positionAngleDeg).toBeCloseTo(270, 6)
    expect(west?.arcsec).toBeCloseTo(36, 6)
    expect(west?.arcsecPerHour).toBeCloseTo(36, 6)
    const still = cometMotion([
      { at: new Date(0), raDeg: 123.456, decDeg: 33.3 },
      { at: new Date(1800_000), raDeg: 123.456, decDeg: 33.3 }
    ])
    expect(still?.spanHours).toBe(0.5)
    expect(still?.arcsec).toBeLessThan(0.01)
    expect(Number.isNaN(still?.arcsec)).toBe(false)
    const three = cometMotion([
      { at: new Date(3600_000), raDeg: 10, decDeg: 0.005 },
      { at: new Date(7200_000), raDeg: 10, decDeg: 0.01 },
      { at: new Date(0), raDeg: 10, decDeg: 0 }
    ])
    expect(three?.spanHours).toBe(2)
    expect(three?.arcsec).toBeCloseTo(36, 6)
    expect(three?.positionAngleDeg).toBeCloseTo(0, 6)
  })

  it('[RIG-014] Given a comet moving north-east at 60° north, and its mirror in the south moving the other way, When the motion is taken, Then the angle and distance follow the sphere', () => {
    const ne = cometMotion([
      { at: new Date(0), raDeg: 10, decDeg: 60 },
      { at: new Date(3600_000), raDeg: 10.5, decDeg: 60.2 }
    ])
    expect(ne?.positionAngleDeg).toBeCloseTo(51.038969642, 6)
    expect(ne?.arcsec).toBeCloseTo(1150.4327934, 4)
    const sw = cometMotion([
      { at: new Date(0), raDeg: 10, decDeg: -60 },
      { at: new Date(3600_000), raDeg: 9.5, decDeg: -60.2 }
    ])
    expect(sw?.positionAngleDeg).toBeCloseTo(231.038969642, 6)
  })
})
