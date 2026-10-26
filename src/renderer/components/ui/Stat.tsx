import React from 'react'

/** One figure with what it counts, figures in tabular numerals so columns line up (LF-006). */
export function Stat({ label, value, detail }: { label: string; value: React.ReactNode; detail?: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-astro-muted">{label}</span>
      <span className="text-xl font-semibold text-astro-text tabular-nums">{value}</span>
      {detail && <span className="text-xs text-astro-muted">{detail}</span>}
    </div>
  )
}
