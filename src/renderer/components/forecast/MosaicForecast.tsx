import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '../common/Card'
import { Button } from '../ui'
import { ForecastKind, ForecastTable } from './ForecastTable'
import { invoke } from '../../hooks/useIPC'
import type { MosaicIntegrationView } from '@shared/types'

/** What another hour buys on each panel of a mosaic, from its coverage (specs/039-integration-forecasts). */
export function MosaicForecast({ workspaceId, revision, version }: { workspaceId: string; revision: number; version: number }): React.ReactElement | null {
  const [view, setView] = useState<MosaicIntegrationView | null | undefined>(undefined)
  const [failed, setFailed] = useState<string | null>(null)
  const loading = useRef(0)

  const load = useCallback(async () => {
    const mine = ++loading.current
    try {
      const v = await invoke<MosaicIntegrationView | null>('forecast:mosaic', { workspace_id: workspaceId, revision })
      if (mine !== loading.current) return
      setView(v)
      setFailed(null)
    } catch (error) {
      if (mine === loading.current) setFailed(error instanceof Error ? error.message : String(error))
    }
  }, [workspaceId, revision])

  useEffect(() => {
    load()
  }, [load, version])

  if (view === null) return null
  return (
    <Card title="What another hour buys">
      {failed && !view ? (
        <div className="space-y-2 text-sm">
          <p className="text-astro-danger">The forecast could not be worked out: {failed}</p>
          <Button size="sm" onClick={() => load()}>
            Try again
          </Button>
        </div>
      ) : !view ? (
        <p className="text-sm text-astro-muted">Loading…</p>
      ) : (
        <div className="space-y-3 text-sm">
          {view.best.length > 0 && view.best[0].gain ? (
            <ol className="list-decimal pl-5 space-y-0.5">
              {view.best.slice(0, 5).map(b => (
                <li key={b.label} className="text-astro-text">
                  {b.label}: {b.gain ?? 'nothing counted yet'} <ForecastKind kind={b.kind} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-astro-muted">Nothing is counted on any panel yet, so there is nothing to forecast.</p>
          )}
          {view.panels
            .filter(p => p.filters.length > 0)
            .map(p => (
              <div key={p.panelId}>
                <h3 className="text-xs font-medium text-astro-text mb-1">{p.panelId}</h3>
                <ForecastTable rows={p.filters} />
              </div>
            ))}
          <details className="text-xs">
            <summary className="cursor-pointer text-astro-muted">What this rests on</summary>
            <ul className="mt-2 list-disc pl-5 space-y-0.5 text-astro-text">
              {view.assumptions.map(a => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <p className="mt-1 text-astro-muted">{view.basis} Panels are counted capture by capture, not measured frame by frame, so their forecasts are theoretical.</p>
          </details>
        </div>
      )}
    </Card>
  )
}
