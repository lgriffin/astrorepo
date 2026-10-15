import { moonPhase, type NightSky } from './sky'

/**
 * Clear skies (specs/036-clear-skies): whether a night's dark window is forecast clear, from the
 * hourly forecast of a public provider and the user's own weather service.
 */

const HOUR_MS = 3600 * 1000

/** One period of a forecast: what is expected from `at` for `hours` hours. */
export interface ForecastHour {
  at: Date
  /** How long this forecast stands for: 1 for hourly forecasts, up to 6 further ahead. */
  hours: number
  /** Total cloud cover, 0 to 100. */
  cloudPct: number | null
  /** Chance of precipitation, 0 to 100. */
  precipChancePct: number | null
  /** Relative humidity, 0 to 100. */
  humidityPct: number | null
  temperatureC: number | null
  dewPointC: number | null
}

/** What the user's own weather service says about one evening (weatherlink_website's forecast). */
export interface StationNight {
  /** The evening it is for, YYYY-MM-DD at the site. */
  night: string
  /** Chance of rain in the next 24 hours, 0 to 1. */
  rainChance: number | null
  /** Chance of frost overnight, 0 to 1. */
  frostChance: number | null
  /** The overnight low, °C. */
  lowC: number | null
  /** Cloud cover over the night, 0 to 100, when the service gives one. */
  cloudPct: number | null
  /** The service's own words about the night. */
  brief: string | null
}

export type WarningLevel = 'yellow' | 'orange' | 'red' | 'unknown'

export interface WeatherWarning {
  level: WarningLevel
  headline: string
  onset: Date | null
  expiry: Date | null
}

/** Everything one weather source said. A public provider fills `hours`; the user's service `nights` and `warnings`. */
export interface WeatherReport {
  hours: ForecastHour[]
  nights: StationNight[]
  warnings: WeatherWarning[]
}

export interface ClearSkyPolicy {
  /** A half hour is clear at or below this cloud cover (WX-002). */
  clearCloudPct: number
  /** ...and with a chance of precipitation below this. */
  wetChancePct: number
  /** A night is clear when at least this share of its forecast dark window is clear. */
  clearShare: number
  /** A night has clear spells when its longest clear stretch lasts at least this long. */
  minSpellHours: number
  /** Below this share of the dark window forecast, the night has no forecast yet (WX-007). */
  minCoverage: number
  /** The user's service giving rain at least this chance holds back a clear night (WX-004). */
  stationRainVeto: number
  /** Dew is likely at or above this humidity (WX-008)... */
  dewHumidityPct: number
  /** ...or with the dew point within this of the air temperature. */
  dewSpreadC: number
}

export const DEFAULT_CLEAR_SKY_POLICY: ClearSkyPolicy = {
  clearCloudPct: 25,
  wetChancePct: 40,
  clearShare: 0.75,
  minSpellHours: 2,
  minCoverage: 0.5,
  stationRainVeto: 0.6,
  dewHumidityPct: 95,
  dewSpreadC: 2
}

export type SkyVerdict = 'clear' | 'clear-spells' | 'cloudy' | 'no-forecast' | 'no-darkness'

export interface ClearSpell {
  start: Date
  end: Date
  hours: number
}

export interface NightOutlook {
  night: string
  verdict: SkyVerdict
  darkStart: Date | null
  darkEnd: Date | null
  darkHours: number
  /** Forecast clear hours of the dark window; null when only the user's service judged the night. */
  clearHours: number | null
  longestSpell: ClearSpell | null
  /** Mean cloud cover over the forecast dark window, 0 to 100. */
  cloudPct: number | null
  /** The highest chance of precipitation in the dark window, 0 to 100. */
  precipChancePct: number | null
  dew: boolean
  /** How much of the moon is lit that night, 0 to 100; null with no dark window. */
  moonPercent: number | null
  station: StationNight | null
  /** True when the forecast was clear but the user's service gives rain too high a chance (WX-004). */
  heldBackByStation: boolean
  /** Warnings in force at some time in the dark window (or that day, with no dark window). */
  warnings: WeatherWarning[]
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** The forecast in force at an instant: the first period, in the order given, that covers it. */
export function forecastAt(hours: readonly ForecastHour[], at: Date): ForecastHour | null {
  const t = at.getTime()
  for (const h of hours) {
    const start = h.at.getTime()
    if (t >= start && t < start + h.hours * HOUR_MS) return h
  }
  return null
}

/** True when a forecast period counts as clear (WX-002). */
export function isClearHour(h: ForecastHour, policy: ClearSkyPolicy = DEFAULT_CLEAR_SKY_POLICY): boolean {
  if (h.cloudPct === null || h.cloudPct > policy.clearCloudPct) return false
  return h.precipChancePct === null || h.precipChancePct < policy.wetChancePct
}

/** True when a forecast period says dew is likely on the optics (WX-008). */
export function isDewHour(h: ForecastHour, policy: ClearSkyPolicy = DEFAULT_CLEAR_SKY_POLICY): boolean {
  if (h.humidityPct !== null && h.humidityPct >= policy.dewHumidityPct) return true
  return h.temperatureC !== null && h.dewPointC !== null && h.temperatureC - h.dewPointC <= policy.dewSpreadC
}

/** Warnings in force at some time between two instants; a missing onset or expiry is open-ended. */
export function warningsBetween(warnings: readonly WeatherWarning[], from: Date, to: Date): WeatherWarning[] {
  return warnings.filter(w => (w.onset === null || w.onset < to) && (w.expiry === null || w.expiry > from))
}

/** The verdict from the user's service's own cloud cover, when no hourly forecast covers the night. */
function stationVerdict(cloudPct: number, policy: ClearSkyPolicy): SkyVerdict {
  if (cloudPct <= policy.clearCloudPct) return 'clear'
  return cloudPct < 100 - policy.clearCloudPct ? 'clear-spells' : 'cloudy'
}

/**
 * One night's outlook (WX-001, WX-002, WX-004, WX-007, WX-008): each dark sample of the night is
 * matched to the forecast in force then, and the night is clear, has clear spells, or is cloudy.
 */
export function judgeNight(
  night: string,
  sky: NightSky | null,
  report: WeatherReport,
  policy: ClearSkyPolicy = DEFAULT_CLEAR_SKY_POLICY
): NightOutlook {
  const station = report.nights.find(n => n.night === night) ?? null
  if (!sky) {
    const noon = new Date(`${night}T12:00:00Z`)
    return {
      night,
      verdict: 'no-darkness',
      darkStart: null,
      darkEnd: null,
      darkHours: 0,
      clearHours: null,
      longestSpell: null,
      cloudPct: null,
      precipChancePct: null,
      dew: false,
      moonPercent: null,
      station,
      heldBackByStation: false,
      warnings: warningsBetween(report.warnings, noon, new Date(noon.getTime() + 24 * HOUR_MS))
    }
  }

  const stepMs = sky.stepHours * HOUR_MS
  const endMs = sky.darkEnd.getTime()
  let coveredMs = 0
  let clearMs = 0
  let cloudWeighted = 0
  let precip: number | null = null
  let dew = false
  let spell: { start: number; end: number } | null = null
  let longest: { start: number; end: number } | null = null
  const closeSpell = () => {
    if (spell && (!longest || spell.end - spell.start > longest.end - longest.start)) longest = spell
    spell = null
  }

  for (const s of sky.samples) {
    const start = s.at.getTime()
    const ms = Math.max(0, Math.min(stepMs, endMs - start))
    if (ms === 0) continue
    const f = forecastAt(report.hours, s.at)
    // Dew needs only humidity or temperatures, so an hour with no cloud figure still counts for it.
    if (f && isDewHour(f, policy)) dew = true
    if (!f || f.cloudPct === null) {
      closeSpell()
      continue
    }
    coveredMs += ms
    cloudWeighted += f.cloudPct * ms
    if (f.precipChancePct !== null) precip = Math.max(precip ?? 0, f.precipChancePct)
    if (isClearHour(f, policy)) {
      clearMs += ms
      if (spell && spell.end === start) spell.end = start + ms
      else {
        closeSpell()
        spell = { start, end: start + ms }
      }
    } else closeSpell()
  }
  closeSpell()

  const darkMs = endMs - sky.darkStart.getTime()
  const covered = darkMs > 0 && coveredMs >= policy.minCoverage * darkMs
  // TypeScript cannot see closeSpell() assign it, so it is read back through a cast.
  const best = longest as { start: number; end: number } | null
  const spellMs = best ? best.end - best.start : 0
  const longestSpell = best ? { start: new Date(best.start), end: new Date(best.end), hours: round1(spellMs / HOUR_MS) } : null

  let verdict: SkyVerdict
  let cloudPct: number | null = covered ? Math.round(cloudWeighted / coveredMs) : null
  if (covered) {
    if (clearMs >= policy.clearShare * coveredMs) verdict = 'clear'
    else if (spellMs >= policy.minSpellHours * HOUR_MS) verdict = 'clear-spells'
    else verdict = 'cloudy'
  } else if (station?.cloudPct !== null && station?.cloudPct !== undefined) {
    verdict = stationVerdict(station.cloudPct, policy)
    cloudPct = Math.round(station.cloudPct)
  } else verdict = 'no-forecast'

  const heldBackByStation =
    verdict === 'clear' && station !== null && station.rainChance !== null && station.rainChance >= policy.stationRainVeto
  if (heldBackByStation) verdict = 'clear-spells'

  return {
    night,
    verdict,
    darkStart: sky.darkStart,
    darkEnd: sky.darkEnd,
    darkHours: round1(darkMs / HOUR_MS),
    clearHours: covered ? round1(clearMs / HOUR_MS) : null,
    longestSpell: covered ? longestSpell : null,
    cloudPct,
    precipChancePct: covered ? precip : null,
    dew: covered && dew,
    moonPercent: Math.round(moonPhase(sky) * 100),
    station,
    heldBackByStation,
    warnings: warningsBetween(report.warnings, sky.darkStart, sky.darkEnd)
  }
}

const warningKey = (w: WeatherWarning) => `${w.level}|${w.headline}|${w.onset?.getTime() ?? ''}|${w.expiry?.getTime() ?? ''}`

/**
 * One report from several sources, in the order given: for any instant or night the first source
 * that covers it wins, and a warning two sources give is kept once.
 */
export function mergeReports(reports: readonly WeatherReport[]): WeatherReport {
  const nights: StationNight[] = []
  const warnings: WeatherWarning[] = []
  const seen = new Set<string>()
  for (const r of reports) {
    for (const n of r.nights) if (!nights.some(m => m.night === n.night)) nights.push(n)
    for (const w of r.warnings) {
      const key = warningKey(w)
      if (!seen.has(key)) {
        seen.add(key)
        warnings.push(w)
      }
    }
  }
  return { hours: reports.flatMap(r => r.hours), nights, warnings }
}
