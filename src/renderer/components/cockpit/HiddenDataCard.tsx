import React from 'react'
import { useNavigate } from 'react-router-dom'
import type { HiddenDataItem } from '@shared/types'

/** "Hidden in your files": data that exists but has not become anything yet (DSC-006). */
export function HiddenDataCard({ items }: { items: HiddenDataItem[] }): React.ReactElement {
  const navigate = useNavigate()
  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
      <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-4">Hidden in your files</h2>
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
