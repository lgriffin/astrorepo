import * as Astronomy from 'astronomy-engine'
import { getSqlite } from '../db/connection'
import type { AltitudePoint, BestTargetTonight, MoonInfo, TwilightTimes, MonthlyVisibility } from '@shared/types'

function makeObserver(lat: number, lon: number, elevation = 0): Astronomy.Observer {
  return new Astronomy.Observer(lat, lon, elevation)
}

export function getTargetAltitudeCurve(
  targetId: string,
  date: string,
  lat: number,
  lon: number,
  elevation = 0
): AltitudePoint[] {
  const sqlite = getSqlite()
  const target = sqlite.prepare(
    'SELECT ra_hours, dec_degrees FROM targets WHERE id = ?'
  ).get(targetId) as { ra_hours: number | null; dec_degrees: number | null } | undefined

  if (!target?.ra_hours || target.dec_degrees === null || target.dec_degrees === undefined) return []

  const observer = makeObserver(lat, lon, elevation)
  const raDeg = target.ra_hours * 15
  const dec = target.dec_degrees

  const noon = Astronomy.MakeTime(new Date(`${date}T12:00:00Z`))
  const sunset = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, noon, 1)
  const sunrise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, noon, 1)

  if (!sunset || !sunrise) return []

  const points: AltitudePoint[] = []
  const startMs = sunset.date.getTime()
  let endMs = sunrise.date.getTime()
  if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000

  for (let ms = startMs; ms <= endMs; ms += 15 * 60 * 1000) {
    const t = Astronomy.MakeTime(new Date(ms))
    const hor = Astronomy.Horizon(t, observer, raDeg, dec, 'normal')
    points.push({
      time: new Date(ms).toISOString(),
      altitude: Math.round(hor.altitude * 100) / 100,
      azimuth: Math.round(hor.azimuth * 100) / 100
    })
  }

  return points
}

export function getBestTargetsTonight(
  lat: number,
  lon: number,
  elevation = 0
): BestTargetTonight[] {
  const sqlite = getSqlite()
  const targets = sqlite.prepare(
    'SELECT id, canonical_name, object_type, ra_hours, dec_degrees FROM targets WHERE ra_hours IS NOT NULL AND dec_degrees IS NOT NULL'
  ).all() as Array<{ id: string; canonical_name: string; object_type: string; ra_hours: number; dec_degrees: number }>

  if (targets.length === 0) return []

  const observer = makeObserver(lat, lon, elevation)
  const now = new Date()
  const dateStr = now.toISOString().substring(0, 10)
  const noon = Astronomy.MakeTime(new Date(`${dateStr}T12:00:00Z`))
  const sunset = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, noon, 1)
  const sunrise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, noon, 1)

  if (!sunset || !sunrise) return []

  const startMs = sunset.date.getTime()
  let endMs = sunrise.date.getTime()
  if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000

  const results: BestTargetTonight[] = []

  for (const t of targets) {
    const raDeg = t.ra_hours * 15
    let maxAlt = -90
    let transitTime: string | null = null
    let hoursAbove30 = 0

    for (let ms = startMs; ms <= endMs; ms += 15 * 60 * 1000) {
      const time = Astronomy.MakeTime(new Date(ms))
      const hor = Astronomy.Horizon(time, observer, raDeg, t.dec_degrees, 'normal')
      if (hor.altitude > maxAlt) {
        maxAlt = hor.altitude
        transitTime = new Date(ms).toISOString()
      }
      if (hor.altitude >= 30) hoursAbove30 += 0.25
    }

    if (maxAlt > 10) {
      results.push({
        targetId: t.id,
        targetName: t.canonical_name,
        objectType: t.object_type,
        maxAltitude: Math.round(maxAlt * 10) / 10,
        transitTime,
        hoursAbove30: Math.round(hoursAbove30 * 100) / 100
      })
    }
  }

  results.sort((a, b) => b.maxAltitude - a.maxAltitude)
  return results.slice(0, 20)
}

export function getMoonInfo(date: string): MoonInfo {
  const t = Astronomy.MakeTime(new Date(`${date}T00:00:00Z`))
  const phase = Astronomy.MoonPhase(t)
  const illum = Astronomy.Illumination(Astronomy.Body.Moon, t)

  let phaseName: string
  if (phase < 15 || phase >= 345) phaseName = 'New Moon'
  else if (phase < 75) phaseName = 'Waxing Crescent'
  else if (phase < 105) phaseName = 'First Quarter'
  else if (phase < 165) phaseName = 'Waxing Gibbous'
  else if (phase < 195) phaseName = 'Full Moon'
  else if (phase < 255) phaseName = 'Waning Gibbous'
  else if (phase < 285) phaseName = 'Last Quarter'
  else phaseName = 'Waning Crescent'

  return {
    phase: Math.round(phase * 10) / 10,
    illumination: Math.round(illum.phase_fraction * 1000) / 10,
    phaseName
  }
}

export function getTwilightTimes(
  date: string,
  lat: number,
  lon: number,
  elevation = 0
): TwilightTimes {
  const observer = makeObserver(lat, lon, elevation)
  const noon = Astronomy.MakeTime(new Date(`${date}T12:00:00Z`))

  const sunset = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, noon, 1)
  const sunrise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, noon, 1)

  const civilDusk = Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, -1, noon, 1, -6)
  const civilDawn = Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, +1, noon, 1, -6)
  const nauticalDusk = Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, -1, noon, 1, -12)
  const nauticalDawn = Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, +1, noon, 1, -12)
  const astronomicalDusk = Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, -1, noon, 1, -18)
  const astronomicalDawn = Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, +1, noon, 1, -18)

  return {
    sunset: sunset?.date.toISOString() ?? null,
    sunrise: sunrise?.date.toISOString() ?? null,
    civilDusk: civilDusk?.date.toISOString() ?? null,
    civilDawn: civilDawn?.date.toISOString() ?? null,
    nauticalDusk: nauticalDusk?.date.toISOString() ?? null,
    nauticalDawn: nauticalDawn?.date.toISOString() ?? null,
    astronomicalDusk: astronomicalDusk?.date.toISOString() ?? null,
    astronomicalDawn: astronomicalDawn?.date.toISOString() ?? null
  }
}

export function getTargetVisibility(
  targetId: string,
  lat: number,
  lon: number,
  elevation = 0
): MonthlyVisibility[] {
  const sqlite = getSqlite()
  const target = sqlite.prepare(
    'SELECT ra_hours, dec_degrees FROM targets WHERE id = ?'
  ).get(targetId) as { ra_hours: number | null; dec_degrees: number | null } | undefined

  if (!target?.ra_hours || target.dec_degrees === null || target.dec_degrees === undefined) return []

  const observer = makeObserver(lat, lon, elevation)
  const raDeg = target.ra_hours * 15
  const dec = target.dec_degrees

  const now = new Date()
  const results: MonthlyVisibility[] = []

  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 15, 0, 0, 0)
    const month = d.toISOString().substring(0, 7)
    const midnight = Astronomy.MakeTime(d)
    const hor = Astronomy.Horizon(midnight, observer, raDeg, dec, 'normal')

    results.push({
      month,
      maxAltitude: Math.round(hor.altitude * 10) / 10,
      isVisible: hor.altitude > 15
    })
  }

  return results
}
