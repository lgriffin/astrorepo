import React, { useEffect, useState } from 'react'
import { Button, Input } from '../ui'
import { invoke } from '../../hooks/useIPC'
import type { TargetSummary } from '@shared/types'

/** Search the targets by name and pick one; the search runs from two letters. */
export function TargetPicker({ onPick, label = 'Find a target', exclude = [] }: { onPick: (t: { id: string; name: string }) => void; label?: string; exclude?: string[] }): React.ReactElement {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<TargetSummary[]>([])

  useEffect(() => {
    if (query.trim().length < 2) {
      setMatches([])
      return
    }
    let current = true
    invoke<{ targets: TargetSummary[] }>('targets:search', { query, limit: 8 })
      .then(r => current && setMatches(r.targets))
      .catch(() => current && setMatches([]))
    return () => {
      current = false
    }
  }, [query])

  const shown = matches.filter(t => !exclude.includes(t.id))
  return (
    <div className="space-y-2">
      <Input aria-label={label} value={query} onChange={e => setQuery(e.target.value)} placeholder={label} className="w-64" />
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {shown.map(t => (
            <Button
              key={t.id}
              size="sm"
              variant="secondary"
              onClick={() => {
                onPick({ id: t.id, name: t.canonicalName })
                setQuery('')
                setMatches([])
              }}
            >
              {t.canonicalName}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
