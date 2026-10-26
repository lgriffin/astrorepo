import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, NAV_PLACES, SETTINGS_SECTIONS, locate } from '../../src/shared/navigation'
import { matchEntries, opensPalette, paletteEntries, paletteKeyTarget, paletteScore, targetEntry } from '../../src/shared/command-palette'
import { NAV_ICONS, PLACE_ICONS } from '../../src/renderer/components/common/nav-icons'

const renderer = path.resolve(__dirname, '../../src/renderer')
const read = (rel: string) => fs.readFileSync(path.join(renderer, rel), 'utf8')

describe('The shell (specs/041-look-and-feel V2)', () => {
  it('[LF-011] Given the eight places, When the sidebar draws them, Then each has a drawn icon and opens on its first page', () => {
    expect(NAV_PLACES).toHaveLength(8)
    expect(NAV_PLACES.filter(p => !PLACE_ICONS[p.id]).map(p => p.id)).toEqual([])
    const sidebar = read('components/common/Sidebar.tsx')
    expect(sidebar).toContain('to={place.pages[0].to}')
    expect(sidebar).toContain("aria-current={active ? 'page' : undefined}")
    // Lit while any of its pages, or a page below one, is open.
    expect(locate('/stacking')?.place.id).toBe('process')
    expect(locate('/sessions/new')?.place.id).toBe('data')
    expect(locate('/projects/p1')?.place.id).toBe('plan')
  })

  it('[LF-012] Given a place with several pages, When one is open, Then its pages show as links above the title, and a detail page links back instead', () => {
    const frame = read('components/common/PageContainer.tsx')
    expect(frame).toContain('{here && !here.detail && <PlacePages place={here.place} current={here.item.id} />}')
    expect(frame).toContain("if (place.pages.length < 2) return null")
    expect(frame).toContain("aria-current={open ? 'page' : undefined}")
    expect(frame).toMatch(/here\?\.detail && \(\s*<Link to=\{here\.item\.to\}/)
  })

  it('[LF-013] Given the palette before typing, When it lists entries, Then every page, Settings section and action is there once', () => {
    const entries = paletteEntries()
    expect(new Set(entries.map(e => e.id)).size).toBe(entries.length)
    for (const page of NAV_ITEMS) expect(entries.some(e => e.to === page.to && e.kind === 'page')).toBe(true)
    for (const s of SETTINGS_SECTIONS) expect(entries.some(e => e.to === `/settings?section=${s.id}`)).toBe(true)
    expect(entries.find(e => e.id === 'log-night')).toMatchObject({ to: '/sessions/new', kind: 'action' })
    for (const e of entries.filter(e => e.kind !== 'action')) expect(NAV_ICONS[e.icon], e.id).toBeDefined()
  })

  it('[LF-013] Given typed words, When entries are matched, Then each typed word must start a word, and labels that start with the query come first', () => {
    const entries = paletteEntries()
    expect(matchEntries(entries, 'sky')[0].label).toBe('Sky planner')
    expect(matchEntries(entries, 'fits')[0].label).toBe('FITS files')
    expect(matchEntries(entries, 'run win').map(e => e.label)).toContain('Run window')
    // A word in the place or the hint still finds the page, after the label matches.
    expect(matchEntries(entries, 'darks').map(e => e.label)).toContain('Calibration')
    // Small words in a page's description do not pull every page in.
    expect(matchEntries(entries, 'and').map(e => e.label)).toEqual(['Import and export'])
    // The middle of a word is not a match.
    expect(paletteScore(entries.find(e => e.label === 'Library')!, 'brary')).toBeNull()
    expect(matchEntries(entries, '', 100)).toHaveLength(entries.length)
  })

  it('[LF-013] Given a target found by name, When it is listed, Then it opens the target and names another of its names', () => {
    expect(targetEntry({ id: 't1', canonicalName: 'Andromeda Galaxy', aliases: ['Andromeda Galaxy', 'M31'] })).toMatchObject({
      label: 'Andromeda Galaxy',
      where: 'Target · M31',
      to: '/targets/t1',
      kind: 'target'
    })
    expect(targetEntry({ id: 't2', canonicalName: 'NGC 7000', aliases: [] }).where).toBe('Target')
  })

  it('[LF-013] Given the palette open, When keys are pressed, Then arrows, Home and End move and wrap, and only Ctrl or Cmd with K opens it', () => {
    expect(paletteKeyTarget('ArrowDown', 2, 3)).toBe(0)
    expect(paletteKeyTarget('ArrowUp', 0, 3)).toBe(2)
    expect(paletteKeyTarget('End', 0, 3)).toBe(2)
    expect(paletteKeyTarget('Home', 2, 3)).toBe(0)
    expect(paletteKeyTarget('ArrowDown', 0, 0)).toBeNull()
    expect(paletteKeyTarget('a', 0, 3)).toBeNull()
    expect(opensPalette({ key: 'k', ctrlKey: true, metaKey: false, altKey: false })).toBe(true)
    expect(opensPalette({ key: 'K', ctrlKey: false, metaKey: true, altKey: false })).toBe(true)
    expect(opensPalette({ key: 'k', ctrlKey: false, metaKey: false, altKey: false })).toBe(false)
    expect(opensPalette({ key: 'k', ctrlKey: true, metaKey: false, altKey: true })).toBe(false)
    const palette = read('components/common/CommandPalette.tsx')
    expect(palette).toContain("if (e.key === 'Escape')")
    expect(palette).toContain('if (opener.current instanceof HTMLElement) opener.current.focus()')
    expect(palette).toContain('aria-activedescendant')
  })

  it('[LF-014] Given a folded sidebar, When it is drawn, Then each place keeps its name for screen readers and on hover, and the choice is remembered', () => {
    const sidebar = read('components/common/Sidebar.tsx')
    expect(sidebar).toContain('aria-label={rail ? place.label : undefined}')
    expect(sidebar).toContain('title={rail ? place.label : undefined}')
    expect(sidebar).toContain("window.localStorage.setItem(RAIL_KEY, next ? '1' : '0')")
    // The jobs line stays on every page (UX-004), as a named icon when folded.
    expect(sidebar).toContain('<JobsFooter rail={rail} />')
    expect(sidebar).toMatch(/if \(rail\) \{[\s\S]*aria-label=\{status\.text\}/)
  })

  it('[LF-015] Given words that match nothing, When the palette lists them, Then it fails to find any and says nothing matches', () => {
    expect(matchEntries(paletteEntries(), 'zzzz')).toEqual([])
    expect(read('components/common/CommandPalette.tsx')).toContain('Nothing matches')
  })
})
