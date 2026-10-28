import React from 'react'
import { TriangleAlert } from 'lucide-react'
import { sizeAgainstMoon } from '@shared/learning'
import type { Target } from '@shared/types'
import { Card } from '../common/Card'
import { Explain } from '../ui'
import { useLearning } from '../../contexts/LearningContext'

function Part({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <h3 className="font-condensed text-xs text-astro-muted">{title}</h3>
      <p className="mt-0.5 text-sm text-astro-text">{children}</p>
    </div>
  )
}

/**
 * "The physics" on a target's Overview (specs/042-learning, LRN-003): what kind of object it is,
 * what makes its light, where it comes from, what to look for and how its physics shapes the way to
 * image it, with its own magnitude and size told in words and the ideas behind them a "Why?" away.
 * A warning such as solar safety always shows, whatever the learning level (LRN-007).
 */
export function PhysicsCard({ target }: { target: Pick<Target, 'objectType' | 'magnitude' | 'angularSizeArcmin'> }): React.ReactElement | null {
  const { level, primer, concept, source, openSource } = useLearning()
  const p = primer(target.objectType)
  if (!p) return null
  const caution = p.caution && (
    <p role="note" className="flex items-start gap-2 rounded border border-astro-danger/40 bg-astro-danger/10 p-2 text-sm text-astro-text">
      <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-astro-danger" />
      <span><span className="font-semibold">Warning: </span>{p.caution}</span>
    </p>
  )
  if (level === 'off') return caution ? <Card title="Safety">{caution}</Card> : null

  const size = sizeAgainstMoon(target.angularSizeArcmin)
  return (
    <Card title={`The physics: ${p.title.charAt(0).toLowerCase()}${p.title.slice(1)}`}>
      <div className="space-y-3">
        {caution}
        <p className="text-sm text-astro-text">{p.summary}</p>
        {(target.magnitude != null || size) && (
          <p className="text-sm text-astro-text">
            {target.magnitude != null && (
              <span className="mr-3">
                Magnitude {target.magnitude} <Explain concept="apparent-magnitude" />
              </span>
            )}
            {size && (
              <span>
                {target.angularSizeArcmin}′ on the sky, {size} <Explain concept="angular-size" />
              </span>
            )}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Part title="What makes its light">{p.shines}</Part>
          <Part title="Where it comes from">{p.life}</Part>
          <Part title="What to look for">{p.inPicture}</Part>
          <Part title="How its physics shapes the imaging">{p.imaging}</Part>
        </div>
        {p.concepts.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-astro-muted">Ideas behind it:</span>
            {p.concepts.map(id => {
              const c = concept(id)
              return c ? <Explain key={id} concept={id} label={c.title} /> : null
            })}
          </div>
        )}
        <p className="text-xs text-astro-muted">
          Sources:{' '}
          {p.sources.map((s, i) => {
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
    </Card>
  )
}
