import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { THEME_SETTING_KEY, parseThemeChoice, resolveTheme, type ThemeChoice, type ThemeName } from '@shared/appearance'
import { invoke } from '../hooks/useIPC'
import { applyTheme, cacheChoice, cachedChoice, systemPrefersDark } from '../theme'

interface ThemeContextValue {
  /** What the user picked, 'system' included. */
  choice: ThemeChoice
  /** What the screen is drawn in now. */
  theme: ThemeName
  /** Saves a new choice and redraws at once; resolves false when it could not be saved. */
  choose: (choice: ThemeChoice) => Promise<boolean>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Keeps the screen in the user's theme (LF-001 to LF-003): the saved choice, else the system's
 * light or dark, following the system while the choice is 'system'.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [choice, setChoice] = useState<ThemeChoice>(() => cachedChoice(window))
  const [prefersDark, setPrefersDark] = useState(() => systemPrefersDark(window))
  const theme = resolveTheme(choice, prefersDark)

  useEffect(() => {
    let current = true
    invoke<{ value: string | null }>('settings:get', { key: THEME_SETTING_KEY })
      .then(r => {
        if (!current) return
        const saved = parseThemeChoice(r?.value)
        setChoice(saved)
        cacheChoice(window, saved)
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const follow = (e: MediaQueryListEvent): void => setPrefersDark(e.matches)
    media.addEventListener('change', follow)
    return () => media.removeEventListener('change', follow)
  }, [])

  useEffect(() => applyTheme(document, theme), [theme])

  const choose = useCallback(async (next: ThemeChoice) => {
    setChoice(next)
    cacheChoice(window, next)
    try {
      await invoke('settings:set', { key: THEME_SETTING_KEY, value: next })
      return true
    } catch {
      return false
    }
  }, [])

  return <ThemeContext.Provider value={{ choice, theme, choose }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme needs a ThemeProvider')
  return value
}
