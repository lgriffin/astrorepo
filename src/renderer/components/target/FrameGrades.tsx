import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { invoke } from '../../hooks/useIPC'
import { useToast } from '../../contexts/ToastContext'
import { EmptyState, LinkButton } from '../common/Card'
import { settingsLink } from '@shared/navigation'
import type { FrameGradeView, GradesView, MeasureBatchView, NightGradeView } from '@shared/types'

const VERDICT_STYLE: Record<FrameGradeView['verdict'], string> = {
  keep: 'bg-green-500/15 text-green-400',
  reject: 'bg-red-500/15 text-red-400',
  unmeasured: 'bg-astro-border text-astro-muted'
}
const VERDICT_LABEL: Record<FrameGradeView['verdict'], string> = { keep: 'Kept', reject: 'Rejected', unmeasured: 'Not measured' }

/** The main process's reason, without Electron's wrapper. */
const reasonOf = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '') : '')

/**
 * Grade the lights (specs/019-frame-grading): measure every light, see each night's FWHM and
 * star count in capture order, keep or reject a frame by hand, and export the grades. Only kept
 * lights reach Siril.
 */
export function FrameGrades({ targetId, onChanged }: { targetId: string; onChanged?: () => void }): React.ReactElement {
  const [view, setView] = useState<GradesView | null>(null)
  const [failed, setFailed] = useState(false)
  const [measuring, setMeasuring] = useState<{ done: number; left: number } | null>(null)
  const stop = useRef(false)
  const { addToast } = useToast()

  const load = useCallback((): void => {
    invoke<GradesView>('grades:target', { target_id: targetId })
      .then(v => {
        setView(v)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [targetId])
  useEffect(load, [load])
  // Stop measuring when the page closes.
  useEffect(() => () => void (stop.current = true), [])

  async function measure(retry: boolean): Promise<void> {
    stop.current = false
    let done = 0
    setMeasuring({ done, left: view?.unmeasured ?? 0 })
    try {
      let last: string | null = null
      while (!stop.current) {
        const batch: MeasureBatchView = await invoke<MeasureBatchView>('grades:measure', { target_id: targetId, retry, retry_after: last })
        last = batch.last ?? last
        done += batch.measured + batch.failed
        setMeasuring({ done, left: batch.remaining })
        load()
        if (batch.remaining === 0 || batch.measured + batch.failed === 0) break
      }
      addToast(stop.current ? `Stopped after measuring ${done} lights` : `Measured ${done} lights`, 'success')
    } catch {
      addToast('Measuring stopped: a frame could not be read. Its reason shows beside it.', 'error')
    } finally {
      setMeasuring(null)
      load()
      onChanged?.()
    }
  }

  async function override(fileId: string, choice: 'keep' | 'reject' | null): Promise<void> {
    try {
      await invoke('grades:override', { file_id: fileId, override: choice })
    } catch (error) {
      addToast(`Your choice was not saved. ${reasonOf(error)}`.trim(), 'error')
    } finally {
      // Reload either way, so the choice shown is the one saved.
      load()
      onChanged?.()
    }
  }

  async function exportCsv(): Promise<void> {
    try {
      const result = await invoke<{ saved: boolean; path?: string }>('grades:export', { target_id: targetId })
      if (result.saved) addToast(`Grades saved to ${result.path}`, 'success')
    } catch (error) {
      addToast(`The grades were not saved. ${reasonOf(error)}`.trim(), 'error')
    }
  }

  if (failed && !view) return <EmptyState>Could not read this target&apos;s frame grades. Open the page again to retry.</EmptyState>
  if (!view) return <p className="text-sm text-astro-muted">Reading frame grades…</p>
  if (view.total === 0) {
    return (
      <EmptyState>
        No light frames are indexed for this target, so there is nothing to grade. Scan its folder on the{' '}
        <Link to="/fits-analyzer" className="text-astro-accent hover:underline">FITS files</Link> page.
      </EmptyState>
    )
  }

  const failedCount = view.nights.reduce((n, night) => n + night.trend.filter(f => f.verdict === 'unmeasured' && f.reasons[0]?.startsWith('Not measured:')).length, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-astro-text flex-1 min-w-0">{view.summary}</p>
        {measuring ? (
          <>
            <span className="text-xs text-astro-muted">Measured {measuring.done}, {measuring.left} to go</span>
            <button onClick={() => (stop.current = true)} className="px-3 py-1 text-xs border border-astro-border rounded text-astro-text">Stop</button>
          </>
        ) : (
          <>
            {view.unmeasured - failedCount > 0 && (
              <button onClick={() => void measure(false)} className="px-3 py-1 text-xs bg-astro-accent text-white rounded">
                Measure {view.unmeasured - failedCount} lights
              </button>
            )}
            {failedCount > 0 && <LinkButton onClick={() => void measure(true)}>Try the {failedCount} unreadable again</LinkButton>}
            <LinkButton onClick={() => void exportCsv()}>Export CSV</LinkButton>
          </>
        )}
      </div>
      <p className="text-xs text-astro-muted">
        Limits: eccentricity up to {view.limits.maxEccentricity}, FWHM up to {view.limits.maxFwhmRatio}× and stars at least {view.limits.minStarRatio}× the night&apos;s median,
        background up to {view.limits.maxBackgroundRatio}×{view.limits.maxFwhmPixels !== null ? `, FWHM up to ${view.limits.maxFwhmPixels} px` : ''}.{' '}
        <Link to={settingsLink('grading')} className="text-astro-accent hover:underline">Change limits</Link>
      </p>
      {view.nights.map(n => (
        <NightGrades key={n.key} night={n} onOverride={override} />
      ))}
    </div>
  )
}

function NightGrades({ night, onOverride }: { night: NightGradeView; onOverride: (fileId: string, choice: 'keep' | 'reject' | null) => void }): React.ReactElement {
  const [open, setOpen] = useState(night.rejected > 0)
  return (
    <div className="border border-astro-border rounded p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-astro-text">{night.label}</h3>
        <span className="text-xs text-astro-muted">
          {night.kept} of {night.frames} kept{night.medianFwhm && ` · median FWHM ${night.medianFwhm}`}{night.medianStars && ` · ${night.medianStars} stars`}
        </span>
      </div>
      <Trend frames={night.trend} />
      <LinkButton onClick={() => setOpen(o => !o)}>{open ? 'Hide frames' : `Show ${night.frames} frames`}</LinkButton>
      {open && (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-astro-muted">
                <th className="py-1 pr-3 font-normal">Frame</th>
                <th className="py-1 pr-3 font-normal">Time</th>
                <th className="py-1 pr-3 font-normal text-right">FWHM</th>
                <th className="py-1 pr-3 font-normal text-right">Ecc.</th>
                <th className="py-1 pr-3 font-normal text-right">Stars</th>
                <th className="py-1 pr-3 font-normal text-right">SNR</th>
                <th className="py-1 pr-3 font-normal text-right">Weight</th>
                <th className="py-1 pr-3 font-normal">Grade</th>
                <th className="py-1 font-normal">Your choice</th>
              </tr>
            </thead>
            <tbody>
              {night.trend.map(f => (
                <tr key={f.fileId} className="border-t border-astro-border align-top">
                  <td className="py-1 pr-3 text-astro-text break-all" title={f.path}>{f.fileName}</td>
                  <td className="py-1 pr-3 text-astro-muted whitespace-nowrap">{f.capturedAt ? new Date(f.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–'}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{f.fwhm ?? '–'}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{f.eccentricity ?? '–'}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{f.stars ?? '–'}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{f.snr ?? '–'}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{f.weight ?? '–'}</td>
                  <td className="py-1 pr-3">
                    <span className={`px-1.5 py-0.5 rounded ${VERDICT_STYLE[f.verdict]}`} title={f.reasons.join(' ')}>{VERDICT_LABEL[f.verdict]}</span>
                    {f.reasons.length > 0 && <p className="mt-1 text-astro-muted max-w-xs">{f.reasons.join(' ')}</p>}
                  </td>
                  <td className="py-1 whitespace-nowrap">
                    <select
                      aria-label={`Your choice for ${f.fileName}`}
                      value={f.override ?? ''}
                      onChange={e => onOverride(f.fileId, e.target.value === '' ? null : (e.target.value as 'keep' | 'reject'))}
                      className="bg-astro-bg border border-astro-border rounded px-1 py-0.5 text-xs text-astro-text"
                    >
                      <option value="">By the limits</option>
                      <option value="keep">Keep</option>
                      <option value="reject">Reject</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** FWHM (line) and star count (bars) across a night, in capture order; rejected frames in red. */
export function Trend({ frames }: { frames: FrameGradeView[] }): React.ReactElement | null {
  const measured = frames.filter(f => f.fwhm !== null || f.stars !== null)
  if (measured.length < 2) return null
  const W = 600
  const H = 70
  const pad = 4
  const maxFwhm = Math.max(...frames.map(f => f.fwhm ?? 0)) || 1
  const maxStars = Math.max(...frames.map(f => f.stars ?? 0)) || 1
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, frames.length - 1)
  const yF = (v: number) => H - pad - (v / maxFwhm) * (H - 2 * pad)
  const barW = Math.max(1, (W - 2 * pad) / frames.length - 1)
  const line = frames
    .map((f, i) => (f.fwhm === null ? null : `${x(i).toFixed(1)},${yF(f.fwhm).toFixed(1)}`))
    .filter(Boolean)
    .join(' ')
  return (
    <figure className="my-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" role="img" aria-label="FWHM and star count across the night">
        {frames.map((f, i) =>
          f.stars === null ? null : (
            <rect key={f.fileId} x={x(i) - barW / 2} width={barW} y={H - pad - (f.stars / maxStars) * (H - 2 * pad)} height={(f.stars / maxStars) * (H - 2 * pad)}
              className={f.verdict === 'reject' ? 'fill-red-500/40' : 'fill-astro-border'} />
          )
        )}
        <polyline points={line} fill="none" className="stroke-astro-accent" strokeWidth={1.5} />
        {frames.map((f, i) => (f.verdict === 'reject' && f.fwhm !== null ? <circle key={`r${f.fileId}`} cx={x(i)} cy={yF(f.fwhm)} r={2.5} className="fill-red-400" /> : null))}
      </svg>
      <figcaption className="text-[11px] text-astro-muted">Line: FWHM (up to {maxFwhm.toFixed(1)} px). Bars: stars (up to {maxStars}). Red: rejected.</figcaption>
    </figure>
  )
}
