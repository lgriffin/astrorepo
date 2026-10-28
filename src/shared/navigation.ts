import type { JobsView, JobView } from './types'

/**
 * The app's one map of places (specs/017-unified-ux, reshaped into eight places by
 * specs/041-look-and-feel V2). The sidebar, the row of pages above a page's title, every page's
 * title and subtitle, the back link on a detail page and the command palette all come from here,
 * so a page has one name wherever it appears.
 */
export interface NavItem {
  id: string
  to: string
  label: string
  /** What the page answers, shown under its title. */
  hint: string
  /** Other path prefixes that belong to this page (its detail pages and forms). */
  also?: string[]
}

/** One of the eight places in the sidebar, and the pages it holds, its first page opening it. */
export interface NavPlace {
  id: string
  label: string
  pages: NavItem[]
}

export const NAV_PLACES: NavPlace[] = [
  {
    id: 'home',
    label: 'Home',
    pages: [{ id: 'home', to: '/dashboard', label: 'Home', hint: 'What to do next, the coming nights, and what is hiding in your files' }]
  },
  {
    id: 'targets',
    label: 'Targets',
    pages: [
      { id: 'targets', to: '/targets', label: 'Targets', hint: 'Every object you have captured or plan to' },
      { id: 'collections', to: '/collections', label: 'Collections', hint: 'Catalogues and lists of targets, and how far through each you are' },
      { id: 'messier', to: '/messier', label: 'Messier mosaic', hint: 'All 110 Messier objects with your own images, the gaps, and when each gap is up' }
    ]
  },
  {
    id: 'plan',
    label: 'Plan',
    pages: [
      { id: 'sky', to: '/sky-planner', label: 'Sky planner', hint: 'Tonight, the moon and the seasons from your site' },
      { id: 'projects', to: '/projects', label: 'Projects', hint: 'Campaigns over targets or a mosaic, with what finished means and the next step for each' },
      { id: 'mosaics', to: '/mosaics', label: 'Mosaics', hint: 'Mosaic plans drawn on the sky, revision by revision, with exact panel coordinates' }
    ]
  },
  {
    id: 'process',
    label: 'Process',
    pages: [
      { id: 'jobs', to: '/jobs', label: 'Jobs', hint: 'Stacking and post-processing runs, queued for the run window' },
      { id: 'stacks', to: '/stacking', label: 'Stacks', hint: "Integration so far against each target's goal" },
      { id: 'calibration', to: '/calibration', label: 'Calibration', hint: 'Darks, flats and biases, and which lights they cover' }
    ]
  },
  {
    id: 'data',
    label: 'Data',
    pages: [
      { id: 'library', to: '/library', label: 'Library', hint: 'The folders that hold your captures, and their last scan' },
      { id: 'fits', to: '/fits-analyzer', label: 'FITS files', hint: 'What the headers say, file by file' },
      { id: 'nights', to: '/timeline', label: 'Nights', hint: 'Every night you imaged, month by month', also: ['/sessions'] },
      { id: 'vespera', to: '/vespera', label: 'Vespera', hint: 'Copy observations off your Vespera over its Wi-Fi' },
      { id: 'storage', to: '/analytics', label: 'Storage', hint: 'How much space your data takes, and how fast it grows' }
    ]
  },
  {
    id: 'gallery',
    label: 'Gallery',
    pages: [
      { id: 'images', to: '/images', label: 'Pictures', hint: 'Your finished pictures, and what each one shows' },
      { id: 'posters', to: '/poster', label: 'Posters', hint: 'A printable grid of a collection' }
    ]
  },
  {
    id: 'insights',
    label: 'Insights',
    pages: [{ id: 'insights', to: '/insights', label: 'Insights', hint: 'Totals, catalogue progress, and seeing, filters and activity over time' }]
  },
  {
    id: 'settings',
    label: 'Settings',
    // Equipment is a Settings section (LF-024); its old address still opens it.
    pages: [{ id: 'settings', to: '/settings', label: 'Settings', hint: 'Your site and equipment, folders, tools and how the app looks', also: ['/equipment'] }]
  }
]

export const NAV_ITEMS: NavItem[] = NAV_PLACES.flatMap(p => p.pages)

export interface Location {
  place: NavPlace
  item: NavItem
  /** A page below the place (a target, a collection, a form), which gets a back link to it. */
  detail: boolean
}

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)

/** Which place and page a path belongs to, or null for a path the map does not know. */
export function locate(pathname: string): Location | null {
  const path = pathname === '/' || pathname === '' ? '/dashboard' : pathname.replace(/\/+$/, '')
  for (const place of NAV_PLACES) {
    for (const item of place.pages) {
      if (path === item.to) return { place, item, detail: false }
      if (under(path, item.to) || (item.also ?? []).some(p => under(path, p))) return { place, item, detail: true }
    }
  }
  return null
}

/** The groups Settings lists its sections under (LF-024), in order. */
export const SETTINGS_GROUPS = ['Your observatory', 'Files and tools', 'Processing', 'This app'] as const

/** The sections of Settings, each a page of its own, in the order the list shows them; links elsewhere open one. */
export const SETTINGS_SECTIONS = [
  { id: 'location', label: 'Your site', group: 'Your observatory', hint: 'Where you observe from, for the sky, the moon and the weather' },
  { id: 'equipment', label: 'Equipment', group: 'Your observatory', hint: 'Your scopes, cameras and filters, and their field of view' },
  { id: 'weather', label: 'Weather', group: 'Your observatory', hint: 'Where the forecast for clear skies comes from' },
  { id: 'folders', label: 'Folders', group: 'Files and tools', hint: 'Where your data lives and where copies go' },
  { id: 'tools', label: 'Tools', group: 'Files and tools', hint: 'Siril, scripts and the other programs the app runs' },
  { id: 'import', label: 'Import and export', group: 'Files and tools', hint: 'CSV exports and NINA sequences' },
  { id: 'run-window', label: 'Run window', group: 'Processing', hint: 'When queued jobs may run' },
  { id: 'grading', label: 'Frame grading', group: 'Processing', hint: 'Which frames are kept for stacking' },
  { id: 'appearance', label: 'Appearance', group: 'This app', hint: 'Dark, light or red night theme' },
  { id: 'learning', label: 'Learning', group: 'This app', hint: 'How much the app explains the astrophysics behind what it shows' },
  { id: 'companions', label: 'Companion screens', group: 'This app', hint: 'Other screens that follow this one' },
  { id: 'reset', label: 'Start again', group: 'This app', hint: 'Clear the database, or bring back the setup checklist' }
] as const satisfies readonly { id: string; label: string; group: (typeof SETTINGS_GROUPS)[number]; hint: string }[]

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id']

/** A link that opens Settings scrolled to one section. */
export function settingsLink(section: SettingsSection): string {
  return `/settings?section=${section}`
}

/** The section a Settings link asks for, or null when it names none the page has. */
export function settingsSectionFrom(search: string): SettingsSection | null {
  const wanted = new URLSearchParams(search).get('section')
  return SETTINGS_SECTIONS.find(s => s.id === wanted)?.id ?? null
}

/**
 * The line under the sidebar that says what the job runner is doing, wherever the user is:
 * the running job, else how many wait and why the next one (the head of the queue, in the order
 * it will run) has not started, in the scheduler's own words; else nothing.
 */
export function jobsStatus(view: Pick<JobsView, 'running' | 'queue'> | null): { text: string; busy: boolean } | null {
  if (!view) return null
  if (view.running) return { text: `Running: ${view.running.title}`, busy: true }
  if (view.queue.length === 0) return null
  const count = view.queue.length === 1 ? '1 job queued' : `${view.queue.length} jobs queued`
  const waiting = view.queue[0].waiting
  const next = waiting ? `Next ${waiting.charAt(0).toLowerCase()}${waiting.slice(1)}` : 'Next starts in a moment.'
  return { text: `${count}. ${next}`, busy: false }
}

/** The parts of a target's page (UX-009), in the order they appear. */
export const TARGET_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'process', label: 'Stack and process' },
  { id: 'files', label: 'Files' },
  { id: 'notes', label: 'Notes and nights' }
] as const

export type TargetTab = (typeof TARGET_TABS)[number]['id']

/** A link to a target's page, opened on one part of it. */
export function targetLink(targetId: string, tab: TargetTab = 'overview'): string {
  const path = `/targets/${encodeURIComponent(targetId)}`
  return tab === 'overview' ? path : `${path}?tab=${tab}`
}

/** The Sky planner opened on a target's mosaic plan (specs/024-sky-geometry). */
export function mosaicPlannerLink(targetId: string): string {
  return `/sky-planner?mosaic=${encodeURIComponent(targetId)}#mosaic`
}

/** An astronomy project's page (specs/038-astronomy-projects). */
export function projectLink(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`
}

/** A mosaic workspace's page (specs/037-mosaic-workspace), at a revision when one is named. */
export function workspaceLink(workspaceId: string, revision?: number): string {
  const path = `/mosaics/${encodeURIComponent(workspaceId)}`
  return revision === undefined ? path : `${path}?revision=${revision}`
}

/** The revision a workspace link asks for, or null for the latest. */
export function workspaceRevisionFrom(search: string): number | null {
  const n = Number(new URLSearchParams(search).get('revision'))
  return Number.isInteger(n) && n >= 1 ? n : null
}

/** The target a Sky planner link asks to plan a mosaic for, or null. */
export function mosaicTargetFrom(search: string): string | null {
  return new URLSearchParams(search).get('mosaic')
}

/** The part of a target's page a link asks for; Overview when it names none. */
export function targetTabFrom(search: string): TargetTab {
  const wanted = new URLSearchParams(search).get('tab')
  return TARGET_TABS.find(t => t.id === wanted)?.id ?? 'overview'
}

export interface TargetRuns {
  /** Queued or running, in the order the queue will run them (the running one first). */
  active: JobView[]
  /** The last few that finished, newest first. */
  finished: JobView[]
  /** The active job for each step of the flow, so the step can say it is already on its way. */
  stack: JobView | null
  postProcess: JobView | null
  /** A SyQon step on its way (specs/023-hub-syqon). */
  syqon: JobView | null
}

/** One target's stack and post-processing jobs out of the whole queue (UX-011); plate solves are not runs. */
export function runsForTarget(view: Pick<JobsView, 'running' | 'queue' | 'history'> | null, targetId: string, keep = 5): TargetRuns {
  const mine = (j: JobView) => j.targetId === targetId && j.kind !== 'solve'
  const active = view ? [...(view.running ? [view.running] : []), ...view.queue].filter(mine) : []
  const finished = view ? view.history.filter(mine).slice(0, keep) : []
  return {
    active,
    finished,
    stack: active.find(j => j.kind === 'stack') ?? null,
    postProcess: active.find(j => j.kind === 'post-process') ?? null,
    syqon: active.find(j => j.kind === 'syqon') ?? null
  }
}

/**
 * Whether one filter's stack is already queued or running (RIG-009), so only that filter's Queue
 * button is hidden. Filters match as the plan matches them: case and spaces at the ends do not count.
 */
export function filterStackQueued(runs: Pick<TargetRuns, 'active'>, filter: string): boolean {
  const wanted = filter.trim().toLowerCase()
  return runs.active.some(j => j.kind === 'stack' && j.filter !== null && j.filter.trim().toLowerCase() === wanted)
}

/** What a step says when its job is already on its way. */
export function runLine(job: JobView): string {
  if (job.state === 'running') return `Running now: ${job.title}.`
  return job.waiting && job.waiting !== 'Starting now.' ? `Queued: ${job.title}. ${job.waiting}` : `Queued: ${job.title}. Starting now.`
}

/** The Messier mosaic, opened on one object's tile when a number is given (specs/032-messier-mosaic). */
export function messierLink(number?: number): string {
  return number === undefined ? '/messier' : `/messier?m=${number}`
}

/** The Messier number a mosaic link opens, or null when it names none from 1 to 110. */
export function messierNumberFrom(search: string): number | null {
  const wanted = new URLSearchParams(search).get('m')
  if (!wanted || !/^\d{1,3}$/.test(wanted)) return null
  const n = Number(wanted)
  return n >= 1 && n <= 110 ? n : null
}
