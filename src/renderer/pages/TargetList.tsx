import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { EmptyState } from '../components/common/Card'
import { SearchBar } from '../components/target/SearchBar'
import { TargetCard } from '../components/target/TargetCard'
import { Button, Select, Tabs } from '../components/ui'
import { invoke } from '../hooks/useIPC'
import { OBJECT_TYPE_FILTERS, TARGET_SCOPES, TARGET_SORTS, stageWords, targetCountLine, type TargetScope } from '@shared/target-list'
import type { TargetSummary, WorkflowStage, CollectionWithStats } from '@shared/types'

const PAGE_SIZE = 48

export function TargetList(): React.ReactElement {
  const navigate = useNavigate()
  const [targets, setTargets] = useState<TargetSummary[]>([])
  const [total, setTotal] = useState(0)
  const [scope, setScope] = useState<TargetScope>('mine')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [sort, setSort] = useState('name:asc')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [stages, setStages] = useState<WorkflowStage[]>([])
  // Choosing is a mode: cards stay links until the user asks to pick some (LF-022).
  const [choosing, setChoosing] = useState(false)
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
        scope,
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
  }, [query, page, scope, typeFilter, stageFilter, sort])

  useEffect(() => {
    fetchTargets()
  }, [fetchTargets])

  const handleSearch = useCallback((q: string) => {
    setQuery(q)
    setPage(0)
  }, [])

  const changeScope = (next: TargetScope) => {
    setScope(next)
    setPage(0)
  }

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setShowBatchStage(false)
    setShowBatchCollection(false)
    setShowBatchDelete(false)
  }, [])

  const stopChoosing = () => {
    clearSelection()
    setChoosing(false)
  }

  const allShownSelected = targets.length > 0 && targets.every(t => selected.has(t.id))
  const toggleAllShown = () => setSelected(allShownSelected ? new Set() : new Set(targets.map(t => t.id)))

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
  const filtered = Boolean(query || typeFilter || stageFilter)

  const empty = (): React.ReactNode => {
    if (scope === 'mine' && filtered) {
      return (
        <EmptyState action={<Button size="sm" onClick={() => changeScope('all')}>Search the whole catalogue</Button>}>
          None of your targets match. The whole catalogue may have it.
        </EmptyState>
      )
    }
    if (scope === 'mine') {
      return (
        <EmptyState
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => navigate('/library')}>Scan your library</Button>
              <Button size="sm" onClick={() => changeScope('all')}>Browse the whole catalogue</Button>
            </div>
          }
        >
          No targets of yours yet. A target becomes yours once your files, a night or a collection of yours mention it.
        </EmptyState>
      )
    }
    return <EmptyState>{filtered ? 'No targets match your filters.' : 'The catalogue is empty.'}</EmptyState>
  }

  return (
    <PageContainer subtitle={loading ? undefined : targetCountLine(total, scope, filtered)}>
      <div className={`space-y-4 ${selected.size > 0 ? 'pb-20' : ''}`}>
        <Tabs tabs={TARGET_SCOPES} active={scope} onChange={changeScope} label="Which targets" />

        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[200px]">
            <SearchBar onSearch={handleSearch} />
          </div>
          <div className="w-48 shrink-0">
            <Select aria-label="Object type" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(0) }}>
              {OBJECT_TYPE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </Select>
          </div>
          <div className="w-40 shrink-0">
            <Select aria-label="Stage" value={stageFilter} onChange={(e) => { setStageFilter(e.target.value); setPage(0) }}>
              <option value="">All stages</option>
              {stages.map((s) => (
                <option key={s.id} value={s.name}>{stageWords(s.name)}</option>
              ))}
            </Select>
          </div>
          <div className="w-44 shrink-0">
            <Select aria-label="Sort by" value={sort} onChange={(e) => { setSort(e.target.value); setPage(0) }}>
              {TARGET_SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </div>
          {choosing ? (
            <>
              <Button onClick={toggleAllShown}>{allShownSelected ? 'Clear this page' : 'Choose this page'}</Button>
              <Button variant="ghost" onClick={stopChoosing}>Done</Button>
            </>
          ) : (
            <Button onClick={() => setChoosing(true)}>Choose targets</Button>
          )}
        </div>

        {loading ? (
          <div role="status" aria-label="Loading targets" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }, (_, i) => <div key={i} aria-hidden className="h-28 animate-pulse rounded-lg bg-astro-raised" />)}
          </div>
        ) : targets.length === 0 ? (
          empty()
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {targets.map((target) => (
              <li key={target.id} className="flex items-stretch gap-2">
                {choosing && (
                  <label className="flex shrink-0 cursor-pointer items-start pt-4">
                    <input
                      type="checkbox"
                      checked={selected.has(target.id)}
                      onChange={() => toggleSelect(target.id)}
                      aria-label={`Choose ${target.canonicalName}`}
                      className="h-4 w-4 accent-astro-accent"
                    />
                  </label>
                )}
                <div className="min-w-0 flex-1">
                  <TargetCard target={target} stages={stages} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-center gap-2 pt-4">
            <Button size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
            <span className="text-sm text-astro-muted">Page {page + 1} of {totalPages}</span>
            <Button size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
          </nav>
        )}

        {/* What to do with the chosen targets; it stays at the bottom of the page, whatever the sidebar's width. */}
        {selected.size > 0 && (
          <div role="region" aria-label="Chosen targets" className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center gap-3 rounded-lg border border-astro-border bg-astro-surface p-3 shadow-lg">
            <span className="text-sm text-astro-text font-medium">{selected.size} chosen</span>
            <div className="h-4 w-px bg-astro-border" />

            {showBatchStage ? (
              <div className="flex items-center gap-2">
                <div className="w-44">
                  <Select aria-label="Stage to move to" value={batchStage} onChange={e => setBatchStage(e.target.value)}>
                    <option value="">Pick a stage</option>
                    {stages.map(s => <option key={s.id} value={s.name}>{stageWords(s.name)}</option>)}
                  </Select>
                </div>
                <Button size="sm" variant="primary" onClick={handleBatchAdvance} disabled={!batchStage}>Apply</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowBatchStage(false)}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => setShowBatchStage(true)}>Advance stage</Button>
            )}

            {showBatchCollection ? (
              <div className="flex items-center gap-2">
                <div className="w-44">
                  <Select aria-label="Collection" value={batchCollection} onChange={e => setBatchCollection(e.target.value)}>
                    <option value="">Pick a collection</option>
                    {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <Button size="sm" variant="primary" onClick={handleBatchAddCollection} disabled={!batchCollection}>Add</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowBatchCollection(false)}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" onClick={openCollectionPicker}>Add to collection</Button>
            )}

            {showBatchDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-astro-danger">Delete {selected.size} targets?</span>
                <Button size="sm" variant="danger" onClick={handleBatchDelete}>Yes, delete</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowBatchDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" variant="danger" onClick={() => setShowBatchDelete(true)}>Delete</Button>
            )}

            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={clearSelection}>Clear choice</Button>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
