import React, { useEffect, useState } from 'react'
import type { GalleryPictureView, LookbackStopView } from '@shared/types'
import { invoke } from '../../hooks/useIPC'
import { useLearning } from '../../contexts/LearningContext'
import { Card } from '../common/Card'
import { ExternalLink } from 'lucide-react'
import { Explain } from '../ui'

/** The most pictures, and designations per picture, `learning:lookback` takes. */
const PICTURES_MAX = 100_000
const DESIGNATIONS_MAX = 20

/**
 * Back in time (specs/042-learning, L6): the gallery's pictures in order of how long their light
 * travelled, nearest first, one stop per object with a published distance. A stop opens its first
 * picture. Deep level also says when the light set out. Hidden while learning is off and when no
 * picture names an object with a distance.
 */
export function LookbackStrip({ pictures, onOpen }: { pictures: GalleryPictureView[]; onOpen: (path: string) => void }): React.ReactElement | null {
  const { level, source, openSource } = useLearning()
  const [stops, setStops] = useState<LookbackStopView[]>([])

  useEffect(() => {
    let current = true
    setStops([])
    // No more than the channel takes: pictures past the limit, and designations past the limit on one picture, are left off.
    const named = pictures
      .filter(p => p.objects.length > 0)
      .slice(0, PICTURES_MAX)
      .map(p => ({ path: p.path, designations: p.objects.flatMap(o => o.designations).slice(0, DESIGNATIONS_MAX) }))
    if (level === 'off' || named.length === 0) return
    invoke<LookbackStopView[]>('learning:lookback', { pictures: named })
      .then(s => { if (current) setStops(s ?? []) })
      .catch(error => console.warn('The pictures could not be put in order of distance:', error))
    return () => {
      current = false
    }
  }, [pictures, level])

  if (level === 'off' || stops.length === 0) return null
  return (
    <Card title="Back in time" action={<Explain concept="lookback" label="Why old light?" />}>
      <p className="text-sm text-astro-muted mb-3">Your pictures, nearest first. The farther the object, the older the light you caught.</p>
      <ol className="flex gap-3 overflow-x-auto pb-2">
        {stops.map(s => (
          <li key={s.designation} className="shrink-0 w-56">
            <button
              onClick={() => onOpen(s.paths[0])}
              className="w-full text-left rounded border border-astro-border bg-astro-bg/40 p-3 hover:border-astro-accent focus:outline-none focus-visible:border-astro-accent"
            >
              <span className="block font-medium text-astro-text">{s.designation}</span>
              <span className="block text-xs text-astro-muted">{s.distance}</span>
              <span className="block text-sm text-astro-text mt-1">Its light left {s.travel} ago.</span>
              {level === 'deep' && <span className="block text-xs text-astro-muted mt-1">{s.lookback}</span>}
              {s.paths.length > 1 && <span className="block text-xs text-astro-muted mt-1">{s.paths.length} pictures</span>}
            </button>
            {/* Where the distance and the milestone come from, outside the button that opens the picture. */}
            <span className="mt-1 block space-y-0.5 text-xs">
              {s.sources.map(id => {
                const src = source(id)
                return src ? (
                  <button key={id} type="button" onClick={() => openSource(id)} className="flex items-center gap-1 text-astro-muted hover:text-astro-accent hover:underline">
                    <ExternalLink aria-hidden className="h-3 w-3" />
                    {src.title}, {src.publisher}
                  </button>
                ) : null
              })}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
