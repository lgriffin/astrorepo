import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { invoke } from '../../hooks/useIPC'
import { formatSize } from '../../utils/format'
import type { DuplicateView, HiddenDataItem } from '@shared/types'

/** "Hidden in your files": data that exists but has not become anything yet (DSC-006). */
export function HiddenDataCard({ items, onChanged }: { items: HiddenDataItem[]; onChanged?: () => void }): React.ReactElement {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(false)
  const [duplicateSummary, setDuplicateSummary] = useState<string | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicateView | null>(null)

  const checkDuplicates = () => {
    setChecking(true)
    invoke<DuplicateView>('ingest:find-duplicates')
      .then(r => {
        setDuplicateSummary(r.summary)
        setDuplicates(r)
        onChanged?.()
      })
      .catch(() => {
        setDuplicateSummary('The duplicate check failed.')
        setDuplicates(null)
      })
      .finally(() => setChecking(false))
  }

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider">Hidden in your files</h2>
        <button
          onClick={checkDuplicates}
          disabled={checking}
          className="text-xs text-astro-accent hover:underline disabled:opacity-50"
          title="Reads only files that changed since the last check; never deletes anything"
        >
          {checking ? 'Checking for duplicates...' : 'Check for duplicates'}
        </button>
      </div>
      {duplicateSummary && <p className="text-xs text-astro-muted mb-3">{duplicateSummary}</p>}
      {duplicates && duplicates.groups.length > 0 && (
        <details className="mb-3 text-xs">
          <summary className="cursor-pointer text-astro-accent">
            Show where the copies are
            {duplicates.totalGroups > duplicates.groups.length
              ? ` (the ${duplicates.groups.length} biggest of ${duplicates.totalGroups} groups)`
              : ''}
          </summary>
          <ul className="mt-2 space-y-2 max-h-72 overflow-y-auto">
            {duplicates.groups.map(g => (
              <li key={g.paths[0]} className="p-2 bg-astro-bg rounded">
                <p className="text-astro-muted mb-1">{g.paths.length} copies of {formatSize(g.sizeBytes)}</p>
                {g.paths.map(p => (
                  <p key={p} className="text-astro-text break-all font-mono">{p}</p>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-astro-muted">Nothing hiding: every night is stacked and every sub has a target.</p>
      ) : (
        <ul className="space-y-3">
          {items.map(item => (
            <li key={item.id} className="flex items-start gap-3 p-3 bg-astro-bg rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-astro-text font-medium">{item.title}</p>
                <p className="text-xs text-astro-muted mt-0.5">{item.detail}</p>
              </div>
              {item.link && (
                <button onClick={() => navigate(item.link!)} className="shrink-0 text-xs text-astro-accent hover:underline">
                  Review
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
