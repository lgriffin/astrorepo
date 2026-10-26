import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { Card, EmptyState } from '../components/common/Card'
import { PictureTile } from '../components/gallery/PictureTile'
import { PictureViewer } from '../components/gallery/PictureViewer'
import { invoke } from '../hooks/useIPC'
import { settingsLink } from '@shared/navigation'
import type { GalleryPictureView, GalleryView } from '@shared/types'
import { Loading } from '../components/ui'

type Sort = 'newest' | 'name' | 'object'

const SORTS: { id: Sort; label: string }[] = [
  { id: 'newest', label: 'Newest first' },
  { id: 'name', label: 'By file name' },
  { id: 'object', label: 'By object' }
]

const byName = (a: GalleryPictureView, b: GalleryPictureView) => a.name.localeCompare(b.name, undefined, { numeric: true })

/** Pictures in the order picked; the gallery sends them newest first. */
export function sortPictures(pictures: GalleryPictureView[], sort: Sort): GalleryPictureView[] {
  if (sort === 'newest') return pictures
  if (sort === 'name') return [...pictures].sort(byName)
  // By object: named pictures by their first object, the rest after them by file name.
  return [...pictures].sort((a, b) => {
    const x = a.objects[0]?.label
    const y = b.objects[0]?.label
    if (x && y) return x.localeCompare(y, undefined, { numeric: true }) || byName(a, b)
    if (x || y) return x ? -1 : 1
    return byName(a, b)
  })
}

/** Pictures whose name, folder or objects hold every word searched for. */
export function searchPictures(pictures: GalleryPictureView[], query: string): GalleryPictureView[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return pictures
  return pictures.filter(p => {
    const text = [p.name, p.folder, ...p.objects.map(o => o.label)].join(' ').toLowerCase()
    return words.every(w => text.includes(w))
  })
}

/**
 * The gallery (specs/031-gallery): every finished picture in the images folder as a grid, and a
 * viewer with a side panel on what each one shows.
 */
export function Images(): React.ReactElement {
  const [view, setView] = useState<GalleryView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    invoke<GalleryView>('gallery:browse')
      .then(setView)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const shown = useMemo(() => sortPictures(searchPictures(view?.pictures ?? [], query), sort), [view, query, sort])
  const openIndex = open === null ? -1 : shown.findIndex(p => p.path === open)
  const move = useCallback((i: number) => setOpen(shown[i]?.path ?? null), [shown])
  const close = useCallback(() => setOpen(null), [])

  if (error) {
    return (
      <PageContainer>
        <Card title="Gallery" className="max-w-lg">
          <EmptyState>The gallery could not be read: {error}</EmptyState>
        </Card>
      </PageContainer>
    )
  }

  if (!view) {
    return (
      <PageContainer>
        <Loading label="Loading the pictures" rows={4} />
      </PageContainer>
    )
  }

  if (!view.root) {
    return (
      <PageContainer>
        <Card title="Gallery" className="max-w-lg">
          <EmptyState action={<Link to={settingsLink('folders')} className="text-xs text-astro-accent hover:underline">Set your home folder</Link>}>
            The gallery shows the PNG and JPEG pictures in the images folder of your home folder. No home folder is set yet, or it has no images
            folder.
          </EmptyState>
        </Card>
      </PageContainer>
    )
  }

  const named = view.pictures.filter(p => p.objects.length > 0).length

  return (
    <PageContainer subtitle={`${view.pictures.length} pictures in ${view.root}, ${named} named for a catalogue object`}>
      {view.pictures.length === 0 ? (
        <Card title="Gallery" className="max-w-lg">
          <EmptyState action={<button onClick={() => invoke('home:open-folder', { folder_path: view.root })} className="text-xs text-astro-accent hover:underline">Open the images folder</button>}>
            No PNG or JPEG pictures are in the images folder yet. Save your finished pictures there, named after their object (M31.png), and they will
            appear here.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by file or object, such as M31 or Orion"
              className="flex-1 min-w-[16rem] bg-astro-surface border border-astro-border rounded px-3 py-1.5 text-sm text-astro-text placeholder:text-astro-muted focus:outline-none focus:border-astro-accent"
            />
            <select
              value={sort}
              onChange={e => setSort(e.target.value as Sort)}
              aria-label="Sort pictures"
              className="bg-astro-surface border border-astro-border rounded px-2 py-1.5 text-sm text-astro-text"
            >
              {SORTS.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            {query && <span className="text-xs text-astro-muted">{shown.length} shown</span>}
          </div>

          {shown.length === 0 ? (
            <EmptyState>No picture matches “{query}”.</EmptyState>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {shown.map(p => (
                <PictureTile key={p.path} picture={p} onOpen={() => setOpen(p.path)} />
              ))}
            </div>
          )}
        </div>
      )}

      {openIndex >= 0 && <PictureViewer pictures={shown} index={openIndex} onMove={move} onClose={close} />}
    </PageContainer>
  )
}
