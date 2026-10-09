import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { invoke } from '../../hooks/useIPC'
import { Card, EmptyState, LinkButton } from '../common/Card'
import { settingsLink } from '@shared/navigation'
import type { ArchivePreviewView, ArchiveRunResult } from '@shared/types'

type Mode = 'linked' | 'self-contained'

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`
}

const VERDICT_TONE = { fits: 'text-green-400', short: 'text-red-400', unknown: 'text-yellow-400' } as const

/**
 * 5 · Archive (specs/022-archive): keep a finished target's stacks, manifests, masters and finished
 * images, linked to its raw frames or with them bundled in, and show what each intermediate folder
 * frees before anything is removed (ARC-001). Nothing is removed until the user confirms.
 */
export function ArchiveCard({ targetId, busy }: { targetId: string; busy: boolean }): React.ReactElement {
  const [view, setView] = useState<ArchivePreviewView | null>(null)
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState<Mode>('linked')
  const [remove, setRemove] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ArchiveRunResult | null>(null)

  const load = useCallback((): void => {
    setFailed(false)
    invoke<ArchivePreviewView>('archive:preview', { target_id: targetId })
      .then(v => {
        setView(v)
        setRemove(new Set(v.folders.filter(f => f.suggested).map(f => f.folder)))
      })
      .catch(() => setFailed(true))
  }, [targetId])
  // Read again when a run for this target starts or ends, since it changes the work folder.
  useEffect(() => load(), [load, busy])

  async function archive(): Promise<void> {
    setRunning(true)
    try {
      setResult(await invoke<ArchiveRunResult>('archive:run', { target_id: targetId, mode, remove: [...remove] }))
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : String(error) })
    } finally {
      setRunning(false)
      setConfirming(false)
      load()
    }
  }

  const settings = <Link to={settingsLink('folders')} className="text-astro-accent hover:underline">Settings → Folders</Link>
  const body = (): React.ReactNode => {
    if (failed) return <EmptyState action={<LinkButton onClick={load}>Try again</LinkButton>}>The work folder could not be read.</EmptyState>
    if (!view) return <EmptyState>Measuring the work folder…</EmptyState>
    const option = view.options.find(o => o.mode === mode) ?? null
    const chosen = view.folders.filter(f => remove.has(f.folder))
    // Each folder's own figure, plus files hard-linked across folders that are all chosen.
    const frees = chosen.reduce((sum, f) => sum + f.freesBytes, 0) + view.shared.filter(s => s.folders.every(f => remove.has(f))).reduce((sum, s) => sum + s.bytes, 0)
    const toggle = (folder: string) =>
      setRemove(r => {
        const next = new Set(r)
        if (next.has(folder)) next.delete(folder)
        else next.add(folder)
        return next
      })
    return (
      <div className="space-y-3 text-xs">
        {view.blocked && <p className="text-yellow-400">{view.blocked}</p>}
        {view.folders.length > 0 && (
          <>
            <p className="text-astro-muted">{view.manifests}</p>
            <table className="w-full text-astro-muted">
              <thead>
                <tr className="text-left">
                  <th className="pr-3 font-normal">Folder</th>
                  <th className="pr-3 font-normal text-right">Size</th>
                  <th className="pr-3 font-normal text-right">Frees</th>
                  <th className="pr-3 font-normal">Rebuildable</th>
                  <th className="font-normal text-right">Remove</th>
                </tr>
              </thead>
              <tbody>
                {view.folders.map(f => (
                  <tr key={f.folder} className="border-t border-astro-border">
                    <td className="pr-3 py-1">
                      <span className="text-astro-text">{f.label}</span>
                      {f.folder && <span className="font-mono"> {f.folder}</span>}
                    </td>
                    <td className="pr-3 text-right tabular-nums">{f.size}</td>
                    <td className="pr-3 text-right tabular-nums">{f.frees}</td>
                    <td className={`pr-3 ${f.rebuildable ? 'text-green-400' : ''}`}>{f.rebuild}</td>
                    <td className="text-right">
                      {f.removable && (
                        <input type="checkbox" aria-label={`Remove ${f.folder}`} checked={remove.has(f.folder)} onChange={() => toggle(f.folder)} disabled={running} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {view.options.length > 0 && !view.blocked && (
          <>
            <div className="space-y-1.5">
              {view.options.map(o => (
                <label key={o.mode} className="flex gap-2 items-start cursor-pointer">
                  <input type="radio" name={`archive-mode-${targetId}`} checked={mode === o.mode} onChange={() => setMode(o.mode)} disabled={running} className="mt-0.5" />
                  <span>
                    <span className="text-astro-text">{o.label}</span>
                    <span className="text-astro-muted">: {o.text} </span>
                    <span className={VERDICT_TONE[o.verdict]}>{o.verdictText}.</span>
                    {o.missing && <span className="block text-yellow-400">{o.missing}</span>}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-astro-muted">
              Archive folder: <span className="font-mono">{view.destination}</span>. Change where archives go in {settings}.
            </p>
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                disabled={running || option?.verdict === 'short'}
                className="px-3 py-1 bg-astro-accent text-white rounded disabled:opacity-50"
              >
                Archive this target
              </button>
            ) : (
              <div className="border border-astro-border rounded p-2 space-y-1 bg-astro-bg">
                <p className="font-semibold text-astro-text">Check before archiving</p>
                <ul className="list-disc pl-4 text-astro-muted space-y-0.5">
                  {option && <li>{option.text}</li>}
                  {chosen.length > 0 ? (
                    <li>
                      Then removes {chosen.map(f => f.folder).join(', ')} from the work folder, which frees {formatBytes(frees)}. Your source folders are never touched.
                    </li>
                  ) : (
                    <li>Nothing is removed from the work folder.</li>
                  )}
                  <li>If any copy fails, no archive is left behind and nothing is removed.</li>
                </ul>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button disabled={running} onClick={() => void archive()} className="px-3 py-1 bg-astro-accent text-white rounded disabled:opacity-50">
                    {running ? 'Archiving…' : chosen.length > 0 ? 'Archive and remove' : 'Archive'}
                  </button>
                  <button disabled={running} onClick={() => setConfirming(false)} className="px-3 py-1 text-astro-muted">
                    Back
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {result && <p className={result.ok ? 'text-green-400' : 'text-red-400'}>{result.ok ? result.message : result.error}</p>}
      </div>
    )
  }

  return (
    <Card title="5 · Archive">
      {view?.archived && (
        <p className="mb-3 px-3 py-2 rounded bg-astro-accent/10 border border-astro-accent/30 text-xs text-astro-accent">
          {view.archived} In <span className="font-mono">{view.archivedPath}</span>.{' '}
          {view.archivedPath && <LinkButton onClick={() => void invoke('home:open-folder', { folder_path: view.archivedPath })}>Open folder</LinkButton>}
        </p>
      )}
      {body()}
    </Card>
  )
}
