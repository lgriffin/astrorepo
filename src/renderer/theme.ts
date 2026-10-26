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

/** Where a choice is saved: the installation's settings, or nowhere when this screen keeps its own. */
export interface ThemeStore {
  read: () => Promise<ThemeChoice | null>
  save: (choice: ThemeChoice) => Promise<void>
}

/**
 * Keeps choices in order (LF-002, LF-003): saves go out one after another so the last pick is the
 * one stored, a choice made before the saved one arrives is not overwritten by it, and a choice that
 * could not be saved is not left in the cache for the next start.
 */
export function makeThemeKeeper(win: Window, store: ThemeStore) {
  let picked = false
  let latest = 0
  let saved: ThemeChoice = cachedChoice(win)
  let queue: Promise<unknown> = Promise.resolve()
  return {
    /** The saved choice, or null when there is none or the user has already picked on this screen. */
    async start(): Promise<ThemeChoice | null> {
      const read = await store.read().catch(() => null)
      if (read === null || picked) return null
      saved = read
      cacheChoice(win, read)
      return read
    },
    /** Saves a choice; resolves false when it could not be saved. */
    async choose(next: ThemeChoice): Promise<boolean> {
      picked = true
      const ticket = ++latest
      cacheChoice(win, next)
      const write = queue.then(() => store.save(next))
      queue = write.catch(() => undefined)
      try {
        await write
        saved = next
        return true
      } catch {
        if (ticket === latest) cacheChoice(win, saved)
        return false
      }
    }
  }
}
