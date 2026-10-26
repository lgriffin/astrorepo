import React from 'react'
import { atlasMark, type AtlasSymbolKind } from '@shared/atlas'
import { tokenColor } from '../../theme'

/** Each symbol drawn in a 16-unit box, stroked in the kind's atlas colour (LF-009). */
const SHAPES: Record<AtlasSymbolKind, React.ReactNode> = {
  galaxy: <ellipse cx="8" cy="8" rx="6.5" ry="3" transform="rotate(-30 8 8)" />,
  'open-cluster': <circle cx="8" cy="8" r="6" strokeDasharray="1.2 1.8" />,
  'globular-cluster': (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2v12" />
    </>
  ),
  'planetary-nebula': (
    <>
      <circle cx="8" cy="8" r="3.5" />
      <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" />
    </>
  ),
  'bright-nebula': <rect x="2.5" y="2.5" width="11" height="11" />,
  'dark-nebula': <rect x="2.5" y="2.5" width="11" height="11" strokeDasharray="2 1.5" />,
  remnant: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" />
      <circle cx="8" cy="8" r="3" />
    </>
  ),
  'galaxy-cluster': (
    <>
      <ellipse cx="5" cy="5.5" rx="3" ry="1.5" transform="rotate(-30 5 5.5)" />
      <ellipse cx="11" cy="7" rx="3" ry="1.5" transform="rotate(20 11 7)" />
      <ellipse cx="6.5" cy="11.5" rx="3" ry="1.5" transform="rotate(-10 6.5 11.5)" />
    </>
  ),
  star: <circle cx="8" cy="8" r="3" fill="currentColor" />,
  'solar-system': (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
    </>
  ),
  field: <circle cx="8" cy="8" r="6" strokeDasharray="3 2" />
}

interface AtlasSymbolProps {
  objectType: string
  /** Side in pixels. */
  size?: number
  /** Names the kind for screen readers; leave false when its name is written beside it. */
  labelled?: boolean
  className?: string
}

/** The atlas symbol for a kind of object, in its atlas colour (LF-009). */
export function AtlasSymbol({ objectType, size = 16, labelled = false, className = '' }: AtlasSymbolProps): React.ReactElement {
  const mark = atlasMark(objectType)
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      className={`shrink-0 ${className}`}
      style={{ color: tokenColor(mark.tone) }}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? mark.label : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {SHAPES[mark.symbol]}
    </svg>
  )
}

/** The symbol with the kind's name, as a target's type is shown in lists. */
export function AtlasKind({ objectType, className = '' }: { objectType: string; className?: string }): React.ReactElement {
  const mark = atlasMark(objectType)
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-condensed whitespace-nowrap ${className}`} style={{ color: tokenColor(mark.tone) }}>
      <AtlasSymbol objectType={objectType} size={14} />
      {mark.label}
    </span>
  )
}
