import React from 'react'
import { statTone } from '@shared/stat'

interface StatCardProps {
  label: string
  value: string | number
  accent?: boolean
  compact?: boolean
}

/** A zero reads as quiet, not as an alert (EUX-009); only a real value takes the accent. */
const TONE = {
  muted: 'font-normal text-astro-muted',
  accent: 'font-bold text-astro-accent',
  plain: 'font-bold text-astro-text'
} as const

export function StatCard({ label, value, accent, compact }: StatCardProps): React.ReactElement {
  const bg = compact ? 'bg-astro-bg' : 'bg-astro-surface'
  const padding = compact ? 'p-3' : 'p-4'
  const border = compact ? 'border-astro-border/50' : 'border-astro-border'
  const textSize = compact ? 'text-lg' : 'text-2xl'

  return (
    <div className={`${bg} border ${border} rounded-lg ${padding}`}>
      <p className="text-xs text-astro-muted font-condensed">{label}</p>
      <p className={`${textSize} mt-1 ${TONE[statTone(value, accent)]}`}>{value}</p>
    </div>
  )
}
