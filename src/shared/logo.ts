import type { Palette } from './themes'

/**
 * The app's mark (LF-010) as geometry on a 32-unit square: an atlas galaxy symbol inside a ring of
 * right-ascension hour ticks with the celestial equator across it. The sidebar draws it in theme
 * tokens; the app icon and favicon draw it from a palette (LF-031).
 */
export const MARK_TICKS: ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number }> = Array.from({ length: 24 }, (_, h) => {
  const a = (h / 24) * 2 * Math.PI
  const inner = h % 6 === 0 ? 11.2 : 12.4
  const r = (n: number): number => Math.round(n * 1000) / 1000
  return { x1: r(16 + inner * Math.cos(a)), y1: r(16 + inner * Math.sin(a)), x2: r(16 + 14 * Math.cos(a)), y2: r(16 + 14 * Math.sin(a)) }
})

export const MARK_EQUATOR = 'M3 16 Q16 20 29 16'

/** The mark on a rounded tile of the palette's surface, as a standalone SVG document. */
export function appIconSvg(palette: Palette): string {
  const ticks = MARK_TICKS.map(t => `<line x1="${t.x1}" y1="${t.y1}" x2="${t.x2}" y2="${t.y2}"/>`).join('')
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">',
    `<rect width="32" height="32" rx="7" fill="${palette.surface}"/>`,
    `<g stroke="${palette.muted}" stroke-width="1">${ticks}</g>`,
    `<path d="${MARK_EQUATOR}" stroke="${palette.border}" stroke-width="1"/>`,
    `<ellipse cx="16" cy="16" rx="8.5" ry="3.6" transform="rotate(-28 16 16)" stroke="${palette.accent}" stroke-width="2"/>`,
    `<circle cx="16" cy="16" r="1.6" fill="${palette.accent}"/>`,
    '</svg>'
  ].join('')
}

/** The icon as a data address for a favicon link. */
export function appIconDataUrl(palette: Palette): string {
  return `data:image/svg+xml,${encodeURIComponent(appIconSvg(palette))}`
}
