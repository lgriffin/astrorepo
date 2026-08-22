import React, { useState, useEffect, useCallback } from 'react'
import { invoke } from '../../hooks/useIPC'
import { formatExposure } from '../../utils/format'
import type { SessionSummary } from '@shared/types'

interface SessionListProps {
  targetId?: string
}

export function SessionList({ targetId }: SessionListProps): React.ReactElement {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const result = await invoke<{ sessions: SessionSummary[]; total: number }>('sessions:list', {
        target_id: targetId,
        limit: 50
      })
      setSessions(result.sessions)
    } finally {
      setLoading(false)
    }
  }, [targetId])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  if (loading) {
    return <p className="text-sm text-astro-muted">Loading sessions...</p>
  }

  if (sessions.length === 0) {
    return <p className="text-sm text-astro-muted">No observation sessions recorded yet.</p>
  }

  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <div
          key={s.id}
          className="flex items-center justify-between px-3 py-2 bg-astro-bg rounded border border-astro-border/50"
        >
          <div>
            <span className="text-sm text-astro-text font-medium">{s.date}</span>
            {s.locationName && (
              <span className="text-xs text-astro-muted ml-2">{s.locationName}</span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-astro-muted">
            {s.totalFrames !== null && <span>{s.totalFrames} frames</span>}
            {s.totalExposureSec !== null && (
              <span>{formatExposure(s.totalExposureSec)}</span>
            )}
            {s.targetCount > 1 && <span>{s.targetCount} targets</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

