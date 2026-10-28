import React, { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { PageContainer } from '../components/common/PageContainer'
import { Card, EmptyState } from '../components/common/Card'
import { Button, Loading } from '../components/ui'
import { useLearning } from '../contexts/LearningContext'
import { CONCEPT_PLACES, conceptAtLevel } from '@shared/learning'
import { settingsLink } from '@shared/navigation'
import type { ConceptView } from '@shared/types'

/** The Learn page's link to one idea. */
const ideaLink = (id: string): string => `/learn?concept=${encodeURIComponent(id)}`

/**
 * Learn (specs/042-learning, L7): every idea the app explains, by theme, each with a link to where
 * it shows up in your own data, and the ideas you have opened lately (kept on this computer, never
 * a score). An idea named in the address (`?concept=`) is brought into view and joins the trail.
 * The page explains every idea in full whatever the level, since opening it is asking; the level
 * only sets how much the "Why?"s elsewhere say.
 */
export function Learn(): React.ReactElement {
  const { level, library, concept, trail, remember, forget } = useLearning()
  const wanted = new URLSearchParams(useLocation().search).get('concept')
  const loaded = library.concepts.length > 0
  // The idea last brought up by the address, so it joins the trail once per visit, not again when
  // the trail changes (Forget them must leave it empty).
  const brought = useRef<string | null>(null)

  useEffect(() => {
    if (!wanted || !loaded || brought.current === wanted || !concept(wanted)) return
    brought.current = wanted
    remember(wanted)
    document.getElementById(`concept-${wanted}`)?.scrollIntoView({ block: 'start' })
  }, [wanted, loaded, concept, remember])

  if (!loaded) {
    return (
      <PageContainer>
        <Loading label="Reading the ideas" />
      </PageContainer>
    )
  }

  const opened = trail.map(id => concept(id)).filter((c): c is ConceptView => c !== null)

  return (
    <PageContainer subtitle={`${library.concepts.length} ideas, each with where to see it in your own data`}>
      <div className="space-y-6">
        {level === 'off' && (
          <p className="text-sm text-astro-muted">
            Learning is off, so the rest of the app explains nothing; this page still does.{' '}
            <Link to={settingsLink('learning')} className="text-astro-accent hover:underline">
              Change it in Settings
            </Link>
          </p>
        )}

        <Card
          title="Ideas you have opened"
          action={
            opened.length > 0 && (
              <Button size="sm" onClick={forget}>
                Forget them
              </Button>
            )
          }
        >
          {opened.length === 0 ? (
            <EmptyState>Each idea you open with a “Why?” anywhere in the app, or here, is listed, most recent first. It stays on this computer.</EmptyState>
          ) : (
            <ol className="flex flex-wrap gap-2 text-sm">
              {opened.map(c => (
                <li key={c.id}>
                  <Link to={ideaLink(c.id)} className="inline-block rounded border border-astro-border px-2 py-0.5 text-astro-accent hover:bg-astro-surface">
                    {c.title}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {library.themes.map(theme => (
          <Card key={theme.id} title={theme.title}>
            <div className="space-y-5">
              {theme.concepts.map(id => {
                const c = concept(id)
                return c ? <Idea key={id} concept={c} chosen={id === wanted} /> : null
              })}
            </div>
          </Card>
        ))}
      </div>
    </PageContainer>
  )
}

/** One idea at full length, its next ideas, where to see it and its sources. */
function Idea({ concept: c, chosen }: { concept: ConceptView; chosen: boolean }): React.ReactElement {
  const { concept, source, openSource } = useLearning()
  const text = conceptAtLevel(c, 'deep')!
  const place = CONCEPT_PLACES[c.id]
  return (
    <article id={`concept-${c.id}`} className={`scroll-mt-6 rounded p-3 ${chosen ? 'border border-astro-accent bg-astro-accent/5' : ''}`}>
      <h3 className="font-condensed text-base font-semibold text-astro-text">{c.title}</h3>
      <p className="mt-1 text-sm text-astro-text">{text.short}</p>
      {text.detail && <p className="mt-2 text-sm text-astro-muted">{text.detail}</p>}
      {text.formula && <p className="mt-2 inline-block rounded bg-astro-bg px-2 py-1 font-mono text-xs text-astro-text">{text.formula}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {place && (
          <Link to={place.to} className="text-astro-accent hover:underline">
            See it: {place.label}
          </Link>
        )}
        {c.related.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            <span className="text-astro-muted">Next:</span>
            {c.related.map(r => {
              const next = concept(r)
              return next ? (
                <Link key={r} to={ideaLink(r)} className="rounded border border-astro-border px-1.5 py-0.5 text-astro-accent hover:bg-astro-surface">
                  {next.title}
                </Link>
              ) : null
            })}
          </span>
        )}
        {c.sources.map(s => {
          const src = source(s)
          return src ? (
            <button key={s} type="button" onClick={() => openSource(s)} className="inline-flex items-center gap-1 text-astro-muted hover:text-astro-accent hover:underline">
              <ExternalLink aria-hidden className="h-3 w-3" />
              {src.title}, {src.publisher}
            </button>
          ) : null
        })}
      </div>
    </article>
  )
}
