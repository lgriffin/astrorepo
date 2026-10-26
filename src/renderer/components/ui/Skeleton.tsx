import React from 'react'

/** A placeholder shaped like the content that is loading, instead of a blank area (LF-006). */
export function Skeleton({ className = 'h-4 w-full', label = 'Loading' }: { className?: string; label?: string }): React.ReactElement {
  return <div role="status" aria-label={label} className={`animate-pulse rounded bg-astro-raised ${className}`} />
}
