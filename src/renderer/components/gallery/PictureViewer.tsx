import React, { useEffect, useState } from 'react'
import { Loading } from '../ui'
import { GALLERY_VIEW_WIDTH } from '@shared/gallery'
import type { GalleryDetailsView, GalleryPictureView } from '@shared/types'
import { invoke } from '../../hooks/useIPC'
import { ObjectPanel } from './ObjectPanel'
import { usePicture } from './usePicture'

type Details = { status: 'loading' } | { status: 'ready'; view: GalleryDetailsView } | { status: 'failed'; error: string }

/**
 * A picture shown large beside its side panel (GAL-002): the arrow keys or the buttons move to
 * the previous or next picture, Escape closes.
 */
export function PictureViewer({
  pictures,
  index,
  onMove,
  onClose
}: {
  pictures: GalleryPictureView[]
  index: number
  onMove: (index: number) => void
  onClose: () => void
}): React.ReactElement {
  const picture = pictures[index]
  const image = usePicture(picture.path, GALLERY_VIEW_WIDTH)
  const [details, setDetails] = useState<Details>({ status: 'loading' })
  const hasPrev = index > 0
  const hasNext = index < pictures.length - 1

  useEffect(() => {
    let current = true
    setDetails({ status: 'loading' })
    invoke<GalleryDetailsView | { refused: string }>('gallery:details', { path: picture.path })
      .then(result => current && setDetails('refused' in result ? { status: 'failed', error: result.refused } : { status: 'ready', view: result }))
      .catch(error => current && setDetails({ status: 'failed', error: error instanceof Error ? error.message : String(error) }))
    return () => {
      current = false
    }
  }, [picture.path])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && hasPrev) onMove(index - 1)
      else if (e.key === 'ArrowRight' && hasNext) onMove(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, hasPrev, hasNext, onMove, onClose])

  const navButton = 'w-10 h-10 rounded-full bg-astro-scrim/50 text-astro-on-scrim text-xl flex items-center justify-center hover:bg-astro-scrim/80 disabled:opacity-20 disabled:cursor-default'

  return (
    <div className="fixed inset-0 z-50 flex bg-astro-scrim/90" role="dialog" aria-label={picture.name}>
      <div className="relative flex-1 min-w-0 flex items-center justify-center p-6" onClick={onClose}>
        {image.status === 'ready' ? (
          <img src={image.src} alt={picture.name} className="max-w-full max-h-full object-contain rounded" onClick={e => e.stopPropagation()} />
        ) : image.status === 'failed' ? (
          <div className="max-w-md bg-astro-surface border border-astro-border rounded-lg p-6 text-sm text-astro-muted" onClick={e => e.stopPropagation()}>
            {image.error}
          </div>
        ) : (
          <div className="w-8 h-8 border-2 border-astro-accent border-t-transparent rounded-full animate-spin" />
        )}
        <button aria-label="Previous picture" className={`${navButton} absolute left-4 top-1/2 -translate-y-1/2`} disabled={!hasPrev} onClick={e => { e.stopPropagation(); onMove(index - 1) }}>
          ‹
        </button>
        <button aria-label="Next picture" className={`${navButton} absolute right-4 top-1/2 -translate-y-1/2`} disabled={!hasNext} onClick={e => { e.stopPropagation(); onMove(index + 1) }}>
          ›
        </button>
        <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-astro-on-scrim/60">
          {index + 1} of {pictures.length}
        </p>
      </div>

      <aside className="w-96 shrink-0 h-full overflow-y-auto bg-astro-surface border-l border-astro-border p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-astro-text break-words">{picture.name}</h2>
            <p className="text-xs text-astro-muted">
              {[picture.folder || 'Images folder', picture.size, picture.saved].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-astro-muted hover:text-astro-text text-lg leading-none">
            ×
          </button>
        </div>
        <button onClick={() => invoke('home:open-folder', { folder_path: picture.folderPath })} className="text-xs text-astro-accent hover:underline">
          Open its folder
        </button>

        {details.status === 'loading' && <Loading label="Reading what it shows" rows={2} />}
        {details.status === 'failed' && <p className="text-xs text-astro-danger">{details.error}</p>}
        {details.status === 'ready' && <DetailsBody view={details.view} onLeave={onClose} />}
      </aside>
    </div>
  )
}

function DetailsBody({ view, onLeave }: { view: GalleryDetailsView; onLeave: () => void }): React.ReactElement {
  return (
    <div className="space-y-6">
      {view.readFrom && <p className="text-[11px] text-astro-muted">{view.readFrom}</p>}
      {view.objects.length === 0 && (
        <div className="text-sm text-astro-muted space-y-2">
          <p>No catalogue object was found in this picture’s name or its folders.</p>
          <p>
            Name the file after what it shows, such as M31.png, NGC 7000.png or Andromeda Galaxy.png, or put it in a folder named for it, and the
            gallery will say what it is.
          </p>
        </div>
      )}
      {view.unknown.length > 0 && (
        <p className="text-xs text-astro-muted">
          {view.unknown.join(', ')} {view.unknown.length === 1 ? 'is' : 'are'} not in the app’s catalogues (Messier, NGC, IC, Caldwell and Sharpless). Add it as a target to
          see it here.
        </p>
      )}
      {view.objects.map((o, i) => (
        <div key={o.id} className={i > 0 ? 'pt-6 border-t border-astro-border' : ''}>
          <ObjectPanel object={o} onLeave={onLeave} />
        </div>
      ))}
    </div>
  )
}
