/**
 * Quicker pages (specs/046-everyday-ux, U6): which page a link opens, so its code can be fetched
 * before it is clicked, and which pages are fetched in the background once Home has settled.
 */
import type { NavPlace } from './navigation'

/** The route a link opens: its pattern, matched segment by segment (":id" takes any one segment). */
export function routeFor(patterns: readonly string[], to: string): string | null {
  const path = to.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  const parts = path.split('/')
  return patterns.find(pattern => {
    const want = pattern.split('/')
    return want.length === parts.length && want.every((w, i) => w.startsWith(':') ? parts[i] !== '' : w === parts[i])
  }) ?? null
}

/** How long after the app starts the background fetching begins, so Home's own requests go first. */
export const WARM_AFTER_MS = 2000

/**
 * The pages fetched in the background (EUX-019): the first page of each sidebar place other than
 * Home. A companion screen fetches nothing ahead, since it reaches the PC over the network.
 */
export function pagesToWarm(mode: string | undefined, places: readonly NavPlace[]): string[] {
  if (mode === 'companion') return []
  return places.map(p => p.pages[0].to).filter(to => to !== '/dashboard')
}
