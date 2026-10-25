import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { Card, EmptyState } from '../components/common/Card'
import { invoke } from '../hooks/useIPC'
import { useToast } from '../contexts/ToastContext'
import { targetLink, workspaceLink, workspaceRevisionFrom } from '@shared/navigation'
import type { WorkspaceGridInput, WorkspaceSaveView, WorkspaceView } from '@shared/types'
import { GridWorkbench, PanelTable } from './MosaicWorkspaces'
import type { FlushCentre } from '../components/mosaic/GridEditor'

const input = 'px-2 py-1 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent'
const button = 'px-3 py-1.5 text-xs bg-astro-accent/10 text-astro-accent border border-astro-accent/30 rounded hover:bg-astro-accent/20 transition-colors disabled:opacity-50'

/** One mosaic: its grid at a revision, edited and saved as the next revision, its panels and exports. */
export function MosaicWorkspaceDetail(): React.ReactElement {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const wanted = workspaceRevisionFrom(useLocation().search)
  const [view, setView] = useState<WorkspaceView | null | undefined>(undefined)
  const [grid, setGrid] = useState<WorkspaceGridInput | null>(null)
  const [note, setNote] = useState('')
  const [problems, setProblems] = useState<string[]>([])
  const flushRef = useRef<FlushCentre | null>(null)
  const loading = useRef(0)

  const load = useCallback(async () => {
    // Only the newest request is shown, so a slow answer for another revision never replaces it.
    const mine = ++loading.current
    const v = await invoke<WorkspaceView | null>('workspace:get', { workspace_id: id, ...(wanted ? { revision: wanted } : {}) }).catch(() => null)
    if (mine !== loading.current) return
    setView(v)
    setGrid(v ? v.drawing.grid : null)
  }, [id, wanted])

  useEffect(() => {
    load()
  }, [load])

  if (view === undefined) return <PageContainer title="Mosaic">Loading…</PageContainer>
  if (view === null || !grid) {
    return (
      <PageContainer title="Mosaic">
        <EmptyState>This mosaic or revision no longer exists.</EmptyState>
      </PageContainer>
    )
  }

  const save = async () => {
    const typed = flushRef.current ? await flushRef.current() : grid
    if (!typed) return
    const result = await invoke<WorkspaceSaveView>('workspace:save', { workspace_id: view.id, grid: typed, note: note.trim() || null }).catch(() => null)
    if (!result) {
      addToast('The revision could not be saved.', 'error')
      return
    }
    setProblems(result.problems)
    addToast(result.message, result.ok ? 'success' : 'error')
    if (result.ok && result.revision) {
      setNote('')
      navigate(workspaceLink(view.id))
      if (!wanted) load()
    }
  }

  const exportAs = async (format: 'csv' | 'json') => {
    const result = await invoke<{ saved: boolean; path?: string }>('workspace:export', { workspace_id: view.id, format, revision: view.revision })
    if (result.saved) addToast(`Panels saved to ${result.path}`, 'success')
  }

  const archive = async () => {
    await invoke('workspace:archive', { workspace_id: view.id, archived: !view.archived })
    load()
  }

  return (
    <PageContainer
      title={view.name}
      actions={
        <div className="flex gap-2">
          <button onClick={() => exportAs('csv')} className={button}>
            Export CSV
          </button>
          <button onClick={() => exportAs('json')} className={button}>
            Export JSON
          </button>
          <button onClick={archive} className={button}>
            {view.archived ? 'Bring back' : 'Archive'}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <Card title={`Revision ${view.revision} of ${view.latestRevision}`}>
          <div className="space-y-2 text-sm">
            <p className="text-astro-text">
              {view.drawing.summary} {view.fieldFrom}.
              {view.targetId && (
                <>
                  {' '}
                  <Link to={targetLink(view.targetId)} className="text-astro-accent hover:underline">
                    Its target
                  </Link>
                  .
                </>
              )}
            </p>
            {view.note && <p className="text-xs text-astro-muted">{view.note}</p>}
            {view.revision !== view.latestRevision && (
              <p className="text-xs text-astro-warning">This is an earlier revision, kept as it was saved. Saving changes here makes revision {view.latestRevision + 1}.</p>
            )}
            {view.outlookNote && <p className="text-xs text-astro-muted">{view.outlookNote}</p>}
            <PanelTable drawing={view.drawing} />
            <div className="flex flex-wrap gap-2 pt-2">
              {view.revisions.map(r => (
                <Link
                  key={r.revision}
                  to={workspaceLink(view.id, r.revision)}
                  className={`text-xs ${r.revision === view.revision ? 'text-astro-text' : 'text-astro-accent hover:underline'}`}
                  title={r.note ?? undefined}
                >
                  Revision {r.revision}: {r.size}, {r.savedAt.slice(0, 10)}
                </Link>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Change the grid">
          <div className="space-y-4 text-sm">
            <GridWorkbench grid={grid} setGrid={setGrid} flushRef={flushRef} />
            {problems.length > 0 && (
              <ul className="text-sm text-astro-warning list-disc pl-5">
                {problems.map(p => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-astro-muted">What changed (optional)</span>
                <input value={note} onChange={e => setNote(e.target.value)} className={`${input} w-80`} />
              </label>
              <button onClick={save} className={button}>
                Save as revision {view.latestRevision + 1}
              </button>
              <button onClick={() => setGrid(view.drawing.grid)} className={button}>
                Undo changes
              </button>
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  )
}
