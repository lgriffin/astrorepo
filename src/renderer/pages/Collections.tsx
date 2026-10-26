import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { EmptyState } from '../components/common/Card'
import { invoke } from '../hooks/useIPC'
import type { Collection, CollectionWithStats } from '@shared/types'
import { Button, Field, Input, Loading } from '../components/ui'
import { useToast } from '../contexts/ToastContext'

export function Collections(): React.ReactElement {
  const [collections, setCollections] = useState<CollectionWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const { addToast } = useToast()

  // A collection of the user's own, opened at once so targets can be added to it (LF-030).
  const create = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      const made = await invoke<Collection>('collections:create', { name: name.trim() })
      void navigate(`/collections/${made.id}`)
    } catch (err) {
      addToast(`The collection could not be made: ${err instanceof Error ? err.message : String(err)}`, 'error')
      setCreating(false)
    }
  }

  useEffect(() => {
    invoke<{ collections: CollectionWithStats[] }>('collections:list')
      .then((r) => setCollections(r.collections))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <PageContainer>
        <Loading label="Loading the collections" rows={4} />
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
        <EmptyState>No collections yet. Make one below, then add targets to it from Targets.</EmptyState>
      )}

      <form onSubmit={e => void create(e)} className="mt-6 flex max-w-lg items-end gap-2">
        <Field label="New collection" className="flex-1">
          {f => <Input id={f.id} aria-describedby={f.describedBy} value={name} onChange={e => setName(e.target.value)} placeholder="For example, winter galaxies" />}
        </Field>
        <Button type="submit" variant="primary" busy={creating} disabled={!name.trim()}>Make it</Button>
      </form>
    </PageContainer>
  )
}
