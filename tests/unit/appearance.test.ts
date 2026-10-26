import { describe, expect, it } from 'vitest'
import {
  THEME_CHOICES,
  THEME_SETTING_KEY,
  contrastFailures,
  contrastRatio,
  cssChannels,
  hexChannels,
  parseThemeChoice,
  relativeLuminance,
  resolveTheme
} from '../../src/shared/appearance'

describe('Themes (specs/041-look-and-feel)', () => {
  it('[LF-001] Given the choice to match the computer, When the theme is worked out, Then it follows the system and a picked theme wins', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('night', false)).toBe('night')
    expect(THEME_CHOICES).toEqual(['system', 'dark', 'light', 'night'])
    expect(THEME_SETTING_KEY).toBe('ui_theme')
  })

  it('[LF-002] Given a saved choice, When it is read back, Then each theme is kept whatever its case or spaces', () => {
    for (const c of THEME_CHOICES) expect(parseThemeChoice(c)).toBe(c)
    expect(parseThemeChoice(' Night ')).toBe('night')
    expect(parseThemeChoice('DARK')).toBe('dark')
  })

  it('[LF-003] Given a missing or unknown saved choice, When it is read, Then it falls back to matching the computer rather than failing', () => {
    expect(parseThemeChoice(null)).toBe('system')
    expect(parseThemeChoice(undefined)).toBe('system')
    expect(parseThemeChoice('')).toBe('system')
    expect(parseThemeChoice('sepia')).toBe('system')
  })
})

describe('Contrast (specs/041-look-and-feel)', () => {
  it('[LF-005] Given black, white and greys, When luminance and contrast are measured, Then they match WCAG 2', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10)
    // Below the 0.03928 knee the channel is linear; above it, the power curve.
    expect(relativeLuminance('#0a0a0a')).toBeCloseTo(10 / 255 / 12.92, 10)
    expect(relativeLuminance('#808080')).toBeCloseTo(((128 / 255 + 0.055) / 1.055) ** 2.4, 10)
    expect(relativeLuminance('#ff0000')).toBeCloseTo(0.2126, 10)
    expect(relativeLuminance('#00ff00')).toBeCloseTo(0.7152, 10)
    expect(relativeLuminance('#0000ff')).toBeCloseTo(0.0722, 10)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 10)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })

  it('[LF-005] Given a palette and the pairs it must meet, When it is checked, Then only the pairs below their minimum are reported, a missing token among them', () => {
    const palette = { text: '#ffffff', bg: '#000000', muted: '#949494', faint: '#222222' }
    expect(contrastFailures(palette, [{ fg: 'text', bg: 'bg', min: 4.5 }])).toEqual([])
    expect(contrastFailures(palette, [{ fg: 'muted', bg: 'bg', min: 4.5 }])).toEqual([])
    expect(contrastFailures(palette, [{ fg: 'faint', bg: 'bg', min: 4.5 }])).toEqual([{ fg: 'faint', bg: 'bg', min: 4.5, ratio: 1.32 }])
    expect(contrastFailures(palette, [{ fg: 'missing', bg: 'bg', min: 1 }])).toEqual([{ fg: 'missing', bg: 'bg', min: 1, ratio: 0 }])
    expect(contrastFailures(palette, [{ fg: 'text', bg: 'missing', min: 1 }])).toEqual([{ fg: 'text', bg: 'missing', min: 1, ratio: 0 }])
    // Exactly at the minimum passes.
    expect(contrastFailures({ a: '#000000', b: '#ffffff' }, [{ fg: 'a', bg: 'b', min: 21 }])).toEqual([])
  })

  it('[LF-005] Given a colour, When it is read into channels, Then it gives the three numbers a CSS variable holds and an invalid colour is rejected', () => {
    expect(hexChannels('#0f1729')).toEqual([15, 23, 41])
    expect(hexChannels(' #FFFFFF ')).toEqual([255, 255, 255])
    expect(cssChannels('#4f9cf7')).toBe('79 156 247')
    for (const bad of ['0f1729', '#fff', '#12345g', '#1234567', 'red']) expect(() => hexChannels(bad)).toThrow(`Not a #rrggbb colour: ${bad}`)
  })
})
