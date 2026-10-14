import React, { useEffect, useRef, useState } from 'react'
import { Card, EmptyState } from '../common/Card'
import { invoke } from '../../hooks/useIPC'
import type { IngestKindView, IngestPlanView, IngestProgressView, IngestScanView, IngestSessionView } from '@shared/types'

const KIND_LABEL: Record<IngestKindView, string> = { fits: 'FITS', tiff: 'TIFF', jpeg: 'JPEG', json: 'JSON' }
const LEVEL_COLOUR = { error: 'text-red-400', warn: 'text-yellow-400', info: 'text-astro-muted' } as const
const LEVEL_WORD = { error: 'Error', warn: 'Check', info: 'Note' } as const
const CONFIDENCE: Record<string, string> = {
  folder: 'from the folder name',
  'observation-json': 'from observation.json',
  exif: "from the stack's EXIF",
  'fits-header': 'from a FITS header',
  manual: 'named by you',
  unknown: 'not found'
}

function bytesText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let n = bytes / 1024
  let u = 0
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024
    u++
  }
  return `${n.toFixed(1)} ${units[u]}`
}

/** A session is ticked after a scan when it is an observation that can be copied and is not in the repository yet. */
const tickedByDefault = (s: IngestSessionView) => s.deepSky && s.transferable && s.job?.state !== 'done'

/**
 * On the Vespera (specs/034-vespera-ingest): every session on the scope with its counts and what
 * looks wrong, its target and why astrorepo thinks so, and one button that copies the ticked
 * sessions one after another, each into its target's folder under a folder named for what it holds,
 * such as M31/M31_2026-10-14_FIT=400_TIF=1. A paused copy carries on where it stopped.
 */
export function IngestPanel({ kinds }: { kinds: IngestKindView[] }): React.ReactElement {
  const [scan, setScan] = useState<IngestScanView | null>(null)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ targetFolder: string; folder: string | null } | null>(null)
  const [typed, setTyped] = useState('')
  const [progress, setProgress] = useState<IngestProgressView | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showOthers, setShowOthers] = useState(false)

  const sessions = scan?.ok ? scan.sessions : []
  const replace = (view: IngestSessionView) => setScan(s => (s?.ok ? { ...s, sessions: s.sessions.map(x => (x.id === view.id ? view : x)) } : s))

  /** Runs a call to the main process; anything it throws is said on the card, not lost. */
  async function attempt(call: () => Promise<void>): Promise<void> {
    try {
      await call()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function rescan(): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      await attempt(async () => {
        const s = await invoke<IngestScanView>('vespera-ingest:scan')
        setScan(s)
        if (s.ok) setPicked(new Set(s.sessions.filter(tickedByDefault).map(x => x.id)))
      })
    } finally {
      setBusy(false)
    }
  }

  // A copy started before the page was opened is followed from the start.
  const wasRunning = useRef(false)
  const loadProgress = (): void => {
    invoke<IngestProgressView | null>('vespera-ingest:progress')
      .then(p => {
        // When a copy ends, the scope is read again so each row shows what is now in the repository.
        if (wasRunning.current && !p?.running) void rescan()
        wasRunning.current = p?.running ?? false
        setProgress(p)
      })
      .catch(() => undefined)
  }
  const poll = useRef(loadProgress)
  useEffect(() => {
    poll.current = loadProgress
  })
  useEffect(() => poll.current(), [])

  const running = progress?.running ?? false
  const following = running || (progress?.indexing ?? '').endsWith('…')
  useEffect(() => {
    if (!following) return
    const timer = setInterval(() => poll.current(), 1000)
    return () => clearInterval(timer)
  }, [following])

  // The folder names are shown read-only, and follow the target and the kinds in Connection.
  const currentId = sessions.find(s => s.id === open)?.id ?? null
  const currentTarget = sessions.find(s => s.id === open)?.target.name ?? null
  const kindsKey = kinds.join(',')
  useEffect(() => {
    if (!currentId) return setPreview(null)
    invoke<{ targetFolder: string; folder: string | null }>('vespera-ingest:preview', { session_id: currentId })
      .then(setPreview)
      .catch(() => setPreview(null))
  }, [currentId, currentTarget, kindsKey])

  const identify = (id: string) =>
    attempt(async () => {
      replace(await invoke<IngestSessionView>('vespera-ingest:identify', { session_id: id }))
    })

  const rename = (id: string) =>
    attempt(async () => {
      if (typed.trim() === '') return
      const view = await invoke<IngestSessionView>('vespera-ingest:name', { session_id: id, name: typed.trim() })
      replace(view)
      if (view.transferable) setPicked(prev => new Set(prev).add(id))
      setTyped('')
    })

  const started = (r: IngestPlanView) => {
    setMessage(r.status === 'blocked' ? r.reason : null)
    wasRunning.current = r.status === 'started'
    loadProgress()
  }

  const transfer = (ids: string[], allowDuplicate = false) =>
    attempt(async () => started(await invoke<IngestPlanView>('vespera-ingest:transfer', { session_ids: ids, allow_duplicate: allowDuplicate })))

  const resume = (jobId: string) => attempt(async () => started(await invoke<IngestPlanView>('vespera-ingest:resume', { job_id: jobId })))

  const toggle = (id: string) =>
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const shown = showOthers ? sessions : sessions.filter(s => s.deepSky)
  const chosen = sessions.filter(s => picked.has(s.id) && s.transferable)
  const chosenBytes = chosen.reduce((n, s) => n + s.transferBytes, 0)
  const freeBytes = scan?.ok ? scan.freeBytes : null
  const short = freeBytes !== null && Math.ceil(chosenBytes * 1.01) > freeBytes
  const kindsText = kinds.length > 0 ? kinds.map(k => KIND_LABEL[k]).join(' and ') : 'nothing'

  return (
    <Card
      title="On the Vespera"
      action={
        <button onClick={() => void rescan()} disabled={busy || running} className="px-3 py-1 bg-astro-accent text-white text-xs rounded hover:bg-astro-accent/80 disabled:opacity-50">
          {busy ? 'Scanning…' : 'Scan the scope'}
        </button>
      }
    >
      {!scan && <EmptyState>Scan the scope to see each session's counts and what is already on the PC before anything is copied.</EmptyState>}
      {scan && !scan.ok && <p className="text-sm text-red-400">{scan.error}</p>}
      {scan?.ok && (
        <>
          <p className="text-sm text-astro-text">{scan.summary}</p>
          {!scan.destinationRoot && <p className="text-xs text-red-400 mt-1">Choose where copies land above before copying.</p>}
          {scan.expertMode && <p className="text-xs text-astro-muted mt-1">Expert-mode darks are on the scope; they are listed, never copied.</p>}
          <label className="flex items-center gap-2 text-xs text-astro-muted mt-2">
            <input type="checkbox" checked={showOthers} onChange={() => setShowOthers(v => !v)} />
            Show auto-init, sun and other sessions
          </label>
          <table className="w-full text-xs mt-3">
            <thead className="text-astro-muted text-left">
              <tr>
                <th className="font-normal w-6" />
                <th className="font-normal py-1">When</th>
                <th className="font-normal">Target</th>
                <th className="font-normal text-right">FITS</th>
                <th className="font-normal text-right">TIFF</th>
                <th className="font-normal text-right">JPEG</th>
                <th className="font-normal text-right">To copy</th>
                <th className="font-normal pl-3">State</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(s => (
                <React.Fragment key={s.id}>
                  <tr className="border-t border-astro-border cursor-pointer hover:bg-astro-bg" onClick={() => {
                      // A name typed for one session is not carried to the next one opened.
                      setTyped('')
                      setOpen(open === s.id ? null : s.id)
                    }}>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={picked.has(s.id)} disabled={!s.transferable || running} onChange={() => toggle(s.id)} />
                    </td>
                    <td className="py-1.5 text-astro-text" title={s.id}>{s.when ?? s.id}</td>
                    <td className="text-astro-text">
                      {s.target.name}
                      {s.target.review && <span className="text-yellow-400"> ?</span>}
                    </td>
                    <td className="text-right">{s.counts.fits}</td>
                    <td className="text-right">{s.counts.tiff}</td>
                    <td className="text-right">{s.counts.jpeg}</td>
                    <td className="text-right text-astro-muted">{s.transferSize}</td>
                    <td className="pl-3">
                      {s.job?.state === 'done' ? (
                        <span className="text-green-400">In the repository</span>
                      ) : s.job?.state === 'paused' || s.job?.state === 'failed' ? (
                        <span className="text-yellow-400">Copy {s.job.state}</span>
                      ) : s.worst ? (
                        <span className={LEVEL_COLOUR[s.worst]}>{LEVEL_WORD[s.worst]}</span>
                      ) : (
                        <span className="text-astro-muted">Ready</span>
                      )}
                    </td>
                  </tr>
                  {open === s.id && (
                    <tr>
                      <td colSpan={8} className="pb-3">
                        <div className="bg-astro-bg rounded p-3 space-y-2">
                          <p className="text-astro-muted">
                            Target {s.target.name}, {CONFIDENCE[s.target.confidence] ?? s.target.confidence}
                            {s.target.evidence.length > 0 && <span title={s.target.evidence.join('\n')}> (why)</span>}
                          </p>
                          <div className="flex gap-2 items-center">
                            <input
                              value={typed}
                              onChange={e => setTyped(e.target.value)}
                              placeholder="Name the target, e.g. M 31 or Jellyfish Nebula"
                              className="flex-1 px-2 py-1 bg-astro-surface border border-astro-border rounded text-xs text-astro-text focus:outline-none focus:border-astro-accent"
                            />
                            <button onClick={() => void rename(s.id)} disabled={running} className="px-2 py-1 border border-astro-border rounded text-astro-text hover:border-astro-accent disabled:opacity-50">
                              Use this name
                            </button>
                            <button onClick={() => void identify(s.id)} disabled={running} className="px-2 py-1 border border-astro-border rounded text-astro-text hover:border-astro-accent disabled:opacity-50" title="Reads observation.json, then the stack's EXIF, then a FITS header">
                              Check the scope's metadata
                            </button>
                          </div>
                          {s.runs.map(r => (
                            <p key={r.folder} className="text-astro-muted">
                              {r.folder}: {r.fits} FITS, {r.tiff} TIFF, {r.jpeg} JPEG, {r.json} JSON{r.other > 0 ? `, ${r.other} other` : ''}
                            </p>
                          ))}
                          {s.findings.map((f, i) => (
                            <p key={i} className={LEVEL_COLOUR[f.level]}>
                              {LEVEL_WORD[f.level]}: {f.message}
                            </p>
                          ))}
                          {preview?.folder && scan.destinationRoot && (
                            <p className="text-astro-muted break-all">
                              Copies {kindsText} into {scan.destinationRoot} / {preview.targetFolder} / <span className="text-astro-text">{preview.folder}</span>
                            </p>
                          )}
                          {s.job && (s.job.state === 'paused' || s.job.state === 'failed') && (
                            <button onClick={() => void resume(s.job!.id)} disabled={running} className="px-3 py-1 bg-astro-accent text-white rounded hover:bg-astro-accent/80 disabled:opacity-50">
                              Resume
                            </button>
                          )}
                          {s.job?.state === 'done' && s.job.manifestPath && <p className="text-green-400 break-all">Copied and checked: {s.job.manifestPath}</p>}
                          {s.job?.reason && s.job.state !== 'done' && <p className="text-yellow-400">{s.job.reason}</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <EmptyState>The scope holds no observations.</EmptyState>}
          <div className="flex items-center justify-between gap-3 mt-3">
            <p className={`text-xs ${short ? 'text-red-400' : 'text-astro-muted'}`}>
              {chosen.length === 0
                ? 'Tick the sessions to copy.'
                : `${chosen.length} ${chosen.length === 1 ? 'session' : 'sessions'}, ${bytesText(chosenBytes)} of ${kindsText}`}
              {chosen.length > 0 && freeBytes !== null && (short ? `; ${bytesText(Math.ceil(chosenBytes * 1.01) - freeBytes)} more room is needed where copies land.` : `; ${bytesText(freeBytes)} free where copies land.`)}
            </p>
            <button
              onClick={() => void transfer(chosen.map(s => s.id))}
              disabled={running || chosen.length === 0 || kinds.length === 0 || !scan.destinationRoot || short}
              className="px-3 py-1 bg-astro-accent text-white text-xs rounded hover:bg-astro-accent/80 disabled:opacity-50 shrink-0"
            >
              Copy selected
            </button>
          </div>
        </>
      )}
      {message && <p className="text-xs text-red-400 mt-2">{message}</p>}
      {progress && (
        <div className="mt-4 border-t border-astro-border pt-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-astro-text">{progress.headline}</p>
            {running && (
              <button onClick={() => void invoke('vespera-ingest:pause').then(loadProgress)} className="px-2 py-1 text-xs border border-astro-border rounded text-astro-text hover:border-astro-accent">
                Pause
              </button>
            )}
          </div>
          {running && (
            <div className="h-2 bg-astro-bg rounded mt-2 overflow-hidden">
              <div className="h-full bg-astro-accent" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
            </div>
          )}
          {progress.detail && <p className="text-xs text-astro-muted mt-1">{progress.detail}</p>}
          {running && progress.current && <p className="text-xs text-astro-muted mt-1 break-all">{progress.current}</p>}
          {progress.outcomes.map(o => (
            <div key={o.sessionId} className="flex items-baseline justify-between gap-3 mt-1">
              <p className={`text-xs ${o.level === 'info' ? 'text-green-400' : LEVEL_COLOUR[o.level]}`}>{o.message}</p>
              {o.refused && !running && (
                <button onClick={() => void transfer([o.sessionId], true)} className="px-2 py-1 text-xs border border-astro-border rounded text-astro-text hover:border-astro-accent shrink-0">
                  Use the next free name
                </button>
              )}
            </div>
          ))}
          {progress.indexing && <p className="text-xs text-astro-muted mt-1">{progress.indexing}</p>}
        </div>
      )}
    </Card>
  )
}
