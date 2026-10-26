import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, EmptyState } from '../common/Card'
import { MosaicCanvas, type HeatMap } from './MosaicCanvas'
import { Button, Select, Table, Td, Th, Tr, Loading } from '../ui'
import { invoke } from '../../hooks/useIPC'
import { useToast } from '../../contexts/ToastContext'
import type { WorkspaceCoverageView, WorkspaceDrawingView, WorkspacePanelCoverageView } from '@shared/types'

const STATE_CLASS: Record<WorkspacePanelCoverageView['state'], string> = {
  covered: 'text-astro-success',
  'partly covered': 'text-astro-warning',
  'not started': 'text-astro-muted'
}

const ALL = ''

interface MosaicCoverageProps {
  workspaceId: string
  revision: number
  drawing: WorkspaceDrawingView
  /** Changes when a capture is placed by hand or left out, so coverage is worked out again. */
  version: number
}

/**
 * How a mosaic revision is covered (specs/037-mosaic-workspace, X3): a heat map of counted
 * exposure over the panels, each panel's covered share and depth per filter against the target's
 * goals, what counts and what does not, and the panels to shoot next.
 */
export function MosaicCoverage({ workspaceId, revision, drawing, version }: MosaicCoverageProps): React.ReactElement {
  const { addToast } = useToast()
  const [view, setView] = useState<WorkspaceCoverageView | null | undefined>(undefined)
  const [failed, setFailed] = useState<string | null>(null)
  const [filter, setFilter] = useState(ALL)
  const [panel, setPanel] = useState<string | null>(null)
  const loading = useRef(0)

  const load = useCallback(async () => {
    const mine = ++loading.current
    try {
      const v = await invoke<WorkspaceCoverageView | null>('workspace:coverage', { workspace_id: workspaceId, revision })
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

  const heat = useMemo<HeatMap | undefined>(() => {
    if (!view) return undefined
    const at = filter === ALL ? -1 : view.filters.indexOf(filter)
    const cells = view.cells.map(c => ({ x: c.x, y: c.y, value: at < 0 ? c.seconds : (c.byFilter[at] ?? 0), covered: c.captures > 0 }))
    return { cellDeg: view.cellDeg, cells, max: cells.reduce((m, c) => Math.max(m, c.value), 0) }
  }, [view, filter])

  const exportNext = async (format: 'csv' | 'json') => {
    try {
      const result = await invoke<{ saved: boolean; path?: string }>('workspace:export-next', { workspace_id: workspaceId, format, revision })
      if (result.saved) addToast(`Saved ${result.path ?? 'the next session'}`, 'success')
    } catch (error) {
      addToast(`The next session could not be saved: ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  if (failed && !view)
    return (
      <Card title="Coverage">
        <div className="space-y-2 text-sm">
          <p className="text-astro-danger">Coverage could not be worked out: {failed}</p>
          <Button size="sm" onClick={() => load()}>
            Try again
          </Button>
        </div>
      </Card>
    )
  if (view === undefined) return <Card title="Coverage"><Loading label="Working out the coverage" /></Card>
  if (view === null) return <Card title="Coverage">This revision no longer exists.</Card>

  const chosen = view.panels.find(p => p.panelId === panel) ?? null
  const onPanel = panel ? view.captures.filter(c => c.panelId === panel) : view.captures
  const anyCovered = view.cells.some(c => c.captures > 0)

  return (
    <Card title="Coverage">
      <div className="space-y-4 text-sm">
        <p className="text-astro-text">{view.summary}</p>
        {failed && (
          <p className="text-xs text-astro-danger">
            This could not be brought up to date ({failed}); it shows what was worked out before.{' '}
            <Button size="sm" variant="ghost" onClick={() => load()}>
              Try again
            </Button>
          </p>
        )}
        {view.totals.length > 0 && (
          <p className="text-xs text-astro-muted">Usable exposure on this mosaic, each frame counted once: {view.totals.map(t => `${t.filter} ${t.exposure}`).join(', ')}.</p>
        )}
        {!anyCovered ? (
          <EmptyState>
            Coverage is worked out from solved footprints only. Once captures on this grid are plate solved, this shows how much of each panel they cover and how deep.
          </EmptyState>
        ) : (
          <>
            {view.filters.length > 1 && (
              <label className="flex items-center gap-2">
                <span className="text-xs text-astro-muted">Heat map of</span>
                <Select value={filter} onChange={e => setFilter(e.target.value)} className="w-auto">
                  <option value={ALL}>All filters</option>
                  {view.filters.map(f => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <MosaicCanvas drawing={drawing} selected={panel} onSelect={id => setPanel(p => (p === id ? null : id))} heat={heat} />
            <p className="text-xs text-astro-muted">
              Stronger shading is deeper exposure; the warning colour marks sky inside a panel that no counted capture covers. A panel is covered at 95% of its area. Click a panel
              for what counts there.
            </p>
          </>
        )}

        <Table className="text-xs">
          <thead>
            <tr>
              <Th>Panel</Th>
              <Th>Coverage</Th>
              <Th>Depth</Th>
              <Th>Per filter</Th>
              <Th>Gaps</Th>
            </tr>
          </thead>
          <tbody>
            {view.panels.map(p => (
              <Tr
                key={p.panelId}
                className={`cursor-pointer ${p.panelId === panel ? 'bg-astro-accent/10' : ''}`}
                onClick={() => setPanel(x => (x === p.panelId ? null : p.panelId))}
              >
                <Td>{p.panelId}</Td>
                <Td className={STATE_CLASS[p.state]}>
                  {p.coverage}, {p.state}
                </Td>
                <Td className="text-astro-muted">{p.depth}</Td>
                <Td className="text-astro-muted">
                  {p.filters.length === 0
                    ? 'None yet'
                    : p.filters.map(f => (
                        <span key={f.filter} className={`mr-2 ${f.met === true ? 'text-astro-success' : ''}`}>
                          {f.filter} {f.have}
                          {f.goal ? ` of ${f.goal}` : ''}
                        </span>
                      ))}
                </Td>
                <Td className="text-astro-muted">{p.gaps.length === 0 ? 'None' : p.gaps.map(g => `${g.share} ${g.where}`).join('; ')}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>

        {chosen && chosen.gaps.length > 0 && (
          <ul className="text-xs list-disc pl-5 space-y-0.5">
            {chosen.gaps.map(g => (
              <li key={g.centre} className="text-astro-text">
                {chosen.panelId} has {g.share} uncovered {g.where}, centred on {g.centre}.
              </li>
            ))}
          </ul>
        )}

        {onPanel.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-astro-muted">{panel ? `What counts toward ${panel}` : 'What counts, capture by capture'}</summary>
            <ul className="mt-2 space-y-0.5">
              {onPanel.map(c => (
                <li key={c.id} className="text-astro-text">
                  {c.label}
                  {c.panelId ? ` on ${c.panelId}` : ''}: {c.exposure ?? 'adds no exposure'}
                  {c.note && <span className="text-astro-muted"> ({c.note})</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="space-y-2 border-t border-astro-border pt-3">
          <h3 className="text-sm font-medium text-astro-text">Next session</h3>
          {view.next.length === 0 ? (
            <p className="text-xs text-astro-muted">
              Every panel is covered
              {view.panels.some(p => p.goalsMet !== null) ? ' and meets its goals' : ''}.
            </p>
          ) : (
            <ol className="text-xs list-decimal pl-5 space-y-0.5">
              {view.next.map(n => (
                <li key={n.panelId} className="text-astro-text">
                  {n.panelId} at {n.aim}: {n.reason}
                </li>
              ))}
            </ol>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={view.next.length === 0} onClick={() => exportNext('csv')}>
              Export next session CSV
            </Button>
            <Button size="sm" disabled={view.next.length === 0} onClick={() => exportNext('json')}>
              Export next session JSON
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
