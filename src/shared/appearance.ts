/**
 * The app's look (specs/041-look-and-feel): which theme a choice resolves to, and whether a
 * theme's colours are legible. Shared with the renderer, which may not reach the core (HEX-002);
 * the palettes are in themes.ts.
 */

/** The themes a screen can be drawn in. Night is red on black, for use beside the scope. */
export type ThemeName = 'dark' | 'light' | 'night'

/** What the user picks in Settings → Appearance: a theme, or whatever the system is set to. */
export type ThemeChoice = ThemeName | 'system'

export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'dark', 'light', 'night']

/** The setting that holds the choice. */
export const THEME_SETTING_KEY = 'ui_theme'

/** A saved choice, or 'system' when nothing (or something unreadable) is saved. */
export function parseThemeChoice(raw: string | null | undefined): ThemeChoice {
  const wanted = (raw ?? '').trim().toLowerCase()
  return (THEME_CHOICES as readonly string[]).includes(wanted) ? (wanted as ThemeChoice) : 'system'
}

/** The theme to draw: the one picked, or the system's light or dark when the choice is 'system'. */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ThemeName {
  if (choice !== 'system') return choice
  return systemPrefersDark ? 'dark' : 'light'
}

/** A colour as #rrggbb, read into its three channels (0 to 255). */
export function hexChannels(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) throw new Error(`Not a #rrggbb colour: ${hex}`)
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

/** WCAG 2.x relative luminance of a #rrggbb colour, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexChannels(hex).map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio between two colours, 1 to 21, the same whichever comes first. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** A foreground drawn on a background, and the contrast it needs. */
export interface ContrastPair {
  fg: string
  bg: string
  /** 4.5 for text, 3 for large text and the edges of controls. */
  min: number
}

export interface ContrastFailure extends ContrastPair {
  ratio: number
}

/**
 * The pairs of a palette whose contrast falls short, each with its ratio rounded to two places.
 * A pair names tokens of the palette; a token the palette lacks is a failure with ratio 0.
 */
export function contrastFailures(palette: Readonly<Record<string, string>>, pairs: readonly ContrastPair[]): ContrastFailure[] {
  const out: ContrastFailure[] = []
  for (const pair of pairs) {
    const fg = palette[pair.fg]
    const bg = palette[pair.bg]
    const ratio = fg && bg ? Math.round(contrastRatio(fg, bg) * 100) / 100 : 0
    if (ratio < pair.min) out.push({ ...pair, ratio })
  }
  return out
}

/** A #rrggbb colour as the "r g b" triple a CSS variable holds, so Tailwind can add opacity to it. */
export function cssChannels(hex: string): string {
  return hexChannels(hex).join(' ')
}
