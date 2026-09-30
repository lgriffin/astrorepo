import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import type { CollectionWithStats } from '@shared/types'

export function Collections(): React.ReactElement {
  const [collections, setCollections] = useState<CollectionWithStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    invoke<{ collections: CollectionWithStats[] }>('collections:list')
      .then((r) => setCollections(r.collections))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <PageContainer>
        <div className="text-astro-muted">Loading collections...</div>
      </PageContainer>
    )
  }

  return (
    <PageContainer subtitle={`${collections.length} collections`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {collections.map((c) => {
          const obsPct = c.total > 0 ? Math.round((c.observed / c.total) * 100) : 0
          return (
            <Link
              key={c.id}
              to={`/collections/${c.id}`}
              className="block bg-astro-surface border border-astro-border rounded-lg p-4 hover:border-astro-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-astro-text">{c.name}</h3>
                {c.isAuto && (
                  <span className="text-xs px-1.5 py-0.5 bg-astro-accent/10 text-astro-accent rounded">
                    Auto
                  </span>
                )}
              </div>
              {c.description && (
                <p className="text-xs text-astro-muted mb-3 line-clamp-2">{c.description}</p>
              )}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-astro-muted">
                  <span>{c.observed} / {c.total} observed</span>
                  <span>{obsPct}%</span>
                </div>
                <div className="w-full h-1.5 bg-astro-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-astro-accent rounded-full transition-all"
                    style={{ width: `${obsPct}%` }}
                  />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {collections.length === 0 && (
        <div className="text-center py-12 text-astro-muted">No collections yet.</div>
      )}
    </PageContainer>
  )
}
