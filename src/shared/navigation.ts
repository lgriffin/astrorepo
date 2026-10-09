import type { JobsView, JobView } from './types'

/**
 * The app's one map of places (specs/017-unified-ux). The sidebar, every page's title and
 * subtitle, the breadcrumb above it and the back link on a detail page all come from here, so a
 * place has one name wherever it appears.
 */
export interface NavItem {
  id: string
  to: string
  label: string
  icon: string
  /** What the page answers, shown under its title. */
  hint: string
  /** Other path prefixes that belong to this place (its detail pages and forms). */
  also?: string[]
}

export interface NavGroup {
  /** Null for the daily places at the top, which need no heading. */
  label: string | null
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { id: 'home', to: '/dashboard', label: 'Home', icon: '◉', hint: 'What to do next, the coming nights, and what is hiding in your files' },
      { id: 'targets', to: '/targets', label: 'Targets', icon: '★', hint: 'Every object you have captured or plan to' },
      { id: 'sky', to: '/sky-planner', label: 'Sky planner', icon: '☽', hint: 'Tonight, the moon and the seasons from your site' },
      { id: 'jobs', to: '/jobs', label: 'Jobs', icon: '▶', hint: 'Stacking and post-processing runs, queued for the run window' }
    ]
  },
  {
    label: 'Files',
    items: [
      { id: 'library', to: '/library', label: 'Library', icon: '⊟', hint: 'The folders that hold your captures, and their last scan' },
      { id: 'fits', to: '/fits-analyzer', label: 'FITS files', icon: '◈', hint: 'What the headers say, file by file' },
      { id: 'images', to: '/images', label: 'Images', icon: '▢', hint: 'Your stacked and finished images' },
      { id: 'calibration', to: '/calibration', label: 'Calibration', icon: '◇', hint: 'Darks, flats and biases, and which lights they cover' }
    ]
  },
  {
    label: 'Review',
    items: [
      { id: 'nights', to: '/timeline', label: 'Nights', icon: '▥', hint: 'Every night you imaged, month by month', also: ['/sessions'] },
      { id: 'stacks', to: '/stacking', label: 'Stacks', icon: '⊞', hint: "Integration so far against each target's goal" },
      { id: 'insights', to: '/insights', label: 'Insights', icon: '◎', hint: 'Totals, catalogue progress, and seeing, filters and activity over time' },
      { id: 'storage', to: '/analytics', label: 'Storage', icon: '▤', hint: 'How much space your data takes, and how fast it grows' }
    ]
  },
  {
    label: 'Collections',
    items: [
      { id: 'collections', to: '/collections', label: 'Collections', icon: '▦', hint: 'Catalogues and lists of targets, and how far through each you are' },
      { id: 'posters', to: '/poster', label: 'Posters', icon: '▣', hint: 'A printable grid of a collection' }
    ]
  },
  {
    label: 'Setup',
    items: [
      { id: 'equipment', to: '/equipment', label: 'Equipment', icon: '⚙', hint: 'Your scopes, cameras and filters, and their field of view' },
      { id: 'settings', to: '/settings', label: 'Settings', icon: '⚒', hint: 'Your site, folders, tools and run window' }
    ]
  }
]

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap(g => g.items)

export interface Location {
  group: NavGroup
  item: NavItem
  /** A page below the place (a target, a collection, a form), which gets a back link to it. */
  detail: boolean
}

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)

/** Which place a path belongs to, or null for a path the map does not know. */
export function locate(pathname: string): Location | null {
  const path = pathname === '/' || pathname === '' ? '/dashboard' : pathname.replace(/\/+$/, '')
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (path === item.to) return { group, item, detail: false }
      if (under(path, item.to) || (item.also ?? []).some(p => under(path, p))) return { group, item, detail: true }
    }
  }
  return null
}

/** The sections of Settings, in page order; links elsewhere open Settings at one of them. */
export const SETTINGS_SECTIONS = [
  { id: 'location', label: 'Your site' },
  { id: 'folders', label: 'Folders' },
  { id: 'tools', label: 'Tools' },
  { id: 'run-window', label: 'Run window' },
  { id: 'grading', label: 'Frame grading' },
  { id: 'import', label: 'Import and export' },
  { id: 'reset', label: 'Start again' }
] as const

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

/** One target's jobs out of the whole queue (UX-011). */
export function runsForTarget(view: Pick<JobsView, 'running' | 'queue' | 'history'> | null, targetId: string, keep = 5): TargetRuns {
  const mine = (j: JobView) => j.targetId === targetId
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

/** What a step says when its job is already on its way. */
export function runLine(job: JobView): string {
  if (job.state === 'running') return `Running now: ${job.title}.`
  return job.waiting && job.waiting !== 'Starting now.' ? `Queued: ${job.title}. ${job.waiting}` : `Queued: ${job.title}. Starting now.`
}
