import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { TargetCard } from '../components/target/TargetCard'
import { invoke } from '../hooks/useIPC'
import type { Collection, TargetSummary } from '@shared/types'

export function CollectionDetail(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const [collection, setCollection] = useState<Collection | null>(null)
  const [targets, setTargets] = useState<TargetSummary[]>([])
  const [completed, setCompleted] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    invoke<{ collection: Collection; targets: TargetSummary[]; completed: number; total: number }>(
      'collections:get',
      { id }
    )
      .then((r) => {
        if (r) {
          setCollection(r.collection)
          setTargets(r.targets)
          setCompleted(r.completed)
          setTotal(r.total)
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <PageContainer title="Loading...">
        <div className="text-astro-muted">Loading collection...</div>
      </PageContainer>
    )
  }

  if (!collection) {
    return (
      <PageContainer title="Not Found">
        <div className="text-astro-muted">
          Collection not found. <Link to="/collections" className="text-astro-accent hover:underline">Back</Link>
        </div>
      </PageContainer>
    )
  }

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <PageContainer
      title={collection.name}
      subtitle={collection.description ?? undefined}
      actions={
        <Link
          to="/collections"
          className="px-3 py-1.5 bg-astro-surface border border-astro-border rounded text-sm text-astro-muted hover:text-astro-text"
        >
          Back
        </Link>
      }
    >
      <div className="mb-6 bg-astro-surface border border-astro-border rounded-lg p-4">
        <div className="flex justify-between text-sm text-astro-muted mb-2">
          <span>{completed} / {total} completed</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full h-2 bg-astro-bg rounded-full overflow-hidden">
          <div
            className="h-full bg-astro-accent rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {targets.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {targets.map((t) => (
            <TargetCard key={t.id} target={t} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-astro-muted">No targets in this collection.</div>
      )}
    </PageContainer>
  )
}
