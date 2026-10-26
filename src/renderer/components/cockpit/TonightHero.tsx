import React from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { NightSkyView } from '@shared/types'
import { settingsLink, targetLink } from '@shared/navigation'
import { moonPath, type TonightSummary } from '@shared/tonight'
import { tokenColor } from '../../theme'
import { Skeleton } from '../ui'

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const HEADLINE_TONE: Record<NightSkyView['verdict'], string> = {
  clear: 'text-astro-success',
  'clear-spells': 'text-astro-warning',
  cloudy: 'text-astro-muted',
  'no-forecast': 'text-astro-text',
  'no-darkness': 'text-astro-muted'
}

/** How the dark window is named; until the plan says how dark, the forecast's window is just the night. */
const DARK_LABEL = { astronomical: 'Dark', nautical: 'Nautical dark only', unknown: 'Night' } as const

/** The moon as it is tonight: night sky behind, its lit part light, the same in every theme (red at night). */
export function MoonGlyph({ percent, size = 40 }: { percent: number; size?: number }): React.ReactElement {
  const r = size / 2
  const lit = moonPath(percent, r)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Moon ${Math.round(percent)}% lit`}>
      <circle cx={r} cy={r} r={r - 0.75} fill={tokenColor('scrim')} stroke={tokenColor('border')} strokeWidth={1.5} />
      {lit && <path d={lit} fill={tokenColor('on-scrim')} fillOpacity={0.9} />}
    </svg>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <p className="font-condensed text-xs text-astro-muted">{label}</p>
      <p className="text-sm text-astro-text tabular-nums">{children}</p>
    </div>
  )
}

/**
 * What Home leads with (LF-016): whether tonight is clear, when it is dark, the moon, and the
 * best few targets to shoot, each a link to its page.
 */
export function TonightHero({ summary, loading }: { summary: TonightSummary; loading: boolean }): React.ReactElement {
  if (loading && summary.state === 'unknown') {
    return (
      <section aria-label="Tonight" className="rounded-lg border border-astro-border bg-astro-surface p-5">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-3 h-4 w-80" />
      </section>
    )
  }
  if (summary.state === 'no-site') {
    return (
      <section aria-label="Tonight" className="rounded-lg border border-astro-border bg-astro-surface p-5">
        <h2 className="text-2xl font-semibold text-astro-text">{summary.headline}</h2>
        <p className="mt-1 text-sm text-astro-muted">
          The dark window, the moon and what to shoot are worked out from where your scopes stand.{' '}
          <Link to={settingsLink('location')} className="text-astro-accent hover:underline">Set your site in Settings</Link>
        </p>
      </section>
    )
  }
  const tone = summary.verdict ? HEADLINE_TONE[summary.verdict] : 'text-astro-text'
  return (
    <section aria-label="Tonight" className="grid gap-5 rounded-lg border border-astro-border bg-astro-surface p-5 lg:grid-cols-[1fr_minmax(0,22rem)]">
      <div>
        <h2 className={`text-2xl font-semibold ${tone}`}>{summary.headline}</h2>
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
          {summary.dark && (
            <Fact label={DARK_LABEL[summary.dark.darkness ?? 'unknown']}>
              {time(summary.dark.start)} to {time(summary.dark.end)}
            </Fact>
          )}
          {summary.spell && (
            <Fact label="Clearest">
              {time(summary.spell.start)} to {time(summary.spell.end)}
            </Fact>
          )}
          {summary.moonPercent !== null && (
            <div className="flex items-center gap-3">
              <MoonGlyph percent={summary.moonPercent} />
              <Fact label="Moon">{summary.moon ?? `${Math.round(summary.moonPercent)}% lit`}</Fact>
            </div>
          )}
        </div>
        {summary.notes.map(n => (
          <p key={n} className="mt-3 text-xs text-astro-muted">{n}</p>
        ))}
      </div>
      {summary.picks.length > 0 && (
        <div>
          <p className="font-condensed text-xs text-astro-muted">Best to shoot</p>
          <ul className="mt-1 divide-y divide-astro-border">
            {summary.picks.map(p => (
              <li key={p.targetId}>
                <Link to={targetLink(p.targetId)} className="group flex items-center gap-3 py-2">
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-medium text-astro-text group-hover:text-astro-accent">{p.targetName}</span>
                    <span className="block truncate text-xs text-astro-muted">{p.detail}</span>
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-astro-muted" strokeWidth={1.75} />
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/sky-planner" className="mt-1 inline-block text-xs text-astro-accent hover:underline">More in the Sky planner</Link>
        </div>
      )}
    </section>
  )
}
