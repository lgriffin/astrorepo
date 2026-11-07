import React from 'react'
import { SiteQuickForm } from './SiteQuickForm'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { NightSkyView } from '@shared/types'
import { settingsLink, targetLink } from '@shared/navigation'
import { moonPath, NO_SITE_HEADLINE, type TonightSummary } from '@shared/tonight'
import { tokenColor } from '../../theme'
import type { MissingForecast } from '@shared/tonight-card'
import { Badge, Explain, Skeleton } from '../ui'
import { WhyTonight, type TonightSite } from './WhyTonight'
import { BortleScale, FAINT_TONE, Meter, NightStripBar, type Insight } from './TonightSky'

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

function Fact({ label, concept, children, more }: { label: string; concept?: string; children: React.ReactNode; more?: React.ReactNode }): React.ReactElement {
  return (
    <div className="min-w-0">
      <p className="font-condensed text-xs text-astro-muted">
        {label}
        {concept && <> <Explain concept={concept} /></>}
      </p>
      <p className="text-sm text-astro-text tabular-nums">{children}</p>
      {more && <div className="mt-0.5 space-y-0.5 text-xs text-astro-muted">{more}</div>}
    </div>
  )
}

/** Tonight's sky as Home has it: worked out, still loading (null) or failed. */
export type TonightInsight = Insight | null | 'failed'

/** The cloud, said once: the forecast's figure, or why there is none (EUX-005). */
function CloudFact({ insight, forecast }: { insight: Insight | null; forecast: MissingForecast | null }): React.ReactElement | null {
  if (forecast) {
    return (
      <Fact
        label="Cloud"
        more={
          <p>
            {forecast.reason}
            {forecast.settings && <> <Link to={settingsLink('weather')} className="text-astro-accent hover:underline">Weather settings</Link></>}
          </p>
        }
      >
        {forecast.headline}
      </Fact>
    )
  }
  const cloud = insight?.cloud
  if (!cloud || cloud.cloudPct === null) return null
  return (
    <Fact
      label="Cloud"
      more={
        <>
          <p>{cloud.detail}</p>
          {cloud.dew && <p>Dew likely: keep the dew heater on.</p>}
          <Meter share={cloud.cloudPct / 100} label={`${cloud.cloudPct}% cloud over the dark`} />
        </>
      }
    >
      {cloud.cloudPct}% · {cloud.headline}
    </Fact>
  )
}

/**
 * What Home leads with (LF-016), in one card (EUX-004): whether tonight is clear, how good it is for
 * faint targets, when it is dark, the moon, the cloud and how dark your sky is, each said once, with
 * the noon-to-noon strip and the best few targets to shoot, each a link to its page.
 */
export function TonightHero({
  summary,
  loading,
  site = null,
  askSite = false,
  onSiteSaved,
  insight = null,
  forecast = null,
  onRetryInsight
}: {
  summary: TonightSummary
  loading: boolean
  site?: TonightSite | null
  askSite?: boolean
  onSiteSaved?: () => void
  /** Tonight's sky, drawn in this card rather than a card of its own (EUX-004). */
  insight?: TonightInsight
  /** Why there is no forecast for tonight, said here once (EUX-005). */
  forecast?: MissingForecast | null
  onRetryInsight?: () => void
}): React.ReactElement {
  // Home's one site prompt asks whatever the forecast and plan have answered so far (EUX-001).
  if (askSite || summary.state === 'no-site') {
    return (
      <section aria-label="Tonight" className="rounded-lg border border-astro-border bg-astro-surface p-5">
        <h2 className="text-2xl font-semibold text-astro-text">{NO_SITE_HEADLINE}</h2>
        <p className="mt-1 text-sm text-astro-muted">
          The dark window, the moon, the forecast and what to shoot are worked out from where your scopes stand.{' '}
          <Link to={settingsLink('location')} className="text-astro-accent hover:underline">More in Your site</Link>
        </p>
        {/* Home's one site prompt when Get set up is hidden (EUX-001). */}
        {onSiteSaved && <SiteQuickForm onSaved={onSiteSaved} />}
      </section>
    )
  }
  if (loading && summary.state === 'unknown') {
    return (
      <section aria-label="Tonight" className="rounded-lg border border-astro-border bg-astro-surface p-5">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-3 h-4 w-80" />
      </section>
    )
  }
  const tone = summary.verdict ? HEADLINE_TONE[summary.verdict] : 'text-astro-text'
  const sky = insight && insight !== 'failed' ? insight : null
  const dark = summary.dark ?? (sky?.dark ? { start: sky.dark.start, end: sky.dark.end, darkness: sky.dark.darkness } : null)
  const moonPercent = summary.moonPercent ?? sky?.moon?.percent ?? null
  return (
    <section aria-label="Tonight" className="grid gap-5 rounded-lg border border-astro-border bg-astro-surface p-5 lg:grid-cols-[1fr_minmax(0,22rem)]">
      <div>
        <h2 className={`text-2xl font-semibold ${tone}`}>{summary.headline}</h2>
        {sky && (
          <p className="mt-1 text-sm text-astro-text">
            <Badge tone={FAINT_TONE[sky.faint]} className="mr-2 align-middle">{sky.faintLabel}</Badge>
            {sky.summary}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          {dark && (
            <Fact
              label={DARK_LABEL[dark.darkness ?? 'unknown']}
              concept="twilight"
              more={sky?.dark && (
                <>
                  <p>{sky.dark.text} of it</p>
                  {sky.dark.change && <p>{sky.dark.change}</p>}
                </>
              )}
            >
              {time(dark.start)} to {time(dark.end)}
            </Fact>
          )}
          {summary.spell && (
            <Fact label="Clearest">
              {time(summary.spell.start)} to {time(summary.spell.end)}
            </Fact>
          )}
          {moonPercent !== null && (
            <div className="flex items-start gap-3">
              <MoonGlyph percent={moonPercent} />
              <Fact
                label="Moon"
                concept="moon-phase"
                more={sky?.moon && (
                  <>
                    <p>{sky.moon.up}</p>
                    <p>{sky.moon.moonFree} of dark without it</p>
                  </>
                )}
              >
                {sky?.moon ? `${sky.moon.phase}, ${sky.moon.percent}% lit` : summary.moon ?? `${Math.round(moonPercent)}% lit`}
              </Fact>
            </div>
          )}
          <CloudFact insight={sky} forecast={forecast} />
          {sky && (
            <Fact
              label="Your sky"
              concept="light-pollution"
              more={
                sky.sky ? (
                  <>
                    <p>{sky.sky.sqm !== null ? `${sky.sky.sqm.toFixed(2)} mag/arcsec², your meter reading` : sky.sky.name}</p>
                    <BortleScale bortle={sky.sky.bortle} />
                  </>
                ) : (
                  <p><Link to={settingsLink('location')} className="text-astro-accent hover:underline">Set your Bortle class</Link> in Your site.</p>
                )
              }
            >
              {sky.sky ? `Bortle ${sky.sky.bortle}` : 'Not set'}
            </Fact>
          )}
        </div>
        {summary.notes.map(n => (
          <p key={n} className="mt-3 text-xs text-astro-muted">
            {n}
            {/^The moon is/.test(n) && <> <Explain concept="moonlight" /></>}
          </p>
        ))}
        {sky && <NightStripBar insight={sky} />}
        {insight === null && <Skeleton className="mt-4 h-3 w-full" label="Working out tonight’s darkness, moon and cloud" />}
        {insight === 'failed' && (
          <p className="mt-3 text-xs text-astro-muted">
            Could not work out tonight’s sky.{' '}
            {onRetryInsight && <button type="button" onClick={onRetryInsight} className="text-astro-accent hover:underline">Try again</button>}
          </p>
        )}
        {site && <WhyTonight site={site} />}
      </div>
      {summary.picks.length > 0 && (
        <div>
          <p className="font-condensed text-xs text-astro-muted">
            Best to shoot <Explain concept="airmass" label="Why high?" />
          </p>
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
