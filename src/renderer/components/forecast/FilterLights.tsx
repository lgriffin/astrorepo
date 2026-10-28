import React, { useEffect, useState } from 'react'
import type { FilterLightView } from '@shared/types'
import { invoke } from '../../hooks/useIPC'
import { useLearning } from '../../contexts/LearningContext'
import { Explain } from '../ui'

/**
 * What your filters catch (specs/042-learning, L5): for each filter a target was shot through, the
 * light it passes, and for narrowband and dual-band filters the emission lines with their
 * wavelengths. Hidden while learning is off and for filters it does not recognise.
 */
export function FilterLights({ filters }: { filters: string[] }): React.ReactElement | null {
  const { level } = useLearning()
  const [lights, setLights] = useState<FilterLightView[]>([])
  const key = filters.join('\u0000')

  useEffect(() => {
    // An answer for another target's filters must not land on this one.
    let current = true
    setLights([])
    if (level === 'off' || filters.length === 0) return
    invoke<FilterLightView[]>('learning:filters', { filters })
      .then(l => { if (current) setLights(l ?? []) })
      .catch(error => console.warn('The filters could not be explained:', error))
    return () => {
      current = false
    }
    // The names, not the array, decide when to ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, level])

  if (level === 'off' || lights.length === 0) return null
  return (
    <div className="rounded border border-astro-border bg-astro-bg/40 p-3">
      <h3 className="font-condensed text-xs text-astro-muted">
        What your filters catch {lights.some(l => l.lines.length > 0) && <Explain concept="emission-lines" />}
      </h3>
      <ul className="mt-1 space-y-1.5 text-sm text-astro-text">
        {lights.map(l => (
          <li key={l.filter}>
            <span className="font-medium">{l.filter}:</span> {l.passes}
            {l.lines.length > 0 && (
              <span className="block text-xs text-astro-muted">
                {l.lines.map((line, i) => (
                  <React.Fragment key={line.name}>
                    {i > 0 && '; '}
                    {line.name}, {line.nm} nm, {line.colour} <Explain concept={line.concept} />
                  </React.Fragment>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
      {level === 'deep' && lights.filter(l => l.kind === 'narrowband').length >= 2 && (
        <p className="mt-2 text-xs text-astro-muted">
          With two or more narrowband filters, each line can go to its own colour channel <Explain concept="hubble-palette" />
        </p>
      )}
    </div>
  )
}
