import { cssChannels, parseThemeChoice, resolveTheme, type ThemeChoice, type ThemeName } from '@shared/appearance'
import { PALETTES, TOKENS, type Token } from '@shared/themes'

/** Where the last choice is kept on this screen, so the first paint is already in the right theme. */
const CACHE_KEY = 'astrorepo.theme'

/** A token as a colour for an SVG or inline style; follows the theme without a re-render. */
export function tokenColor(token: Token, alpha = 1): string {
  return alpha >= 1 ? `rgb(var(--astro-${token}))` : `rgb(var(--astro-${token}) / ${alpha})`
}

/** Draws the document in a theme: its tokens as CSS variables, and the browser's own controls to match. */
export function applyTheme(doc: Document, theme: ThemeName): void {
  const root = doc.documentElement
  const palette = PALETTES[theme]
  for (const token of TOKENS) root.style.setProperty(`--astro-${token}`, cssChannels(palette[token]))
  root.dataset.theme = theme
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark'
}

export function systemPrefersDark(win: Window): boolean {
  return win.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
}

/** The choice this screen last used; 'system' when none is cached or storage is unavailable. */
export function cachedChoice(win: Window): ThemeChoice {
  try {
    return parseThemeChoice(win.localStorage.getItem(CACHE_KEY))
  } catch {
    return 'system'
  }
}

export function cacheChoice(win: Window, choice: ThemeChoice): void {
  try {
    win.localStorage.setItem(CACHE_KEY, choice)
  } catch {
    // Private windows and blocked storage only lose the head start on the first paint.
  }
}

/** Applies the cached choice before React draws anything. */
export function applyCachedTheme(win: Window): void {
  applyTheme(win.document, resolveTheme(cachedChoice(win), systemPrefersDark(win)))
}
