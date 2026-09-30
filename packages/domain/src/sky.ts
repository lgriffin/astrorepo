/**
 * Forward planning from the user's site: seasons, closing windows, new-moon windows and
 * bright-moon choices. Pure: the ephemeris adapter supplies sidereal time and the moon per sample,
 * and everything here is trigonometry and counting.
 */

export interface Site {
  latitudeDeg: number
  longitudeDeg: number
  elevationM: number
}

export interface SkyTarget {
  targetId: string
  targetName: string
  raHours: number
  decDeg: number
  objectType: string
  /** Usable (not rejected) integration captured so far. */
  integrationSec: number
  /** Integration still needed to reach the target's goals (per filter where set); null with no goal. */
  shortOfGoalSec: number | null
  /** A finished image (JPEG or PNG) exists for the target. */
  hasFinal: boolean
}

/** One moment inside a night's dark window. */
export interface SkySample {
  at: Date
  /** Local sidereal time at the site, in hours. */
  lstHours: number
  moonAltitudeDeg: number
  /** Fraction of the moon's disc lit, 0 to 1. */
  moonIllumination: number
  moonRaHours: number
  moonDecDeg: number
}

/** A night's dark window, sampled at a fixed step. `night` is the date the evening began. */
export interface NightSky {
  night: string
  darkStart: Date
  darkEnd: Date
  /** 'astronomical' when the sun reaches -18°; 'nautical' on summer nights when it only reaches -12°. */
  darkness: 'astronomical' | 'nautical'
  stepHours: number
  samples: SkySample[]
}

export interface PlanningPolicy {
  /** A target counts as observable above this altitude. */
  minAltitudeDeg: number
  /** A night is in season for a target when it offers at least this many usable hours. */
  minUsableHours: number
  /** How soon a season must end to be flagged as closing. */
  closingWithinDays: number
  /** Above this illumination, only targets that suit a narrowband or dual-band filter are suggested. */
  brightMoonIllumination: number
  /** Days either side of a new moon that make up its dark window. */
  newMoonHalfWidthDays: number
}

export const DEFAULT_PLANNING_POLICY: PlanningPolicy = {
  minAltitudeDeg: 30,
  minUsableHours: 1,
  closingWithinDays: 30,
  brightMoonIllumination: 0.6,
  newMoonHalfWidthDays: 3
}

const RAD = Math.PI / 180

/** Altitude of a J2000 position from the site at a local sidereal time. Refraction is ignored. */
export function altitudeDeg(latitudeDeg: number, lstHours: number, raHours: number, decDeg: number): number {
  const hourAngle = (lstHours - raHours) * 15 * RAD
  const lat = latitudeDeg * RAD
  const dec = decDeg * RAD
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD
}

/** Angle between two sky positions, in degrees. */
export function separationDeg(ra1Hours: number, dec1Deg: number, ra2Hours: number, dec2Deg: number): number {
  const d1 = dec1Deg * RAD
  const d2 = dec2Deg * RAD
  const cos = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos((ra1Hours - ra2Hours) * 15 * RAD)
  return Math.acos(Math.max(-1, Math.min(1, cos))) / RAD
}

/**
 * Hours the target spends above the minimum altitude during the night's dark window. Each sample
 * stands for the step after it, cut off at the end of darkness, so a window that is not a whole
 * number of steps is not overcounted.
 */
export function usableHours(night: NightSky, site: Site, target: Pick<SkyTarget, 'raHours' | 'decDeg'>, policy = DEFAULT_PLANNING_POLICY): number {
  const stepMs = night.stepHours * 3600 * 1000
  const endMs = night.darkEnd.getTime()
  let ms = 0
  for (const s of night.samples) {
    if (altitudeDeg(site.latitudeDeg, s.lstHours, target.raHours, target.decDeg) < policy.minAltitudeDeg) continue
    ms += Math.max(0, Math.min(stepMs, endMs - s.at.getTime()))
  }
  return Math.round((ms / (3600 * 1000)) * 100) / 100
}

export interface MonthSeason {
  /** YYYY-MM */
  month: string
  /** Average usable dark hours per night over the nights sampled in the month. */
  hoursPerNight: number
  /** Site nights of the new moons that fall in the month. */
  newMoons: string[]
}

/**
 * Averages sampled nights into months, in calendar order, marking each month's new moons.
 * `newMoonNights` are site nights (see `siteNightOf`), so a new moon shortly after midnight counts
 * for the evening before.
 */
export function monthlySeason(nights: { night: string; hours: number }[], newMoonNights: string[]): MonthSeason[] {
  const byMonth = new Map<string, number[]>()
  for (const n of nights) {
    const m = n.night.slice(0, 7)
    byMonth.set(m, [...(byMonth.get(m) ?? []), n.hours])
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, hours]) => ({
      month,
      hoursPerNight: Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10,
      newMoons: newMoonNights.filter(d => d.startsWith(month))
    }))
}

const DAY_MS = 24 * 3600 * 1000
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

export interface SeasonClosing {
  /** The first sampled night that no longer offers the minimum usable hours. */
  closesOn: string
  daysLeft: number
  hoursTonight: number
}

/**
 * Whether a target's season is ending soon: in season on the first sampled night, and out of
 * season on a later night within the policy's window. Nights must be sorted and start tonight.
 */
export function seasonClosing(nights: { night: string; hours: number }[], policy = DEFAULT_PLANNING_POLICY): SeasonClosing | null {
  if (nights.length === 0 || nights[0].hours < policy.minUsableHours) return null
  const first = nights[0].night
  for (const n of nights.slice(1)) {
    const days = daysBetween(first, n.night)
    if (days > policy.closingWithinDays) return null
    if (n.hours < policy.minUsableHours) return { closesOn: n.night, daysLeft: days, hoursTonight: nights[0].hours }
  }
  return null
}

/**
 * Whether there is still work to do on a target: short of its integration goal, or, with no goal
 * set, started but without a finished image yet.
 */
export function hasWorkLeft(t: Pick<SkyTarget, 'integrationSec' | 'shortOfGoalSec' | 'hasFinal'>): boolean {
  return t.shortOfGoalSec !== null ? t.shortOfGoalSec > 0 : t.integrationSec > 0 && !t.hasFinal
}

export interface DarkWindow {
  newMoon: string
  start: string
  end: string
}

/**
 * The dark window around each new moon: a few nights either side of it. `newMoonNights` are site
 * nights (see `siteNightOf`), so the window's dates are the evenings the user would go out.
 */
export function newMoonWindows(newMoonNights: string[], policy = DEFAULT_PLANNING_POLICY): DarkWindow[] {
  const shift = (night: string, days: number) => new Date(Date.parse(`${night}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
  return newMoonNights.map(night => ({
    newMoon: night,
    start: shift(night, -policy.newMoonHalfWidthDays),
    end: shift(night, policy.newMoonHalfWidthDays)
  }))
}

/** Object types whose light is mostly emission lines, so a dual-band or narrowband filter cuts moonlight. */
const EMISSION_TYPES = new Set(['emission_nebula', 'planetary_nebula', 'supernova_remnant', 'molecular_cloud'])

export function suitsNarrowband(objectType: string): boolean {
  return EMISSION_TYPES.has(objectType)
}

/** The brightest the moon gets while it is above the horizon in the night's dark window; 0 when it stays down. */
export function peakMoonIllumination(night: NightSky): number {
  let peak = 0
  for (const s of night.samples) if (s.moonAltitudeDeg > 0) peak = Math.max(peak, s.moonIllumination)
  return peak
}

/** The moon's phase over the night, whether or not it is up: the fraction of its disc lit. */
export function moonPhase(night: NightSky): number {
  let phase = 0
  for (const s of night.samples) phase = Math.max(phase, s.moonIllumination)
  return phase
}

export interface TonightChoice {
  targetId: string
  targetName: string
  usableHours: number
  /** Closest the moon comes to the target while it is usable, in degrees; null when the moon is down. */
  moonSeparationDeg: number | null
  /** Integration still needed to reach the goal; null when no goal is set. */
  shortOfGoalSec: number | null
}

export interface TonightPlan {
  night: string
  darkStart: Date
  darkEnd: Date
  darkness: NightSky['darkness']
  /** The moon's phase, rounded to two places, whether or not it is up. */
  moonIllumination: number
  /** The moon rises above the horizon during the dark window. */
  moonUp: boolean
  /** The moon is up and brighter than the policy allows for broadband targets. */
  brightMoon: boolean
  /** When the moon is bright and no dual-band or narrowband filter is available. */
  noFilterForBrightMoon: boolean
  choices: TonightChoice[]
}

/**
 * Tonight's targets with work left, most usable hours first. While the moon is bright, only
 * emission targets remain, and only if the user has a narrowband or dual-band filter.
 */
export function planTonight(
  night: NightSky,
  site: Site,
  targets: SkyTarget[],
  options: { hasNarrowbandFilter: boolean },
  policy = DEFAULT_PLANNING_POLICY
): TonightPlan {
  const brightMoon = peakMoonIllumination(night) > policy.brightMoonIllumination
  const choices: TonightChoice[] = []
  for (const t of targets) {
    if (!hasWorkLeft(t)) continue
    if (brightMoon && !(options.hasNarrowbandFilter && suitsNarrowband(t.objectType))) continue
    const hours = usableHours(night, site, t, policy)
    if (hours < policy.minUsableHours) continue
    let closest: number | null = null
    for (const s of night.samples) {
      if (s.moonAltitudeDeg <= 0) continue
      if (altitudeDeg(site.latitudeDeg, s.lstHours, t.raHours, t.decDeg) < policy.minAltitudeDeg) continue
      const sep = separationDeg(t.raHours, t.decDeg, s.moonRaHours, s.moonDecDeg)
      closest = closest === null ? sep : Math.min(closest, sep)
    }
    choices.push({
      targetId: t.targetId,
      targetName: t.targetName,
      usableHours: hours,
      moonSeparationDeg: closest === null ? null : Math.round(closest),
      shortOfGoalSec: t.shortOfGoalSec
    })
  }
  choices.sort((a, b) => b.usableHours - a.usableHours || a.targetName.localeCompare(b.targetName))
  return {
    night: night.night,
    darkStart: night.darkStart,
    darkEnd: night.darkEnd,
    darkness: night.darkness,
    moonIllumination: Math.round(moonPhase(night) * 100) / 100,
    moonUp: night.samples.some(s => s.moonAltitudeDeg > 0),
    brightMoon,
    noFilterForBrightMoon: brightMoon && !options.hasNarrowbandFilter,
    choices
  }
}

/**
 * The night the site is in (or about to begin) at a moment, as the date its evening began in the
 * site's mean solar time. Before local noon, that is the previous evening.
 */
export function siteNightOf(at: Date, longitudeDeg: number): string {
  const localMs = at.getTime() + (longitudeDeg / 15) * 3600 * 1000
  return new Date(localMs - 12 * 3600 * 1000).toISOString().slice(0, 10)
}

/** `count` night dates from `start`, `stepDays` apart. */
export function nightsFrom(start: string, count: number, stepDays: number): string[] {
  const base = Date.parse(`${start}T00:00:00Z`)
  return Array.from({ length: count }, (_, i) => new Date(base + i * stepDays * DAY_MS).toISOString().slice(0, 10))
}

/** Whether a site's coordinates are usable. */
export function isValidSite(site: Site): boolean {
  return (
    Number.isFinite(site.latitudeDeg) &&
    Number.isFinite(site.longitudeDeg) &&
    Math.abs(site.latitudeDeg) <= 90 &&
    Math.abs(site.longitudeDeg) <= 180
  )
}
