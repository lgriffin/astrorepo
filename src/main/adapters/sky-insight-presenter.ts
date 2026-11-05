import type { SkyInsightAnswer } from '@astro/application'
import { hoursText, moonPhaseName, type CloudInsight, type FaintTargets, type SkyInsight } from '@astro/domain'
import type { SkyInsightView } from '@shared/types'
import { HEADLINES } from './weather-presenter'

export const SKY_INSIGHT_NO_SITE_MESSAGE = 'Set your latitude and longitude in Settings to see tonight’s darkness, moon and sky.'

const FAINT_LABELS: Record<FaintTargets, string> = {
  good: 'Good',
  possible: 'Possible',
  poor: 'Poor',
  none: 'No proper dark'
}

function change(minutes: number | null): string | null {
  if (minutes === null || minutes === 0) return null
  return `${hoursText(Math.abs(minutes) / 60)} ${minutes > 0 ? 'longer' : 'shorter'} than last night`
}

type CloudView = Extract<SkyInsightView, { status: 'ok' }>['cloud']

function cloud(c: CloudInsight, darkHours: number | null): CloudView {
  if (c.state === 'off') return { state: 'off', headline: 'Forecast off', cloudPct: null, detail: 'Choose a forecast in Settings → Weather.', dew: false }
  if (c.state === 'unavailable') return { state: 'unavailable', headline: 'Forecast unavailable', cloudPct: null, detail: 'The forecast could not be read just now.', dew: false }
  const detail =
    c.clearHours !== null && darkHours
      ? `${hoursText(c.clearHours)} clear of ${hoursText(darkHours)} dark`
      : c.verdict === 'no-forecast'
        ? 'The forecast does not reach tonight’s dark yet.'
        : 'From your weather service’s cloud figure.'
  return { state: 'forecast', headline: c.verdict === 'clear' ? 'Clear' : HEADLINES[c.verdict], cloudPct: c.cloudPct, detail, dew: c.dew }
}

function moonUp(upHours: number, darkHours: number): string {
  if (upHours === 0) return 'Down all through the dark'
  if (upHours >= darkHours) return 'Up all through the dark'
  return `Up for ${hoursText(upHours)} of the dark`
}

export function toSkyInsightView(answer: SkyInsightAnswer): SkyInsightView {
  if (answer.status === 'no-site') return { status: 'no-site', message: SKY_INSIGHT_NO_SITE_MESSAGE }
  const i: SkyInsight = answer.insight
  return {
    status: 'ok',
    night: i.night,
    faint: i.faint,
    faintLabel: FAINT_LABELS[i.faint],
    summary: i.summary,
    dark: i.dark
      ? {
          start: i.dark.start.toISOString(),
          end: i.dark.end.toISOString(),
          hours: i.dark.hours,
          text: hoursText(i.dark.hours),
          darkness: i.dark.darkness,
          change: change(i.dark.changeMinutes)
        }
      : null,
    moon:
      i.moon && i.dark
        ? {
            percent: i.moon.percent,
            trend: i.moon.trend,
            phase: moonPhaseName(i.moon.percent, i.moon.trend),
            upHours: i.moon.upHours,
            up: moonUp(i.moon.upHours, i.dark.hours),
            upFrom: i.moon.upFrom?.toISOString() ?? null,
            upTo: i.moon.upTo?.toISOString() ?? null,
            moonFree: hoursText(i.moon.moonFreeHours)
          }
        : null,
    cloud: cloud(i.cloud, i.dark?.hours ?? null),
    sky: i.sky ? { bortle: i.sky.bortle, name: i.sky.name, sqm: i.sky.sqm, from: i.sky.from } : null
  }
}
