import fs from 'fs'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'
import { opensShortcuts, pressesKey, SHORTCUTS, typingInto } from '../../src/shared/keyboard'
import { pressable } from '../../src/renderer/components/ui/pressable'
import { blend, contrastFailures } from '../../src/shared/appearance'
import { BADGE_WASH, CONTRAST_PAIRS, PALETTES, SELECTED_WASH } from '../../src/shared/themes'
import { jsxElements, type JsxElementInfo } from '../helpers/jsx-elements'

const ROOT = path.join(__dirname, '../..')
const RENDERER = path.join(ROOT, 'src/renderer')
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const ELEMENTS = jsxElements(RENDERER)
const at = (e: JsxElementInfo): string => `${e.file}:${e.line} <${e.tag}>`

/** Elements a keyboard reaches and works by themselves. */
const INTERACTIVE = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary', 'Link', 'NavLink', 'Button', 'LinkButton', 'Input', 'Select', 'Textarea', 'Checkbox'])

/** Clicks kept for the mouse alone, each with the key that does the same. */
const MOUSE_ONLY: Record<string, string> = {
  'components/gallery/PictureViewer.tsx': 'a click beside the picture closes it; Escape does the same'
}

const press = (key: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...extra })

describe('Keyboard and accessibility (specs/046-everyday-ux, U4)', () => {
  it('[EUX-010] Given every element of the renderer that acts on a click, When it is not a control already, Then it takes focus and answers Enter and Space', () => {
    const silent = ELEMENTS.filter(e => {
      if (INTERACTIVE.has(e.tag) || /^[A-Z]/.test(e.tag) || !e.attrs.has('onClick')) return false
      if (/^\{\s*\(?e\)?\s*=>\s*e\.stopPropagation\(\)\s*\}$/.test(e.attrs.get('onClick') ?? '')) return false
      if (MOUSE_ONLY[e.file]) return false
      if (e.spreads.some(s => s.includes('pressable('))) return false
      // A palette option is worked from its combobox's arrow keys and Enter.
      if (e.attrs.get('role') === '"option"') return false
      return !(e.attrs.has('tabIndex') && e.attrs.has('onKeyDown'))
    })
    expect(silent.map(at)).toEqual([])
  })

  it('[EUX-010] Given a pressable row or card, When Enter or Space is pressed on it, Then it does what a click does, and not when the key was meant for a control inside it', () => {
    const onPress = vi.fn()
    const card = pressable(onPress, { pressed: true, label: 'March 2026' })
    expect(card).toMatchObject({ tabIndex: 0, role: 'button', 'aria-pressed': true, 'aria-label': 'March 2026' })
    expect(pressable(onPress, { row: true, expanded: false })).not.toHaveProperty('role')
    const self = {}
    const keyOn = (target: object, key: string) => ({ ...press(key), target, currentTarget: self, preventDefault: vi.fn() })
    card.onKeyDown?.(keyOn(self, 'Enter') as never)
    card.onKeyDown?.(keyOn(self, ' ') as never)
    card.onKeyDown?.(keyOn({}, 'Enter') as never)
    card.onKeyDown?.(keyOn(self, 'a') as never)
    expect(onPress).toHaveBeenCalledTimes(2)
    expect(pressesKey(press('Enter', { ctrlKey: true }))).toBe(false)
  })

  it('[EUX-010] Given a button or link, When it is rendered, Then no other control is inside it, since a control inside a control cannot be reached', () => {
    const nested = ELEMENTS.filter(e => ['button', 'a', 'Link', 'Button', 'LinkButton'].includes(e.tag) && e.descendants.some(d => INTERACTIVE.has(d)))
    expect(nested.map(at)).toEqual([])
  })

  it('[EUX-011] Given the app, When ? is pressed outside a text field, Then the shortcuts sheet opens; a ? typed in a field is not a shortcut', () => {
    expect(opensShortcuts(press('?'), { tagName: 'BODY' })).toBe(true)
    expect(opensShortcuts(press('?'), { tagName: 'BUTTON' })).toBe(true)
    expect(opensShortcuts(press('?'), { tagName: 'INPUT', type: 'checkbox' })).toBe(true)
    expect(opensShortcuts(press('?'), { tagName: 'INPUT', type: 'text' })).toBe(false)
    expect(opensShortcuts(press('?'), { tagName: 'INPUT' })).toBe(false)
    expect(opensShortcuts(press('?'), { tagName: 'TEXTAREA' })).toBe(false)
    expect(opensShortcuts(press('?'), { tagName: 'DIV', isContentEditable: true })).toBe(false)
    expect(opensShortcuts(press('?', { ctrlKey: true }), { tagName: 'BODY' })).toBe(false)
    expect(typingInto(null)).toBe(false)
    const layout = read('src/renderer/components/common/Layout.tsx')
    expect(layout).toContain('opensShortcuts(e')
    expect(layout).toContain('<ShortcutsSheet')
    expect(read('src/renderer/components/common/Sidebar.tsx')).toContain('aria-keyshortcuts="?"')
  })

  it('[EUX-011] Given the shortcuts sheet, When it lists the keys, Then it names the palette, itself and every key the app answers, and Escape closes it', () => {
    const keys = SHORTCUTS.map(s => s.keys.join('+'))
    for (const k of ['Ctrl+K', '?', 'Tab', 'Enter', 'Space', 'Esc']) expect(keys).toContain(k)
    expect(new Set(keys).size).toBe(keys.length)
    for (const s of SHORTCUTS) expect(s.does.length).toBeGreaterThan(5)
    const sheet = read('src/renderer/components/common/ShortcutsSheet.tsx')
    expect(sheet).toContain("e.key === 'Escape'")
    expect(sheet).toContain('aria-modal="true"')
    expect(sheet).toContain('opener.focus()')
  })

  it('[EUX-012] Given every theme, When text sits on a selected row or a badge sits on a card, Then it still reaches 4.5:1', () => {
    expect(blend('#ffffff', '#000000', 0.5)).toBe('#808080')
    const washed = CONTRAST_PAIRS.filter(p => p.wash)
    expect(washed.some(p => p.wash?.alpha === SELECTED_WASH && p.fg === 'muted')).toBe(true)
    expect(washed.some(p => p.wash?.alpha === BADGE_WASH && p.fg === 'success')).toBe(true)
    for (const theme of ['dark', 'light', 'night'] as const) expect(contrastFailures(PALETTES[theme], washed), theme).toEqual([])
  })

  it('[EUX-012] Given the renderer, When text is drawn in the text or muted colour, Then it is never dimmed with an opacity, which would fall below 4.5:1', () => {
    const dimmed = /(?<![:\w-])text-astro-(?:text|muted)\/\d+/
    const found = ELEMENTS.filter(e => dimmed.test(e.attrs.get('className') ?? ''))
    expect(found.map(at)).toEqual([])
    expect(read('src/renderer/components/messier/MosaicTile.tsx')).not.toMatch(dimmed)
  })

  it('[EUX-012] Given a sentence with a link in it, When it is drawn, Then the link is underlined, not told apart by colour alone', () => {
    expect(read('src/renderer/styles/global.css')).toMatch(/main p a \{\s*text-decoration-line: underline;/)
  })

  it('[EUX-013] Given every list box of the renderer, When a screen reader reaches it, Then it has a name: its own label, or the label it sits in', () => {
    const unnamed = ELEMENTS.filter(e =>
      e.tag === 'select' &&
      !['aria-label', 'aria-labelledby', 'id'].some(a => e.attrs.has(a)) &&
      !e.ancestors.includes('label') &&
      // The shared Select passes on the name its caller gives it.
      e.file !== 'components/ui/Field.tsx'
    )
    expect(unnamed.map(at)).toEqual([])
  })

  it('[EUX-013] Given the smoke run, When its accessibility baselines are read, Then none is left, so any serious finding fails it', () => {
    expect(JSON.parse(read('scripts/smoke/axe-baseline.json'))).toEqual({})
    expect(JSON.parse(read('scripts/smoke/axe-baseline.demo.json'))).toEqual({})
  })
})
