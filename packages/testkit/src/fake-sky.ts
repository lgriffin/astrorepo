import type { NightSky, Site, SkySample, Vec3 } from '@astro/domain'
import type { Ephemeris, PlanningSettings, TargetPosition, TargetPositions } from '@astro/application'

export interface FakeMoon {
  altitudeDeg: number
  illumination: number
  raHours: number
  decDeg: number
}

const HOUR_MS = 3600 * 1000
const MOON_DOWN: FakeMoon = { altitudeDeg: -30, illumination: 0, raHours: 0, decDeg: 0 }

/** Greenwich mean sidereal time in hours (the standard low-precision formula, good to a second). */
export function gmstHours(at: Date): number {
  const days = at.getTime() / (24 * HOUR_MS) + 2440587.5 - 2451545
  const deg = 280.46061837 + 360.98564736629 * days
  return (((deg % 360) + 360) % 360) / 15
}

/**
 * An ephemeris with real sidereal time but a scripted sun and moon: every night is dark from
 * 20:00 to 04:00 site mean time unless a test says otherwise, and the moon is down unless set.
 */
export class FakeEphemeris implements Ephemeris {
  private readonly moons = new Map<string, FakeMoon>()
  private readonly lightNights = new Set<string>()
  private readonly nauticalNights = new Set<string>()
  private newMoonDates: Date[] = []
  readonly nightsRequested: string[] = []

  constructor(private readonly darkHours = 8) {}

  setMoon(night: string, moon: FakeMoon): this {
    this.moons.set(night, moon)
    return this
  }

  /** The sun never gets 12° down on this night. */
  noDarkness(night: string): this {
    this.lightNights.add(night)
    return this
  }

  /** The sun gets 12° but not 18° down on this night. */
  nauticalOnly(night: string): this {
    this.nauticalNights.add(night)
    return this
  }

  setNewMoons(dates: string[]): this {
    this.newMoonDates = dates.map(d => new Date(d))
    return this
  }

  async nightSky(site: Site, night: string): Promise<NightSky | null> {
    this.nightsRequested.push(night)
    if (this.lightNights.has(night)) return null
    const localMidnight = Date.parse(`${night}T00:00:00Z`) + 24 * HOUR_MS - (site.longitudeDeg / 15) * HOUR_MS
    const start = localMidnight - (this.darkHours / 2) * HOUR_MS
    const end = localMidnight + (this.darkHours / 2) * HOUR_MS
    const moon = this.moons.get(night) ?? MOON_DOWN
    const samples: SkySample[] = []
    for (let ms = start; ms < end; ms += HOUR_MS / 2) {
      const at = new Date(ms)
      samples.push({
        at,
        lstHours: (((gmstHours(at) + site.longitudeDeg / 15) % 24) + 24) % 24,
        moonAltitudeDeg: moon.altitudeDeg,
        moonIllumination: moon.illumination,
        moonRaHours: moon.raHours,
        moonDecDeg: moon.decDeg
      })
    }
    return {
      night,
      darkStart: new Date(start),
      darkEnd: new Date(end),
      darkness: this.nauticalNights.has(night) ? 'nautical' : 'astronomical',
      stepHours: 0.5,
      samples
    }
  }

  async newMoons(from: Date, to: Date): Promise<Date[]> {
    return this.newMoonDates.filter(d => d >= from && d <= to).map(d => new Date(d))
  }

  /** The Earth from the low-precision solar theory (Meeus, chapter 25), good to about 0.01°, plus the site's offset. */
  async observerPositions(site: Site | null, times: Date[]): Promise<Vec3[]> {
    return times.map(at => earthLowPrecision(at, site))
  }
}

const RAD = Math.PI / 180
const EARTH_RADIUS_AU = 6378.137 / 149_597_870.7

/** The Earth's heliocentric J2000 equatorial position from the Sun's apparent orbit, with an observer's offset. */
export function earthLowPrecision(at: Date, site: Site | null): Vec3 {
  const t = (at.getTime() / (24 * HOUR_MS) + 2440587.5 - 2451545) / 36525
  const l0 = 280.46646 + 36000.76983 * t
  const m = (357.52911 + 35999.05029 * t) * RAD
  const e = 0.016708634 - 0.000042037 * t
  const c = (1.914602 - 0.004817 * t) * Math.sin(m) + (0.019993 - 0.000101 * t) * Math.sin(2 * m) + 0.000289 * Math.sin(3 * m)
  // The Sun's longitude of date, brought back to the J2000 equinox.
  const lon = (l0 + c - 1.397 * t) * RAD
  const r = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(m + c * RAD))
  const eps = 23.4392911 * RAD
  const [x, y] = [-r * Math.cos(lon), -r * Math.sin(lon)]
  const earth = { x, y: y * Math.cos(eps), z: y * Math.sin(eps) }
  if (!site) return earth
  const lst = ((gmstHours(at) + site.longitudeDeg / 15) * 15) * RAD
  const lat = site.latitudeDeg * RAD
  return {
    x: earth.x + EARTH_RADIUS_AU * Math.cos(lat) * Math.cos(lst),
    y: earth.y + EARTH_RADIUS_AU * Math.cos(lat) * Math.sin(lst),
    z: earth.z + EARTH_RADIUS_AU * Math.sin(lat)
  }
}

export class InMemoryPlanningSettings implements PlanningSettings {
  constructor(
    private current: Site | null = null,
    private narrowband = true
  ) {}

  setSite(site: Site | null): this {
    this.current = site
    return this
  }

  setNarrowband(has: boolean): this {
    this.narrowband = has
    return this
  }

  async site(): Promise<Site | null> {
    return this.current ? { ...this.current } : null
  }

  async hasNarrowbandFilter(): Promise<boolean> {
    return this.narrowband
  }
}

export class InMemoryTargetPositions implements TargetPositions {
  private readonly positions = new Map<string, TargetPosition>()

  add(position: TargetPosition): this {
    this.positions.set(position.targetId, { ...position })
    return this
  }

  async listPositions(): Promise<TargetPosition[]> {
    return [...this.positions.values()].map(p => ({ ...p }))
  }
}
