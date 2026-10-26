import type { FilterForecast, MosaicIntegration, TargetIntegration } from '@astro/application'
import { FORECAST_MODEL, forecastGain, gainPercent, type GainForecast, type IntegrationSummary, type RankedExposure } from '@astro/domain'
import type { ForecastView, IntegrationFilterView, IntegrationView, MosaicIntegrationView } from '@shared/types'
import { formatDuration } from './job-presenter'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const time = (sec: number) => (sec > 0 ? formatDuration(sec) : 'none')

/** What one forecast rests on: its model, the frames it was worked out from, and its assumptions. */
function evidence(f: GainForecast): string {
  const { frames, acceptedFrames, measured } = f.inputs
  return [`Model ${f.model}, from ${plural(frames, 'frame')} (${acceptedFrames} accepted${measured > 0 ? `, ${measured} measured` : ''}).`, ...f.assumptions].join(' ')
}

export function toForecastView(f: GainForecast): ForecastView {
  return {
    added: formatDuration(f.addedSec),
    gain: f.snrGain === null ? null : gainPercent(f.snrGain),
    range: f.range ? `${gainPercent(f.range.low)} to ${gainPercent(f.range.high)}` : null,
    kind: f.kind,
    evidence: evidence(f)
  }
}

/** "About 2 h 30 min more capture (2 h to 3 h 10 min)" */
function toGoalText(f: FilterForecast): string | null {
  if (!f.toGoal) return null
  if (f.toGoal.needSec === 0) return 'Goal met'
  if (f.toGoal.captureSec === null || !f.toGoal.range) return `${formatDuration(f.toGoal.needSec)} short, and nothing accepted yet to say how much capture that takes`
  const { low, high } = f.toGoal.range
  return `About ${formatDuration(f.toGoal.captureSec)} more capture (${formatDuration(low)} to ${Number.isFinite(high) ? formatDuration(high) : 'more than the data can say'})`
}

function filterView(summary: IntegrationSummary, extra: Partial<FilterForecast> & { forecasts: GainForecast[] }): IntegrationFilterView {
  const rejected = summary.frames - summary.acceptedFrames
  return {
    filter: summary.filter ?? 'All filters',
    frames: `${plural(summary.frames, 'frame')}${rejected > 0 ? `, ${rejected} rejected` : ''}`,
    acquired: time(summary.acquiredSec),
    accepted: time(summary.acceptedSec),
    rejection: summary.frames > 0 ? `${Math.round((rejected / summary.frames) * 100)}% rejected` : null,
    goal: extra.goalSec != null ? formatDuration(extra.goalSec) : null,
    toGoal: extra.toGoal !== undefined ? toGoalText(extra as FilterForecast) : null,
    forecasts: extra.forecasts.map(toForecastView)
  }
}

const bestView = (best: RankedExposure[]) => best.map(b => ({ label: b.label, gain: b.forecast.snrGain === null ? null : gainPercent(b.forecast.snrGain), kind: b.forecast.kind }))

const basis = (s: IntegrationSummary) => `Model ${FORECAST_MODEL}, from ${plural(s.frames, 'frame')}${s.measured > 0 ? ` (${s.measured} measured)` : ''}.`

export function toIntegrationView(t: TargetIntegration, minutes: number[]): IntegrationView {
  const hour = forecastGain(t.all, 3600)
  return {
    total: filterView(t.all, { forecasts: minutes.map(m => forecastGain(t.all, m * 60)) }),
    weighted: t.all.weightedSec !== null ? `Equivalent to ${formatDuration(t.all.weightedSec)} of the median frame` : null,
    filters: t.filters.map(f => filterView(f.summary, f)),
    best: bestView(t.best),
    assumptions: hour.assumptions,
    basis: basis(t.all)
  }
}

/** Every panel's light together, so the mosaic's assumptions quote its overall acceptance. */
function combined(list: IntegrationSummary[]): IntegrationSummary {
  const sum = (pick: 'frames' | 'acceptedFrames' | 'acquiredSec' | 'acceptedSec' | 'measured') => list.reduce((n, s) => n + s[pick], 0)
  const frames = sum('frames')
  return {
    filter: null,
    frames,
    acceptedFrames: sum('acceptedFrames'),
    acquiredSec: sum('acquiredSec'),
    acceptedSec: sum('acceptedSec'),
    acceptance: frames > 0 ? sum('acceptedFrames') / frames : null,
    measured: sum('measured'),
    weightedSec: null,
    weights: []
  }
}

export function toMosaicIntegrationView(m: MosaicIntegration): MosaicIntegrationView {
  const all = combined(m.panels.map(p => p.all))
  return {
    panels: m.panels.map(p => ({ panelId: p.panelId, filters: p.filters.map(f => filterView(f.summary, f)) })),
    best: bestView(m.best),
    assumptions:
      all.acceptedSec > 0
        ? [...forecastGain(all, 3600).assumptions, 'That rate is the whole mosaic\'s; each panel\'s forecast uses its own.']
        : ['Nothing counted on any panel yet, so there is nothing to improve on.'],
    basis: `Model ${FORECAST_MODEL}, from ${plural(all.frames, 'frame')} counted on the panels.`
  }
}
