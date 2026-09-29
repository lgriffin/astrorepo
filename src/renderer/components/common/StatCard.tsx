import React from 'react'

interface StatCardProps {
  label: string
  value: string | number
  accent?: boolean
  compact?: boolean
}

export function StatCard({ label, value, accent, compact }: StatCardProps): React.ReactElement {
  const bg = compact ? 'bg-astro-bg' : 'bg-astro-surface'
  const padding = compact ? 'p-3' : 'p-4'
  const border = compact ? 'border-astro-border/50' : 'border-astro-border'
  const textSize = compact ? 'text-lg' : 'text-2xl'
  const color = accent ? 'text-astro-accent' : 'text-astro-text'

  return (
    <div className={`${bg} border ${border} rounded-lg ${padding}`}>
      <p className="text-xs text-astro-muted uppercase tracking-wider">{label}</p>
      <p className={`${textSize} font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}
