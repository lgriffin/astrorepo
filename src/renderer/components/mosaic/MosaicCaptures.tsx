import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState } from '../common/Card'
import { MosaicCanvas } from './MosaicCanvas'
import { invoke } from '../../hooks/useIPC'
import { useToast } from '../../contexts/ToastContext'
import { targetLink } from '@shared/navigation'
import type { SolveQueuedView, WorkspaceCaptureView, WorkspaceCapturesView, WorkspaceDrawingView } from '@shared/types'

const input = 'px-2 py-1 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent'
const small = 'px-2 py-1 text-xs bg-astro-accent/10 text-astro-accent border border-astro-accent/30 rounded hover:bg-astro-accent/20 transition-colors disabled:opacity-50'

const STATE_TEXT: Record<WorkspaceCaptureView['state'], string> = {
  accepted: 'Accepted',
  'needs-review': 'To review',
  conflict: 'Conflict',
  excluded: 'Left out'
}

const STATE_CLASS: Record<WorkspaceCaptureView['state'], string> = {
  accepted: 'text-emerald-400',
  'needs-review': 'text-amber-400',
  conflict: 'text-red-400',
  excluded: 'text-astro-muted'
}

/** Thumbnails drawn on the canvas at most; the rest show as outlines. */
const MAX_THUMBNAILS = 40

interface MosaicCapturesProps {
  workspaceId: string
  revision: number
  drawing: WorkspaceDrawingView
  /** Panel ids of the latest revision, the only ones a capture can be put on. */
  latestPanels: string[]
}

/**
 * Captures on a mosaic revision (specs/037-mosaic-workspace, X2): each solved light group and
 * master at its footprint over the panels, coloured by its review state, with the panels it meets.
 * A capture can be put on a panel by hand or left out; that is kept apart and shown as dashed.
 * Captures not solved yet, outside the grid or gone from the index have their own trays.
 */
export function MosaicCaptures({ workspaceId, revision, drawing, latestPanels }: MosaicCapturesProps): React.ReactElement {
  const { addToast } = useToast()
  const [view, setView] = useState<WorkspaceCapturesView | null | undefined>(undefined)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [panel, setPanel] = useState<string | null>(null)
  const [capture, setCapture] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const loading = useRef(0)
  // Thumbnails asked for already, so a reload after a change does not fetch them again.
  const asked = useRef(new Set<string>())

  const load = useCallback(async () => {
    const mine = ++loading.current
    const v = await invoke<WorkspaceCapturesView | null>('workspace:captures', { workspace_id: workspaceId, revision }).catch(() => null)
    if (mine === loading.current) setView(v)
  }, [workspaceId, revision])

  useEffect(() => {
    load()
  }, [load])

  // Thumbnails, one at a time so a large mosaic does not flood the main process.
  useEffect(() => {
    if (!view) return
    let current = true
    const room = MAX_THUMBNAILS - asked.current.size
    const wanted = [...new Set(view.placed.map(c => c.fileId).filter((id): id is string => !!id && !asked.current.has(id)))].slice(0, Math.max(0, room))
    ;(async () => {
      for (const fileId of wanted) {
        if (!current) return
        asked.current.add(fileId)
        const t = await invoke<{ dataBase64: string } | null>('fits:get-thumbnail', { file_id: fileId }).catch(() => null)
        if (current && t) setThumbnails(all => ({ ...all, [fileId]: `data:image/png;base64,${t.dataBase64}` }))
      }
    })()
    return () => {
      current = false
    }
  }, [view])

  const change = async (captureId: string, body: { action: 'assign'; panel_id: string; reason?: string | null } | { action: 'exclude'; reason?: string | null } | { action: 'clear' }) => {
    setBusy(true)
    try {
      const result = await invoke<{ ok: boolean; reason?: string }>('workspace:assign', { workspace_id: workspaceId, capture_id: captureId, ...body })
      if (!result.ok) addToast(result.reason ?? 'That could not be changed.', 'error')
      await load()
    } catch (error) {
      addToast(`That could not be changed: ${error instanceof Error ? error.message : String(error)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const solve = async (targetId: string) => {
    try {
      const result = await invoke<SolveQueuedView>('sky:solve-target', { target_id: targetId })
      addToast(result.message, result.queued ? 'success' : 'info')
      await load()
    } catch (error) {
      addToast(`Plate solving could not be queued: ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  if (view === undefined) return <Card title="Captures on this revision">Loading…</Card>
  if (view === null) return <Card title="Captures on this revision">This revision no longer exists.</Card>

  const all = [...view.placed, ...view.outside]
  const chosen = all.find(c => c.id === capture) ?? null
  const onPanel = panel ? view.placed.filter(c => c.panelId === panel || c.panels.some(p => p.panelId === panel)) : []
  const shown = panel ? onPanel : view.placed
  const unsolvedTargets = [...new Set(view.unsolved.map(u => u.targetId))]

  return (
    <Card title="Captures on this revision">
      <div className="space-y-4 text-sm">
        <p className="text-astro-text">{view.summary}</p>
        {view.placed.length === 0 && view.outside.length === 0 ? (
          <EmptyState>
            Captures appear here once their lights or masters are plate solved: each is placed by where its solved field overlaps the panels, never by file name.
          </EmptyState>
        ) : (
          <>
            <MosaicCanvas
              drawing={drawing}
              selected={panel}
              onSelect={id => setPanel(p => (p === id ? null : id))}
              captures={all}
              thumbnails={thumbnails}
              selectedCapture={capture}
              onSelectCapture={id => setCapture(c => (c === id ? null : id))}
            />
            <p className="text-xs text-astro-muted">
              Green is placed, amber needs a look, red is a hand placement its footprint does not reach, grey is left out; dashed outlines were placed by hand. Click a panel to list what
              falls on it, or a capture to place it.
            </p>
          </>
        )}

        {chosen && <CaptureInspector capture={chosen} panels={latestPanels} busy={busy} latest={view.revision === view.latestRevision} onChange={body => change(chosen.id, body)} />}

        {shown.length > 0 && (
          <div className="overflow-x-auto">
            <p className="text-xs text-astro-muted mb-1">{panel ? `On or overlapping ${panel}` : 'Placed captures'}</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-astro-muted border-b border-astro-border">
                  <th className="py-1 pr-3 font-medium">Capture</th>
                  <th className="py-1 pr-3 font-medium">Panel</th>
                  <th className="py-1 pr-3 font-medium">Overlaps</th>
                  <th className="py-1 pr-3 font-medium">Exposure</th>
                  <th className="py-1 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(c => (
                  <tr key={c.id} className={`border-b border-astro-border/50 cursor-pointer ${c.id === capture ? 'bg-astro-accent/10' : ''}`} onClick={() => setCapture(c.id)}>
                    <td className="py-1 pr-3 text-astro-text">{c.label}</td>
                    <td className="py-1 pr-3 text-astro-text">{c.panelId ?? 'None'}</td>
                    <td className="py-1 pr-3 text-astro-muted">{c.panels.map(p => `${p.panelId} ${p.share}`).join(', ')}</td>
                    <td className="py-1 pr-3 text-astro-muted">
                      {c.exposure ?? 'Unknown'}
                      {c.filters.length > 0 ? `, ${c.filters.join(' ')}` : ''}
                    </td>
                    <td className={`py-1 ${STATE_CLASS[c.state]}`} title={c.note ?? undefined}>
                      {STATE_TEXT[c.state]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view.unsolved.length > 0 && (
          <Tray title={`Not solved yet (${view.unsolved.length})`}>
            <p className="text-xs text-astro-muted">
              These have no position, so they are not placed on any panel. Plate solve them to place them; solving runs in Jobs, so check again when it has finished.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className={small} onClick={() => load()}>
                Check again
              </button>
              {unsolvedTargets.map(t => (
                <button key={t} className={small} onClick={() => solve(t)}>
                  Plate solve {t}
                </button>
              ))}
            </div>
            <ul className="text-xs space-y-0.5">
              {view.unsolved.slice(0, 30).map(u => (
                <li key={u.id} className="text-astro-text">
                  {u.label}
                  {u.solveError && <span className="text-amber-400">: {u.solveError}</span>}
                  {' '}
                  <Link to={targetLink(u.targetId)} className="text-astro-accent hover:underline">
                    target
                  </Link>
                </li>
              ))}
            </ul>
          </Tray>
        )}

        {view.outside.length > 0 && (
          <Tray title={`Outside the grid (${view.outside.length})`}>
            <p className="text-xs text-astro-muted">Solved captures of this mosaic's targets whose fields meet no panel. Click one to put it on a panel by hand.</p>
            <ul className="text-xs space-y-0.5">
              {view.outside.map(c => (
                <li key={c.id}>
                  <button className="text-astro-accent hover:underline text-left" onClick={() => setCapture(c.id)}>
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </Tray>
        )}

        {view.missing.length > 0 && (
          <Tray title={`No longer in the index (${view.missing.length})`}>
            <p className="text-xs text-astro-muted">What you said about these is kept in case the files come back. Clear it to forget it.</p>
            <ul className="text-xs space-y-1">
              {view.missing.map(m => (
                <li key={m.captureId} className="flex flex-wrap items-center gap-2">
                  <span className="text-astro-text break-all" title={m.captureId}>
                    {m.label}
                  </span>
                  <span className="text-astro-muted">
                    {m.said}
                    {m.reason ? ` (${m.reason})` : ''}
                    {m.lastCentre ? `, last solved at ${m.lastCentre}` : ''}
                  </span>
                  <button className={small} disabled={busy} onClick={() => change(m.captureId, { action: 'clear' })}>
                    Clear
                  </button>
                </li>
              ))}
            </ul>
          </Tray>
        )}
      </div>
    </Card>
  )
}

function Tray({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="space-y-2 border-t border-astro-border pt-3">
      <h3 className="text-sm font-medium text-astro-text">{title}</h3>
      {children}
    </div>
  )
}

function CaptureInspector({
  capture,
  panels,
  busy,
  latest,
  onChange
}: {
  capture: WorkspaceCaptureView
  panels: string[]
  busy: boolean
  latest: boolean
  onChange: (body: { action: 'assign'; panel_id: string; reason?: string | null } | { action: 'exclude'; reason?: string | null } | { action: 'clear' }) => void
}): React.ReactElement {
  const [target, setTarget] = useState(capture.panelId ?? capture.primary ?? panels[0] ?? '')
  const [reason, setReason] = useState(capture.reason ?? '')

  useEffect(() => {
    setTarget(capture.panelId ?? capture.primary ?? panels[0] ?? '')
    setReason(capture.reason ?? '')
    // Keyed on the panel ids, not the array, so a re-render of the page keeps what was typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture.id, capture.panelId, capture.primary, capture.reason, panels.join(',')])

  return (
    <div className="space-y-2 rounded border border-astro-border p-3">
      <p className="text-astro-text">
        {capture.label}: <span className={STATE_CLASS[capture.state]}>{STATE_TEXT[capture.state]}</span>
        {capture.source === 'user-override' ? ', placed by hand' : ''}
      </p>
      {capture.note && <p className="text-xs text-astro-muted">{capture.note}</p>}
      <p className="text-xs text-astro-muted">
        {capture.panels.length === 0
          ? 'Its solved field meets no panel.'
          : capture.panels.map(p => `${p.share} of it falls in ${p.panelId}, covering ${p.coverage} of that panel`).join('; ') + '.'}
      </p>
      {latest ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-astro-muted">Panel</span>
            <select value={target} onChange={e => setTarget(e.target.value)} className={input}>
              {panels.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-astro-muted">Why (optional)</span>
            <input value={reason} onChange={e => setReason(e.target.value)} className={`${input} w-64`} />
          </label>
          <button className={small} disabled={busy || !target} onClick={() => onChange({ action: 'assign', panel_id: target, reason: reason.trim() || null })}>
            Put on {target || 'a panel'}
          </button>
          <button className={small} disabled={busy} onClick={() => onChange({ action: 'exclude', reason: reason.trim() || null })}>
            Leave out
          </button>
          {capture.source === 'user-override' && (
            <button className={small} disabled={busy} onClick={() => onChange({ action: 'clear' })}>
              Use the computed panel
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-astro-muted">Captures are placed by hand on the latest revision.</p>
      )}
    </div>
  )
}
