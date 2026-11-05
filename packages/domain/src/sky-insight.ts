/**
 * Tonight's sky at a glance (specs/043-sky-insight): how long it is properly dark, how lit the Moon
 * is and how much of the dark it is up for, the forecast cloud, and how dark the user's sky is on
 * the Bortle scale. Pure: the ephemeris supplies the night, spec 036 the forecast, and the user the
 * sky quality, since a light-pollution atlas is too large to ship and only a model anyway.
 */

import type { NightSky } from './sky'
import { moonPhase } from './sky'
import type { ClearSpell, NightOutlook, SkyVerdict } from './clear-skies'

const HOUR_MS = 3600 * 1000

/** One class of the Bortle dark-sky scale, as Wikipedia's "Bortle scale" gives it. */
export interface BortleClass {
  bortle: number
  name: string
  /** The faintest zenith sky brightness of the class in mag/arcsec²; null below 18.38, where 8 and 9 share one range. */
  sqmFrom: number | null
}

/** The nine classes, darkest first (NSI-003). */
export const BORTLE_CLASSES: readonly BortleClass[] = [
  { bortle: 1, name: 'Excellent dark-sky site', sqmFrom: 21.99 },
  { bortle: 2, name: 'Typical truly dark site', sqmFrom: 21.89 },
  { bortle: 3, name: 'Rural sky', sqmFrom: 21.69 },
  { bortle: 4, name: 'Rural/suburban transition', sqmFrom: 20.49 },
  { bortle: 5, name: 'Suburban sky', sqmFrom: 19.5 },
  { bortle: 6, name: 'Bright suburban sky', sqmFrom: 18.94 },
  { bortle: 7, name: 'Suburban/urban transition', sqmFrom: 18.38 },
  { bortle: 8, name: 'City sky', sqmFrom: null },
  { bortle: 9, name: 'Inner-city sky', sqmFrom: null }
]

/** Sky Quality Meter readings outside this range are mistyped, not a sky (NSI-004). */
export const SQM_RANGE = { min: 16, max: 22.5 } as const

/** The settings keys the user's sky quality is saved under (Settings → Your site). */
export const SKY_QUALITY_KEYS = { bortle: 'site_bortle', sqm: 'site_sqm' } as const

/** The Bortle class a zenith sky brightness falls in; below 18.38 it is 8, since a reading cannot tell 8 from 9 (NSI-004). */
export function bortleFromSqm(sqm: number): number {
  for (const c of BORTLE_CLASSES) if (c.sqmFrom !== null && sqm >= c.sqmFrom) return c.bortle
  return 8
}

/** How dark the user's sky is, and whether they measured it or picked the class. */
export interface SkyQuality {
  bortle: number
  name: string
  /** The user's Sky Quality Meter reading, mag/arcsec². */
  sqm: number | null
  from: 'reading' | 'class'
}

/**
 * The user's sky from what they saved (NSI-003, NSI-004): a meter reading in range wins over the
 * class, since it is measured; a class from 1 to 9 otherwise; null when neither reads.
 */
export function readSkyQuality(saved: { bortle: string | null; sqm: string | null }): SkyQuality | null {
  const sqmText = saved.sqm?.trim() ?? ''
  const sqm = sqmText === '' ? NaN : Number(sqmText)
  if (Number.isFinite(sqm) && sqm >= SQM_RANGE.min && sqm <= SQM_RANGE.max) {
    const bortle = bortleFromSqm(sqm)
    return { bortle, name: BORTLE_CLASSES[bortle - 1].name, sqm: Math.round(sqm * 100) / 100, from: 'reading' }
  }
  const classText = saved.bortle?.trim() ?? ''
  const bortle = classText === '' ? NaN : Number(classText)
  if (Number.isInteger(bortle) && bortle >= 1 && bortle <= 9) return { bortle, name: BORTLE_CLASSES[bortle - 1].name, sqm: null, from: 'class' }
  return null
}

/** Tonight's dark window and how it compares with last night's. */
export interface DarkInsight {
  start: Date
  end: Date
  hours: number
  darkness: 'astronomical' | 'nautical'
  /** Minutes more (positive) or less dark than last night; null when last night had no dark window. */
  changeMinutes: number | null
}

/** The Moon over tonight's dark window. */
export interface MoonInsight {
  /** How much of the disc is lit, 0 to 100. */
  percent: number
  /** Growing or shrinking since last night; null when it cannot be told. */
  trend: 'waxing' | 'waning' | null
  /** Hours of the dark window with the Moon above the horizon. */
  upHours: number
  /** The first and last dark moments the Moon is up; null when it stays down. */
  upFrom: Date | null
  upTo: Date | null
  /** Dark hours with the Moon down: the time for faint targets. */
  moonFreeHours: number
}

export type CloudInsight =
  | { state: 'forecast'; verdict: SkyVerdict; cloudPct: number | null; clearHours: number | null; spell: ClearSpell | null; dew: boolean }
  /** The forecast is switched off in Settings → Weather. */
  | { state: 'off' }
  /** The forecast could not be read. */
  | { state: 'unavailable' }

/** How tonight suits faint galaxies and nebulae, the hardest targets (NSI-006). */
export type FaintTargets = 'good' | 'possible' | 'poor' | 'none'

export interface SkyInsight {
  night: string
  dark: DarkInsight | null
  moon: MoonInsight | null
  cloud: CloudInsight
  sky: SkyQuality | null
  faint: FaintTargets
  /** One sentence: the night for faint targets and why. */
  summary: string
}

/** A Moon this far into the dark window's samples counts as up. */
const MOON_UP_DEG = 0
/** Moon-free dark needed for a good night, and the least worth calling possible. */
export const FAINT_POLICY = { goodHours: 3, possibleHours: 1, brightSkyBortle: 7 } as const

const round1 = (n: number) => Math.round(n * 10) / 10

/** Hours as people say them: "9 h 40 min", "45 min", "2 h". */
export function hoursText(hours: number): string {
  const minutes = Math.round(hours * 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** The Moon over a night's dark window (NSI-002): lit share, waxing or waning, and the hours it is up. */
export function moonInDark(sky: NightSky, previous: NightSky | null): MoonInsight {
  const stepMs = sky.stepHours * HOUR_MS
  const endMs = sky.darkEnd.getTime()
  let upMs = 0
  let upFrom: Date | null = null
  let upTo: Date | null = null
  for (const s of sky.samples) {
    const ms = Math.max(0, Math.min(stepMs, endMs - s.at.getTime()))
    if (ms === 0 || s.moonAltitudeDeg <= MOON_UP_DEG) continue
    upMs += ms
    upFrom ??= s.at
    upTo = new Date(s.at.getTime() + ms)
  }
  const darkHours = (endMs - sky.darkStart.getTime()) / HOUR_MS
  const lit = moonPhase(sky)
  // Last night's Moon says which way the phase is going; without it, the first and last samples tonight.
  const before = previous && previous.samples.length > 0 ? moonPhase(previous) : sky.samples[0]?.moonIllumination
  const after = previous && previous.samples.length > 0 ? lit : sky.samples[sky.samples.length - 1]?.moonIllumination
  const trend = before === undefined || after === undefined || before === after ? null : after > before ? 'waxing' : 'waning'
  const upHours = round1(upMs / HOUR_MS)
  return { percent: Math.round(lit * 100), trend, upHours, upFrom, upTo, moonFreeHours: round1(Math.max(0, darkHours - upMs / HOUR_MS)) }
}

/** Tonight's dark window against last night's (NSI-001). */
export function darkInsight(sky: NightSky, previous: NightSky | null): DarkInsight {
  const ms = sky.darkEnd.getTime() - sky.darkStart.getTime()
  const before = previous ? previous.darkEnd.getTime() - previous.darkStart.getTime() : null
  return {
    start: sky.darkStart,
    end: sky.darkEnd,
    hours: round1(ms / HOUR_MS),
    darkness: sky.darkness,
    changeMinutes: before === null ? null : Math.round((ms - before) / 60000)
  }
}

/** The forecast's word on tonight, or why there is none (NSI-005). */
export function cloudInsight(outlook: NightOutlook | 'off' | 'unavailable'): CloudInsight {
  if (outlook === 'off') return { state: 'off' }
  if (outlook === 'unavailable') return { state: 'unavailable' }
  return {
    state: 'forecast',
    verdict: outlook.verdict,
    cloudPct: outlook.cloudPct,
    clearHours: outlook.clearHours,
    spell: outlook.longestSpell,
    dew: outlook.dew
  }
}

/**
 * How tonight suits faint targets (NSI-006): none with no dark window; poor when cloudy or the
 * Moon leaves under an hour of dark; good with three moonless hours forecast clear under a sky
 * darker than Bortle 7; possible otherwise, including when the cloud is not known.
 */
export function faintTargets(dark: DarkInsight | null, moon: MoonInsight | null, cloud: CloudInsight, sky: SkyQuality | null): FaintTargets {
  if (!dark || !moon) return 'none'
  const verdict = cloud.state === 'forecast' ? cloud.verdict : null
  if (verdict === 'cloudy' || verdict === 'no-darkness') return 'poor'
  if (moon.moonFreeHours < FAINT_POLICY.possibleHours) return 'poor'
  const brightSky = sky !== null && sky.bortle >= FAINT_POLICY.brightSkyBortle
  if (verdict === 'clear' && moon.moonFreeHours >= FAINT_POLICY.goodHours && !brightSky && dark.darkness === 'astronomical') return 'good'
  return 'possible'
}

/** The one-sentence verdict (NSI-007), worded from the same figures the tiles show. */
export function insightSummary(faint: FaintTargets, dark: DarkInsight | null, moon: MoonInsight | null, cloud: CloudInsight, sky: SkyQuality | null): string {
  if (faint === 'none' || !dark || !moon) return 'No proper dark tonight: the Sun stays less than 12° below the horizon all night.'
  const verdict = cloud.state === 'forecast' ? cloud.verdict : null
  const moonless = `${hoursText(moon.moonFreeHours)} of dark without the Moon`
  if (faint === 'poor') {
    if (verdict === 'cloudy') return 'Cloud is forecast through the dark, so not a night for faint targets.'
    return `The Moon is up for nearly all of the ${hoursText(dark.hours)} of dark, so bright clusters or narrowband targets suit tonight better than faint galaxies.`
  }
  if (faint === 'good') return `A good night for faint galaxies and nebulae: ${moonless}, forecast clear.`
  const reasons: string[] = []
  if (verdict === 'clear-spells') reasons.push(cloud.state === 'forecast' && cloud.spell ? `clear for ${hoursText(cloud.spell.hours)} at best` : 'clear spells only')
  else if (verdict === null || verdict === 'no-forecast') reasons.push('the cloud is not known')
  if (moon.moonFreeHours < FAINT_POLICY.goodHours) reasons.push(`only ${moonless}`)
  if (dark.darkness === 'nautical') reasons.push('the sky only gets nautically dark')
  if (sky && sky.bortle >= FAINT_POLICY.brightSkyBortle) reasons.push(`a bright Bortle ${sky.bortle} sky`)
  return reasons.length > 0 ? `Possible for faint targets: ${reasons.join(', ')}.` : `Possible for faint targets, with ${moonless}.`
}

/**
 * Tonight's sky at a glance (NSI-001 to NSI-007), from tonight's and last night's dark windows,
 * tonight's forecast (or why there is none) and the user's sky quality.
 */
export function skyInsight(input: {
  night: string
  sky: NightSky | null
  previous: NightSky | null
  outlook: NightOutlook | 'off' | 'unavailable'
  quality: SkyQuality | null
}): SkyInsight {
  const dark = input.sky ? darkInsight(input.sky, input.previous) : null
  const moon = input.sky ? moonInDark(input.sky, input.previous) : null
  const cloud = cloudInsight(input.outlook)
  const faint = faintTargets(dark, moon, cloud, input.quality)
  return { night: input.night, dark, moon, cloud, sky: input.quality, faint, summary: insightSummary(faint, dark, moon, cloud, input.quality) }
}

/** The phase's common name from how lit the Moon is and which way it is going (NSI-002). */
export function moonPhaseName(percent: number, trend: 'waxing' | 'waning' | null): string {
  if (percent < 2) return 'New moon'
  if (percent > 98) return 'Full moon'
  const shape = percent < 45 ? 'crescent' : percent <= 55 ? null : 'gibbous'
  if (shape === null) return trend === 'waxing' ? 'First quarter' : trend === 'waning' ? 'Last quarter' : 'Quarter moon'
  return trend ? `${trend === 'waxing' ? 'Waxing' : 'Waning'} ${shape}` : shape === 'crescent' ? 'Crescent moon' : 'Gibbous moon'
}
