import React, { useState, useEffect, useRef } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import type { ImageScanResult, ImageTargetGroup, ImageFileInfo } from '@shared/types'

export function Images(): React.ReactElement {
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<ImageScanResult | null>(null)
  const [lightbox, setLightbox] = useState<{ path: string; filename: string } | null>(null)

  useEffect(() => {
    invoke<ImageScanResult>('images:scan')
      .then(setResult)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <PageContainer>
        <div className="text-astro-muted">Loading images...</div>
      </PageContainer>
    )
  }

  if (!result || (result.targets.length === 0 && result.unmatched.length === 0)) {
    return (
      <PageContainer>
        <div className="bg-astro-surface border border-astro-border rounded-lg p-6 max-w-lg">
          <p className="text-sm text-astro-muted">
            No images found. Run a library scan from the{' '}
            <a href="#/library" className="text-astro-accent hover:underline">Library</a>{' '}
            page to discover and organize your images.
          </p>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="text-sm text-astro-muted">
          {result.totalImages} images across {result.targets.length} targets
          {result.unmatched.length > 0 && ` + ${result.unmatched.length} unmatched`}
        </div>

        {result.targets.map(group => (
          <TargetImageGroup
            key={group.normalizedName}
            group={group}
            onImageClick={(img) => setLightbox(img)}
          />
        ))}

        {result.unmatched.length > 0 && (
          <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-astro-muted uppercase tracking-wider">
                Unmatched Images ({result.unmatched.length})
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {result.unmatched.map((img, i) => (
                <ImageThumbnail
                  key={i}
                  image={img}
                  onClick={() => setLightbox(img)}
                />
              ))}
            </div>
          </div>
        )}

        {lightbox && (
          <ImageLightbox
            image={lightbox}
            onClose={() => setLightbox(null)}
          />
        )}
      </div>
    </PageContainer>
  )
}

function TargetImageGroup({ group, onImageClick }: {
  group: ImageTargetGroup
  onImageClick: (img: { path: string; filename: string }) => void
}): React.ReactElement {
  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-astro-text">{group.name}</h3>
          <span className="text-xs text-astro-muted">{group.images.length} images</span>
        </div>
        <button
          onClick={() => invoke('home:open-folder', { folder_path: group.folderPath })}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-astro-muted hover:text-astro-accent border border-astro-border rounded transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Open Folder
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {group.images.map((img, i) => (
          <ImageThumbnail
            key={i}
            image={img}
            onClick={() => onImageClick(img)}
          />
        ))}
      </div>
    </div>
  )
}

function ImageThumbnail({ image, onClick }: {
  image: ImageFileInfo
  onClick: () => void
}): React.ReactElement {
  const [loaded, setLoaded] = useState<{ data: string; mime: string } | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const [error, setError] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !loadedRef.current) {
        loadedRef.current = true
        invoke<{ data: string; mime: string } | { unsupported: true; filename: string } | null>('images:read', { file_path: image.path })
          .then(result => {
            if (!result) {
              setError(true)
            } else if ('unsupported' in result) {
              setUnsupported(true)
            } else {
              setLoaded(result)
            }
          })
          .catch(() => setError(true))
        observer.disconnect()
      }
    }, { threshold: 0.1 })

    observer.observe(el)
    return () => observer.disconnect()
  }, [image.path])

  const isTiff = image.filename.toLowerCase().endsWith('.tif') || image.filename.toLowerCase().endsWith('.tiff')

  return (
    <div
      ref={ref}
      onClick={!unsupported && !error ? onClick : undefined}
      className={`relative aspect-square bg-astro-bg border border-astro-border rounded overflow-hidden group ${!unsupported && !error ? 'cursor-pointer' : ''}`}
    >
      {loaded ? (
        <img
          src={`data:${loaded.mime};base64,${loaded.data}`}
          alt={image.filename}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          onError={() => { setLoaded(null); setError(true) }}
        />
      ) : unsupported || isTiff ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
          <span className="text-xs font-mono px-2 py-0.5 bg-astro-border/50 rounded text-astro-muted">TIFF</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              const dir = image.path.replace(/[\\/][^\\/]+$/, '')
              invoke('home:open-folder', { folder_path: dir })
            }}
            className="text-[10px] text-astro-accent hover:underline"
          >
            Open folder
          </button>
        </div>
      ) : error ? (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-xs text-astro-muted">Failed to load</span>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-astro-border border-t-astro-accent rounded-full animate-spin" />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[10px] text-white truncate">{image.filename}</p>
      </div>
    </div>
  )
}

function ImageLightbox({ image, onClose }: {
  image: { path: string; filename: string }
  onClose: () => void
}): React.ReactElement {
  const [loaded, setLoaded] = useState<{ data: string; mime: string } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    invoke<{ data: string; mime: string } | { unsupported: true } | null>('images:read', { file_path: image.path })
      .then(result => {
        if (result && 'data' in result) setLoaded(result)
        else setError(true)
      })
      .catch(() => setError(true))
  }, [image.path])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 bg-astro-surface border border-astro-border rounded-full flex items-center justify-center text-astro-muted hover:text-white transition-colors z-10"
        >
          &times;
        </button>

        {loaded ? (
          <img
            src={`data:${loaded.mime};base64,${loaded.data}`}
            alt={image.filename}
            className="max-w-full max-h-[85vh] object-contain rounded"
          />
        ) : error ? (
          <div className="bg-astro-surface border border-astro-border rounded-lg p-8">
            <p className="text-sm text-astro-muted">Could not load image</p>
          </div>
        ) : (
          <div className="bg-astro-surface border border-astro-border rounded-lg p-8">
            <div className="w-6 h-6 border-2 border-astro-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <p className="mt-3 text-sm text-white/70">{image.filename}</p>
      </div>
    </div>
  )
}
