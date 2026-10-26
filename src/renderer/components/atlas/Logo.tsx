import React from 'react'
import { tokenColor } from '../../theme'

/**
 * The app's mark (LF-010): an atlas galaxy symbol in the deep-sky red, inside a ring of
 * right-ascension hour ticks with the celestial equator across it.
 */
export function LogoMark({ size = 28 }: { size?: number }): React.ReactElement {
  const ticks = Array.from({ length: 24 }, (_, h) => {
    const a = (h / 24) * 2 * Math.PI
    const inner = h % 6 === 0 ? 11.2 : 12.4
    return <line key={h} x1={16 + inner * Math.cos(a)} y1={16 + inner * Math.sin(a)} x2={16 + 14 * Math.cos(a)} y2={16 + 14 * Math.sin(a)} />
  })
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden className="shrink-0">
      <g stroke={tokenColor('muted')} strokeWidth={1}>{ticks}</g>
      <path d="M3 16 Q16 20 29 16" stroke={tokenColor('border')} strokeWidth={1} />
      <ellipse cx="16" cy="16" rx="8.5" ry="3.6" transform="rotate(-28 16 16)" stroke={tokenColor('accent')} strokeWidth={2} />
      <circle cx="16" cy="16" r="1.6" fill={tokenColor('accent')} />
    </svg>
  )
}

/** The mark with the name, for the top of the sidebar. */
export function Logo(): React.ReactElement {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight text-astro-text" style={{ fontStretch: '88%' }}>AstroRepo</span>
    </span>
  )
}
