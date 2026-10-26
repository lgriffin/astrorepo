import React from 'react'

/** Row widths, so a loading block reads as lines of content rather than a grey slab. */
const WIDTHS = ['w-3/4', 'w-full', 'w-2/3', 'w-5/6', 'w-1/2']

/**
 * What a part of a page shows while it loads (LF-028): placeholder lines shaped like text, named
 * for screen readers by what is being fetched, in place of a bare "Loading..." line.
 */
export function Loading({ label, rows = 3, className = '' }: { label: string; rows?: number; className?: string }): React.ReactElement {
  return (
    <div role="status" aria-label={label} className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className={`h-3 animate-pulse rounded bg-astro-raised ${WIDTHS[i % WIDTHS.length]}`} />
      ))}
    </div>
  )
}
