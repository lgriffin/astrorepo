import { describe, expect, it } from 'vitest'
import { cometPosition, parseMpcComet, TT_MINUS_UTC_SEC } from '@astro/domain'
import { AstronomyEngineEphemeris } from '../../src/main/adapters/astronomy-engine-ephemeris'

/**
 * Meeus, Astronomical Algorithms (2nd ed.), example 33.a: comet Encke on 1990 October 6.0 TT from
 * its osculating elements, equinox J2000. The published astrometric place is α = 10h 34m 14.2s,
 * δ = +19° 09′ 31″, at 0.8243 AU.
 */
const ENCKE = '0002P         1990 10 28.54502  0.330886  0.850220  186.23352  334.75006   11.94524  19901006   9.8  6.0  2P/Encke'
const PUBLISHED = { raDeg: (10 + 34 / 60 + 14.2 / 3600) * 15, decDeg: 19 + 9 / 60 + 31 / 3600 }

describe('comet positions against a published ephemeris', () => {
  it('[NFR-020] [RIG-013] Given Encke\'s elements and the Earth from astronomy-engine, When placed at 1990 October 6.0 TT, Then it is within 1′ of Meeus\' example (in practice a few arc seconds)', async () => {
    const parsed = parseMpcComet(ENCKE)
    if (!parsed.ok) throw new Error(parsed.error)
    // The solver adds today's TT − UTC; 1990's was 57.184 s, which moves the Earth only 360 km.
    const at = new Date(Date.UTC(1990, 9, 6) - TT_MINUS_UTC_SEC * 1000)
    const [earth] = await new AstronomyEngineEphemeris().observerPositions(null, [new Date(Date.UTC(1990, 9, 6) - 57_184)])
    const p = cometPosition(parsed.orbit, at, earth)
    const dRa = (p.raDeg - PUBLISHED.raDeg) * Math.cos((PUBLISHED.decDeg * Math.PI) / 180) * 3600
    const dDec = (p.decDeg - PUBLISHED.decDeg) * 3600
    expect(Math.hypot(dRa, dDec)).toBeLessThan(60)
    expect(Math.hypot(dRa, dDec)).toBeLessThan(5)
    expect(p.distanceAu).toBeCloseTo(0.8243, 3)
  })

  it('[NFR-020] Given a site, When the comet is placed from it, Then parallax moves a comet 0.8 AU away by no more than about 11″', async () => {
    const parsed = parseMpcComet(ENCKE)
    if (!parsed.ok) throw new Error(parsed.error)
    const eph = new AstronomyEngineEphemeris()
    const when = new Date('1990-10-06T00:00:00Z')
    const [centre] = await eph.observerPositions(null, [when])
    const [site] = await eph.observerPositions({ latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 20 }, [when])
    const a = cometPosition(parsed.orbit, when, centre)
    const b = cometPosition(parsed.orbit, when, site)
    const shift = Math.hypot((a.raDeg - b.raDeg) * Math.cos((a.decDeg * Math.PI) / 180), a.decDeg - b.decDeg) * 3600
    expect(shift).toBeGreaterThan(1)
    expect(shift).toBeLessThan(8.794 / 0.8243 + 0.5)
  })
})
