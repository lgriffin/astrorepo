import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { THEME_SETTING_KEY, parseThemeChoice, resolveTheme, type ThemeChoice, type ThemeName } from '@shared/appearance'
import { invoke } from '../hooks/useIPC'
import { applyTheme, cachedChoice, makeThemeKeeper, systemPrefersDark, type ThemeStore } from '../theme'

interface ThemeContextValue {
  /** What the user picked, 'system' included. */
  choice: ThemeChoice
  /** What the screen is drawn in now. */
  theme: ThemeName
  /** Saves a new choice and redraws at once; resolves false when it could not be saved. */
  choose: (choice: ThemeChoice) => Promise<boolean>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/** The PC's settings; a companion screen keeps its own theme on the screen, apart from the PC's. */
function themeStore(): ThemeStore {
  if (window.astrorepoMode === 'companion') return { read: async () => null, save: async () => undefined }
  return {
    read: async () => {
      const r = await invoke<{ value: string | null }>('settings:get', { key: THEME_SETTING_KEY })
      return parseThemeChoice(r?.value)
    },
    save: async next => {
      await invoke('settings:set', { key: THEME_SETTING_KEY, value: next })
    }
  }
}

/**
 * Keeps the screen in the user's theme (LF-001 to LF-003): the saved choice, else the system's
 * light or dark, following the system while the choice is 'system'.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [choice, setChoice] = useState<ThemeChoice>(() => cachedChoice(window))
  const [prefersDark, setPrefersDark] = useState(() => systemPrefersDark(window))
  const keeper = useMemo(() => makeThemeKeeper(window, themeStore()), [])
  const theme = resolveTheme(choice, prefersDark)

  useEffect(() => {
    let current = true
    void keeper.start().then(saved => {
      if (current && saved) setChoice(saved)
    })
    return () => {
      current = false
    }
  }, [keeper])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const follow = (e: MediaQueryListEvent): void => setPrefersDark(e.matches)
    media.addEventListener('change', follow)
    return () => media.removeEventListener('change', follow)
  }, [])

  useEffect(() => applyTheme(document, theme), [theme])

  const choose = useCallback(
    (next: ThemeChoice) => {
      setChoice(next)
      return keeper.choose(next)
    },
    [keeper]
  )

  return <ThemeContext.Provider value={{ choice, theme, choose }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme needs a ThemeProvider')
  return value
}
