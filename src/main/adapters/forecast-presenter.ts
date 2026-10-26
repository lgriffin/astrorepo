import type { FilterForecast, MosaicIntegration, TargetIntegration } from '@astro/application'
import { FORECAST_MODEL, forecastGain, gainPercent, type GainForecast, type IntegrationSummary, type RankedExposure } from '@astro/domain'
import type { ForecastView, IntegrationFilterView, IntegrationView, MosaicIntegrationView } from '@shared/types'
import { formatDuration } from './job-presenter'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const time = (sec: number) => (sec > 0 ? formatDuration(sec) : 'none')

export function toForecastView(f: GainForecast): ForecastView {
  return {
    added: formatDuration(f.addedSec),
    gain: f.snrGain === null ? null : gainPercent(f.snrGain),
    range: f.range ? `${gainPercent(f.range.low)} to ${gainPercent(f.range.high)}` : null,
    kind: f.kind
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

export function toMosaicIntegrationView(m: MosaicIntegration): MosaicIntegrationView {
  const all = m.panels.map(p => p.all)
  const frames = all.reduce((n, s) => n + s.frames, 0)
  const sample = m.panels.find(p => p.all.acceptedSec > 0)?.all
  return {
    panels: m.panels.map(p => ({ panelId: p.panelId, filters: p.filters.map(f => filterView(f.summary, f)) })),
    best: bestView(m.best),
    assumptions: sample ? forecastGain(sample, 3600).assumptions : ['Nothing counted on any panel yet, so there is nothing to improve on.'],
    basis: `Model ${FORECAST_MODEL}, from ${plural(frames, 'frame')} counted on the panels.`
  }
}
