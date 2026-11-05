import React from 'react'
import { Link } from 'react-router-dom'
import type { SkyInsightView } from '@shared/types'
import { settingsLink } from '@shared/navigation'
import { nightStrip } from '@shared/sky-insight'
import { Card, EmptyState } from '../common/Card'
import { Badge, Explain, type BadgeTone } from '../ui'
import { MoonGlyph } from './TonightHero'

type Insight = Extract<SkyInsightView, { status: 'ok' }>

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const FAINT_TONE: Record<Insight['faint'], BadgeTone> = { good: 'success', possible: 'warning', poor: 'danger', none: 'neutral' }

function Tile({ label, concept, value, children }: { label: string; concept?: string; value: React.ReactNode; children?: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-md border border-astro-border bg-astro-bg p-3">
      <p className="font-condensed text-xs text-astro-muted">
        {label}
        {concept && <> <Explain concept={concept} /></>}
      </p>
      <div className="mt-1 text-xl font-semibold text-astro-text tabular-nums">{value}</div>
      <div className="mt-1 space-y-0.5 text-xs text-astro-muted">{children}</div>
    </div>
  )
}

/** A thin bar filled to a share, for cloud cover; the figure beside it carries the meaning. */
function Meter({ share, label }: { share: number; label: string }): React.ReactElement {
  return (
    <div role="img" aria-label={label} className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-astro-raised">
      <div className="h-full rounded-full bg-astro-muted" style={{ width: `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%` }} />
    </div>
  )
}

/** The nine Bortle steps, darkest on the left, the user's class marked (SKY-003). */
function BortleScale({ bortle }: { bortle: number }): React.ReactElement {
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

/** Noon to noon: the dark window, and the part of it with the Moon up (SKY-001, SKY-002). */
function NightStripBar({ insight }: { insight: Insight }): React.ReactElement | null {
  if (!insight.dark) return null
  const strip = nightStrip(insight.dark.start, insight.dark.end, insight.moon?.upFrom ?? null, insight.moon?.upTo ?? null)
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`
  const label = `Dark ${time(insight.dark.start)} to ${time(insight.dark.end)}${
    insight.moon?.upFrom && insight.moon.upTo ? `, Moon up ${time(insight.moon.upFrom)} to ${time(insight.moon.upTo)}` : ''
  }`
  return (
    <div className="mt-4">
      <div role="img" aria-label={label} className="relative h-3 w-full overflow-hidden rounded-full bg-astro-raised">
        <div className="absolute inset-y-0 bg-astro-scrim" style={{ left: pct(strip.dark.left), width: pct(strip.dark.width) }} />
        {strip.moon && <div className="absolute inset-y-0 bg-astro-on-scrim" style={{ left: pct(strip.moon.left), width: pct(strip.moon.width), opacity: 0.55 }} />}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-astro-muted tabular-nums">
        <span>Noon</span>
        <span>Midnight</span>
        <span>Noon</span>
      </div>
    </div>
  )
}

/**
 * Tonight's sky at a glance (specs/043-sky-insight): how long it is dark, the Moon, the cloud and
 * how dark the user's sky is, summed up in one sentence for faint targets.
 */
export function SkyInsightCard({ insight }: { insight: SkyInsightView }): React.ReactElement {
  if (insight.status === 'no-site') {
    return (
      <Card title="Tonight’s sky">
        <EmptyState action={<Link to={settingsLink('location')} className="text-sm text-astro-accent hover:underline">Set your site in Settings</Link>}>{insight.message}</EmptyState>
      </Card>
    )
  }
  const { dark, moon, cloud, sky } = insight
  return (
    <Card title="Tonight’s sky">
      <p className="text-sm text-astro-text">
        <Badge tone={FAINT_TONE[insight.faint]} className="mr-2 align-middle">{insight.faintLabel}</Badge>
        {insight.summary}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label={dark?.darkness === 'nautical' ? 'Nautical dark' : 'Darkness'} concept="twilight" value={dark ? dark.text : 'None'}>
          {dark ? (
            <>
              <p>{time(dark.start)} to {time(dark.end)}</p>
              {dark.change && <p>{dark.change}</p>}
            </>
          ) : (
            <p>The Sun stays less than 12° down.</p>
          )}
        </Tile>
        <Tile
          label="Moon"
          concept="moon-phase"
          value={
            moon ? (
              <span className="flex items-center gap-2">
                <MoonGlyph percent={moon.percent} size={28} />
                {moon.percent}% lit
              </span>
            ) : (
              '—'
            )
          }
        >
          {moon && (
            <>
              <p>{moon.phase}</p>
              <p>
                {moon.up}
                {moon.upFrom && moon.upTo && moon.upHours > 0 && moon.up.startsWith('Up for') && `, ${time(moon.upFrom)} to ${time(moon.upTo)}`}
              </p>
              <p>{moon.moonFree} of dark without it</p>
            </>
          )}
        </Tile>
        <Tile label="Cloud" value={cloud.cloudPct !== null ? `${cloud.cloudPct}%` : cloud.headline}>
          {cloud.cloudPct !== null && <p className="text-astro-text">{cloud.headline}</p>}
          <p>
            {cloud.detail}
            {cloud.state === 'off' && (
              <>
                {' '}
                <Link to={settingsLink('weather')} className="text-astro-accent hover:underline">Weather settings</Link>
              </>
            )}
          </p>
          {cloud.dew && <p>Dew likely: keep the dew heater on.</p>}
          {cloud.cloudPct !== null && <Meter share={cloud.cloudPct / 100} label={`${cloud.cloudPct}% cloud over the dark`} />}
        </Tile>
        <Tile label="Your sky" concept="light-pollution" value={sky ? `Bortle ${sky.bortle}` : 'Not set'}>
          {sky ? (
            <>
              <p>{sky.name}</p>
              <p>{sky.sqm !== null ? `${sky.sqm.toFixed(2)} mag/arcsec², your meter reading` : 'The class you set'}</p>
              <BortleScale bortle={sky.bortle} />
            </>
          ) : (
            <p>
              <Link to={settingsLink('location')} className="text-astro-accent hover:underline">Set your Bortle class</Link> in Your site.
            </p>
          )}
        </Tile>
      </div>
      <NightStripBar insight={insight} />
    </Card>
  )
}
