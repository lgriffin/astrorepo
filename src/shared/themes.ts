import type { ContrastPair, ThemeName } from './appearance'

/**
 * The colour tokens every screen is drawn with (specs/041-look-and-feel). Pages name a token
 * (`text-astro-muted`, `bg-astro-surface`), never a colour, so a theme is one palette here.
 */
export const TOKENS = [
  'bg', 'surface', 'raised', 'border', 'text', 'muted', 'accent', 'on-accent',
  'success', 'warning', 'danger', 'info', 'scrim', 'on-scrim',
  'cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8'
] as const

export type Token = (typeof TOKENS)[number]

/** Eight categorical colours, for object types, frame kinds and chart series, in this order. */
export const CATEGORY_TOKENS = ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8'] as const satisfies readonly Token[]

export type Palette = Record<Token, string>

export const PALETTES: Record<ThemeName, Palette> = {
  // Star atlas by night: Prussian-ink grounds, hairline rules, atlas deep-sky red as the accent.
  dark: {
    bg: '#0b1822',
    surface: '#0f2130',
    raised: '#15293a',
    border: '#22384a',
    text: '#e8eef2',
    muted: '#93a7b4',
    accent: '#ff6a55',
    'on-accent': '#1a0805',
    success: '#5fd18a',
    warning: '#f2b84b',
    danger: '#ff5c8a',
    info: '#6cc3e8',
    scrim: '#000000',
    'on-scrim': '#ffffff',
    // Atlas convention first: galaxies red, reflection blue, planetaries teal, clusters amber, nebulae green.
    'cat-1': '#ff7b6b',
    'cat-2': '#7fb4ff',
    'cat-3': '#4fd1c5',
    'cat-4': '#f2b84b',
    'cat-5': '#6fd38f',
    'cat-6': '#b69cff',
    'cat-7': '#f5dd6b',
    'cat-8': '#a9b8c3'
  },
  // Star atlas by day: cool chart-white, ink text, the same red printed darker.
  light: {
    bg: '#eef2f5',
    surface: '#ffffff',
    raised: '#e3e9ee',
    border: '#c9d3db',
    text: '#0b2233',
    muted: '#48606f',
    accent: '#b8281c',
    'on-accent': '#ffffff',
    success: '#17713f',
    warning: '#8a5a00',
    danger: '#b0124f',
    info: '#0b6390',
    scrim: '#000000',
    'on-scrim': '#ffffff',
    'cat-1': '#b8281c',
    'cat-2': '#1f5fbf',
    'cat-3': '#0c7a72',
    'cat-4': '#8a5a00',
    'cat-5': '#1d7a43',
    'cat-6': '#6d3fc4',
    'cat-7': '#7a6400',
    'cat-8': '#4a5c69'
  },
  // Beside the scope: only red light, so eyes stay dark-adapted. Status is told by words, not hue.
  night: {
    bg: '#0a0000',
    surface: '#140202',
    raised: '#1e0404',
    border: '#3a0a0a',
    text: '#ff7a6b',
    muted: '#d9473a',
    accent: '#ff9a8a',
    'on-accent': '#1a0000',
    success: '#e8705f',
    warning: '#ff8f5e',
    danger: '#ff5a4a',
    info: '#ff8270',
    scrim: '#000000',
    'on-scrim': '#ff7a6b',
    'cat-1': '#ff8a7a',
    'cat-2': '#e8705f',
    'cat-3': '#ff9f8c',
    'cat-4': '#ff8f5e',
    'cat-5': '#f0675a',
    'cat-6': '#ffad9c',
    'cat-7': '#ff9470',
    'cat-8': '#e0574a'
  }
}

const TEXT = 4.5

/** Every pairing the pages draw, and the contrast WCAG AA asks of it. */
export const CONTRAST_PAIRS: ContrastPair[] = [
  ...(['bg', 'surface', 'raised'] as const).flatMap(bg => [
    { fg: 'text', bg, min: TEXT },
    { fg: 'muted', bg, min: TEXT },
    { fg: 'accent', bg, min: TEXT }
  ]),
  ...(['success', 'warning', 'danger', 'info', ...CATEGORY_TOKENS] as const).map(fg => ({ fg, bg: 'surface', min: TEXT })),
  ...(['accent', 'danger', 'success'] as const).map(bg => ({ fg: 'on-accent', bg, min: TEXT })),
  { fg: 'on-scrim', bg: 'scrim', min: TEXT }
]
