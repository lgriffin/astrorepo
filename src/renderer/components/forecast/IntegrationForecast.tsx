import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input } from '../ui'
import { ForecastKind, ForecastTable } from './ForecastTable'
import { invoke } from '../../hooks/useIPC'
import type { IntegrationView } from '@shared/types'

/**
 * What another stretch of capture buys on a target (specs/039-integration-forecasts): acquired and
 * accepted light per filter, the time to each goal, the expected gain in signal to noise with its
 * range and kind, and everything it rests on. Worked out again when grading changes (`version`).
 */
export function IntegrationForecast({ targetId, version }: { targetId: string; version: number }): React.ReactElement {
  const [view, setView] = useState<IntegrationView | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [minutes, setMinutes] = useState('')
  const loading = useRef(0)
  // The length last asked for, kept when grading changes and the forecast is worked out again.
  const asked = useRef<number | undefined>(undefined)

  const load = useCallback(
    async (custom = asked.current) => {
      asked.current = custom
      const mine = ++loading.current
      try {
        const v = await invoke<IntegrationView>('forecast:target', { target_id: targetId, ...(custom ? { minutes: custom } : {}) })
        if (mine !== loading.current) return
        setView(v)
        setFailed(null)
      } catch (error) {
        if (mine === loading.current) setFailed(error instanceof Error ? error.message : String(error))
      }
    },
    [targetId]
  )

  // Another target starts from the standard lengths.
  useEffect(() => {
    asked.current = undefined
  }, [targetId])

  useEffect(() => {
    load()
  }, [load, version])

  if (failed && !view)
    return (
      <div className="space-y-2 text-sm">
        <p className="text-astro-danger">The forecast could not be worked out: {failed}</p>
        <Button size="sm" onClick={() => load()}>
          Try again
        </Button>
      </div>
    )
  if (!view) return <p className="text-sm text-astro-muted">Loading…</p>
  if (view.filters.length === 0) return <p className="text-sm text-astro-muted">No lights and no goals yet, so there is nothing to forecast.</p>

  const custom = Number(minutes)
  return (
    <div className="space-y-3 text-sm">
      <p className="text-astro-text">
        {view.total.accepted} accepted of {view.total.acquired} acquired{view.total.rejection ? `, ${view.total.rejection}` : ''}.{view.weighted ? ` ${view.weighted}.` : ''}
      </p>
      <ForecastTable rows={view.filters} />
      {view.best.length > 0 && view.best[0].gain && (
        <p className="text-astro-text">
          The next hour buys most on <span className="font-medium">{view.best[0].label}</span> ({view.best[0].gain} signal to noise) <ForecastKind kind={view.best[0].kind} />
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Minutes of capture" type="number" min={1} max={6000} value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="Minutes" className="w-24" />
        <Button size="sm" variant="secondary" disabled={!(custom >= 1 && custom <= 6000)} onClick={() => load(Math.round(custom))}>
          Forecast this long
        </Button>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-astro-muted">What this rests on</summary>
        <ul className="mt-2 list-disc pl-5 space-y-0.5 text-astro-text">
          {view.assumptions.map(a => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <ul className="mt-2 space-y-0.5 text-astro-muted">
          {view.filters
            .filter(f => f.forecasts.length > 0)
            .map(f => (
              <li key={f.filter}>
                <span className="font-medium text-astro-text">{f.filter}:</span> {f.forecasts[0].evidence}
              </li>
            ))}
        </ul>
        <p className="mt-1 text-astro-muted">{view.basis} Gains are in signal to noise; they say nothing about how the image will look.</p>
      </details>
    </div>
  )
}
