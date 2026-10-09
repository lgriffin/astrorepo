import { describe, it, expect } from 'vitest'
import type { Ephemeris, PlanningSettings, TargetPosition, TargetPositions } from '@astro/application'
import type { Site } from '@astro/domain'

const london: Site = { latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 20 }

/**
 * Every Ephemeris adapter must pass this suite. `make` returns an ephemeris that knows the real
 * new moons between October 2026 and January 2027 (a fake is seeded with them).
 */
export function ephemerisContract(adapterName: string, make: () => Ephemeris): void {
  describe(`Ephemeris contract: ${adapterName}`, () => {
    it('[NFR-006] Given a winter night in London, When its sky is read, Then half-hourly samples run in order inside the dark window', async () => {
      const sky = await make().nightSky(london, '2026-12-21')
      expect(sky).not.toBeNull()
      if (!sky) return
      expect(sky.night).toBe('2026-12-21')
      expect(sky.darkness).toBe('astronomical')
      expect(sky.stepHours).toBe(0.5)
      expect(sky.darkEnd.getTime()).toBeGreaterThan(sky.darkStart.getTime())
      expect(sky.darkStart.toISOString() > '2026-12-21T12:00').toBe(true)
      expect(sky.darkEnd.toISOString() < '2026-12-22T12:00').toBe(true)
      expect(sky.samples.length).toBeGreaterThan(8)
      for (const [i, s] of sky.samples.entries()) {
        expect(s.at.getTime()).toBeGreaterThanOrEqual(sky.darkStart.getTime())
        expect(s.at.getTime()).toBeLessThan(sky.darkEnd.getTime())
        if (i > 0) expect(s.at.getTime() - sky.samples[i - 1].at.getTime()).toBe(1800 * 1000)
        expect(s.lstHours).toBeGreaterThanOrEqual(0)
        expect(s.lstHours).toBeLessThan(24)
        expect(s.moonIllumination).toBeGreaterThanOrEqual(0)
        expect(s.moonIllumination).toBeLessThanOrEqual(1)
        expect(Math.abs(s.moonAltitudeDeg)).toBeLessThanOrEqual(90)
      }
    })

    it('[NFR-006] Given a range, When new moons are listed, Then they fall inside it, in order, about a lunar month apart', async () => {
      const moons = await make().newMoons(new Date('2026-10-01T00:00:00Z'), new Date('2027-01-31T00:00:00Z'))
      expect(moons.map(d => d.toISOString().slice(0, 10))).toEqual(['2026-10-10', '2026-11-09', '2026-12-09', '2027-01-07'])
      for (let i = 1; i < moons.length; i++) {
        const days = (moons[i].getTime() - moons[i - 1].getTime()) / 86400000
        expect(days).toBeGreaterThan(29)
        expect(days).toBeLessThan(30.1)
      }
    })

    it('[RIG-013] Given the March equinox, When the Earth is placed in J2000, Then it is 1 AU from the Sun on the −x axis, turned by the precession since 2000', async () => {
      const [earth] = await make().observerPositions(null, [new Date('2026-03-20T14:46:00Z')])
      expect(earth.x).toBeCloseTo(-0.996, 2)
      // The equinox of date has moved 26 × 50.3″ = 0.36° since J2000: 0.0063 AU along the ecliptic.
      expect(earth.y).toBeCloseTo(0.0063 * Math.cos((23.44 * Math.PI) / 180), 3)
      expect(earth.z).toBeCloseTo(0.0063 * Math.sin((23.44 * Math.PI) / 180), 3)
    })

    it('[RIG-013] Given a year of dates and a site, When the observer is placed, Then the Earth stays 0.983 to 1.017 AU out and the site sits one Earth radius from its centre', async () => {
      const eph = make()
      const times = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, i, 15)))
      const centre = await eph.observerPositions(null, times)
      const site = await eph.observerPositions(london, times)
      expect(centre).toHaveLength(12)
      for (const [i, c] of centre.entries()) {
        const r = Math.hypot(c.x, c.y, c.z)
        expect(r).toBeGreaterThan(0.983)
        expect(r).toBeLessThan(1.0175)
        const offset = Math.hypot(site[i].x - c.x, site[i].y - c.y, site[i].z - c.z)
        expect(offset).toBeGreaterThan(4.2e-5)
        expect(offset).toBeLessThan(4.3e-5)
      }
    })
  })
}

export interface PlanningSettingsSeed {
  site?: Site | null
  narrowband?: boolean | null
}

/** Every PlanningSettings adapter must pass this suite. `make` returns settings holding the seed. */
export function planningSettingsContract(adapterName: string, make: (seed: PlanningSettingsSeed) => PlanningSettings): void {
  describe(`PlanningSettings contract: ${adapterName}`, () => {
    it('[FWD-007] Given no site, When the site is read, Then it is null', async () => {
      expect(await make({}).site()).toBeNull()
    })

    it('[FWD-007] Given a site, When it is read, Then latitude, longitude and elevation come back', async () => {
      expect(await make({ site: london }).site()).toEqual(london)
    })

    it('[FWD-005] Given no filter answer, When it is read, Then a dual-band filter is assumed, and an explicit no is respected', async () => {
      expect(await make({}).hasNarrowbandFilter()).toBe(true)
      expect(await make({ narrowband: false }).hasNarrowbandFilter()).toBe(false)
      expect(await make({ narrowband: true }).hasNarrowbandFilter()).toBe(true)
    })
  })
}

/** Every TargetPositions adapter must pass this suite. `make` returns positions holding the seed. */
export function targetPositionsContract(adapterName: string, make: (seed: TargetPosition[]) => TargetPositions): void {
  describe(`TargetPositions contract: ${adapterName}`, () => {
    it('[FWD-001] Given targets with positions, When positions are listed, Then each comes back with its type', async () => {
      const seed: TargetPosition[] = [
        { targetId: 'target-m-31', raHours: 0.71, decDeg: 41.27, objectType: 'galaxy' },
        { targetId: 'target-ngc-7000', raHours: 20.98, decDeg: 44.33, objectType: 'emission_nebula' }
      ]
      const listed = await make(seed).listPositions()
      expect([...listed].sort((a, b) => a.targetId.localeCompare(b.targetId))).toEqual(seed)
    })
  })
}
