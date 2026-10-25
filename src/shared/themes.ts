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
  // The incumbent look: deep navy ground, slate text, a sky-blue accent.
  dark: {
    bg: '#0f1729',
    surface: '#1a2332',
    raised: '#223044',
    border: '#2a3a4e',
    text: '#e2e8f0',
    muted: '#94a3b8',
    accent: '#4f9cf7',
    'on-accent': '#0b1220',
    success: '#4ade80',
    warning: '#facc15',
    danger: '#f87171',
    info: '#60a5fa',
    scrim: '#000000',
    'on-scrim': '#ffffff',
    'cat-1': '#c4b5fd',
    'cat-2': '#93c5fd',
    'cat-3': '#67e8f9',
    'cat-4': '#fdba74',
    'cat-5': '#f9a8d4',
    'cat-6': '#bef264',
    'cat-7': '#fde047',
    'cat-8': '#cbd5e1'
  },
  // Daylight at the PC: paper-white surfaces on a cool grey ground.
  light: {
    bg: '#f3f5f9',
    surface: '#ffffff',
    raised: '#e9edf3',
    border: '#d3d9e3',
    text: '#111827',
    muted: '#4b5563',
    accent: '#1d5fd1',
    'on-accent': '#ffffff',
    success: '#15803d',
    warning: '#a16207',
    danger: '#b91c1c',
    info: '#1d4ed8',
    scrim: '#000000',
    'on-scrim': '#ffffff',
    'cat-1': '#7e22ce',
    'cat-2': '#1d4ed8',
    'cat-3': '#0e7490',
    'cat-4': '#c2410c',
    'cat-5': '#be185d',
    'cat-6': '#4d7c0f',
    'cat-7': '#a16207',
    'cat-8': '#475569'
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
