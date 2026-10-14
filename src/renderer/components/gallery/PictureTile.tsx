import React, { useEffect, useRef, useState } from 'react'
import { GALLERY_THUMB_WIDTH } from '@shared/gallery'
import type { GalleryPictureView } from '@shared/types'
import { usePicture } from './usePicture'

/** One picture in the gallery's grid (GAL-001): its thumbnail, loaded once it scrolls into view, and its caption. */
export function PictureTile({ picture, onOpen }: { picture: GalleryPictureView; onOpen: () => void }): React.ReactElement {
  const ref = useRef<HTMLButtonElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSeen(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [seen])
  const image = usePicture(picture.path, GALLERY_THUMB_WIDTH, seen)
  const caption = picture.objects.map(o => o.label).join(', ')

  return (
    <button
      ref={ref}
      onClick={onOpen}
      title={picture.folder ? `${picture.folder} / ${picture.name}` : picture.name}
      className="group text-left bg-astro-surface border border-astro-border rounded-lg overflow-hidden hover:border-astro-accent/60 focus:outline-none focus:border-astro-accent transition-colors"
    >
      <div className="aspect-square bg-astro-bg flex items-center justify-center overflow-hidden">
        {image.status === 'ready' ? (
          <img src={image.src} alt={picture.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
        ) : image.status === 'failed' ? (
          <span className="px-3 text-xs text-astro-muted text-center">Cannot show this picture</span>
        ) : (
          <div className="w-5 h-5 border-2 border-astro-border border-t-astro-accent rounded-full animate-spin" />
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="text-xs font-medium text-astro-text truncate">{caption || picture.name}</p>
        <p className="text-[11px] text-astro-muted truncate">{caption ? picture.name : picture.folder || picture.saved || ' '}</p>
      </div>
    </button>
  )
}
