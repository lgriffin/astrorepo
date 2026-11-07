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

/** Accessibility rule ids that failed at serious or critical impact, with how many elements failed each. */
export type Findings = Record<string, number>

/** What one page showed in one theme. */
export interface PageResult {
  route: string
  theme: SmokeTheme
  /** Uncaught errors and console errors while it loaded. */
  errors: string[]
  /** How many characters of text the page's own content holds, apart from its heading; none means it drew blank. */
  textLength: number
  violations: Findings
}

/**
 * The accessibility findings already known, by route then rule id, each with the most elements
 * that failed it in any theme. U4 works it down; a page may fail a rule on no more elements than this.
 */
export type AxeBaseline = Record<string, Findings>

/** Why a page fails the smoke run, or none: errors or a blank page (DEV-012), or findings beyond the baseline (DEV-013). */
export function pageProblems(result: PageResult, baseline: AxeBaseline): string[] {
  const known = baseline[result.route] ?? {}
  const where = `${result.route} (${result.theme})`
  return [
    ...result.errors.map(e => `${where}: ${e}`),
    ...(result.textLength === 0 ? [`${where} drew a blank page`] : []),
    ...Object.entries(result.violations)
      .filter(([rule, nodes]) => nodes > (known[rule] ?? 0))
      .map(([rule, nodes]) => (known[rule] ? `${where}: ${rule} on ${nodes} elements, ${known[rule]} known` : `${where}: new accessibility finding ${rule}`))
  ]
}

/** The most elements failing each rule on each route, over every theme. */
function observed(results: PageResult[]): AxeBaseline {
  const out: AxeBaseline = {}
  for (const r of results) for (const [rule, nodes] of Object.entries(r.violations)) out[r.route] = { ...out[r.route], [rule]: Math.max(out[r.route]?.[rule] ?? 0, nodes) }
  return out
}

const sorted = (baseline: AxeBaseline): AxeBaseline =>
  Object.fromEntries(
    Object.entries(baseline)
      .filter(([, rules]) => Object.keys(rules).length > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([route, rules]) => [route, Object.fromEntries(Object.entries(rules).sort(([a], [b]) => a.localeCompare(b)))])
  )

/** The baseline's entries that now fail on fewer elements, or none, so it can be cut down (DEV-013). */
export function fixedFindings(results: PageResult[], baseline: AxeBaseline): string[] {
  const seen = observed(results)
  return Object.entries(baseline).flatMap(([route, rules]) =>
    Object.entries(rules)
      .filter(([rule, nodes]) => (seen[route]?.[rule] ?? 0) < nodes)
      .map(([rule, nodes]) => `${route} ${rule} (${seen[route]?.[rule] ?? 0} of ${nodes})`)
  )
}

/** The baseline cut down to this run's findings: it only ever loses entries or elements, never gains them (DEV-013). */
export function shrunkBaseline(results: PageResult[], baseline: AxeBaseline): AxeBaseline {
  const seen = observed(results)
  return sorted(
    Object.fromEntries(
      Object.entries(baseline).map(([route, rules]) => [
        route,
        Object.fromEntries(
          Object.entries(rules)
            .map(([rule, nodes]) => [rule, Math.min(nodes, seen[route]?.[rule] ?? 0)] as const)
            .filter(([, nodes]) => nodes > 0)
        )
      ])
    )
  )
}

/** Every finding of this run as a baseline, for accepting findings on purpose (`--accept-findings`). */
export function baselineOf(results: PageResult[]): AxeBaseline {
  return sorted(observed(results))
}
