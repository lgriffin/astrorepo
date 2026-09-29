import * as Astronomy from 'astronomy-engine'
import type { Ephemeris } from '@astro/application'
import type { NightSky, Site, SkySample } from '@astro/domain'

const HOUR_MS = 3600 * 1000
const DAY_MS = 24 * HOUR_MS
const STEP_HOURS = 0.5

/**
 * Ephemeris over astronomy-engine (MIT, pure JavaScript). Moon positions are topocentric and of
 * date while targets are J2000; the difference (well under a degree) does not matter for planning.
 */
export class AstronomyEngineEphemeris implements Ephemeris {
  async nightSky(site: Site, night: string): Promise<NightSky | null> {
    const observer = new Astronomy.Observer(site.latitudeDeg, site.longitudeDeg, site.elevationM)
    const localNoon = new Date(Date.parse(`${night}T12:00:00Z`) - (site.longitudeDeg / 15) * HOUR_MS)
    const window =
      darkWindow(observer, localNoon, -18, 'astronomical') ?? darkWindow(observer, localNoon, -12, 'nautical')
    if (!window) return null

    const samples: SkySample[] = []
    for (let ms = window.start.getTime(); ms < window.end.getTime(); ms += STEP_HOURS * HOUR_MS) {
      const time = Astronomy.MakeTime(new Date(ms))
      const moon = Astronomy.Equator(Astronomy.Body.Moon, time, observer, true, true)
      const horizon = Astronomy.Horizon(time, observer, moon.ra, moon.dec, 'normal')
      samples.push({
        at: new Date(ms),
        lstHours: (((Astronomy.SiderealTime(time) + site.longitudeDeg / 15) % 24) + 24) % 24,
        moonAltitudeDeg: horizon.altitude,
        moonIllumination: Astronomy.Illumination(Astronomy.Body.Moon, time).phase_fraction,
        moonRaHours: moon.ra,
        moonDecDeg: moon.dec
      })
    }
    return { night, darkStart: window.start, darkEnd: window.end, darkness: window.darkness, stepHours: STEP_HOURS, samples }
  }

  async newMoons(from: Date, to: Date): Promise<Date[]> {
    const found: Date[] = []
    let start = Astronomy.MakeTime(from)
    while (start.date.getTime() <= to.getTime()) {
      const next = Astronomy.SearchMoonPhase(0, start, 40)
      if (!next || next.date.getTime() > to.getTime()) break
      found.push(next.date)
      start = Astronomy.MakeTime(new Date(next.date.getTime() + DAY_MS))
    }
    return found
  }
}

function darkWindow(
  observer: Astronomy.Observer,
  localNoon: Date,
  sunAltitudeDeg: number,
  darkness: NightSky['darkness']
): { start: Date; end: Date; darkness: NightSky['darkness'] } | null {
  const dusk = Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, -1, Astronomy.MakeTime(localNoon), 1, sunAltitudeDeg)
  if (!dusk) return null
  const dawn = Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, +1, dusk, 1, sunAltitudeDeg)
  if (!dawn) return null
  return { start: dusk.date, end: dawn.date, darkness }
}
