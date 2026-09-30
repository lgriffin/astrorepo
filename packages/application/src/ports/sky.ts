import type { NightSky, Site } from '@astro/domain'

/**
 * Driven port: sun, moon and sidereal time for a site.
 * Adapters: astronomy-engine (desktop today), a fixed table (testkit).
 */
export interface Ephemeris {
  /**
   * The dark window of the night whose evening begins on `night` (YYYY-MM-DD, site time): from
   * astronomical dusk to dawn, or nautical when the sun never reaches -18°, sampled every half
   * hour. Null when the sun never gets 12° below the horizon.
   */
  nightSky(site: Site, night: string): Promise<NightSky | null>
  /** Moments of new moon between two instants, in order. */
  newMoons(from: Date, to: Date): Promise<Date[]>
}

/** Driven port: the planning settings the user has entered. */
export interface PlanningSettings {
  /** The observing site, or null when latitude and longitude are not set. */
  site(): Promise<Site | null>
  /** Whether the user has a dual-band or narrowband filter (the Seestar's LP filter counts). */
  hasNarrowbandFilter(): Promise<boolean>
}

export interface TargetPosition {
  targetId: string
  raHours: number
  decDeg: number
  objectType: string
}

/** Driven port: J2000 positions of catalogue targets that have them. */
export interface TargetPositions {
  listPositions(): Promise<TargetPosition[]>
}
