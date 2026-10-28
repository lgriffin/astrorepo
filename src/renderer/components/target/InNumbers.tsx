import React, { useEffect, useState } from 'react'
import type { ObjectNumbersView } from '@shared/types'
import { invoke } from '../../hooks/useIPC'
import { Explain } from '../ui'
import { useLearning } from '../../contexts/LearningContext'

/**
 * A target in numbers (specs/042-learning, LRN-008 to LRN-010): how far away it is, how long its
 * light has travelled and when it set out, and how wide it really is, from a published distance.
 * Nothing shows for an object with no published distance held.
 */
export function InNumbers({ targetId }: { targetId: string }): React.ReactElement | null {
  const { source, openSource } = useLearning()
  const [numbers, setNumbers] = useState<ObjectNumbersView | null>(null)

  useEffect(() => {
    // An answer for a target the user has moved on from must not land on this one.
    let current = true
    setNumbers(null)
    invoke<ObjectNumbersView | null>('learning:object', { target_id: targetId })
      .then(n => { if (current) setNumbers(n ?? null) })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [targetId])

  if (!numbers) return null
  return (
    <div className="rounded border border-astro-border bg-astro-bg/40 p-3">
      <h3 className="font-condensed text-xs text-astro-muted">In numbers</h3>
      <ul className="mt-1 space-y-1 text-sm text-astro-text">
        <li>
          {numbers.approx ? 'Roughly' : 'About'} {numbers.distance.replace(/^about /, '')} away
          {numbers.range && <span className="text-astro-muted"> ({numbers.range} in the literature)</span>} <Explain concept="light-year" />
        </li>
        <li>
          The light in your pictures of it has been travelling for {numbers.travel}. {numbers.lookback} <Explain concept="lookback" />
        </li>
        {numbers.size && (
          <li>
            {numbers.size.charAt(0).toUpperCase()}{numbers.size.slice(1)}, from its size on the sky and its distance <Explain concept="angular-size" />
          </li>
        )}
      </ul>
      <p className="mt-2 text-xs text-astro-muted">
        Distance for {numbers.designation} from{' '}
        {numbers.sources.map((s, i) => {
          const src = source(s)
          return src ? (
            <React.Fragment key={s}>
              {i > 0 && ', '}
              <button type="button" onClick={() => openSource(s)} className="hover:text-astro-accent hover:underline">
                {src.title} ({src.publisher})
              </button>
            </React.Fragment>
          ) : null
        })}
      </p>
    </div>
  )
}
