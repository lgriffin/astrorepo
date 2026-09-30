import type { ForwardPlan } from '@astro/application'
import type { TonightPlan } from '@astro/domain'
import type { ForwardPlanView, TonightView } from '@shared/types'
import { formatDuration, plural } from './stacking-suggestion-presenter'

const hours = (h: number) => formatDuration(Math.round(h * 3600))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-10" as "10 Oct". */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

export const NO_SITE_MESSAGE = 'Set your latitude and longitude in Settings to see seasons, moon windows and tonight’s plan.'

function toTonightView(t: TonightPlan): TonightView {
  const moonPercent = Math.round(t.moonIllumination * 100)
  let moonNote: string | null = null
  if (t.noFilterForBrightMoon) {
    moonNote = `The moon is ${moonPercent}% lit, so nothing is suggested without a dual-band or narrowband filter. Turn the filter on in Settings if you have one.`
  } else if (t.brightMoon) {
    moonNote = `The moon is ${moonPercent}% lit, so only emission targets are suggested, for your dual-band or narrowband filter.`
  }
  return {
    night: t.night,
    darkStart: t.darkStart.toISOString(),
    darkEnd: t.darkEnd.toISOString(),
    darkness: t.darkness,
    moonPercent,
    moonSummary: t.moonUp ? `moon ${moonPercent}% lit` : `moon ${moonPercent}% lit, below the horizon all night`,
    moonNote,
    darknessNote:
      t.darkness === 'nautical' ? 'The sun does not get 18° below the horizon tonight, so this plan uses nautical darkness.' : null,
    choices: t.choices.map(c => ({
      targetId: c.targetId,
      targetName: c.targetName,
      detail:
        `${hours(c.usableHours)} above 30°` + (c.moonSeparationDeg === null ? ', moon down' : `, moon ${c.moonSeparationDeg}° away`)
    }))
  }
}

export function toForwardPlanView(plan: ForwardPlan): ForwardPlanView {
  if (plan.status === 'no-site') return { status: 'no-site', message: NO_SITE_MESSAGE }
  return {
    status: 'ok',
    site: { latitudeDeg: plan.site.latitudeDeg, longitudeDeg: plan.site.longitudeDeg },
    tonight: plan.tonight ? toTonightView(plan.tonight) : null,
    closing: plan.closing.map(c => ({
      targetId: c.targetId,
      targetName: c.targetName,
      detail: `Season closes around ${shortDate(c.closesOn)}, ${plural(c.daysLeft, 'day')} left; ${hours(c.hoursTonight)} a night now`
    })),
    windows: plan.windows.map(w => ({
      newMoon: w.newMoon,
      start: w.start,
      end: w.end,
      label: `New moon ${shortDate(w.newMoon)}: dark nights ${shortDate(w.start)} to ${shortDate(w.end)}`,
      targets: w.bestTargets.map(t => ({ targetId: t.targetId, targetName: t.targetName, detail: `${hours(t.usableHours)} a night` }))
    })),
    seasons: plan.seasons.map(s => ({
      targetId: s.targetId,
      targetName: s.targetName,
      bestMonth: s.bestMonth,
      months: s.months.map(m => ({ month: m.month, hoursPerNight: m.hoursPerNight, newMoon: m.newMoons.length > 0 }))
    }))
  }
}
