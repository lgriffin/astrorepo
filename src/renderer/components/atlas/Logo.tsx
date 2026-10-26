import React from 'react'
import { MARK_EQUATOR, MARK_TICKS } from '@shared/logo'
import { tokenColor } from '../../theme'

/** The app's mark (LF-010) in the theme's tokens; its geometry is shared with the app icon. */
export function LogoMark({ size = 28 }: { size?: number }): React.ReactElement {
  const ticks = MARK_TICKS.map((t, h) => <line key={h} {...t} />)
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden className="shrink-0">
      <g stroke={tokenColor('muted')} strokeWidth={1}>{ticks}</g>
      <path d={MARK_EQUATOR} stroke={tokenColor('border')} strokeWidth={1} />
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
