import React from 'react'
import { useNavigate } from 'react-router-dom'
import type { ForwardPlanView } from '@shared/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1]

/** Shade by usable hours a night: none, some, good, long. */
function shade(hours: number): string {
  if (hours < 1) return 'bg-astro-bg text-astro-muted'
  if (hours < 3) return 'bg-astro-accent/20 text-astro-text'
  if (hours < 5) return 'bg-astro-accent/45 text-astro-text'
  return 'bg-astro-accent/70 text-white'
}

/** The 12-month season of every target with work left, from the user's site (FWD-001). */
export function SeasonsTable({ plan }: { plan: Extract<ForwardPlanView, { status: 'ok' }> }): React.ReactElement {
  const navigate = useNavigate()
  const months = plan.seasons[0]?.months ?? []
  if (plan.seasons.length === 0) {
    return <p className="text-sm text-astro-muted">No target with coordinates has work left. Set an integration goal on a target to plan it.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-separate border-spacing-0.5">
        <thead>
          <tr>
            <th className="text-left text-astro-muted font-normal pr-2">Target</th>
            {months.map(m => (
              <th key={m.month} className="text-astro-muted font-normal w-10" title={m.newMoon ? 'Has a new moon' : undefined}>
                {monthLabel(m.month)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plan.seasons.map(s => (
            <tr key={s.targetId}>
              <td className="pr-2 whitespace-nowrap">
                <button onClick={() => navigate(`/targets/${s.targetId}`)} className="text-astro-accent hover:underline">
                  {s.targetName}
                </button>
              </td>
              {s.months.map(m => (
                <td
                  key={m.month}
                  className={`text-center rounded px-1 py-0.5 ${shade(m.hoursPerNight)} ${m.month === s.bestMonth ? 'ring-1 ring-astro-accent' : ''}`}
                  title={`${m.hoursPerNight} h a night above 30°`}
                >
                  {m.hoursPerNight > 0 ? m.hoursPerNight.toFixed(1) : '–'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-astro-muted mt-2">
        Average dark hours a night above 30° from your site, sampled weekly. The outlined month is each target's best.
      </p>
    </div>
  )
}
