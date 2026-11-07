/** Astronomy projects (spec 038). */
import type { ForecastKindView } from './forecasts'

// ── Astronomy projects (specs/038-astronomy-projects) ──────────────────

export type ProjectKindView = 'catalogue' | 'seasonal' | 'target-depth' | 'mosaic' | 'custom'
export type ProjectStatusView = 'active' | 'paused' | 'archived'

/** A completion rule as the window edits it; goals in hours. */
export interface ProjectRuleView {
  integration: 'none' | 'target goals' | 'per filter'
  goals: { filter: string; hours: number }[]
  coverage: boolean
  stacked: boolean
  processed: boolean
  published: boolean
}

export interface ProjectSummaryView {
  id: string
  name: string
  kind: ProjectKindView
  /** "Catalogue campaign" */
  kindLabel: string
  status: ProjectStatusView
  done: number
  total: number
  complete: boolean
  /** "Open, 34 days left", or null when it has no window. */
  window: string | null
}

export interface ProjectSourcesView {
  catalogues: { id: string; name: string; size: number }[]
  collections: { id: string; name: string; size: number }[]
}

export interface ProjectPartView {
  part: 'coverage' | 'integration' | 'stacked' | 'processed' | 'published'
  /** "Covered", "Integrated", … */
  label: string
  met: boolean
  detail: string
}

export interface ProjectTaskView {
  id: string
  kind: 'target' | 'panel'
  label: string
  stage: string
  done: boolean
  parts: ProjectPartView[]
  /** "Ha 1 h 30 min of 3 h" per filter, when integration is asked. */
  filters: { filter: string; text: string; met: boolean | null }[]
  next: string | null
}

export interface ProjectActionView {
  taskId: string
  kind: 'set goals' | 'capture' | 'cover' | 'stack' | 'process' | 'publish'
  text: string
}

export interface ProjectView {
  id: string
  name: string
  kind: ProjectKindView
  kindLabel: string
  status: ProjectStatusView
  rule: ProjectRuleView
  /** In words: "Finished means: every goal met per filter and a finished image." */
  ruleText: string
  window: { start: string; end: string; text: string } | null
  done: number
  total: number
  complete: boolean
  /** Each asked part on its own: "Integrated 3 of 5". */
  tallies: { part: ProjectPartView['part']; label: string; met: number; of: number }[]
  tasks: ProjectTaskView[]
  next: ProjectActionView[]
  mosaic: { id: string; name: string; revision: number } | null
  source: { kind: 'catalogue' | 'collection'; name: string; newMembers: number } | null
  /** Filters short of their goals by what the next hour buys, most first (spec 039). */
  bottlenecks: { label: string; gain: string | null; range: string | null; kind: ForecastKindView }[]
  /** "Worked out from the index at 21:04." */
  checked: string
}

/** What a change to a project gave back. */
export type ProjectChangeView = { ok: true; id: string } | { ok: false; problems: string[] }
