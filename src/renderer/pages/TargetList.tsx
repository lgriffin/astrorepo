import React, { useState, useEffect, useCallback } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { SearchBar } from '../components/target/SearchBar'
import { TargetCard } from '../components/target/TargetCard'
import { invoke } from '../hooks/useIPC'
import type { TargetSummary, WorkflowStage } from '@shared/types'

const PAGE_SIZE = 48

const objectTypeFilters = [
  { value: '', label: 'All Types' },
  { value: 'galaxy', label: 'Galaxies' },
  { value: 'emission_nebula', label: 'Emission Nebulae' },
  { value: 'reflection_nebula', label: 'Reflection Nebulae' },
  { value: 'planetary_nebula', label: 'Planetary Nebulae' },
  { value: 'dark_nebula', label: 'Dark Nebulae' },
  { value: 'open_cluster', label: 'Open Clusters' },
  { value: 'globular_cluster', label: 'Globular Clusters' },
  { value: 'supernova_remnant', label: 'Supernova Remnants' },
  { value: 'galaxy_cluster', label: 'Galaxy Clusters' },
  { value: 'star', label: 'Stars' },
  { value: 'custom', label: 'Custom Targets' }
]

export function TargetList(): React.ReactElement {
  const [targets, setTargets] = useState<TargetSummary[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [stages, setStages] = useState<WorkflowStage[]>([])

  useEffect(() => {
    invoke<WorkflowStage[]>('workflow:stages').then(setStages)
  }, [])

  const fetchTargets = useCallback(async () => {
    setLoading(true)
    try {
      const result = await invoke<{ targets: TargetSummary[]; total: number }>('targets:search', {
        query,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE
      })
      const filtered = typeFilter
        ? result.targets.filter((t) => t.objectType === typeFilter)
        : result.targets
      setTargets(filtered)
      setTotal(typeFilter ? filtered.length : result.total)
    } finally {
      setLoading(false)
    }
  }, [query, page, typeFilter])

  useEffect(() => {
    fetchTargets()
  }, [fetchTargets])

  const handleSearch = useCallback((q: string) => {
    setQuery(q)
    setPage(0)
  }, [])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <PageContainer title="Targets" subtitle={`${total} targets found`}>
      <div className="space-y-4">
        <div className="flex gap-4 items-start">
          <div className="flex-1">
            <SearchBar onSearch={handleSearch} />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value)
              setPage(0)
            }}
            className="px-3 py-2.5 bg-astro-surface border border-astro-border rounded-lg
                       text-astro-text focus:outline-none focus:border-astro-accent"
          >
            {objectTypeFilters.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-astro-muted">Loading targets...</div>
        ) : targets.length === 0 ? (
          <div className="text-center py-12 text-astro-muted">
            {query ? 'No targets match your search.' : 'No targets loaded yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {targets.map((target) => (
              <TargetCard key={target.id} target={target} stages={stages} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 bg-astro-surface border border-astro-border rounded
                         text-sm text-astro-muted hover:text-astro-text disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-astro-muted">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 bg-astro-surface border border-astro-border rounded
                         text-sm text-astro-muted hover:text-astro-text disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
