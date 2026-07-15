import * as Astronomy from 'astronomy-engine'
import { getSqlite } from '../db/connection'
import type { VisibilityData, PlannedTarget, TargetSummary } from '@shared/types'

export function getVisibility(targetId: string, observatoryId: string, dateStr: string): VisibilityData {
  const sqlite = getSqlite()

  const target = sqlite.prepare('SELECT ra_hours, dec_degrees FROM targets WHERE id = ?').get(targetId) as { ra_hours: number | null; dec_degrees: number | null } | undefined
  if (!target || target.ra_hours === null || target.dec_degrees === null) {
    return emptyVisibility()
  }

  const obs = sqlite.prepare('SELECT latitude, longitude, altitude_m FROM observatories WHERE id = ?').get(observatoryId) as { latitude: number; longitude: number; altitude_m: number } | undefined
  if (!obs) return emptyVisibility()

  const observer = new Astronomy.Observer(obs.latitude, obs.longitude, obs.altitude_m)
  const date = new Date(dateStr + 'T12:00:00Z')
  const astroDate = Astronomy.MakeTime(date)

  const ra = target.ra_hours
  const dec = target.dec_degrees

  const eqj = { ra, dec, dist: 1.0 }
  const hor = Astronomy.Horizon(astroDate, observer, ra, dec, 'normal')

  let riseTime: string | null = null
  let setTime: string | null = null
  let transitTime: string | null = null
  let transitAlt: number | null = null

  try {
    const maxAlt = 90 - Math.abs(obs.latitude - dec)
    if (maxAlt > 0) {
      const searchStart = Astronomy.MakeTime(new Date(dateStr + 'T18:00:00Z'))

      const hourAngle = computeHourAngle(ra, obs.longitude, date)
      const transitDate = new Date(date.getTime() - hourAngle * 3600000)
      if (transitDate.getTime() > date.getTime() - 12 * 3600000) {
        transitTime = transitDate.toISOString()
        const transitHor = Astronomy.Horizon(Astronomy.MakeTime(transitDate), observer, ra, dec, 'normal')
        transitAlt = transitHor.altitude
      }

      const riseSetPairs = computeRiseSet(ra, dec, observer, date)
      riseTime = riseSetPairs.rise
      setTime = riseSetPairs.set
    }
  } catch {
    // Object may be circumpolar or never rise
  }

  const hoursAbove = computeHoursAboveHorizon(ra, dec, observer, date)

  const moonEqj = Astronomy.Equator(Astronomy.Body.Moon, astroDate, observer, true, true)
  const moonSep = Astronomy.AngleBetween(
    Astronomy.VectorFromSphere({ lat: dec, lon: ra * 15, dist: 1 }, astroDate),
    Astronomy.VectorFromSphere({ lat: moonEqj.dec, lon: moonEqj.ra * 15, dist: 1 }, astroDate)
  )

  return {
    rise: riseTime,
    set: setTime,
    transit: transitTime,
    transitAltitude: transitAlt,
    currentAltitude: hor.altitude,
    currentAzimuth: hor.azimuth,
    bestWindowStart: riseTime,
    bestWindowEnd: setTime,
    hoursAboveHorizon: hoursAbove,
    moonSeparation: moonSep,
    available: hoursAbove > 0
  }
}

export function getTonightTargets(observatoryId: string, dateStr: string, minAltitude = 15, minHours = 1): PlannedTarget[] {
  const sqlite = getSqlite()

  const obs = sqlite.prepare('SELECT latitude, longitude, altitude_m FROM observatories WHERE id = ?').get(observatoryId) as { latitude: number; longitude: number; altitude_m: number } | undefined
  if (!obs) return []

  const targets = sqlite
    .prepare(
      `SELECT t.id, t.canonical_name, t.object_type, t.constellation, t.magnitude,
              t.workflow_stage, t.is_custom, t.ra_hours, t.dec_degrees
       FROM targets t
       WHERE t.ra_hours IS NOT NULL AND t.dec_degrees IS NOT NULL
       AND t.workflow_stage NOT IN ('published','printed','archived')
       LIMIT 500`
    )
    .all() as Array<Record<string, unknown>>

  const observer = new Astronomy.Observer(obs.latitude, obs.longitude, obs.altitude_m)
  const date = new Date(dateStr + 'T12:00:00Z')
  const planned: PlannedTarget[] = []

  for (const t of targets) {
    const ra = t.ra_hours as number
    const dec = t.dec_degrees as number

    const hoursAbove = computeHoursAboveHorizon(ra, dec, observer, date)
    if (hoursAbove < minHours) continue

    const maxAlt = 90 - Math.abs(obs.latitude - dec)
    if (maxAlt < minAltitude) continue

    const aliases = sqlite
      .prepare('SELECT alias FROM target_aliases WHERE target_id = ?')
      .all(t.id as string) as { alias: string }[]

    const vis = getVisibility(t.id as string, observatoryId, dateStr)

    planned.push({
      target: {
        id: t.id as string,
        canonicalName: t.canonical_name as string,
        objectType: t.object_type as TargetSummary['objectType'],
        constellation: t.constellation as string | null,
        magnitude: t.magnitude as number | null,
        workflowStage: t.workflow_stage as string,
        isCustom: (t.is_custom as number) === 1,
        aliases: aliases.map((a) => a.alias)
      },
      visibility: vis
    })
  }

  planned.sort((a, b) => (b.visibility.hoursAboveHorizon) - (a.visibility.hoursAboveHorizon))
  return planned
}

function emptyVisibility(): VisibilityData {
  return {
    rise: null, set: null, transit: null, transitAltitude: null,
    currentAltitude: 0, currentAzimuth: 0,
    bestWindowStart: null, bestWindowEnd: null,
    hoursAboveHorizon: 0, moonSeparation: 0, available: false
  }
}

function computeHourAngle(ra: number, longitude: number, date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5
  const t = (jd - 2451545.0) / 36525
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + t * t * (0.000387933 - t / 38710000)
  gmst = ((gmst % 360) + 360) % 360
  const lst = (gmst + longitude) / 15
  let ha = lst - ra
  if (ha < -12) ha += 24
  if (ha > 12) ha -= 24
  return ha
}

function computeHoursAboveHorizon(ra: number, dec: number, observer: Astronomy.Observer, date: Date): number {
  const cosH = -(Math.tan(observer.latitude * Math.PI / 180)) * Math.tan(dec * Math.PI / 180)
  if (cosH <= -1) return 24
  if (cosH >= 1) return 0
  const h = Math.acos(cosH) * 180 / Math.PI
  return (h / 180) * 24
}

function computeRiseSet(ra: number, dec: number, observer: Astronomy.Observer, date: Date): { rise: string | null; set: string | null } {
  const cosH = -(Math.tan(observer.latitude * Math.PI / 180)) * Math.tan(dec * Math.PI / 180)
  if (cosH <= -1 || cosH >= 1) return { rise: null, set: null }

  const hAngleDeg = Math.acos(cosH) * 180 / Math.PI
  const hAngleHours = hAngleDeg / 15

  const jd = date.getTime() / 86400000 + 2440587.5
  const t = (jd - 2451545.0) / 36525
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + t * t * (0.000387933 - t / 38710000)
  gmst = ((gmst % 360) + 360) % 360
  const lst = (gmst + observer.longitude) / 15

  let transitLST = ra
  let diff = transitLST - lst
  if (diff < -12) diff += 24
  if (diff > 12) diff -= 24

  const transitDate = new Date(date.getTime() + diff * 3600000)
  const riseDate = new Date(transitDate.getTime() - hAngleHours * 3600000)
  const setDate = new Date(transitDate.getTime() + hAngleHours * 3600000)

  return {
    rise: riseDate.toISOString(),
    set: setDate.toISOString()
  }
}
