import React, { useState, useEffect } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import type { CollectionWithStats, TargetSummary } from '@shared/types'

export function Poster(): React.ReactElement {
  const [collections, setCollections] = useState<CollectionWithStats[]>([])
  const [selectedCollection, setSelectedCollection] = useState('')
  const [targets, setTargets] = useState<TargetSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    invoke<{ collections: CollectionWithStats[] }>('collections:list')
      .then((r) => setCollections(r.collections))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedCollection) {
      setTargets([])
      return
    }
    invoke<{ targets: TargetSummary[] }>('collections:get', { id: selectedCollection, limit: 200 })
      .then((r) => { if (r) setTargets(r.targets) })
  }, [selectedCollection])

  return (
    <PageContainer>
      <div className="mb-6">
        <select
          value={selectedCollection}
          onChange={(e) => setSelectedCollection(e.target.value)}
          className="px-3 py-2 bg-astro-surface border border-astro-border rounded-lg text-astro-text focus:outline-none focus:border-astro-accent"
        >
          <option value="">Select a collection...</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.completed}/{c.total})</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-astro-muted">Loading...</div>
      ) : !selectedCollection ? (
        <div className="text-center py-12 text-astro-muted">Select a collection to generate a poster preview.</div>
      ) : (
        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1">
          {targets.map((t) => {
            const isCompleted = ['published', 'printed', 'archived'].includes(t.workflowStage)
            return (
              <div
                key={t.id}
                className={`aspect-square rounded flex items-center justify-center text-xs p-1 ${
                  isCompleted
                    ? 'bg-astro-accent/20 text-astro-accent border border-astro-accent/30'
                    : 'bg-astro-bg text-astro-muted border border-astro-border/50'
                }`}
                title={t.canonicalName}
              >
                <span className="truncate text-center leading-tight">{t.canonicalName.length > 8 ? t.canonicalName.slice(0, 7) + '...' : t.canonicalName}</span>
              </div>
            )
          })}
        </div>
      )}
    </PageContainer>
  )
}
