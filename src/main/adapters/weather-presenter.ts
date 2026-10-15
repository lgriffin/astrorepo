import type { ClearSkiesOutlook } from '@astro/application'
import type { NightOutlook, SkyVerdict } from '@astro/domain'
import type { ClearSkiesView, NightSkyView } from '@shared/types'
import { formatDuration } from './stacking-suggestion-presenter'
import { shortDate } from './planning-presenter'

export const WEATHER_NO_SITE_MESSAGE = 'Set your latitude and longitude in Settings to see whether the next nights look clear.'
export const WEATHER_OFF_MESSAGE = 'The weather forecast is turned off. Choose a forecast or add your weather service in Settings.'

/** The words Home shows for each verdict; "Clear skies" is the one to look for (WX-001). */
export const HEADLINES: Record<SkyVerdict, string> = {
  clear: 'Clear skies',
  'clear-spells': 'Clear spells',
  cloudy: 'Cloudy',
  'no-forecast': 'No forecast yet',
  'no-darkness': 'No dark window'
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const percent = (fraction: number) => `${Math.round(fraction * 100)}%`
const hours = (h: number) => formatDuration(Math.round(h * 3600))

/** "Tonight" for the first night, then "Fri 16 Oct". */
export function nightLabel(night: string, index: number): string {
  if (index === 0) return 'Tonight'
  return `${WEEKDAYS[new Date(`${night}T12:00:00Z`).getUTCDay()]} ${shortDate(night)}`
}

function figures(n: NightOutlook): string[] {
  const out: string[] = []
  if (n.cloudPct !== null) out.push(`Cloud ${n.cloudPct}%`)
  if (n.precipChancePct !== null) out.push(`Rain ${Math.round(n.precipChancePct)}%`)
  if (n.clearHours !== null && n.darkHours > 0) out.push(`${hours(n.clearHours)} clear of ${hours(n.darkHours)} dark`)
  if (n.moonPercent !== null) out.push(`Moon ${n.moonPercent}% lit`)
  return out
}

function notes(n: NightOutlook): string[] {
  const out: string[] = []
  const s = n.station
  if (n.heldBackByStation && s?.rainChance !== null && s?.rainChance !== undefined) {
    out.push(`The forecast is clear, but your weather service gives rain a ${percent(s.rainChance)} chance.`)
  }
  if (s) {
    const said = [
      s.rainChance !== null ? `rain ${percent(s.rainChance)}` : null,
      s.frostChance !== null ? `frost ${percent(s.frostChance)}` : null,
      s.lowC !== null ? `low ${Math.round(s.lowC)} °C` : null,
      s.cloudPct !== null ? `cloud ${Math.round(s.cloudPct)}%` : null
    ].filter((x): x is string => x !== null)
    if (said.length > 0) out.push(`Your weather service: ${said.join(', ')}.`)
  }
  if (n.dew) out.push('Dew likely: keep the dew heater on.')
  return out
}

const LEVEL_WORDS = { yellow: 'Yellow', orange: 'Orange', red: 'Red', unknown: 'Weather' } as const

export function toNightSkyView(n: NightOutlook, index: number): NightSkyView {
  return {
    night: n.night,
    label: nightLabel(n.night, index),
    verdict: n.verdict,
    headline: HEADLINES[n.verdict],
    darkStart: n.darkStart?.toISOString() ?? null,
    darkEnd: n.darkEnd?.toISOString() ?? null,
    spellStart: n.verdict === 'clear-spells' && n.longestSpell ? n.longestSpell.start.toISOString() : null,
    spellEnd: n.verdict === 'clear-spells' && n.longestSpell ? n.longestSpell.end.toISOString() : null,
    figures: figures(n),
    notes: notes(n),
    warnings: n.warnings.map(w => ({ level: w.level, text: `${LEVEL_WORDS[w.level]} warning: ${w.headline}` }))
  }
}

export function toClearSkiesView(outlook: ClearSkiesOutlook): ClearSkiesView {
  if (outlook.status === 'no-site') return { status: 'no-site', message: WEATHER_NO_SITE_MESSAGE }
  if (outlook.status === 'off') return { status: 'off', message: WEATHER_OFF_MESSAGE }
  const answered = outlook.sources.filter(s => s.problem === null).map(s => s.name)
  return {
    status: 'ok',
    nights: outlook.nights.map(toNightSkyView),
    sources: outlook.sources,
    credit: answered.length > 0 ? `Forecast from ${answered.join(' and ').replace(/\bYour\b/, 'your')}` : null
  }
}
