import type { ProjectDescription, ProjectResult, ProjectSummary } from '@astro/application'
import { KIND_LABELS, PART_NAMES, type CampaignWindowState, type CompletionRule, type FilterProgress, type PartName, type ProjectWindow } from '@astro/domain'
import type { ProjectChangeView, ProjectPartView, ProjectRuleView, ProjectSummaryView, ProjectView } from '@shared/types'
import { formatDuration } from './job-presenter'
import { toForecastView } from './forecast-presenter'

const PART_LABELS: Record<PartName, string> = { coverage: 'Covered', integration: 'Integrated', stacked: 'Stacked', processed: 'Processed', published: 'Published' }

/** The rule as the window edits it, goals in hours. */
export function toRuleView(rule: CompletionRule): ProjectRuleView {
  return {
    integration: rule.integration.kind,
    goals: rule.integration.kind === 'per filter' ? rule.integration.goals.map(g => ({ filter: g.filter, hours: Math.round((g.seconds / 3600) * 100) / 100 })) : [],
    coverage: rule.coverage,
    stacked: rule.stacked,
    processed: rule.processed,
    published: rule.published
  }
}

/** The window's rule as the core's, goals in seconds. */
export function fromRuleView(rule: ProjectRuleView): CompletionRule {
  const integration: CompletionRule['integration'] =
    rule.integration === 'per filter' ? { kind: 'per filter', goals: rule.goals.map(g => ({ filter: g.filter, seconds: Math.round(g.hours * 3600) })) } : { kind: rule.integration }
  return { integration, coverage: rule.coverage, stacked: rule.stacked, processed: rule.processed, published: rule.published }
}

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/** "Finished means: every panel covered, the target's own goals met per filter and a finished image." */
export function ruleText(rule: CompletionRule): string {
  const parts: string[] = []
  if (rule.coverage) parts.push('every panel covered')
  if (rule.integration.kind === 'target goals') parts.push("each target's own integration goals met")
  if (rule.integration.kind === 'per filter') parts.push(`${list(rule.integration.goals.map(g => `${g.filter} ${formatDuration(g.seconds)}`))} of usable light`)
  if (rule.stacked) parts.push('a stack')
  if (rule.processed) parts.push('a processed file')
  if (rule.published) parts.push('a finished image')
  return `Finished means ${list(parts)}.`
}

/** "Open, 34 days left", "Starts in 6 days", "Closed" */
export function windowText(state: CampaignWindowState): string {
  if (state.state === 'open') return `Open, ${state.daysLeft} ${state.daysLeft === 1 ? 'day' : 'days'} left`
  if (state.state === 'not begun') return `Starts in ${state.daysToStart} ${state.daysToStart === 1 ? 'day' : 'days'}`
  return 'Closed'
}

const dateText = (w: ProjectWindow) => `${w.start} to ${w.end}`

const filterText = (f: FilterProgress) => ({
  filter: f.filter,
  text: `${f.filter} ${f.haveSec > 0 ? formatDuration(f.haveSec) : 'none'}${f.goalSec !== null ? ` of ${formatDuration(f.goalSec)}` : ''}`,
  met: f.needSec === null ? null : f.needSec === 0
})

export function toProjectSummaries(summaries: ProjectSummary[]): ProjectSummaryView[] {
  return summaries.map(s => ({
    id: s.project.id,
    name: s.project.name,
    kind: s.project.kind,
    kindLabel: KIND_LABELS[s.project.kind],
    status: s.project.status,
    done: s.done,
    total: s.total,
    complete: s.complete,
    window: s.window ? windowText(s.window) : null
  }))
}

const clock = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export function toProjectView(d: ProjectDescription): ProjectView {
  const { project, progress } = d
  return {
    id: project.id,
    name: project.name,
    kind: project.kind,
    kindLabel: KIND_LABELS[project.kind],
    status: project.status,
    rule: toRuleView(project.rule),
    ruleText: ruleText(project.rule),
    window: project.window && d.window ? { ...project.window, text: `${dateText(project.window)}: ${windowText(d.window)}` } : null,
    done: progress.done,
    total: progress.total,
    complete: progress.complete,
    tallies: progress.parts.map(p => ({ part: p.part, label: PART_LABELS[p.part], met: p.met, of: p.of })),
    tasks: progress.tasks.map(t => ({
      id: t.id,
      kind: t.kind,
      label: t.label,
      stage: t.stage,
      done: t.done,
      parts: PART_NAMES.flatMap((part): ProjectPartView[] => {
        const p = t.parts[part]
        return p ? [{ part, label: PART_LABELS[part], met: p.met, detail: p.detail }] : []
      }),
      filters: t.filters.map(filterText),
      next: t.next?.text ?? null
    })),
    next: d.next.map(a => ({ taskId: a.taskId, kind: a.kind, text: a.text })),
    mosaic: d.mosaic,
    source: d.source ? { kind: d.source.kind, name: d.source.name, newMembers: d.source.notInProject.length } : null,
    bottlenecks: d.bottlenecks.map(b => {
      const f = toForecastView(b.forecast)
      return { label: b.label, gain: f.gain, range: f.range, kind: f.kind }
    }),
    checked: `Worked out from the index at ${clock(d.at)}.`
  }
}

export function toProjectChange(result: ProjectResult): ProjectChangeView {
  return result.ok ? { ok: true, id: result.project.id } : { ok: false, problems: result.problems }
}
