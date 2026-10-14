import React, { useEffect, useState } from 'react'
import { Card, EmptyState } from '../common/Card'
import { invoke } from '../../hooks/useIPC'
import type { IngestJobView, IngestKindView, IngestPlanView, IngestScanView, IngestSessionView } from '@shared/types'

const KINDS: { id: IngestKindView; label: string }[] = [
  { id: 'fits', label: 'FITS' },
  { id: 'tiff', label: 'TIFF' },
  { id: 'jpeg', label: 'JPEG' },
  { id: 'json', label: 'JSON' }
]

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

/**
 * Review and transfer (specs/034-vespera-ingest): every session on the scope with its counts and
 * what looks wrong, its target and why astrorepo thinks so, and one button that copies it into a
 * folder named for what it holds, such as M31_2026-10-14_FIT=400. Paused copies carry on.
 */
export function IngestPanel(): React.ReactElement {
  const [scan, setScan] = useState<IngestScanView | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [include, setInclude] = useState<IngestKindView[]>(['fits'])
  const [preview, setPreview] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [progress, setProgress] = useState<IngestJobView | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showOthers, setShowOthers] = useState(false)

  const sessions = scan?.ok ? scan.sessions : []
  const replace = (view: IngestSessionView) => setScan(s => (s?.ok ? { ...s, sessions: s.sessions.map(x => (x.id === view.id ? view : x)) } : s))

  async function rescan(): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      setScan(await invoke<IngestScanView>('vespera-ingest:scan'))
    } finally {
      setBusy(false)
    }
  }

  // The folder name is shown read-only, and follows the target and the kinds chosen.
  const currentId = sessions.find(s => s.id === open)?.id ?? null
  const currentTarget = sessions.find(s => s.id === open)?.target.name ?? null
  useEffect(() => {
    if (!currentId) return setPreview(null)
    invoke<{ folder: string | null }>('vespera-ingest:preview', { session_id: currentId, include })
      .then(r => setPreview(r.folder))
      .catch(() => setPreview(null))
  }, [currentId, currentTarget, include])

  // Follows a running transfer, then reads the scope again so each row shows what is in the repository.
  const running = progress !== null && (progress.state === 'running' || progress.state === 'verifying' || progress.state === 'planned')
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      invoke<IngestJobView | null>('vespera-ingest:progress').then(p => {
        setProgress(p)
        if (!p) void rescan()
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [running])

  async function identify(id: string): Promise<void> {
    replace(await invoke<IngestSessionView>('vespera-ingest:identify', { session_id: id }))
  }

  async function rename(id: string): Promise<void> {
    if (typed.trim() === '') return
    replace(await invoke<IngestSessionView>('vespera-ingest:name', { session_id: id, name: typed.trim() }))
    setTyped('')
  }

  async function transfer(id: string, allowDuplicate = false): Promise<void> {
    const r = await invoke<IngestPlanView>('vespera-ingest:transfer', { session_id: id, include, allow_duplicate: allowDuplicate })
    if ('job' in r) {
      setMessage(null)
      setProgress(r.job)
    } else setMessage('message' in r ? r.message : r.reason)
  }

  async function resume(jobId: string): Promise<void> {
    const r = await invoke<IngestPlanView>('vespera-ingest:resume', { job_id: jobId })
    if ('job' in r) setProgress(r.job)
    else setMessage('message' in r ? r.message : r.reason)
  }

  const toggleKind = (k: IngestKindView) => setInclude(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]))
  const shown = showOthers ? sessions : sessions.filter(s => s.deepSky)

  return (
    <Card
      title="Review and transfer"
      action={
        <button onClick={() => void rescan()} disabled={busy || running} className="px-3 py-1 bg-astro-accent text-white text-xs rounded hover:bg-astro-accent/80 disabled:opacity-50">
          {busy ? 'Scanning…' : 'Scan the scope'}
        </button>
      }
    >
      <p className="text-xs text-astro-muted mb-2">
        Counts each session's files from the scope's listings alone, says what looks wrong, and copies a session into a folder named for its target, date and file counts. A dropped
        Wi-Fi link pauses the copy; resume carries on where it stopped.
      </p>
      {!scan && <EmptyState>Scan the scope to see each session's counts before anything is copied.</EmptyState>}
      {scan && !scan.ok && <p className="text-sm text-red-400">{scan.error}</p>}
      {scan?.ok && (
        <>
          <p className="text-sm text-astro-text">{scan.summary}</p>
          {!scan.destinationRoot && <p className="text-xs text-red-400 mt-1">Choose where copies land above before transferring.</p>}
          {scan.expertMode && <p className="text-xs text-astro-muted mt-1">Expert-mode darks are on the scope; they are listed, never copied.</p>}
          <label className="flex items-center gap-2 text-xs text-astro-muted mt-2">
            <input type="checkbox" checked={showOthers} onChange={() => setShowOthers(v => !v)} />
            Show auto-init, sun and other sessions
          </label>
          <table className="w-full text-xs mt-3">
            <thead className="text-astro-muted text-left">
              <tr>
                <th className="font-normal py-1">When</th>
                <th className="font-normal">Target</th>
                <th className="font-normal text-right">FITS</th>
                <th className="font-normal text-right">JPEG</th>
                <th className="font-normal text-right">TIFF</th>
                <th className="font-normal text-right">JSON</th>
                <th className="font-normal text-right">Size</th>
                <th className="font-normal pl-3">State</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(s => (
                <React.Fragment key={s.id}>
                  <tr className="border-t border-astro-border cursor-pointer hover:bg-astro-bg" onClick={() => setOpen(open === s.id ? null : s.id)}>
                    <td className="py-1.5 text-astro-text" title={s.id}>{s.when ?? s.id}</td>
                    <td className="text-astro-text">
                      {s.target.name}
                      {s.target.review && <span className="text-yellow-400"> ?</span>}
                    </td>
                    <td className="text-right">{s.counts.fits}</td>
                    <td className="text-right">{s.counts.jpeg}</td>
                    <td className="text-right">{s.counts.tiff}</td>
                    <td className="text-right">{s.counts.json}</td>
                    <td className="text-right text-astro-muted">{s.size}</td>
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
                            <button onClick={() => void rename(s.id)} className="px-2 py-1 border border-astro-border rounded text-astro-text hover:border-astro-accent">
                              Use this name
                            </button>
                            <button onClick={() => void identify(s.id)} className="px-2 py-1 border border-astro-border rounded text-astro-text hover:border-astro-accent" title="Reads observation.json, then the stack's EXIF, then a FITS header">
                              Check the scope's metadata
                            </button>
                          </div>
                          {s.runs.map(r => (
                            <p key={r.folder} className="text-astro-muted">
                              {r.folder}: {r.fits} FITS, {r.jpeg} JPEG, {r.tiff} TIFF, {r.json} JSON{r.other > 0 ? `, ${r.other} other` : ''}
                            </p>
                          ))}
                          {s.findings.map((f, i) => (
                            <p key={i} className={LEVEL_COLOUR[f.level]}>
                              {LEVEL_WORD[f.level]}: {f.message}
                            </p>
                          ))}
                          <div className="flex flex-wrap gap-x-4 items-center pt-1">
                            {KINDS.map(k => (
                              <label key={k.id} className="flex items-center gap-1 text-astro-text">
                                <input type="checkbox" checked={include.includes(k.id)} onChange={() => toggleKind(k.id)} />
                                {k.label}
                              </label>
                            ))}
                          </div>
                          {preview && scan.destinationRoot && (
                            <p className="text-astro-muted break-all">
                              Copies into {scan.destinationRoot} / <span className="text-astro-text">{preview}</span>
                            </p>
                          )}
                          <div className="flex gap-2">
                            {s.job && (s.job.state === 'paused' || s.job.state === 'failed') ? (
                              <button onClick={() => void resume(s.job!.id)} disabled={running} className="px-3 py-1 bg-astro-accent text-white rounded hover:bg-astro-accent/80 disabled:opacity-50">
                                Resume
                              </button>
                            ) : (
                              <button
                                onClick={() => void transfer(s.id)}
                                disabled={running || !s.transferable || include.length === 0 || !scan.destinationRoot}
                                className="px-3 py-1 bg-astro-accent text-white rounded hover:bg-astro-accent/80 disabled:opacity-50"
                              >
                                Transfer
                              </button>
                            )}
                            {message?.includes('already exists') && (
                              <button onClick={() => void transfer(s.id, true)} className="px-3 py-1 border border-astro-border rounded text-astro-text hover:border-astro-accent">
                                Use the next free name
                              </button>
                            )}
                          </div>
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
        </>
      )}
      {message && <p className="text-xs text-red-400 mt-2">{message}</p>}
      {progress && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-astro-text">{progress.headline}</p>
            {running && (
              <button onClick={() => void invoke('vespera-ingest:pause')} className="px-2 py-1 text-xs border border-astro-border rounded text-astro-text hover:border-astro-accent">
                Pause
              </button>
            )}
          </div>
          <div className="h-2 bg-astro-bg rounded mt-2 overflow-hidden">
            <div className="h-full bg-astro-accent" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
          </div>
          {progress.current && <p className="text-xs text-astro-muted mt-1 break-all">{progress.current}</p>}
        </div>
      )}
    </Card>
  )
}
