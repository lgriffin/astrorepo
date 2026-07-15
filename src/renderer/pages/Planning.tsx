import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import type { PlannedTarget, Observatory } from '@shared/types'

export function Planning(): React.ReactElement {
  const [targets, setTargets] = useState<PlannedTarget[]>([])
  const [observatories, setObservatories] = useState<Observatory[]>([])
  const [selectedObs, setSelectedObs] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    invoke<{ observatories: Observatory[] }>('observatory:list').then((r) => {
      setObservatories(r.observatories)
      const primary = r.observatories.find((o) => o.isPrimary)
      if (primary) setSelectedObs(primary.id)
    })
  }, [])

  const fetchPlan = async () => {
    if (!selectedObs) return
    setLoading(true)
    try {
      const result = await invoke<{ targets: PlannedTarget[] }>('planning:tonight', {
        observatory_id: selectedObs,
        date,
        min_altitude: 15,
        min_hours: 1
      })
      setTargets(result.targets)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedObs) fetchPlan()
  }, [selectedObs, date])

  return (
    <PageContainer title="Planning" subtitle="Tonight's observable targets">
      <div className="flex gap-4 mb-6">
        <label className="block">
          <span className="text-xs text-astro-muted">Observatory</span>
          <select value={selectedObs} onChange={(e) => setSelectedObs(e.target.value)}
            className="mt-1 block px-3 py-2 bg-astro-surface border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent">
            <option value="">Select...</option>
            {observatories.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-astro-muted">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="mt-1 block px-3 py-2 bg-astro-surface border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent" />
        </label>
      </div>

      {loading ? (
        <div className="text-astro-muted">Computing visibility...</div>
      ) : !selectedObs ? (
        <div className="text-center py-12 text-astro-muted">Register an observatory to start planning.</div>
      ) : targets.length === 0 ? (
        <div className="text-center py-12 text-astro-muted">No targets visible tonight from this location.</div>
      ) : (
        <div className="space-y-2">
          {targets.map((pt) => (
            <Link
              key={pt.target.id}
              to={`/targets/${pt.target.id}`}
              className="flex items-center justify-between px-4 py-3 bg-astro-surface border border-astro-border rounded-lg hover:border-astro-accent/50 transition-colors"
            >
              <div>
                <span className="font-medium text-astro-text">{pt.target.canonicalName}</span>
                <span className="text-xs text-astro-muted ml-2 capitalize">{pt.target.objectType.replace(/_/g, ' ')}</span>
                {pt.target.constellation && <span className="text-xs text-astro-muted ml-2">{pt.target.constellation}</span>}
              </div>
              <div className="flex items-center gap-4 text-xs text-astro-muted">
                <span>{pt.visibility.hoursAboveHorizon.toFixed(1)}h visible</span>
                {pt.visibility.transitAltitude !== null && <span>{pt.visibility.transitAltitude.toFixed(0)}° max alt</span>}
                <span>Moon: {pt.visibility.moonSeparation.toFixed(0)}°</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
