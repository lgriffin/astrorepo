import React, { useEffect, useMemo, useState } from 'react'
import { invoke } from '../../hooks/useIPC'
import { Card, EmptyState } from '../common/Card'
import { decodePixels, PixelCanvas, SkyOverlayLayer, toRgba } from '../gallery/PreviewImage'
import { PreviewPanel } from '../fits/Inspector'
import type { GalleryImageView, PreviewView } from '@shared/types'

type Loaded = PreviewView | { refused: string } | null

/** Two previews over one another, the slider showing the first to its left and the second to its right. */
function Slider({ a, b }: { a: PreviewView; b: PreviewView }): React.ReactElement {
  const [at, setAt] = useState(50)
  const [grid, setGrid] = useState(true)
  const left = useMemo(() => toRgba(decodePixels(a.pixelsBase64), a.width, a.height, a.channels), [a])
  const right = useMemo(() => toRgba(decodePixels(b.pixelsBase64), b.width, b.height, b.channels), [b])
  const overlay = a.overlay ?? b.overlay
  const sizeOf = a.overlay ? a : b
  return (
    <div className="space-y-1">
      <div className="relative select-none">
        <PixelCanvas rgba={right} width={b.width} height={b.height} className="rounded border border-astro-border" />
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - at}% 0 0)` }}>
          <PixelCanvas rgba={left} width={a.width} height={a.height} className="rounded" />
        </div>
        <div className="absolute top-0 bottom-0 w-px bg-white/70" style={{ left: `${at}%` }} />
        {grid && overlay && <SkyOverlayLayer overlay={overlay} width={sizeOf.width} height={sizeOf.height} />}
      </div>
      <div className="flex items-center gap-3 text-xs text-astro-muted">
        <input type="range" min={0} max={100} value={at} onChange={e => setAt(Number(e.target.value))} className="flex-1" aria-label="Slider position" />
        {overlay && (
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} /> Grid and labels
          </label>
        )}
      </div>
    </div>
  )
}

/**
 * Compare: any two of the target's masters or finished images, side by side or under a slider,
 * each from a small preview with the same auto-stretch (spec 025, INS-007).
 */
export function CompareCard({ targetId }: { targetId: string }): React.ReactElement {
  const [images, setImages] = useState<GalleryImageView[] | null>(null)
  const [picked, setPicked] = useState<[string, string]>(['', ''])
  const [previews, setPreviews] = useState<[Loaded, Loaded]>([null, null])
  const [mode, setMode] = useState<'side' | 'slider'>('side')

  useEffect(() => {
    let current = true
    invoke<GalleryImageView[]>('gallery:images', { target_id: targetId })
      .then(list => {
        if (!current) return
        setImages(list)
        setPicked([list[0]?.path ?? '', list[1]?.path ?? ''])
      })
      .catch(() => current && setImages([]))
    return () => {
      current = false
    }
  }, [targetId])

  useEffect(() => {
    let current = true
    setPreviews([null, null])
    const load = (path: string): Promise<Loaded> =>
      path ? invoke<PreviewView | { refused: string }>('gallery:preview', { target_id: targetId, path }).catch(() => ({ refused: 'The image could not be read.' })) : Promise.resolve(null)
    // One after the other: each read is a full frame on the worker thread.
    void load(picked[0]).then(async a => {
      if (!current) return
      setPreviews([a, null])
      const b = await load(picked[1])
      if (current) setPreviews([a, b])
    })
    return () => {
      current = false
    }
  }, [targetId, picked])

  if (!images) return <Card title="Compare images"><EmptyState>Looking for masters and finished images…</EmptyState></Card>
  if (images.length < 2) {
    return (
      <Card title="Compare images">
        <EmptyState>Comparing needs two images: a master stacked from this target’s lights, or a finished FITS or PNG in its images folder. JPEG and TIFF are not read yet.</EmptyState>
      </Card>
    )
  }

  const select = 'bg-astro-bg border border-astro-border rounded px-2 py-1 text-xs text-astro-text max-w-[45%]'
  const ready = previews.every(p => p && !('refused' in p) && !p.error)
  const problem = (p: Loaded) => (p && 'refused' in p ? p.refused : p?.error ?? null)
  const label = (path: string) => images.find(i => i.path === path)?.label
  return (
    <Card
      title="Compare images"
      action={
        <div className="flex gap-2 text-xs">
          {(['side', 'slider'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={mode === m ? 'text-astro-accent' : 'text-astro-muted hover:text-astro-text'}>
              {m === 'side' ? 'Side by side' : 'Slider'}
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {[0, 1].map(k => (
            <select key={k} className={select} value={picked[k]} onChange={e => setPicked(p => (k === 0 ? [e.target.value, p[1]] : [p[0], e.target.value]))}>
              {images.map(i => <option key={i.path} value={i.path}>{i.label}</option>)}
            </select>
          ))}
        </div>
        {previews.map(problem).filter(Boolean).map(m => <p key={m} className="text-xs text-yellow-400">{m}</p>)}
        {!ready && !previews.some(problem) && <p className="text-xs text-astro-muted">Reading the images…</p>}
        {ready && mode === 'side' && (
          <div className="grid grid-cols-2 gap-3">
            <PreviewPanel view={previews[0] as PreviewView} label={label(picked[0])} />
            <PreviewPanel view={previews[1] as PreviewView} label={label(picked[1])} />
          </div>
        )}
        {ready && mode === 'slider' && <Slider a={previews[0] as PreviewView} b={previews[1] as PreviewView} />}
        <p className="text-[10px] text-astro-muted">Both get the same auto-stretch, worked out from each image’s own sky.</p>
      </div>
    </Card>
  )
}
