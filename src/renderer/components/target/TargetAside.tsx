import React, { useEffect, useState } from 'react'
import { invoke } from '../../hooks/useIPC'
import { Card } from '../common/Card'
import { Field } from './NotesTab'
import type { CatalogueEntry, Target, TargetAlias } from '@shared/types'

/** Beside every part of a target's page: its image and its other names. */
export function TargetAside({ target, aliases, catalogueEntries }: { target: Target; aliases: TargetAlias[]; catalogueEntries: CatalogueEntry[] }): React.ReactElement {
  return (
    <div className="space-y-6">
      <ThumbnailSection targetId={target.id} targetName={target.canonicalName} />
      {aliases.length > 0 && (
        <Card title="Also known as">
          <ul className="space-y-1">
            {aliases.map(a => (
              <li key={a.id} className="text-sm text-astro-text flex items-center gap-2">
                <span>{a.alias}</span>
                {a.source && <span className="text-xs text-astro-muted">({a.source})</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {catalogueEntries.length > 0 && (
        <Card title="Catalogue designations">
          <ul className="space-y-1">
            {catalogueEntries.map(ce => (
              <li key={ce.id} className="text-sm text-astro-text">{ce.designation}</li>
            ))}
          </ul>
        </Card>
      )}
      {(target.simbadId || target.nedId) && (
        <Card title="External IDs">
          <div className="space-y-1 text-sm">
            {target.simbadId && <Field label="SIMBAD" value={target.simbadId} />}
            {target.nedId && <Field label="NED" value={target.nedId} />}
          </div>
        </Card>
      )}
    </div>
  )
}

function ThumbnailSection({ targetId, targetName }: { targetId: string; targetName: string }): React.ReactElement | null {
  const [images, setImages] = useState<Array<{ path: string; data: string; mime: string }>>([])
  const [fallback, setFallback] = useState<{ data: string; mime: string } | null>(null)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    invoke<{ images: Array<{ path: string; data: string; mime: string }> }>('targets:images', { id: targetId })
      .then(r => {
        if (r.images.length > 0) {
          setImages(r.images)
        } else {
          invoke<{ data: string | null; mime?: string }>('targets:get-thumbnail', { id: targetId })
            .then(tr => { if (tr.data) setFallback({ data: tr.data, mime: tr.mime ?? 'image/jpeg' }) })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [targetId])

  if (images.length === 0 && !fallback) return null

  if (images.length === 0 && fallback) {
    return (
      <Card title="Image">
        <img src={`data:${fallback.mime};base64,${fallback.data}`} alt={targetName} className="w-full rounded-lg" />
      </Card>
    )
  }

  const img = images[current]
  const fileName = img.path.split(/[\\/]/).pop() ?? ''

  return (
    <Card title={`Images (${current + 1}/${images.length})`}>
      <div className="relative">
        <img src={`data:${img.mime};base64,${img.data}`} alt={targetName} className="w-full rounded-lg" />
        {images.length > 1 && (
          <>
            <button
              onClick={() => setCurrent((current - 1 + images.length) % images.length)}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 text-sm"
            >
              &lsaquo;
            </button>
            <button
              onClick={() => setCurrent((current + 1) % images.length)}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 text-sm"
            >
              &rsaquo;
            </button>
          </>
        )}
      </div>
      <p className="text-[10px] text-astro-muted mt-1.5 truncate">{fileName}</p>
      {images.length > 1 && (
        <div className="flex justify-center gap-1 mt-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === current ? 'bg-astro-accent' : 'bg-astro-border'}`}
            />
          ))}
        </div>
      )}
    </Card>
  )
}
