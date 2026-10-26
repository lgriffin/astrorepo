import fs from 'fs'
import { appIconDataUrl } from '../../src/shared/logo'
import path from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { contrastFailures, hexChannels, type ThemeName } from '../../src/shared/appearance'
import { CONTRAST_PAIRS, PALETTES, TOKENS } from '../../src/shared/themes'
import { NAV_ITEMS } from '../../src/shared/navigation'
import { applyTheme, cachedChoice, cacheChoice, makeThemeKeeper, tokenColor } from '../../src/renderer/theme'
import { titleCaseWords, uiTextsOf } from '../helpers/ui-text'
import { NAV_ICONS } from '../../src/renderer/components/common/nav-icons'
import { ATLAS_MARKS, atlasMark } from '../../src/shared/atlas'
import type { ObjectType } from '../../src/shared/types'
import { AtlasKind, AtlasSymbol } from '../../src/renderer/components/atlas/AtlasSymbol'
import { Badge, Button, Field, Input, Skeleton, Stat, Table, Tabs, Td, Th, radioKeyTarget, tabKeyTarget } from '../../src/renderer/components/ui'

const root = path.resolve(__dirname, '../..')
const renderer = path.join(root, 'src/renderer')
const THEMES = Object.keys(PALETTES) as ThemeName[]

function files(dir: string, ext: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    return e.isDirectory() ? files(full, ext) : ext.test(e.name) ? [full] : []
  })
}

/** A document just big enough for applyTheme. */
function fakeDocument() {
  const vars = new Map<string, string>()
  const root = { style: { setProperty: (k: string, v: string) => vars.set(k, v), colorScheme: '' }, dataset: {} as Record<string, string> }
  const links: Array<Record<string, string>> = []
  const head = {
    querySelector: () => links[0] ?? null,
    appendChild: (link: Record<string, string>) => void links.push(link)
  }
  const doc = { documentElement: root, head, createElement: () => ({}) }
  return { doc: doc as unknown as Document, vars, root, links }
}

function fakeWindow(storage: Partial<Storage> | 'blocked') {
  return {
    get localStorage(): Storage {
      if (storage === 'blocked') throw new Error('SecurityError')
      return storage as Storage
    }
  } as unknown as Window
}

const h = React.createElement
const html = (el: React.ReactElement) => renderToStaticMarkup(el)
const control = (c: { id: string; describedBy: string | undefined; invalid: boolean }) =>
  h(Input, { id: c.id, 'aria-describedby': c.describedBy, 'aria-invalid': c.invalid })

describe('Themes on screen (specs/041-look-and-feel)', () => {
  it('[LF-001] Given each theme, When it is applied, Then every token becomes a CSS variable and the browser controls match', () => {
    for (const theme of THEMES) {
      const { doc, vars, root, links } = fakeDocument()
      applyTheme(doc, theme)
      applyTheme(doc, theme)
      // One favicon link, reused when the theme changes (LF-031).
      expect(links).toHaveLength(1)
      expect(links[0]).toMatchObject({ rel: 'icon', href: appIconDataUrl(PALETTES[theme]) })
      expect([...vars.keys()]).toEqual(TOKENS.map(t => `--astro-${t}`))
      expect(vars.get('--astro-bg')).toBe(hexChannels(PALETTES[theme].bg).join(' '))
      expect(root.dataset.theme).toBe(theme)
      expect(root.style.colorScheme).toBe(theme === 'light' ? 'light' : 'dark')
    }
    expect(tokenColor('accent')).toBe('rgb(var(--astro-accent))')
    expect(tokenColor('danger', 0.25)).toBe('rgb(var(--astro-danger) / 0.25)')
  })

  it('[LF-002] Given a choice made on this screen, When the app starts again, Then the cached choice is drawn before the saved one arrives', () => {
    const store = new Map<string, string>()
    const win = fakeWindow({ getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) })
    expect(cachedChoice(win)).toBe('system')
    cacheChoice(win, 'night')
    expect(cachedChoice(win)).toBe('night')
    // The provider saves through settings:set and reads back ui_theme on start, except on a companion screen.
    const provider = fs.readFileSync(path.join(renderer, 'contexts/ThemeContext.tsx'), 'utf8')
    expect(provider).toContain("invoke('settings:set', { key: THEME_SETTING_KEY, value: next })")
    expect(provider).toContain("invoke<{ value: string | null }>('settings:get', { key: THEME_SETTING_KEY })")
    expect(provider).toMatch(/astrorepoMode === 'companion'\) return \{ read: async \(\) => null/)
    // Both the app and the pairing screen are drawn inside the provider.
    expect(fs.readFileSync(path.join(renderer, 'main.tsx'), 'utf8')).toMatch(/<ThemeProvider>\s*\{window\.astrorepoMode === 'companion'[^}]*<PairScreen \/> : <App \/>\}\s*<\/ThemeProvider>/)
  })

  it('[LF-002] Given a pick made before the saved choice arrives, When the saved one is read, Then the pick is kept', async () => {
    const store = new Map<string, string>()
    const win = fakeWindow({ getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) })
    let answer: (v: 'dark') => void = () => undefined
    const keeper = makeThemeKeeper(win, { read: () => new Promise(r => (answer = r)), save: async () => undefined })
    const started = keeper.start()
    expect(await keeper.choose('light')).toBe(true)
    answer('dark')
    expect(await started).toBeNull()
    expect(cachedChoice(win)).toBe('light')
  })

  it('[LF-002] Given quick picks one after another, When they are saved, Then they are written in order and the last one is stored', async () => {
    const written: string[] = []
    const releases: (() => void)[] = []
    const win = fakeWindow({ getItem: () => null, setItem: () => undefined })
    const keeper = makeThemeKeeper(win, {
      read: async () => null,
      save: next => new Promise<void>(r => releases.push(() => (written.push(next), r())))
    })
    const first = keeper.choose('dark')
    const second = keeper.choose('night')
    await Promise.resolve()
    expect(releases).toHaveLength(1)
    releases[0]()
    await first
    await Promise.resolve()
    releases[1]()
    await second
    expect(written).toEqual(['dark', 'night'])
  })

  it('[LF-003] Given storage that is blocked or holds nonsense, When the cached choice is read or written, Then it matches the computer and does not fail', () => {
    const blocked = fakeWindow('blocked')
    expect(cachedChoice(blocked)).toBe('system')
    expect(() => cacheChoice(blocked, 'dark')).not.toThrow()
    expect(cachedChoice(fakeWindow({ getItem: () => 'sepia' }))).toBe('system')
    // A failed save is said on Settings → Appearance.
    expect(fs.readFileSync(path.join(renderer, 'components/settings/AppearanceSettings.tsx'), 'utf8')).toContain('could not be saved')
  })

  it('[LF-003] Given a save that fails, When the next start reads the cache, Then the last saved choice is drawn, not the unsaved one', async () => {
    const store = new Map<string, string>([['astrorepo.theme', 'dark']])
    const win = fakeWindow({ getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) })
    const keeper = makeThemeKeeper(win, { read: async () => null, save: async () => Promise.reject(new Error('offline')) })
    expect(await keeper.choose('light')).toBe(false)
    expect(cachedChoice(win)).toBe('dark')
  })

  it('[LF-004] Given the night theme, When its colours are read, Then each is red or black and pictures are tinted red', () => {
    for (const token of TOKENS) {
      const [r, g, b] = hexChannels(PALETTES.night[token])
      expect(r >= g && r >= b, `${token} ${PALETTES.night[token]}`).toBe(true)
      if (r > 0) expect(Math.max(g, b) / r, `${token} ${PALETTES.night[token]}`).toBeLessThanOrEqual(0.7)
    }
    const css = fs.readFileSync(path.join(renderer, 'styles/global.css'), 'utf8')
    expect(css).toMatch(/\[data-theme='night'\] img,\s*\[data-theme='night'\] canvas,\s*\[data-theme='night'\] video \{\s*filter: grayscale\(1\) sepia\(1\)/)
  })

  it('[LF-005] Given every theme, When each text token is set on what it sits on, Then all reach 4.5:1', () => {
    expect(CONTRAST_PAIRS.length).toBeGreaterThan(20)
    for (const theme of THEMES) {
      expect(Object.keys(PALETTES[theme]).sort()).toEqual([...TOKENS].sort())
      expect(contrastFailures(PALETTES[theme], CONTRAST_PAIRS), theme).toEqual([])
    }
  })

  it('[LF-005] Given the renderer source, When it is searched for colours, Then none is fixed: no hex, no rgb() of its own and no Tailwind palette class', () => {
    const palette = /(?<![\w-])(?:bg|text|border(?:-[trblxyse])?|from|to|via|ring|fill|stroke|divide|placeholder|outline|accent|shadow|decoration)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})(?![\w-])/
    const hex = /['"`\s:(]#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?(?![\w-])/
    const ownRgb = /\b(?:rgba?|hsla?)\((?!var\(--astro-)/
    // One side's border counts too: the old toasts slipped through as border-l-green-500.
    for (const cls of ['bg-red-500', 'border-l-green-500', 'border-t-slate-200', 'text-white']) expect(palette.test(` ${cls}`), cls).toBe(true)
    expect(palette.test(' border-l-astro-accent')).toBe(false)
    const offenders: string[] = []
    for (const file of files(renderer, /\.(tsx?|css|html)$/)) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (palette.test(line) || hex.test(line) || ownRgb.test(line)) offenders.push(`${path.relative(root, file)}:${i + 1} ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })
})

describe('Shared controls (specs/041-look-and-feel)', () => {
  it('[LF-006] Given a button that is busy, When it is drawn, Then it cannot be pressed again and says so; each variant has its own look', () => {
    const busy = html(h(Button, { busy: true, variant: 'primary' }, 'Queue'))
    expect(busy).toContain('disabled=""')
    expect(busy).toContain('aria-busy="true"')
    expect(busy).toContain('type="button"')
    const looks = (['primary', 'secondary', 'ghost', 'danger'] as const).map(v => html(h(Button, { variant: v }, 'Go')))
    expect(new Set(looks).size).toBe(4)
    expect(looks[0]).not.toContain('aria-busy')
    expect(html(h(Button, { size: 'sm', icon: h('svg') }, 'Go'))).toContain('aria-hidden="true"')
  })

  it('[LF-006] Given a field with a hint and an error, When it is drawn, Then the label names the control and both lines describe it', () => {
    const out = html(h(Field, { label: 'Latitude', hint: 'Degrees north', error: 'Not a number', children: control }))
    const id = /<label for="([^"]+)"/.exec(out)?.[1]
    expect(id).toBeTruthy()
    expect(out).toContain(`id="${id}" aria-describedby="${id}-hint ${id}-error" aria-invalid="true"/>`)
    expect(out).toContain(`<p id="${id}-hint"`)
    expect(out).toContain(`<p id="${id}-error" class="text-xs text-astro-danger">Not a number</p>`)
    const plain = html(h(Field, { label: 'Name', children: control }))
    expect(plain).not.toContain('aria-describedby')
    expect(plain).toContain('aria-invalid="false"')
  })

  it('[LF-006] Given a table, a badge, a figure and a placeholder, When they are drawn, Then they use tabular figures, a tone and a status role', () => {
    expect(html(h(Table, null, h('tbody', null, h('tr', null, h(Th, { align: 'right' }, 'Hours'), h(Td, { align: 'right' }, '4.5')))))).toMatch(/tabular-nums.*scope="col".*text-right.*text-right/)
    expect(html(h(Badge, { tone: 'warning', children: 'Short' }))).toContain('text-astro-warning')
    expect(html(h(Badge, { children: 'Planned' }))).toContain('text-astro-muted')
    expect(html(h(Stat, { label: 'Hours', value: '12.5', detail: 'this month' }))).toContain('tabular-nums')
    expect(html(h(Skeleton))).toContain('role="status"')
  })

  it('[LF-007] Given a row of tabs, When the arrow keys, Home and End are pressed, Then the selection moves and wraps, and only the selected tab is in the tab order', () => {
    expect(tabKeyTarget('ArrowRight', 0, 3)).toBe(1)
    expect(tabKeyTarget('ArrowRight', 2, 3)).toBe(0)
    expect(tabKeyTarget('ArrowLeft', 0, 3)).toBe(2)
    expect(tabKeyTarget('ArrowLeft', 2, 3)).toBe(1)
    expect(tabKeyTarget('Home', 2, 3)).toBe(0)
    expect(tabKeyTarget('End', 0, 3)).toBe(2)
    expect(tabKeyTarget('Enter', 1, 3)).toBeNull()
    // A radio group, such as Settings → Appearance, moves on the up and down arrows too.
    expect(radioKeyTarget('ArrowDown', 3, 4)).toBe(0)
    expect(radioKeyTarget('ArrowUp', 0, 4)).toBe(3)
    expect(radioKeyTarget('ArrowRight', 1, 4)).toBe(2)
    expect(radioKeyTarget(' ', 1, 4)).toBeNull()
    expect(fs.readFileSync(path.join(renderer, 'components/settings/AppearanceSettings.tsx'), 'utf8')).toContain('tabIndex={selected ? 0 : -1}')
    const out = html(h(Tabs<'overview' | 'files'>, { label: 'Target', active: 'files', onChange: () => undefined, tabs: [{ id: 'overview', label: 'Overview' }, { id: 'files', label: 'Files', badge: 3 }] }))
    expect(out).toContain('role="tablist" aria-label="Target"')
    expect(out).toMatch(/aria-selected="false" tabindex="-1"[^>]*>Overview/)
    expect(out).toMatch(/aria-selected="true" tabindex="0"[^>]*>Files<span[^>]*>3<\/span>/)
  })

  it('[LF-008] Given every place in the navigation, When the sidebar draws it, Then it has a drawn icon', () => {
    expect(NAV_ITEMS.filter(i => !NAV_ICONS[i.id]).map(i => i.id)).toEqual([])
    expect(fs.readFileSync(path.join(renderer, 'components/common/Sidebar.tsx'), 'utf8')).toContain('strokeWidth={1.75}')
  })
})

describe('The Star atlas world (specs/041-look-and-feel)', () => {
  it('[LF-009] Given every kind of object, When its atlas mark is read, Then it has a symbol, an atlas colour and a sentence-case name', () => {
    const kinds: ObjectType[] = [
      'galaxy', 'emission_nebula', 'reflection_nebula', 'planetary_nebula', 'dark_nebula', 'open_cluster', 'globular_cluster', 'star_cluster',
      'supernova_remnant', 'molecular_cloud', 'galaxy_cluster', 'star', 'comet', 'asteroid', 'planet', 'moon', 'solar_object', 'variable_star',
      'widefield_region', 'constellation', 'custom', 'unknown'
    ]
    expect(Object.keys(ATLAS_MARKS).sort()).toEqual([...kinds].sort())
    for (const k of kinds) {
      const mark = ATLAS_MARKS[k]
      expect(TOKENS).toContain(mark.tone)
      expect(mark.label.slice(1), k).toBe(mark.label.slice(1).toLowerCase())
    }
    expect(ATLAS_MARKS.galaxy.symbol).toBe('galaxy')
    expect(ATLAS_MARKS.open_cluster.symbol).toBe('open-cluster')
    expect(ATLAS_MARKS.globular_cluster.symbol).toBe('globular-cluster')
    expect(ATLAS_MARKS.planetary_nebula.symbol).toBe('planetary-nebula')
    expect(ATLAS_MARKS.emission_nebula.symbol).toBe('bright-nebula')
    expect(ATLAS_MARKS.dark_nebula.symbol).toBe('dark-nebula')
    expect(atlasMark('quasar')).toBe(ATLAS_MARKS.unknown)
  })

  it('[LF-009] Given a galaxy and an open cluster, When their symbols are drawn, Then the galaxy is an ellipse, the cluster a dotted circle, each in its own colour', () => {
    const galaxy = html(h(AtlasSymbol, { objectType: 'galaxy', labelled: true }))
    expect(galaxy).toContain('<ellipse')
    expect(galaxy).toContain('aria-label="Galaxy"')
    expect(galaxy).toContain('color:rgb(var(--astro-cat-1))')
    const cluster = html(h(AtlasSymbol, { objectType: 'open_cluster' }))
    expect(cluster).toMatch(/<circle[^>]*stroke-dasharray/)
    expect(cluster).toContain('aria-hidden="true"')
    expect(html(h(AtlasKind, { objectType: 'emission_nebula' }))).toContain('Emission nebula')
  })

  it('[LF-010] Given the renderer source, When its class names are read, Then no heading or label is set in small uppercase', () => {
    const offenders: string[] = []
    for (const file of files(renderer, /\.tsx$/)) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/(?<![\w-])uppercase(?![\w-])/.test(line)) offenders.push(`${path.relative(root, file)}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
    expect(fs.readFileSync(path.join(renderer, 'components/common/Card.tsx'), 'utf8')).toContain("className={`text-base font-semibold ${heading}`}")
  })

  it('[LF-010] Given a section heading in title case, When the wording check reads it, Then it is caught, and every heading in the renderer is sentence case', () => {
    const caught = uiTextsOf('x.tsx', '<h2 className="text-base">Best Targets Tonight</h2>').filter(t => titleCaseWords(t.text).length > 0)
    expect(caught.map(t => t.text)).toEqual(['Best Targets Tonight'])
    const headings = files(renderer, /\.tsx$/).flatMap(f => uiTextsOf(path.relative(renderer, f), fs.readFileSync(f, 'utf8')))
    expect(headings.filter(t => titleCaseWords(t.text).length > 0).map(t => `${t.file}:${t.line} ${t.text}`)).toEqual([])
  })
})
