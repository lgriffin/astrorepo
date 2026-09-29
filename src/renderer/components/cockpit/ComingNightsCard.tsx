import React from 'react'
import { useNavigate } from 'react-router-dom'
import type { ForwardPlanView, PlanTargetView } from '@shared/types'

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function TargetList({ items }: { items: PlanTargetView[] }): React.ReactElement {
  const navigate = useNavigate()
  return (
    <ul className="space-y-1">
      {items.map(t => (
        <li key={t.targetId} className="flex items-baseline justify-between gap-3 text-sm">
          <button onClick={() => navigate(`/targets/${t.targetId}`)} className="text-astro-accent hover:underline text-left">
            {t.targetName}
          </button>
          <span className="text-xs text-astro-muted text-right">{t.detail}</span>
        </li>
      ))}
    </ul>
  )
}

/** "Coming nights": tonight's choices, closing seasons and the next new-moon window (FWD-002, 004, 005). */
export function ComingNightsCard({ plan }: { plan: ForwardPlanView }): React.ReactElement {
  const navigate = useNavigate()
  if (plan.status === 'no-site') {
    return (
      <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-2">Coming nights</h2>
        <p className="text-sm text-astro-muted">{plan.message}</p>
        <button onClick={() => navigate('/settings')} className="mt-2 text-xs text-astro-accent hover:underline">
          Open Settings
        </button>
      </div>
    )
  }

  const { tonight, closing, windows } = plan
  const next = windows[0]
  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider">Coming nights</h2>
        <button onClick={() => navigate('/sky-planner')} className="text-xs text-astro-accent hover:underline">
          Seasons
        </button>
      </div>

      <section>
        {tonight ? (
          <>
            <p className="text-sm text-astro-text mb-1">
              Tonight: {tonight.darkness} dark {time(tonight.darkStart)} to {time(tonight.darkEnd)}, {tonight.moonSummary}
            </p>
            {tonight.darknessNote && <p className="text-xs text-astro-muted mb-1">{tonight.darknessNote}</p>}
            {tonight.moonNote && <p className="text-xs text-astro-muted mb-1">{tonight.moonNote}</p>}
            {tonight.choices.length > 0 ? (
              <TargetList items={tonight.choices.slice(0, 5)} />
            ) : (
              !tonight.moonNote && <p className="text-xs text-astro-muted">None of your targets with work left is up for an hour tonight.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-astro-muted">The sun does not get 12° below the horizon tonight, so there is no dark window.</p>
        )}
      </section>

      {closing.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-astro-muted uppercase tracking-wider mb-1">Season closing</h3>
          <TargetList items={closing.slice(0, 5)} />
        </section>
      )}

      {next && (
        <section>
          <h3 className="text-xs font-semibold text-astro-muted uppercase tracking-wider mb-1">{next.label}</h3>
          {next.targets.length > 0 ? (
            <TargetList items={next.targets} />
          ) : (
            <p className="text-xs text-astro-muted">None of your targets with work left is well placed then.</p>
          )}
        </section>
      )}
    </div>
  )
}
