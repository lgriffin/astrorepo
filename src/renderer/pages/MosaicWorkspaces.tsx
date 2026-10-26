import React, { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { Card, EmptyState } from '../components/common/Card'
import { GridEditor, type FlushCentre } from '../components/mosaic/GridEditor'
import { MosaicCanvas } from '../components/mosaic/MosaicCanvas'
import { invoke } from '../hooks/useIPC'
import { useToast } from '../contexts/ToastContext'
import { workspaceLink } from '@shared/navigation'
import type { TargetSummary, TargetGeometryView, WorkspaceDrawingView, WorkspaceGridInput, WorkspaceSaveView, WorkspaceSummaryView } from '@shared/types'

const input = 'px-2 py-1 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent'
const button = 'px-3 py-1.5 text-xs bg-astro-accent/10 text-astro-accent border border-astro-accent/30 rounded hover:bg-astro-accent/20 transition-colors disabled:opacity-50'

/** A Seestar-sized 2 × 2 over M 31 to start from; the editor changes everything. */
const STARTING_GRID: WorkspaceGridInput = {
  ra_deg: 10.6847,
  dec_deg: 41.2688,
  position_angle_deg: 0,
  rows: 2,
  columns: 2,
  overlap_x: 0.15,
  overlap_y: 0.15,
  field_width_deg: 0.72,
  field_height_deg: 1.28,
  field_source: 'manual',
  field_label: null
}

/** The grid laid out by the core whenever it changes; answers for a grid no longer current are dropped. */
export function useDrawing(grid: WorkspaceGridInput | null): [WorkspaceDrawingView | null, (move: { drag?: { x_deg: number; y_deg: number }; shift?: { right_deg: number; up_deg: number } }) => Promise<WorkspaceGridInput | null>] {
  const [drawing, setDrawing] = useState<WorkspaceDrawingView | null>(null)
  useEffect(() => {
    if (!grid) return
    let current = true
    invoke<WorkspaceDrawingView>('workspace:preview', { grid })
      .then(d => current && setDrawing(d))
      .catch(() => current && setDrawing(null))
    return () => {
      current = false
    }
  }, [grid])
  const move = useCallback(
    async (m: { drag?: { x_deg: number; y_deg: number }; shift?: { right_deg: number; up_deg: number } }) => {
      if (!grid) return null
      const d = await invoke<WorkspaceDrawingView>('workspace:preview', { grid, ...m })
      return d.grid
    },
    [grid]
  )
  return [drawing, move]
}

export function PanelTable({ drawing }: { drawing: WorkspaceDrawingView }): React.ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-astro-muted border-b border-astro-border">
            <th className="py-1 pr-3 font-medium">Panel</th>
            <th className="py-1 pr-3 font-medium">RA</th>
            <th className="py-1 pr-3 font-medium">Dec</th>
            <th className="py-1 pr-3 font-medium">Position angle</th>
            <th className="py-1 font-medium">Coming nights</th>
          </tr>
        </thead>
        <tbody>
          {drawing.panels.map(p => (
            <tr key={p.id} className="border-b border-astro-border/50">
              <td className="py-1 pr-3 text-astro-text">{p.id}</td>
              <td className="py-1 pr-3 text-astro-text font-mono">{p.ra}</td>
              <td className="py-1 pr-3 text-astro-text font-mono">{p.dec}</td>
              <td className="py-1 pr-3 text-astro-muted">{p.positionAngle}</td>
              <td className="py-1 text-astro-muted">{p.outlook ?? 'Not checked'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The grid editor beside the drawing it lays out, shared by a new mosaic and a saved one. */
export function GridWorkbench({ grid, setGrid, flushRef }: { grid: WorkspaceGridInput; setGrid: (g: WorkspaceGridInput) => void; flushRef?: MutableRefObject<FlushCentre | null> }): React.ReactElement {
  const [drawing, move] = useDrawing(grid)
  const [selected, setSelected] = useState<string | null>(null)
  const latest = useRef(grid)
  useEffect(() => {
    latest.current = grid
  }, [grid])
  const apply = async (m: Parameters<typeof move>[0]) => {
    const sent = grid
    const next = await move(m).catch(() => null)
    // A move answered after another edit would undo that edit, so it is dropped.
    if (next && latest.current === sent) setGrid(next)
  }
  return (
    <div className="space-y-4">
      <GridEditor grid={grid} onChange={setGrid} onShift={(right, up) => apply({ shift: { right_deg: right, up_deg: up } })} flushRef={flushRef} />
      {drawing && !drawing.ok && (
        <ul className="text-sm text-astro-warning list-disc pl-5">
          {drawing.problems.map(p => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {drawing?.ok && (
        <>
          <p className="text-astro-text text-sm">
            Centred on <span className="font-mono">{drawing.centre}</span>. {drawing.summary}
          </p>
          <MosaicCanvas drawing={drawing} selected={selected} onSelect={setSelected} onDrag={(x, y) => apply({ drag: { x_deg: x, y_deg: y } })} />
          <p className="text-xs text-astro-muted">Drag the grid to move it, or use the buttons. North is up and east is on the left, as the sky is seen.</p>
        </>
      )}
    </div>
  )
}

/** Mosaics (specs/037-mosaic-workspace): every saved mosaic, and a new one drawn on the sky. */
export function MosaicWorkspaces(): React.ReactElement {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [list, setList] = useState<WorkspaceSummaryView[] | null>(null)
  const [name, setName] = useState('')
  const [grid, setGrid] = useState<WorkspaceGridInput>(STARTING_GRID)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<TargetSummary[]>([])
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null)
  const [solves, setSolves] = useState<TargetGeometryView['solves']>([])
  const [problems, setProblems] = useState<string[]>([])
  const flushRef = useRef<FlushCentre | null>(null)
  const picking = useRef(0)

  useEffect(() => {
    invoke<WorkspaceSummaryView[]>('workspace:list')
      .then(setList)
      .catch(() => setList([]))
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) {
      setMatches([])
      return
    }
    let current = true
    invoke<{ targets: TargetSummary[] }>('targets:search', { query, limit: 8 })
      .then(r => current && setMatches(r.targets))
      .catch(() => current && setMatches([]))
    return () => {
      current = false
    }
  }, [query])

  const pick = async (t: TargetSummary) => {
    // Answers for a target picked before this one are dropped, so two targets never mix.
    const mine = ++picking.current
    setQuery('')
    setMatches([])
    setTarget({ id: t.id, name: t.canonicalName })
    setSolves([])
    if (!name) setName(`${t.canonicalName} mosaic`)
    const [detail, geometry] = await Promise.all([
      invoke<{ raHours: number | null; decDegrees: number | null } | null>('targets:get', { id: t.id }).catch(() => null),
      invoke<TargetGeometryView | null>('sky:target-geometry', { target_id: t.id }).catch(() => null)
    ])
    if (mine !== picking.current) return
    if (detail?.raHours !== null && detail?.raHours !== undefined && detail.decDegrees !== null) {
      setGrid(g => ({ ...g, ra_deg: (detail.raHours as number) * 15, dec_deg: detail.decDegrees as number }))
    }
    setSolves((geometry?.solves ?? []).filter(s => s.solved))
  }

  const fromSolve = async (path: string) => {
    const g = await invoke<WorkspaceGridInput | null>('workspace:from-solve', { path })
    if (g) setGrid(g)
  }

  const fromPlanner = async () => {
    if (!target) return
    const result = await invoke<WorkspaceSaveView>('workspace:from-target', { target_id: target.id })
    if (result.ok && result.workspaceId) navigate(workspaceLink(result.workspaceId))
    else setProblems(result.problems)
  }

  const create = async () => {
    const typed = flushRef.current ? await flushRef.current() : grid
    if (!typed) return
    const result = await invoke<WorkspaceSaveView>('workspace:create', { name, target_id: target?.id ?? null, grid: typed }).catch(() => null)
    if (!result) addToast('The mosaic could not be saved.', 'error')
    else if (result.ok && result.workspaceId) {
      addToast(result.message, 'success')
      navigate(workspaceLink(result.workspaceId))
    } else setProblems(result.problems)
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <Card title="Your mosaics">
          {list === null ? (
            <p className="text-sm text-astro-muted">Loading…</p>
          ) : list.length === 0 ? (
            <EmptyState>No mosaic saved yet. Draw one below: its panels keep their coordinates as you revise it.</EmptyState>
          ) : (
            <ul className="divide-y divide-astro-border/50 text-sm">
              {list.map(w => (
                <li key={w.id} className="py-2 flex items-center justify-between gap-3">
                  <Link to={workspaceLink(w.id)} className="text-astro-accent hover:underline">
                    {w.name}
                  </Link>
                  <span className="text-xs text-astro-muted">
                    {w.size}, revision {w.revision}
                    {w.archived ? ', archived' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="New mosaic">
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-astro-muted">Name</span>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Cygnus North America" className={`${input} w-64`} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-astro-muted">Start from a target</span>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder={target?.name ?? 'Search by name'} className={input} />
              </label>
              {target && (
                <button onClick={fromPlanner} className={button} title="Use the grid the Sky planner proposes or saved for this target">
                  Open its Sky planner plan
                </button>
              )}
            </div>
            {matches.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {matches.map(t => (
                  <button key={t.id} onClick={() => pick(t)} className={button}>
                    {t.canonicalName}
                  </button>
                ))}
              </div>
            )}
            {solves.length > 0 && (
              <div className="text-xs text-astro-muted">
                <p>Or start from where one of its solved files points:</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {solves.slice(0, 8).map(s => (
                    <button key={s.path} onClick={() => fromSolve(s.path)} className={button} title={s.centre ?? undefined}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <GridWorkbench grid={grid} setGrid={setGrid} flushRef={flushRef} />

            {problems.length > 0 && (
              <ul className="text-sm text-astro-warning list-disc pl-5">
                {problems.map(p => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <button onClick={create} className={button}>
              Save as revision 1
            </button>
          </div>
        </Card>
      </div>
    </PageContainer>
  )
}
