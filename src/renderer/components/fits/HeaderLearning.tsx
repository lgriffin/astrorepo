import React, { useEffect, useMemo, useState } from 'react'
import type { FitsHeaderRow, FitsKeywordView, FitsLearningView } from '@shared/types'
import { invoke } from '../../hooks/useIPC'
import { useLearning } from '../../contexts/LearningContext'
import { Explain } from '../ui'

/**
 * A file's header read for a learner (specs/042-learning, L3): what each keyword means, and the
 * image scale, field and sampling its optics give. Nothing is asked for while learning is off.
 */
export function useHeaderLearning(headers: FitsHeaderRow[]): {
  learning: FitsLearningView | null
  meaning: (keyword: string) => FitsKeywordView | null
} {
  const { level } = useLearning()
  const [learning, setLearning] = useState<FitsLearningView | null>(null)

  useEffect(() => {
    // An answer for a file the user has moved on from must not land on this one.
    let current = true
    setLearning(null)
    if (level === 'off' || headers.length === 0) return
    invoke<FitsLearningView>('learning:fits', { headers: headers.map(h => ({ keyword: h.keyword, value: h.value })) })
      .then(l => { if (current) setLearning(l ?? null) })
      .catch(error => console.warn('The header could not be explained:', error))
    return () => {
      current = false
    }
  }, [headers, level])

  const meaning = useMemo(() => {
    const byKeyword = new Map((learning?.keywords ?? []).map(k => [k.keyword, k]))
    return (keyword: string) => byKeyword.get(keyword.trim().toUpperCase()) ?? null
  }, [learning])

  return { learning, meaning }
}

/** The "What it means" cell beside one header line (LRN-011). */
export function KeywordMeaning({ entry }: { entry: FitsKeywordView | null }): React.ReactElement | null {
  const { level } = useLearning()
  if (!entry || level === 'off') return null
  return (
    <span className="font-sans">
      <span className="text-astro-text">{entry.meaning}</span>
      {level === 'deep' && <span className="block text-astro-muted">{entry.why}</span>}
      {entry.concept && <Explain concept={entry.concept} />}
      {!entry.standard && <span className="block text-astro-muted">A capture-software convention, not part of the FITS standard.</span>}
    </span>
  )
}

/** "Your setup" (LRN-012): how much sky a pixel sees, the whole field, and how that suits the seeing. */
export function YourSetup({ learning }: { learning: FitsLearningView | null }): React.ReactElement | null {
  const { level } = useLearning()
  if (level === 'off' || !learning || (!learning.setup && !learning.solved)) return null
  const { setup, solved } = learning
  return (
    <div className="rounded border border-astro-border bg-astro-bg/40 p-3">
      <h3 className="font-condensed text-xs text-astro-muted">Your setup</h3>
      <ul className="mt-1 space-y-1 text-sm text-astro-text">
        {setup && (
          <>
            <li>
              Image scale {setup.scale}, from {setup.inputs} <Explain concept="image-scale" />
            </li>
            {setup.field && <li>The whole frame covers {setup.field} of sky.</li>}
            <li>
              {setup.samplingText} <Explain concept="sampling" />
            </li>
          </>
        )}
        {solved && (
          <li>
            {solved} <Explain concept="wcs" />
          </li>
        )}
      </ul>
    </div>
  )
}
