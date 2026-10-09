import React, { useEffect, useMemo, useState } from 'react'
import { invoke } from '../../hooks/useIPC'
import { Card, EmptyState } from '../common/Card'
import { decodePixels, PixelCanvas } from '../gallery/PreviewImage'
import { composePalette } from '../../utils/compose'
import type { PalettePreviewView, PalettesView } from '@shared/types'

/** A palette preview drawn here from each channel's small grey preview (INS-005). */
function PaletteComposite({ view }: { view: PalettePreviewView }): React.ReactElement {
  const composite = useMemo(() => {
    const planes = Object.fromEntries(Object.entries(view.channels).map(([c, p]) => [c, { width: p.width, height: p.height, pixels: decodePixels(p.pixelsBase64) }]))
    return composePalette(planes, view)
  }, [view])
  if (!composite) return <p className="text-xs text-astro-muted">A channel is missing from the preview.</p>
  return <PixelCanvas rgba={composite.rgba} width={composite.width} height={composite.height} className="rounded border border-astro-border max-w-md" />
}

/**
 * Palettes: which colour combinations this target's filters allow, a quick preview of each from
 * its masters, and the one to use, saved as a hint for post-processing (spec 025).
 */
export function PaletteCard({ targetId }: { targetId: string }): React.ReactElement {
  const [view, setView] = useState<PalettesView | null>(null)
  const [shown, setShown] = useState<{ id: string; preview: PalettePreviewView | null; error: string | null } | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = () => invoke<PalettesView>('gallery:palettes', { target_id: targetId }).then(setView).catch(() => setMessage('The palettes could not be worked out.'))
  useEffect(() => {
    setShown(null)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId])

  async function preview(id: string): Promise<void> {
    setShown({ id, preview: null, error: null })
    const result = await invoke<PalettePreviewView | { refused: string }>('gallery:palette-preview', { target_id: targetId, palette: id }).catch(() => ({ refused: 'The preview could not be made.' }))
    setShown(s => (s?.id !== id ? s : 'refused' in result ? { id, preview: null, error: result.refused } : { id, preview: result, error: result.error }))
  }

  async function choose(id: string | null): Promise<void> {
    const result = await invoke<{ ok: true } | { refused: string }>('gallery:choose-palette', { target_id: targetId, palette: id })
    setMessage('refused' in result ? result.refused : null)
    await load()
  }

  if (!view) return <Card title="Palettes"><EmptyState>{message ?? 'Looking at this target’s filters…'}</EmptyState></Card>
  const possible = view.options.filter(o => o.possible)
  const others = view.options.filter(o => !o.possible)
  return (
    <Card title="Palettes">
      {view.message ? (
        <EmptyState>{view.message}</EmptyState>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2">
            {possible.map(o => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-mono text-astro-text w-12">{o.id}</span>
                <span className="text-xs text-astro-muted flex-1">{o.mapping}{o.note ? ` ${o.note}` : ''}</span>
                {o.canPreview && (
                  <button onClick={() => void preview(o.id)} className="text-xs text-astro-accent hover:underline">Preview</button>
                )}
                {view.chosen === o.id ? (
                  <button onClick={() => void choose(null)} className="text-xs text-green-400 hover:underline" title="Clear the choice">Chosen</button>
                ) : (
                  <button onClick={() => void choose(o.id)} className="text-xs text-astro-accent hover:underline">Use this one</button>
                )}
              </li>
            ))}
          </ul>
          {others.length > 0 && <p className="text-xs text-astro-muted">{others.map(o => `${o.id}: ${o.note}`).join(' ')}</p>}
          {message && <p className="text-xs text-yellow-400">{message}</p>}
          {shown && (
            <div className="space-y-1">
              <p className="text-xs text-astro-muted">{shown.id} preview, auto-stretched from the masters.</p>
              {shown.error ? <p className="text-xs text-yellow-400">{shown.error}</p> : shown.preview ? <PaletteComposite view={shown.preview} /> : <p className="text-xs text-astro-muted">Reading the masters…</p>}
            </div>
          )}
          <p className="text-[10px] text-astro-muted">The chosen palette shows beside the post-processing command on Stack and process.</p>
        </div>
      )}
    </Card>
  )
}
