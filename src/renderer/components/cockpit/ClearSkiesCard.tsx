import React from 'react'
import { useNavigate } from 'react-router-dom'
import type { ClearSkiesView, NightSkyView } from '@shared/types'
import { settingsLink } from '@shared/navigation'
import { Card, EmptyState, LinkButton } from '../common/Card'

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const TONE: Record<NightSkyView['verdict'], string> = {
  clear: 'border-astro-success/40 bg-astro-success/10 text-astro-success',
  'clear-spells': 'border-astro-warning/30 bg-astro-warning/5 text-astro-warning',
  cloudy: 'border-astro-border bg-astro-bg text-astro-muted',
  'no-forecast': 'border-astro-border bg-astro-bg text-astro-muted',
  'no-darkness': 'border-astro-border bg-astro-bg text-astro-muted'
}

const WARNING_TONE = { yellow: 'text-astro-warning', orange: 'text-astro-cat-4', red: 'text-astro-danger', unknown: 'text-astro-muted' } as const

function NightTile({ night }: { night: NightSkyView }): React.ReactElement {
  return (
    <div className={`rounded-lg border p-3 ${TONE[night.verdict]}`}>
      <p className="text-xs text-astro-muted">{night.label}</p>
      <p className="text-lg font-semibold">{night.headline}</p>
      {night.spellStart && night.spellEnd && (
        <p className="text-xs text-astro-text">
          Clear {time(night.spellStart)} to {time(night.spellEnd)}
        </p>
      )}
      {night.darkStart && night.darkEnd && (
        <p className="text-xs text-astro-muted">
          Dark {time(night.darkStart)} to {time(night.darkEnd)}
        </p>
      )}
      {night.figures.length > 0 && <p className="text-xs text-astro-muted mt-1">{night.figures.join(' · ')}</p>}
      {night.notes.map(n => (
        <p key={n} className="text-xs text-astro-text mt-1">{n}</p>
      ))}
      {night.warnings.map(w => (
        <p key={w.text} className={`text-xs mt-1 ${WARNING_TONE[w.level]}`}>{w.text}</p>
      ))}
    </div>
  )
}

/** The next three nights at a glance, "Clear skies" when a night's dark window is forecast clear (WX-001). */
export function ClearSkiesCard({ outlook }: { outlook: ClearSkiesView }): React.ReactElement {
  const navigate = useNavigate()
  const settings = <LinkButton onClick={() => navigate(settingsLink('weather'))}>Weather settings</LinkButton>
  if (outlook.status === 'no-site') {
    return (
      <Card title="Clear skies">
        <EmptyState action={<LinkButton onClick={() => navigate(settingsLink('location'))}>Set your site in Settings</LinkButton>}>{outlook.message}</EmptyState>
      </Card>
    )
  }
  if (outlook.status === 'off') {
    return (
      <Card title="Clear skies">
        <EmptyState action={settings}>{outlook.message}</EmptyState>
      </Card>
    )
  }
  const failed = outlook.sources.filter(s => s.problem !== null)
  return (
    <Card title="Clear skies" action={settings}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {outlook.nights.map(n => (
          <NightTile key={n.night} night={n} />
        ))}
      </div>
      {failed.map(s => (
        <p key={s.name} className="text-xs text-astro-warning mt-2">
          {s.name} could not be used: {s.problem}
        </p>
      ))}
      {outlook.credit && <p className="text-[10px] text-astro-muted mt-2">{outlook.credit}</p>}
    </Card>
  )
}
