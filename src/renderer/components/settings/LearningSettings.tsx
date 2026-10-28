import React, { useRef, useState } from 'react'
import type { LearningLevel } from '@shared/learning'
import { Card } from '../common/Card'
import { Explain, radioKeyTarget } from '../ui'
import { useLearning } from '../../contexts/LearningContext'

const CHOICES: { id: LearningLevel; label: string; hint: string }[] = [
  { id: 'off', label: 'Off', hint: 'No explanations; safety warnings still show' },
  { id: 'short', label: 'Short', hint: 'A one-line answer behind every "Why?"' },
  { id: 'deep', label: 'Deep', hint: 'The answer, a paragraph more and the formula behind it' }
]

/** Settings → Learning (LRN-004): how much the app explains the astrophysics behind what it shows. */
export function LearningSettings(): React.ReactElement {
  const { level, choose } = useLearning()
  const [failed, setFailed] = useState(false)
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const pick = async (next: LearningLevel): Promise<void> => {
    setFailed(!(await choose(next)))
  }

  const onKey = (e: React.KeyboardEvent, i: number): void => {
    const next = radioKeyTarget(e.key, i, CHOICES.length)
    if (next === null) return
    e.preventDefault()
    refs.current[next]?.focus()
    void pick(CHOICES[next].id)
  }

  return (
    <Card title="Learning">
      <p className="mb-3 text-sm text-astro-muted">
        Each target explains what kind of object it is and what makes its light, and a "Why?" beside a number opens the idea
        behind it. Every fact names its source. Try one: <Explain concept="light-year" />
      </p>
      <div role="radiogroup" aria-label="How much to explain" className="grid gap-2 sm:grid-cols-3">
        {CHOICES.map((c, i) => {
          const selected = c.id === level
          return (
            <button
              key={c.id}
              ref={el => (refs.current[i] = el)}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => void pick(c.id)}
              onKeyDown={e => onKey(e, i)}
              className={`rounded-md border p-2 text-left transition-colors ${
                selected ? 'border-astro-accent bg-astro-accent/10' : 'border-astro-border hover:border-astro-muted'
              }`}
            >
              <span className="block text-sm text-astro-text">{c.label}</span>
              <span className="block text-xs text-astro-muted">{c.hint}</span>
            </button>
          )
        })}
      </div>
      {failed && <p className="mt-2 text-xs text-astro-danger">The level is used on this screen but could not be saved. It will go back after a restart.</p>}
    </Card>
  )
}
