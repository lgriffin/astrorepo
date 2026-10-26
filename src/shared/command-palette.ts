import { NAV_PLACES, SETTINGS_SECTIONS, settingsLink, targetLink } from './navigation'

/** One thing the command palette can open (specs/041-look-and-feel, LF-013). */
export interface PaletteEntry {
  id: string
  label: string
  /** Where it sits, said under the label: the place, "Settings" or "Target". */
  where: string
  to: string
  kind: 'page' | 'setting' | 'action' | 'target'
  /** The navigation id whose icon it shows. */
  icon: string
  /** More words it answers to. */
  keywords?: string
}

/** The actions that are not a page of their own. */
const ACTIONS: PaletteEntry[] = [
  { id: 'log-night', label: 'Log a night', where: 'Nights', to: '/sessions/new', kind: 'action', icon: 'nights', keywords: 'session add new' },
  { id: 'new-mosaic', label: 'Plan a mosaic', where: 'Mosaics', to: '/mosaics', kind: 'action', icon: 'mosaics', keywords: 'panels grid new' }
]

/** Other words people use for a page, so typing one finds it. */
const PAGE_WORDS: Record<string, string> = {
  home: 'cockpit next actions',
  targets: 'objects catalogue',
  sky: 'tonight moon seasons altitude',
  jobs: 'queue runs stacking',
  stacks: 'integration goals',
  calibration: 'darks flats bias',
  library: 'folders scan',
  fits: 'headers',
  nights: 'sessions timeline',
  vespera: 'ftp copy scope',
  storage: 'disk space',
  images: 'gallery pictures',
  posters: 'print',
  insights: 'totals trends statistics'
}

/** The same for Settings sections; Equipment keeps its own icon now that it lives there. */
const SECTION_WORDS: Record<string, string> = {
  location: 'latitude longitude elevation observatory',
  equipment: 'scopes telescopes cameras filters field view',
  weather: 'forecast clouds',
  folders: 'home archive',
  tools: 'siril astap programs',
  'run-window': 'jobs night schedule',
  grading: 'frames rejection',
  appearance: 'theme dark light night colours',
  reset: 'clear database'
}

/** Every page, Settings section and action, in the order the palette lists them before any typing. */
export function paletteEntries(): PaletteEntry[] {
  const pages = NAV_PLACES.flatMap(place =>
    place.pages.map(page => ({
      id: `page:${page.id}`,
      label: page.label,
      where: place.label,
      to: page.to,
      kind: 'page' as const,
      icon: page.id,
      keywords: PAGE_WORDS[page.id]
    }))
  )
  const settings = SETTINGS_SECTIONS.map(s => ({
    id: `setting:${s.id}`,
    label: s.label,
    where: 'Settings',
    to: settingsLink(s.id),
    kind: 'setting' as const,
    icon: s.id === 'equipment' ? 'equipment' : 'settings',
    keywords: SECTION_WORDS[s.id]
  }))
  return [...pages, ...ACTIONS, ...settings]
}

/** A target found by name, as the palette lists it. */
export function targetEntry(target: { id: string; canonicalName: string; aliases: string[] }): PaletteEntry {
  const other = target.aliases.find(a => a !== target.canonicalName)
  return {
    id: `target:${target.id}`,
    label: target.canonicalName,
    where: other ? `Target · ${other}` : 'Target',
    to: targetLink(target.id),
    kind: 'target',
    icon: 'targets',
    keywords: target.aliases.join(' ')
  }
}

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/**
 * How well an entry answers what was typed, or null when it does not: every typed word has to
 * start a word of the label, its place or its keywords. A label that starts with the query ranks
 * first, then one whose words all match in the label, then matches in the place or keywords.
 */
export function paletteScore(entry: PaletteEntry, query: string): number | null {
  const typed = words(query)
  if (typed.length === 0) return 0
  const label = words(entry.label)
  const rest = words(`${entry.where} ${entry.keywords ?? ''}`)
  let score = 0
  for (const t of typed) {
    if (label.some(w => w.startsWith(t))) score += 2
    else if (rest.some(w => w.startsWith(t))) score += 1
    else return null
  }
  if (entry.label.toLowerCase().startsWith(query.trim().toLowerCase())) score += 10
  return score
}

/** The entries that answer a query, best first, keeping the listed order among equals. */
export function matchEntries(entries: PaletteEntry[], query: string, limit = 12): PaletteEntry[] {
  return entries
    .map((entry, i) => ({ entry, i, score: paletteScore(entry, query) }))
    .filter((m): m is { entry: PaletteEntry; i: number; score: number } => m.score !== null)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map(m => m.entry)
}

/** Where the arrow keys move the highlight in a list of this length, wrapping; null for other keys. */
export function paletteKeyTarget(key: string, index: number, count: number): number | null {
  if (count === 0) return null
  if (key === 'ArrowDown') return (index + 1) % count
  if (key === 'ArrowUp') return (index - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

/** Whether a key press opens the palette: Ctrl+K, or Cmd+K on a Mac. */
export function opensPalette(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey
}
