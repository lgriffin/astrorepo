import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, EmptyState, LinkButton } from '../common/Card'
import { invoke } from '../../hooks/useIPC'
import { useToast } from '../../contexts/ToastContext'
import { mosaicPlannerLink, targetLink } from '@shared/navigation'
import type { SolveQueuedView, TargetGeometryView } from '@shared/types'

const SOLVES_SHOWN = 12

/**
 * Where a target's files point (specs/024-sky-geometry): plate solve them, see each solve, a
 * warning when they point away from the name (SKY-005), the rotation by night (SKY-006) and the
 * panels of a mosaic (SKY-011).
 */
export function SkyGeometryCard({ targetId }: { targetId: string }): React.ReactElement {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [view, setView] = useState<TargetGeometryView | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(() => {
    invoke<TargetGeometryView | null>('sky:target-geometry', { target_id: targetId })
      .then(setView)
      .catch(() => setView(null))
  }, [targetId])

  useEffect(() => {
    setView(null)
    load()
  }, [load])

  const solve = async () => {
    setBusy(true)
    try {
      const result = await invoke<SolveQueuedView>('sky:solve-target', { target_id: targetId })
      addToast(result.message, result.queued ? 'success' : 'info')
      load()
    } catch (error) {
      addToast(`Plate solving could not be queued: ${error instanceof Error ? error.message : String(error)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const action = (
    <div className="flex items-center gap-3">
      <LinkButton onClick={() => navigate(mosaicPlannerLink(targetId))}>Plan a mosaic</LinkButton>
      <button
        onClick={solve}
        disabled={busy}
        className="px-3 py-1.5 text-xs bg-astro-accent/10 text-astro-accent border border-astro-accent/30 rounded hover:bg-astro-accent/20 transition-colors disabled:opacity-50"
      >
        {busy ? 'Queueing…' : 'Plate solve'}
      </button>
    </div>
  )

  if (!view) {
    return (
      <Card title="Where it points" action={action}>
        <EmptyState>Plate solving finds where each night's lights and each master point on the sky.</EmptyState>
      </Card>
    )
  }

  const solves = showAll ? view.solves : view.solves.slice(0, SOLVES_SHOWN)
  return (
    <Card title="Where it points" action={action}>
      <div className="space-y-4 text-sm">
        <p className="text-astro-muted">{view.summary}</p>
        {view.misfiled && <p className="text-amber-400">{view.misfiled}</p>}

        {view.rotation.nights.length > 0 && (
          <div>
            <h3 className="text-xs text-astro-muted uppercase tracking-wider mb-1">Rotation by night</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {view.rotation.nights.map(n => (
                <span key={n.night} className="text-astro-text">
                  {n.night} <span className="text-astro-muted">{n.rotation}</span>
                </span>
              ))}
            </div>
            {view.rotation.note && <p className="text-xs text-astro-muted mt-1">{view.rotation.note}</p>}
          </div>
        )}

        {view.mosaic && (
          <div>
            <h3 className="text-xs text-astro-muted uppercase tracking-wider mb-1">Panels</h3>
            <p className="text-astro-text mb-1">{view.mosaic}</p>
            <ul className="space-y-0.5">
              {view.panels
                .filter(p => p.inMosaic)
                .map(p => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2">
                    <span className="text-astro-text">
                      {p.tile !== null ? `Tile ${p.tile}` : `Panel ${p.id}`} at {p.centre}
                      {p.otherTargets.map(id => (
                        <Link key={id} to={targetLink(id)} className="ml-2 text-xs text-astro-accent hover:underline">
                          filed under another target
                        </Link>
                      ))}
                    </span>
                    <span className="text-astro-muted">
                      {p.integration} in {p.lights} lights over {p.nights} {p.nights === 1 ? 'night' : 'nights'}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {view.solves.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-astro-muted border-b border-astro-border">
                  <th className="py-1 pr-3 font-medium">File</th>
                  <th className="py-1 pr-3 font-medium">Night</th>
                  <th className="py-1 pr-3 font-medium">Centre</th>
                  <th className="py-1 pr-3 font-medium">Field</th>
                  <th className="py-1 pr-3 font-medium">Scale</th>
                  <th className="py-1 pr-3 font-medium">Rotation</th>
                  <th className="py-1 font-medium">From</th>
                </tr>
              </thead>
              <tbody>
                {solves.map(s => (
                  <tr key={s.path} className="border-b border-astro-border/50 align-top">
                    <td className="py-1 pr-3 text-astro-text" title={s.path}>
                      {s.name}
                      {s.kind === 'master' && <span className="ml-1 text-astro-muted">(master)</span>}
                    </td>
                    <td className="py-1 pr-3 text-astro-muted">{s.night ?? 'Undated'}</td>
                    {s.solved ? (
                      <>
                        <td className="py-1 pr-3 text-astro-text whitespace-nowrap">{s.centre}</td>
                        <td className="py-1 pr-3 text-astro-muted whitespace-nowrap">{s.field}</td>
                        <td className="py-1 pr-3 text-astro-muted">{s.scale}</td>
                        <td className="py-1 pr-3 text-astro-muted">{s.rotation}</td>
                      </>
                    ) : (
                      <td colSpan={4} className="py-1 pr-3 text-red-400">
                        {s.error}
                      </td>
                    )}
                    <td className="py-1 text-astro-muted">{s.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {view.solves.length > SOLVES_SHOWN && (
              <div className="mt-2">
                <LinkButton onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${view.solves.length}`}</LinkButton>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
