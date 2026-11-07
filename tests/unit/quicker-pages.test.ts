import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { NAV_PLACES } from '../../src/shared/navigation'
import { WARM_AFTER_MS, pagesToWarm, routeFor } from '../../src/shared/page-loading'

const repo = path.resolve(__dirname, '../..')
const read = (rel: string): string => fs.readFileSync(path.join(repo, rel), 'utf8')
const routes = read('src/renderer/routes.tsx')
const PATTERNS = [...routes.matchAll(/\{ path: '([^']+)', page: \w+ \}/g)].map(m => m[1])

describe('Quicker pages (spec 046, U6)', () => {
  it('[EUX-018] Given a link, When the page it opens is looked up, Then the route is found by its pattern, with or without a query', () => {
    expect(routeFor(PATTERNS, '/targets')).toBe('/targets')
    expect(routeFor(PATTERNS, '/targets/abc-123')).toBe('/targets/:id')
    expect(routeFor(PATTERNS, '/settings?section=tools')).toBe('/settings')
    expect(routeFor(PATTERNS, '/sessions/7/edit')).toBe('/sessions/:id/edit')
    expect(routeFor(PATTERNS, '/sessions/new')).toBe('/sessions/new')
    expect(routeFor(PATTERNS, '/targets/')).toBe('/targets')
    expect(routeFor(PATTERNS, '/nowhere')).toBeNull()
    expect(routeFor(PATTERNS, '/targets//x')).toBeNull()
    // Every sidebar place opens a route the table knows.
    for (const place of NAV_PLACES) for (const p of place.pages) expect(routeFor(PATTERNS, p.to), p.to).not.toBeNull()
  })

  it('[EUX-018] Given the sidebar and Go to, When a place is pointed at, reached with Tab or highlighted, Then its page starts loading, once', () => {
    const sidebar = read('src/renderer/components/common/Sidebar.tsx')
    expect(sidebar).toContain('onMouseEnter={() => preloadPage(place.pages[0].to)}')
    expect(sidebar).toContain('onFocus={() => preloadPage(place.pages[0].to)}')
    expect(read('src/renderer/components/common/CommandPalette.tsx')).toMatch(/if \(activeTo\) preloadPage\(activeTo\)/)
    expect(routes).toMatch(/fetched\.has\(route\.path\)/)
  })

  it('[EUX-019] Given Home is open, When the app is idle, Then the sidebar places are loaded in the background, but not once Home is left first and never on a companion screen', () => {
    const warm = pagesToWarm('desktop', NAV_PLACES)
    expect(warm).toEqual(NAV_PLACES.filter(p => p.id !== 'home').map(p => p.pages[0].to))
    expect(warm).not.toContain('/dashboard')
    expect(pagesToWarm('browser', NAV_PLACES)).toEqual(warm)
    expect(pagesToWarm('companion', NAV_PLACES)).toEqual([])
    expect(WARM_AFTER_MS).toBeGreaterThanOrEqual(1000)
    // Only while Home is open: leaving it first cancels the wait, so the page chosen loads alone.
    expect(routes).toContain("const onHome = pathname === '/dashboard'")
    expect(routes).toContain('onHome ? pagesToWarm(window.astrorepoMode, NAV_PLACES) : []')
    expect(routes).toContain('requestIdleCallback')
    expect(routes).toMatch(/\}, \[onHome\]\)/)
    expect(read('src/renderer/App.tsx')).toContain('<WarmPages />')
  })
})
