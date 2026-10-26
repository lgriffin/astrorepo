import { measureFilters, type FilterProgress, type FilterSeconds, type PanelProgress } from './mosaic-coverage'

/**
 * Astronomy projects (specs/038-astronomy-projects): campaigns over targets or a mosaic's panels
 * with a completion rule of separate parts, each judged from what the index holds now. Pure: no
 * I/O, no clock.
 */

export type ProjectKind = 'catalogue' | 'seasonal' | 'target-depth' | 'mosaic' | 'custom'
export type ProjectStatus = 'active' | 'paused' | 'archived'

export const PROJECT_KINDS: ProjectKind[] = ['catalogue', 'seasonal', 'target-depth', 'mosaic', 'custom']

/** How much usable light each target (or panel) needs per filter. */
export type IntegrationRule = { kind: 'none' } | { kind: 'target goals' } | { kind: 'per filter'; goals: FilterSeconds[] }

/**
 * What finished means (AP-001): a conjunction of parts, each reported on its own (AP-003). Only
 * the parts asked for count; coverage applies to a mosaic's panels only.
 */
export interface CompletionRule {
  integration: IntegrationRule
  /** Every panel covered (mosaic projects). */
  coverage: boolean
  /** A stacked master exists. */
  stacked: boolean
  /** A processed file (such as a TIFF out of Siril) exists. */
  processed: boolean
  /** A finished image (JPEG or PNG) exists. */
  published: boolean
}

/** The rule each kind starts with; the user changes any part. */
export const DEFAULT_RULES: Record<ProjectKind, CompletionRule> = {
  catalogue: { integration: { kind: 'none' }, coverage: false, stacked: false, processed: false, published: true },
  seasonal: { integration: { kind: 'target goals' }, coverage: false, stacked: true, processed: false, published: false },
  'target-depth': { integration: { kind: 'target goals' }, coverage: false, stacked: false, processed: true, published: false },
  mosaic: { integration: { kind: 'target goals' }, coverage: true, stacked: false, processed: false, published: false },
  custom: { integration: { kind: 'none' }, coverage: false, stacked: false, processed: false, published: true }
}

export const KIND_LABELS: Record<ProjectKind, string> = {
  catalogue: 'Catalogue campaign',
  seasonal: 'Seasonal campaign',
  'target-depth': 'Target depth',
  mosaic: 'Mosaic campaign',
  custom: 'Personal collection'
}

/** Why a rule cannot be kept for a project of this kind; empty when it can. */
export function ruleProblems(kind: ProjectKind, rule: CompletionRule): string[] {
  const problems: string[] = []
  if (rule.coverage && kind !== 'mosaic') problems.push('Only a mosaic campaign can ask for coverage.')
  if (rule.integration.kind === 'per filter') {
    const goals = rule.integration.goals
    if (goals.length === 0) problems.push('Name at least one filter and how long it needs.')
    if (goals.some(g => g.filter.trim() === '')) problems.push('Every goal needs a filter name; use "No filter" for frames without one.')
    if (goals.some(g => !Number.isFinite(g.seconds) || g.seconds <= 0)) problems.push('Every goal needs a time above zero.')
    const names = goals.map(g => g.filter.trim().toLowerCase())
    if (new Set(names).size !== names.length) problems.push('Each filter can have one goal only.')
  }
  const asked = rule.integration.kind !== 'none' || rule.coverage || rule.stacked || rule.processed || rule.published
  if (!asked) problems.push('Ask for at least one part: integration, coverage, a stack, a processed file or a finished image.')
  return problems
}

/** A date range in which a seasonal campaign is shot, as YYYY-MM-DD. */
export interface ProjectWindow {
  start: string
  end: string
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (d: string) => DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d)

/** Why a window cannot be kept; empty when it can. */
export function windowProblems(window: ProjectWindow): string[] {
  if (!isDate(window.start) || !isDate(window.end)) return ['Give the window as two dates, such as 2026-11-01 and 2027-02-28.']
  if (window.end < window.start) return ['The window ends before it starts.']
  return []
}

export type CampaignWindowState = { state: 'not begun'; daysToStart: number } | { state: 'open'; daysLeft: number } | { state: 'closed' }

const DAY_MS = 86_400_000
const dayNumber = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS)

/** Where `today` (YYYY-MM-DD) falls against a window; days left counts today. */
export function campaignWindowState(window: ProjectWindow, today: string): CampaignWindowState {
  if (today < window.start) return { state: 'not begun', daysToStart: dayNumber(window.start) - dayNumber(today) }
  if (today > window.end) return { state: 'closed' }
  return { state: 'open', daysLeft: dayNumber(window.end) - dayNumber(today) + 1 }
}

// ── Evidence and tasks ──────────────────────────────────────────────────

/** What the index holds for one target, read afresh each time (AP-002). */
export interface TargetEvidence {
  targetId: string
  name: string
  /** Light acquired per filter, rejected frames included. */
  acquired: FilterSeconds[]
  /** Light grading keeps, per filter. */
  usable: FilterSeconds[]
  stacks: number
  processed: number
  published: number
  /** The target's own goals per filter. */
  goals: FilterSeconds[]
}

/** How far a target's work has gone, the furthest stage reached (AP-003). */
export type TaskStage = 'not observed' | 'acquired' | 'stacked' | 'processed' | 'published'

export type PartName = 'coverage' | 'integration' | 'stacked' | 'processed' | 'published'
export const PART_NAMES: PartName[] = ['coverage', 'integration', 'stacked', 'processed', 'published']

/** One part of the rule as it stands for one task. */
export interface PartState {
  met: boolean
  detail: string
}

export type StepKind = 'set goals' | 'capture' | 'cover' | 'stack' | 'process' | 'publish'

/** The one thing that moves a task on next. */
export interface ProjectStep {
  kind: StepKind
  text: string
  /** Light still to capture, for a capture or cover step; null otherwise. */
  needSec: number | null
}

export interface ProjectTask {
  /** The target's id, or the panel's id (R1C1…). */
  id: string
  kind: 'target' | 'panel'
  label: string
  /** The target's furthest stage, or the panel's coverage state. */
  stage: TaskStage | PanelProgress['state']
  /** The parts that apply to this task, in rule order. */
  parts: Partial<Record<PartName, PartState>>
  /** Per-filter light against the goals, when integration is asked. */
  filters: FilterProgress[]
  done: boolean
  next: ProjectStep | null
}

const hours = (sec: number) => `${(sec / 3600).toFixed(1)} h`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const sum = (list: FilterSeconds[]) => list.reduce((n, f) => n + f.seconds, 0)

export function stageOf(e: TargetEvidence): TaskStage {
  if (e.published > 0) return 'published'
  if (e.processed > 0) return 'processed'
  if (e.stacks > 0) return 'stacked'
  return sum(e.acquired) > 0 ? 'acquired' : 'not observed'
}

/** The goals a task is measured against: none, the target's own, or the rule's. */
export function goalsFor(rule: CompletionRule, targetGoals: FilterSeconds[]): FilterSeconds[] | null {
  if (rule.integration.kind === 'none') return null
  return rule.integration.kind === 'per filter' ? rule.integration.goals : targetGoals
}

/** Integration against goals: met when every goal is, unmet (and asking for goals) when there are none. */
function integrationPart(filters: FilterProgress[], goals: FilterSeconds[]): PartState {
  if (goals.length === 0) return { met: false, detail: 'No goals set' }
  const short = filters.filter(f => f.needSec !== null && f.needSec > 0)
  if (short.length === 0) return { met: true, detail: 'Every goal met' }
  return { met: false, detail: short.map(f => `${f.filter} needs ${hours(f.needSec as number)}`).join(', ') }
}

/** The capture step for the filter with the most still to capture. */
function captureStep(label: string, filters: FilterProgress[]): ProjectStep {
  const worst = filters.filter(f => (f.needSec ?? 0) > 0).sort((a, b) => (b.needSec as number) - (a.needSec as number) || a.filter.localeCompare(b.filter))[0]
  const needSec = filters.reduce((n, f) => n + (f.needSec ?? 0), 0)
  return { kind: 'capture', text: `Capture ${worst.filter} on ${label}: ${hours(worst.needSec as number)} more`, needSec }
}

/** A target's task: its stage and every asked part but coverage, which belongs to panels. */
export function targetTask(e: TargetEvidence, rule: CompletionRule, options: { integration?: boolean } = {}): ProjectTask {
  const parts: ProjectTask['parts'] = {}
  const goals = options.integration === false ? null : goalsFor(rule, e.goals)
  const filters = goals ? measureFilters(e.usable, goals) : []
  if (goals) parts.integration = integrationPart(filters, goals)
  const usableSec = sum(e.usable)
  if (rule.stacked) parts.stacked = e.stacks > 0 ? { met: true, detail: plural(e.stacks, 'stack') } : { met: false, detail: 'No stack yet' }
  if (rule.processed) parts.processed = e.processed > 0 ? { met: true, detail: plural(e.processed, 'processed file') } : { met: false, detail: 'Nothing processed yet' }
  if (rule.published) parts.published = e.published > 0 ? { met: true, detail: plural(e.published, 'finished image') } : { met: false, detail: 'No finished image yet' }
  const done = Object.values(parts).every(p => p.met)
  return { id: e.targetId, kind: 'target', label: e.name, stage: stageOf(e), parts, filters, done, next: done ? null : targetStep(e, parts, filters, usableSec) }
}

/** The earliest step that is missing: goals, light, a stack, processing, then a finished image. */
function targetStep(e: TargetEvidence, parts: ProjectTask['parts'], filters: FilterProgress[], usableSec: number): ProjectStep {
  if (parts.integration && !parts.integration.met) {
    if (parts.integration.detail === 'No goals set') return { kind: 'set goals', text: `Set integration goals for ${e.name}`, needSec: null }
    return captureStep(e.name, filters)
  }
  const wantsOutput = [parts.stacked, parts.processed, parts.published].some(p => p && !p.met)
  // Stryker disable next-line ConditionalExpression: a task reaches here only with an output part unmet
  if (wantsOutput && usableSec === 0 && e.stacks === 0 && e.processed === 0) return { kind: 'capture', text: `Capture lights of ${e.name}`, needSec: null }
  if (parts.stacked && !parts.stacked.met) return { kind: 'stack', text: `Stack ${e.name}: ${hours(usableSec)} usable`, needSec: null }
  if (parts.processed && !parts.processed.met) {
    if (e.stacks === 0) return { kind: 'stack', text: `Stack ${e.name}: ${hours(usableSec)} usable`, needSec: null }
    return { kind: 'process', text: `Process the stack of ${e.name}`, needSec: null }
  }
  if (e.stacks === 0 && e.processed === 0) return { kind: 'stack', text: `Stack ${e.name}: ${hours(usableSec)} usable`, needSec: null }
  return { kind: 'publish', text: `Finish an image of ${e.name} and save it in its images folder`, needSec: null }
}

/**
 * A mosaic panel's task: covered by area, and its usable light against the goals, measured
 * separately (AP-003). `aim` is where the next session should point, in words.
 */
export function panelTask(progress: PanelProgress, rule: CompletionRule, goals: FilterSeconds[] | null, aim: string | null): ProjectTask {
  const parts: ProjectTask['parts'] = {}
  const percent = `${Math.round(progress.coverage.fraction * 100)}% covered`
  if (rule.coverage) parts.coverage = { met: progress.state === 'covered', detail: percent }
  if (goals) parts.integration = integrationPart(progress.filters, goals)
  const done = Object.values(parts).every(p => p.met)
  const filters = goals ? progress.filters : []
  let next: ProjectStep | null = null
  if (!done) {
    if (parts.coverage && !parts.coverage.met) {
      const needSec = filters.reduce((n, f) => n + (f.needSec ?? 0), 0)
      next = { kind: 'cover', text: `Cover ${progress.panelId} (${percent})${aim ? `, aiming at ${aim}` : ''}`, needSec: needSec > 0 ? needSec : null }
    } else if (parts.integration?.detail === 'No goals set') next = { kind: 'set goals', text: 'Set integration goals for the mosaic', needSec: null }
    else next = captureStep(progress.panelId, filters)
  }
  return { id: progress.panelId, kind: 'panel', label: progress.panelId, stage: progress.state, parts, filters, done, next }
}

// ── Progress ────────────────────────────────────────────────────────────

/** How many tasks meet one part, out of those it applies to. */
export interface PartTally {
  part: PartName
  met: number
  of: number
}

export interface ProjectProgress {
  tasks: ProjectTask[]
  done: number
  total: number
  /** Each asked part on its own, so a project-wide total never hides a weak one (AP-003). */
  parts: PartTally[]
  /** Every task done (and at least one task). */
  complete: boolean
}

/** Tallies the tasks: done when every part asked of it is met. */
export function projectProgress(tasks: ProjectTask[]): ProjectProgress {
  const parts: PartTally[] = []
  for (const part of PART_NAMES) {
    const states = tasks.map(t => t.parts[part]).filter((p): p is PartState => p !== undefined)
    if (states.length > 0) parts.push({ part, met: states.filter(p => p.met).length, of: states.length })
  }
  const done = tasks.filter(t => t.done).length
  return { tasks, done, total: tasks.length, parts, complete: tasks.length > 0 && done === tasks.length }
}

const STEP_ORDER: Record<StepKind, number> = { 'set goals': 0, publish: 1, process: 2, stack: 3, cover: 4, capture: 5 }

/**
 * A project's next actions (GetProjectNextActions): one per unfinished task, finishing work that
 * needs no sky first (goals, then a finished image, processing, stacking), then captures with the
 * least still to capture first, so near-finished tasks close.
 */
export function projectNextActions(tasks: ProjectTask[]): (ProjectStep & { taskId: string; label: string })[] {
  return tasks
    .filter(t => t.next !== null)
    .map(t => ({ ...(t.next as ProjectStep), taskId: t.id, label: t.label }))
    .sort((a, b) => STEP_ORDER[a.kind] - STEP_ORDER[b.kind] || (a.needSec ?? Infinity) - (b.needSec ?? Infinity) || a.label.localeCompare(b.label))
}

// ── The manifest ────────────────────────────────────────────────────────

export const MANIFEST_CSV_COLUMNS = ['project', 'task', 'kind', 'stage', 'done', ...PART_NAMES, 'next_step'] as const

export interface ProjectManifestInput {
  name: string
  kind: ProjectKind
  status: ProjectStatus
  rule: CompletionRule
  window: ProjectWindow | null
  progress: ProjectProgress
  /** When it was worked out, as an ISO time. */
  at: string
}

const csvCell = (text: string) => (/[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)
const partCell = (p: PartState | undefined) => (p ? `${p.met ? 'met' : 'not met'}: ${p.detail}` : '')

/** One row per task: its stage, each part asked of it and the next step (ExportProjectManifest). */
export function projectManifestCsv(input: ProjectManifestInput): string {
  const rows = input.progress.tasks.map(t => [input.name, t.label, t.kind, t.stage, t.done ? 'yes' : 'no', ...PART_NAMES.map(p => partCell(t.parts[p])), t.next?.text ?? ''])
  return `${[MANIFEST_CSV_COLUMNS.join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n')}\n`
}

/** The project, its rule and every task with its parts, for other tools to read. */
export function projectManifestJson(input: ProjectManifestInput): string {
  const { progress } = input
  return (
    JSON.stringify(
      {
        project: input.name,
        kind: input.kind,
        status: input.status,
        window: input.window,
        rule: input.rule,
        worked_out_at: input.at,
        done: progress.done,
        total: progress.total,
        parts: progress.parts,
        tasks: progress.tasks.map(t => ({
          id: t.id,
          kind: t.kind,
          label: t.label,
          stage: t.stage,
          done: t.done,
          parts: t.parts,
          filters: t.filters.map(f => ({ filter: f.filter, have_sec: f.haveSec, goal_sec: f.goalSec, need_sec: f.needSec })),
          next_step: t.next?.text ?? null
        }))
      },
      null,
      2
    ) + '\n'
  )
}

/** A file name from the project's name, as the mosaic exports make theirs: "Messier_marathon-manifest.csv". */
export function projectManifestName(name: string, extension: 'csv' | 'json'): string {
  const safe = name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'project'
  return `${safe}-manifest.${extension}`
}
