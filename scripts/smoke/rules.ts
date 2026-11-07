/**
 * The smoke run's rules (specs/045-developer-experience, D3): which pages it opens, how it judges
 * each one, and how accessibility findings are held to a baseline that may only shrink.
 */
import { NAV_PLACES, SETTINGS_SECTIONS, settingsLink } from '../../src/shared/navigation'

/** The themes every page is drawn in (src/shared/themes.ts). */
export const SMOKE_THEMES = ['dark', 'light', 'night'] as const
export type SmokeTheme = (typeof SMOKE_THEMES)[number]

/** One page to open: the route, and a file-safe name for its screenshot. */
export interface SmokePage {
  route: string
  name: string
}

const fileName = (route: string) => route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') || 'root'

/** Every page in the map of places and every Settings section, each once (DEV-011). */
export function smokePages(): SmokePage[] {
  const routes = [...NAV_PLACES.flatMap(p => p.pages.map(page => page.to)), ...SETTINGS_SECTIONS.map(s => settingsLink(s.id))]
  return [...new Set(routes)].map(route => ({ route, name: fileName(route) }))
}

/** What one page showed in one theme. */
export interface PageResult {
  route: string
  theme: SmokeTheme
  /** Uncaught errors and console errors while it loaded. */
  errors: string[]
  /** How many characters of text its main area holds; none means it drew blank. */
  textLength: number
  /** Accessibility rule ids that failed at serious or critical impact, each once. */
  violations: string[]
}

/** The accessibility findings already known, by route then rule id, which U4 works down. */
export type AxeBaseline = Record<string, string[]>

/** Why a page fails the smoke run, or none: errors or a blank page (DEV-012), or a finding not in the baseline (DEV-013). */
export function pageProblems(result: PageResult, baseline: AxeBaseline): string[] {
  const known = new Set(baseline[result.route] ?? [])
  return [
    ...result.errors.map(e => `${result.route} (${result.theme}): ${e}`),
    ...(result.textLength === 0 ? [`${result.route} (${result.theme}) drew a blank page`] : []),
    ...result.violations.filter(v => !known.has(v)).map(v => `${result.route} (${result.theme}): new accessibility finding ${v}`)
  ]
}

/** The baseline's entries that no longer fail anywhere, so it can be cut down (DEV-013). */
export function fixedFindings(results: PageResult[], baseline: AxeBaseline): string[] {
  const seen = new Set(results.flatMap(r => r.violations.map(v => `${r.route} ${v}`)))
  return Object.entries(baseline).flatMap(([route, rules]) => rules.filter(rule => !seen.has(`${route} ${rule}`)).map(rule => `${route} ${rule}`))
}

/** The baseline the current findings would write: each route's failing rules, sorted, every theme together. */
export function baselineOf(results: PageResult[]): AxeBaseline {
  const out: AxeBaseline = {}
  for (const r of results) for (const v of r.violations) out[r.route] = [...new Set([...(out[r.route] ?? []), v])].sort()
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
}
