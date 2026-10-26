import {
  forecastGain,
  rankExposure,
  sameGoalFilter,
  summarise,
  summariseByFilter,
  timeToGoal,
  type FilterSeconds,
  type FilterTally,
  type ForecastFrame,
  type FrameGrade,
  type GainForecast,
  type IntegrationSummary,
  type RankedExposure
} from '@astro/domain'
import type { IntegrationGoalSource } from '../ports/mosaic-workspace'
import type { FrameGrading } from './frame-grading'
import type { DescribeCoverage } from './mosaic-coverage'

/** The capture times a forecast is shown for, in minutes, unless the user asks for another. */
export const FORECAST_MINUTES = [30, 60, 120]

export interface ForecastDeps {
  grading: Pick<FrameGrading, 'grade'>
  goals: IntegrationGoalSource
}

/** One filter's integration, its goal and what more capture buys. */
export interface FilterForecast {
  summary: IntegrationSummary
  goalSec: number | null
  /** Capture time to the goal at the acceptance so far; null with no goal. */
  toGoal: ReturnType<typeof timeToGoal> | null
  forecasts: GainForecast[]
}

export interface TargetIntegration {
  targetId: string
  /** Every filter together. */
  all: IntegrationSummary
  filters: FilterForecast[]
  /** The filters by what the next hour buys, most first. */
  best: RankedExposure[]
}

/** A light as forecasts count it: accepted unless grading rejects it, its SNR only when kept. */
export const forecastFrame = (g: FrameGrade): ForecastFrame => ({
  seconds: g.exposureSec,
  filter: g.filter,
  // Rejected by grading, or flagged by quality analysis and not kept by hand.
  accepted: g.verdict !== 'reject' && (g.override === 'keep' || !g.qualityRejected),
  snr: g.verdict === 'keep' ? (g.measurement?.snr ?? null) : null
})

const goalFor = (goals: FilterSeconds[], filter: string) =>
  goals.filter(g => sameGoalFilter(g.filter, filter)).reduce<number | null>((max, g) => (max === null || g.seconds > max ? g.seconds : max), null)

/** Each filter's summary with its goal and forecasts for the given capture times. */
function filterForecasts(byFilter: IntegrationSummary[], goals: FilterSeconds[], minutes: number[]): FilterForecast[] {
  const filters = byFilter.map(summary => {
    const goalSec = goalFor(goals, summary.filter as string)
    return { summary, goalSec, toGoal: goalSec === null ? null : timeToGoal(summary, goalSec), forecasts: minutes.map(m => forecastGain(summary, m * 60)) }
  })
  // A goal for a filter with nothing captured yet still shows, with nothing to forecast from.
  for (const g of goals) {
    if (filters.some(f => sameGoalFilter(f.summary.filter as string, g.filter))) continue
    const summary = summarise([], g.filter.trim())
    const goalSec = goalFor(goals, g.filter) as number
    filters.push({ summary, goalSec, toGoal: timeToGoal(summary, goalSec), forecasts: minutes.map(m => forecastGain(summary, m * 60)) })
  }
  return filters.sort((a, b) => (a.summary.filter as string).localeCompare(b.summary.filter as string))
}

/**
 * A target's integration, acquired and accepted apart, per filter against its goals, and what
 * 30 minutes, an hour or two hours more are expected to buy (GetIntegrationSummary,
 * ForecastIntegrationGain; AI-001 to AI-003). Worked out from grading each time, so a changed keep
 * or reject changes the forecast the next time it is asked (AI-004).
 */
export function makeDescribeIntegration(deps: ForecastDeps) {
  return async (targetId: string, minutes: number[] = FORECAST_MINUTES): Promise<TargetIntegration> => {
    const [report, goals] = await Promise.all([deps.grading.grade(targetId), deps.goals.goalsOf(targetId)])
    const { all, byFilter } = summariseByFilter(report.grades.map(forecastFrame))
    const filters = filterForecasts(byFilter, goals, minutes)
    return { targetId, all, filters, best: rankExposure(filters.map(f => ({ id: f.summary.filter as string, label: f.summary.filter as string, summary: f.summary }))) }
  }
}

/** A panel's integration from its counted captures, per filter: tallied, not measured frame by frame. */
export function panelSummaries(tallies: FilterTally[]): { all: IntegrationSummary; byFilter: IntegrationSummary[] } {
  const sum = (list: FilterTally[], filter: string | null): IntegrationSummary => {
    const frames = list.reduce((n, t) => n + t.counted + t.rejected, 0)
    const acceptedFrames = list.reduce((n, t) => n + t.counted, 0)
    const acceptedSec = list.reduce((n, t) => n + t.countedSec, 0)
    return {
      filter,
      frames,
      acceptedFrames,
      acquiredSec: acceptedSec + list.reduce((n, t) => n + t.rejectedSec, 0),
      acceptedSec,
      acceptance: frames > 0 ? acceptedFrames / frames : null,
      measured: 0,
      weightedSec: null,
      weights: []
    }
  }
  const groups = new Map<string, FilterTally[]>()
  for (const t of tallies) {
    const key = [...groups.keys()].find(k => sameGoalFilter(k, t.filter)) ?? t.filter
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  return { all: sum(tallies, null), byFilter: [...groups.entries()].map(([filter, list]) => sum(list, filter)).sort((a, b) => (a.filter as string).localeCompare(b.filter as string)) }
}

export interface PanelIntegration {
  panelId: string
  all: IntegrationSummary
  filters: FilterForecast[]
}

export interface MosaicIntegration {
  workspaceId: string
  revision: number
  panels: PanelIntegration[]
  /** Panel and filter pairs by what the next hour buys, most first: the bottlenecks. */
  best: RankedExposure[]
}

/**
 * Each panel's integration and forecasts from a mosaic's coverage (AI-001, AI-002): exposure as
 * counted there, each frame once, against the target's goals on every panel.
 */
export function makeDescribeMosaicIntegration(deps: { coverage: DescribeCoverage }) {
  return async (workspaceId: string, revision?: number, minutes: number[] = FORECAST_MINUTES): Promise<MosaicIntegration | null> => {
    const coverage = await deps.coverage(workspaceId, revision)
    if (!coverage) return null
    const panels = coverage.revision.panels.map(panel => {
      const { all, byFilter } = panelSummaries(coverage.counted.filter(c => c.panelId === panel.id).flatMap(c => c.tally))
      return { panelId: panel.id, all, filters: filterForecasts(byFilter, coverage.goals, minutes) }
    })
    const best = rankExposure(panels.flatMap(p => p.filters.map(f => ({ id: `${p.panelId}|${f.summary.filter}`, label: `${p.panelId} ${f.summary.filter}`, summary: f.summary }))))
    return { workspaceId, revision: coverage.revision.revision, panels, best }
  }
}

