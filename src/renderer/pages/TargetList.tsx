import React, { useState, useEffect, useCallback } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { SearchBar } from '../components/target/SearchBar'
import { TargetCard } from '../components/target/TargetCard'
import { invoke } from '../hooks/useIPC'
import type { TargetSummary, WorkflowStage, CollectionWithStats } from '@shared/types'

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

const sortOptions = [
  { value: 'name:asc', label: 'Name A-Z' },
  { value: 'name:desc', label: 'Name Z-A' },
  { value: 'magnitude:asc', label: 'Magnitude (brightest)' },
  { value: 'magnitude:desc', label: 'Magnitude (faintest)' },
  { value: 'constellation:asc', label: 'Constellation' },
  { value: 'workflow_stage:asc', label: 'Workflow Stage' }
]

export function TargetList(): React.ReactElement {
  const [targets, setTargets] = useState<TargetSummary[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [sort, setSort] = useState('name:asc')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [stages, setStages] = useState<WorkflowStage[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Batch action state
  const [batchStage, setBatchStage] = useState('')
  const [batchCollection, setBatchCollection] = useState('')
  const [collections, setCollections] = useState<CollectionWithStats[]>([])
  const [showBatchStage, setShowBatchStage] = useState(false)
  const [showBatchCollection, setShowBatchCollection] = useState(false)
  const [showBatchDelete, setShowBatchDelete] = useState(false)

  useEffect(() => {
    invoke<WorkflowStage[]>('workflow:stages').then(setStages)
  }, [])

  const fetchTargets = useCallback(async () => {
    setLoading(true)
    try {
      const [sortBy, sortDir] = sort.split(':')
      const result = await invoke<{ targets: TargetSummary[]; total: number }>('targets:search', {
        query,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        object_type: typeFilter || undefined,
        workflow_stage: stageFilter || undefined,
        sort_by: sortBy as 'name' | 'magnitude' | 'constellation' | 'workflow_stage',
        sort_dir: sortDir as 'asc' | 'desc'
      })
      setTargets(result.targets)
      setTotal(result.total)
    } finally {
      setLoading(false)
    }
  }, [query, page, typeFilter, stageFilter, sort])

  useEffect(() => {
    fetchTargets()
  }, [fetchTargets])

  const handleSearch = useCallback((q: string) => {
    setQuery(q)
    setPage(0)
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelected(new Set(targets.map(t => t.id)))
  }, [targets])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setShowBatchStage(false)
    setShowBatchCollection(false)
    setShowBatchDelete(false)
  }, [])

  const handleBatchAdvance = async () => {
    if (!batchStage) return
    await invoke('targets:batch-advance-stage', { target_ids: Array.from(selected), to_stage: batchStage })
    clearSelection()
    fetchTargets()
  }

  const handleBatchAddCollection = async () => {
    if (!batchCollection) return
    await invoke('targets:batch-add-collection', { target_ids: Array.from(selected), collection_id: batchCollection })
    clearSelection()
    fetchTargets()
  }

  const handleBatchDelete = async () => {
    await invoke('targets:batch-delete', { target_ids: Array.from(selected) })
    clearSelection()
    fetchTargets()
  }

  const openCollectionPicker = async () => {
    const result = await invoke<{ collections: CollectionWithStats[] }>('collections:list')
    setCollections(result.collections)
    setShowBatchCollection(true)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const selectClass = 'px-3 py-2.5 bg-astro-surface border border-astro-border rounded-lg text-astro-text text-sm focus:outline-none focus:border-astro-accent'

  return (
    <PageContainer subtitle={`${total} targets found`}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 items-start">
          <div className="flex-1 min-w-[200px]">
            <SearchBar onSearch={handleSearch} />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(0) }}
            className={selectClass}
          >
            {objectTypeFilters.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <select
            value={stageFilter}
            onChange={(e) => { setStageFilter(e.target.value); setPage(0) }}
            className={selectClass}
          >
            <option value="">All Stages</option>
            {stages.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(0) }}
            className={selectClass}
          >
            {sortOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button
            onClick={selected.size === targets.length ? clearSelection : selectAll}
            className="px-3 py-2.5 bg-astro-surface border border-astro-border rounded-lg text-astro-muted text-sm hover:text-astro-text"
          >
            {selected.size > 0 ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-astro-muted">Loading targets...</div>
        ) : targets.length === 0 ? (
          <div className="text-center py-12 text-astro-muted">
            {query || typeFilter || stageFilter ? 'No targets match your filters.' : 'No targets loaded yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {targets.map((target) => (
              <div key={target.id} className="relative">
                <div
                  className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${
                    selected.has(target.id)
                      ? 'bg-astro-accent border-astro-accent'
                      : 'bg-astro-bg/80 border-astro-border hover:border-astro-accent/50'
                  }`}
                  onClick={(e) => { e.stopPropagation(); toggleSelect(target.id) }}
                >
                  {selected.has(target.id) && (
                    <svg viewBox="0 0 12 12" className="w-3 h-3 text-white fill-current">
                      <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <TargetCard target={target} stages={stages} />
              </div>
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

        {/* Batch Action Toolbar */}
        {selected.size > 0 && (
          <div className="fixed bottom-0 left-56 right-0 bg-astro-surface border-t border-astro-border p-3 flex items-center gap-3 z-50">
            <span className="text-sm text-astro-text font-medium">{selected.size} selected</span>
            <div className="h-4 w-px bg-astro-border" />

            {showBatchStage ? (
              <div className="flex items-center gap-2">
                <select value={batchStage} onChange={e => setBatchStage(e.target.value)}
                  className="px-2 py-1 bg-astro-bg border border-astro-border rounded text-sm text-astro-text">
                  <option value="">Pick stage...</option>
                  {stages.map(s => <option key={s.id} value={s.name}>{s.name.replace(/_/g, ' ')}</option>)}
                </select>
                <button onClick={handleBatchAdvance} disabled={!batchStage}
                  className="px-3 py-1 bg-astro-accent text-white text-sm rounded disabled:opacity-50">Apply</button>
                <button onClick={() => setShowBatchStage(false)}
                  className="text-xs text-astro-muted hover:text-astro-text">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setShowBatchStage(true)}
                className="px-3 py-1.5 bg-astro-bg border border-astro-border rounded text-sm text-astro-muted hover:text-astro-text">
                Advance Stage
              </button>
            )}

            {showBatchCollection ? (
              <div className="flex items-center gap-2">
                <select value={batchCollection} onChange={e => setBatchCollection(e.target.value)}
                  className="px-2 py-1 bg-astro-bg border border-astro-border rounded text-sm text-astro-text">
                  <option value="">Pick collection...</option>
                  {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={handleBatchAddCollection} disabled={!batchCollection}
                  className="px-3 py-1 bg-astro-accent text-white text-sm rounded disabled:opacity-50">Add</button>
                <button onClick={() => setShowBatchCollection(false)}
                  className="text-xs text-astro-muted hover:text-astro-text">Cancel</button>
              </div>
            ) : (
              <button onClick={openCollectionPicker}
                className="px-3 py-1.5 bg-astro-bg border border-astro-border rounded text-sm text-astro-muted hover:text-astro-text">
                Add to Collection
              </button>
            )}

            {showBatchDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">Delete {selected.size} targets?</span>
                <button onClick={handleBatchDelete}
                  className="px-3 py-1 bg-red-500 text-white text-sm rounded">Yes, delete</button>
                <button onClick={() => setShowBatchDelete(false)}
                  className="text-xs text-astro-muted hover:text-astro-text">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setShowBatchDelete(true)}
                className="px-3 py-1.5 border border-red-500/50 text-red-400 rounded text-sm hover:bg-red-500/10">
                Delete
              </button>
            )}

            <div className="flex-1" />
            <button onClick={clearSelection}
              className="px-3 py-1.5 text-sm text-astro-muted hover:text-astro-text">
              Clear Selection
            </button>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
