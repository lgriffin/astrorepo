import React, { useEffect, useMemo, useState } from 'react'
import { invoke } from '../../hooks/useIPC'
import { decodePixels, PixelCanvas, SkyOverlayLayer, toRgba } from '../gallery/PreviewImage'
import type { ChannelStatsView, InspectionView, PreviewView } from '@shared/types'

const TONE: Record<ChannelStatsView['channel'], string> = { L: '#cbd5e1', R: '#f87171', G: '#4ade80', B: '#60a5fa' }

/** Every channel's histogram on one chart, counts on a log scale so the faint tail shows (INS-001). */
function HistogramChart({ channels }: { channels: ChannelStatsView[] }): React.ReactElement {
  const w = 256
  const h = 90
  const top = Math.max(1, ...channels.flatMap(c => c.histogram.counts.map(n => Math.log1p(n))))
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24 bg-astro-bg border border-astro-border rounded" preserveAspectRatio="none" aria-label="Histogram">
        {channels.map(c => {
          const n = c.histogram.counts.length
          const points = c.histogram.counts.map((v, i) => `${((i + 0.5) / n) * w},${h - (Math.log1p(v) / top) * (h - 4)}`).join(' ')
          return <polyline key={c.channel} points={points} fill="none" stroke={TONE[c.channel]} strokeWidth={1} strokeOpacity={0.9} />
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-astro-muted font-mono mt-0.5">
        <span>{channels[0]?.histogram.min}</span>
        <span>{channels[0]?.histogram.max}</span>
      </div>
    </div>
  )
}

/** The brightest unsaturated star's radial profile, centre on the left (INS-002). */
function ProfileChart({ profile }: { profile: number[] }): React.ReactElement {
  const top = Math.max(1e-9, ...profile)
  return (
    <div className="flex items-end gap-0.5 h-12" aria-label="Star profile">
      {profile.map((v, r) => (
        <div key={r} className="w-3 bg-astro-accent/70 rounded-t" style={{ height: `${Math.max(2, (Math.max(0, v) / top) * 100)}%` }} title={`${r} px out`} />
      ))}
    </div>
  )
}

/** A file's preview, with the coordinate grid and catalogue labels when its header is solved (INS-011). */
export function PreviewPanel({ view, label }: { view: PreviewView; label?: string }): React.ReactElement {
  const [grid, setGrid] = useState(true)
  const rgba = useMemo(() => toRgba(decodePixels(view.pixelsBase64), view.width, view.height, view.channels), [view])
  return (
    <div className="space-y-1">
      <div className="relative">
        <PixelCanvas rgba={rgba} width={view.width} height={view.height} className="rounded border border-astro-border" />
        {grid && view.overlay && <SkyOverlayLayer overlay={view.overlay} width={view.width} height={view.height} />}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-astro-muted">
        {label && <span className="text-astro-text">{label}</span>}
        <span>Auto-stretched preview of {view.sourceSize}.</span>
        {view.overlay && (
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} /> Grid and labels
          </label>
        )}
      </div>
      {view.fieldText && <p className="text-xs text-astro-muted">{view.fieldText}</p>}
    </div>
  )
}

/**
 * The inspector on the FITS files page (spec 025): histogram per channel, median, noise, clipping
 * and the brightest unsaturated star, then a preview with a grid when the header is solved.
 */
export function Inspector({ fileId }: { fileId: string }): React.ReactElement {
  const [view, setView] = useState<InspectionView | null>(null)
  const [preview, setPreview] = useState<PreviewView | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // A slow read for a file the user has moved on from must not land on the next one.
    let current = true
    setView(null)
    setPreview(null)
    setFailed(false)
    invoke<InspectionView | null>('inspect:file', { file_id: fileId })
      .then(v => {
        if (!current) return null
        setView(v)
        return v && !v.error ? invoke<PreviewView | null>('inspect:file-preview', { file_id: fileId }) : null
      })
      .then(p => {
        if (current && p) setPreview(p)
      })
      .catch(() => {
        if (current) setFailed(true)
      })
    return () => {
      current = false
    }
  }, [fileId])

  if (failed) return <p className="text-sm text-astro-muted">The inspector stopped before it finished. Close the file and open it again.</p>
  if (!view) return <p className="text-sm text-astro-muted">Reading the pixels…</p>
  if (view.error) return <p className="text-sm text-yellow-400">{view.error}</p>

  return (
    <div className="space-y-3">
      <p className="text-xs text-astro-muted">{view.summary}</p>
      <HistogramChart channels={view.channels} />
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-astro-muted">
            <th className="py-1 font-normal">Channel</th>
            <th className="py-1 font-normal">Median</th>
            <th className="py-1 font-normal">Noise</th>
            <th className="py-1 font-normal">Saturated</th>
            <th className="py-1 font-normal">Clipped to black</th>
          </tr>
        </thead>
        <tbody className="font-mono text-astro-text">
          {view.channels.map(c => (
            <tr key={c.channel}>
              <td className="py-0.5 font-sans" style={{ color: TONE[c.channel] }}>{c.label}</td>
              <td className="py-0.5">{c.median}</td>
              <td className="py-0.5">{c.noise}</td>
              <td className="py-0.5">{c.saturated}</td>
              <td className="py-0.5">{c.black}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {view.warnings.map(w => <p key={w} className="text-xs text-yellow-400">{w}</p>)}
      <div>
        <h5 className="text-xs text-astro-muted mb-1">Brightest unsaturated star</h5>
        {view.star ? (
          <div className="flex items-end gap-6">
            <dl className="grid grid-cols-3 gap-4 text-xs">
              <div><dt className="text-astro-muted">FWHM</dt><dd className="font-mono text-astro-text">{view.star.fwhm}</dd></div>
              <div><dt className="text-astro-muted">Peak above sky</dt><dd className="font-mono text-astro-text">{view.star.peak}</dd></div>
              <div><dt className="text-astro-muted">At x, y</dt><dd className="font-mono text-astro-text">{view.star.position}</dd></div>
            </dl>
            <ProfileChart profile={view.star.profile} />
          </div>
        ) : (
          <p className="text-xs text-astro-muted">{view.starNote}</p>
        )}
      </div>
      {preview && (preview.error ? <p className="text-xs text-yellow-400">{preview.error}</p> : <PreviewPanel view={preview} />)}
    </div>
  )
}
