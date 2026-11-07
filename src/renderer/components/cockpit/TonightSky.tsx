/**
 * The parts of tonight's sky (specs/043-sky-insight) that Home's one Tonight card draws
 * (specs/046-everyday-ux, EUX-004): the cloud meter, the Bortle scale and the noon-to-noon strip.
 */
import React from 'react'
import type { SkyInsightView } from '@shared/types'
import { nightStrip } from '@shared/sky-insight'
import type { BadgeTone } from '../ui'

export type Insight = Extract<SkyInsightView, { status: 'ok' }>

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export const FAINT_TONE: Record<Insight['faint'], BadgeTone> = { good: 'success', possible: 'warning', poor: 'danger', none: 'neutral' }

/** A thin bar filled to a share, for cloud cover; the figure beside it carries the meaning. */
export function Meter({ share, label }: { share: number; label: string }): React.ReactElement {
  return (
    <div role="img" aria-label={label} className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-astro-raised">
      <div className="h-full rounded-full bg-astro-muted" style={{ width: `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%` }} />
    </div>
  )
}

/** The nine Bortle steps, darkest on the left, the user's class marked (NSI-003). */
export function BortleScale({ bortle }: { bortle: number }): React.ReactElement {
  return (
    <div role="img" aria-label={`Bortle ${bortle} of 9`} className="mt-2 flex gap-0.5">
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-sm ${i + 1 === bortle ? 'bg-astro-accent' : i + 1 < bortle ? 'bg-astro-border' : 'bg-astro-muted'}`}
          style={i + 1 === bortle ? undefined : { opacity: 0.35 + (i / 8) * 0.45 }}
        />
      ))}
    </div>
  )
}

/** Noon to noon: the dark window, and the parts of it with the Moon up (NSI-001, NSI-002). */
export function NightStripBar({ insight }: { insight: Insight }): React.ReactElement | null {
  if (!insight.dark) return null
  const spans = insight.moon?.spans ?? []
  const strip = nightStrip(insight.dark.start, insight.dark.end, spans)
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`
  const label = `Dark ${time(insight.dark.start)} to ${time(insight.dark.end)}${spans.map(s => `, Moon up ${time(s.start)} to ${time(s.end)}`).join('')}`
  return (
    <div className="mt-4">
      <div role="img" aria-label={label} className="relative h-3 w-full overflow-hidden rounded-full bg-astro-raised">
        <div className="absolute inset-y-0 bg-astro-scrim" style={{ left: pct(strip.dark.left), width: pct(strip.dark.width) }} />
        {strip.moon.map(m => (
          <div key={m.left} className="absolute inset-y-0 bg-astro-on-scrim" style={{ left: pct(m.left), width: pct(m.width), opacity: 0.55 }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-astro-muted tabular-nums">
        <span>Noon</span>
        <span>Midnight</span>
        <span>Noon</span>
      </div>
    </div>
  )
}
