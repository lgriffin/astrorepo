import React from 'react'
import { useNavigate } from 'react-router-dom'
import type { ForwardPlanView, PlanTargetView } from '@shared/types'
import { settingsLink } from '@shared/navigation'
import { Card, EmptyState, LinkButton } from '../common/Card'


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

/**
 * "Coming nights": closing seasons and the next new-moon window (FWD-004, 005). Tonight's choices
 * (FWD-002) lead Home in the Tonight panel instead.
 */
export function ComingNightsCard({ plan }: { plan: ForwardPlanView }): React.ReactElement {
  const navigate = useNavigate()
  if (plan.status === 'no-site') {
    return (
      <Card title="Coming nights">
        <EmptyState action={<LinkButton onClick={() => navigate(settingsLink('location'))}>Set your site in Settings</LinkButton>}>{plan.message}</EmptyState>
      </Card>
    )
  }

  const { closing, windows } = plan
  const next = windows[0]
  return (
    <Card title="Coming nights" action={<LinkButton onClick={() => navigate('/sky-planner')}>Open the Sky planner</LinkButton>}>
      <div className="space-y-4">

      {closing.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-astro-muted mb-1 font-condensed">Season closing</h3>
          <TargetList items={closing.slice(0, 5)} />
        </section>
      )}

      {closing.length === 0 && !next && (
        <EmptyState>No season is closing and no new-moon window is coming up for your targets with work left.</EmptyState>
      )}

      {next && (
        <section>
          <h3 className="text-xs font-semibold text-astro-muted mb-1 font-condensed">{next.label}</h3>
          {next.targets.length > 0 ? (
            <TargetList items={next.targets} />
          ) : (
            <p className="text-xs text-astro-muted">None of your targets with work left is well placed then.</p>
          )}
        </section>
      )}
      </div>
    </Card>
  )
}
