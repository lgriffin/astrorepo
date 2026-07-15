import React, { useState, useEffect } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import type { Observatory as ObservatoryType } from '@shared/types'

export function Observatory(): React.ReactElement {
  const [observatories, setObservatories] = useState<ObservatoryType[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', latitude: '', longitude: '', altitudeM: '0', timezone: '' })

  const fetch = () => {
    invoke<{ observatories: ObservatoryType[] }>('observatory:list')
      .then((r) => setObservatories(r.observatories))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await invoke('observatory:create', {
      name: form.name,
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      altitude_m: parseFloat(form.altitudeM),
      timezone: form.timezone || undefined
    })
    setForm({ name: '', latitude: '', longitude: '', altitudeM: '0', timezone: '' })
    setShowForm(false)
    fetch()
  }

  const handleSetPrimary = async (id: string) => {
    await invoke('observatory:set-primary', { id })
    fetch()
  }

  return (
    <PageContainer
      title="Observatory"
      subtitle="Manage observation locations"
      actions={
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-astro-accent text-white rounded text-sm hover:bg-astro-accent/80">
          {showForm ? 'Cancel' : 'Add Location'}
        </button>
      }
    >
      {showForm && (
        <form onSubmit={handleCreate} className="bg-astro-surface border border-astro-border rounded-lg p-4 mb-6 max-w-xl">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="block col-span-2">
              <span className="text-xs text-astro-muted">Name</span>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required
                className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent"
                placeholder="Home Observatory" />
            </label>
            <label className="block">
              <span className="text-xs text-astro-muted">Latitude</span>
              <input value={form.latitude} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} required type="number" step="any"
                className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent"
                placeholder="53.3498" />
            </label>
            <label className="block">
              <span className="text-xs text-astro-muted">Longitude</span>
              <input value={form.longitude} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} required type="number" step="any"
                className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent"
                placeholder="-6.2603" />
            </label>
            <label className="block">
              <span className="text-xs text-astro-muted">Altitude (m)</span>
              <input value={form.altitudeM} onChange={(e) => setForm((f) => ({ ...f, altitudeM: e.target.value }))} type="number"
                className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent" />
            </label>
            <label className="block">
              <span className="text-xs text-astro-muted">Timezone</span>
              <input value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent"
                placeholder="Europe/Dublin" />
            </label>
          </div>
          <button type="submit" className="px-4 py-2 bg-astro-accent text-white rounded text-sm">Save</button>
        </form>
      )}

      {loading ? (
        <div className="text-astro-muted">Loading...</div>
      ) : observatories.length === 0 ? (
        <div className="text-center py-12 text-astro-muted">No observatory locations registered yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {observatories.map((obs) => (
            <div key={obs.id} className="bg-astro-surface border border-astro-border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-astro-text">{obs.name}</h3>
                  <p className="text-xs text-astro-muted mt-1">
                    {obs.latitude.toFixed(4)}N, {obs.longitude.toFixed(4)}E @ {obs.altitudeM}m
                  </p>
                  {obs.timezone && <p className="text-xs text-astro-muted">{obs.timezone}</p>}
                </div>
                {obs.isPrimary ? (
                  <span className="text-xs px-2 py-0.5 bg-astro-accent/10 text-astro-accent rounded-full">Primary</span>
                ) : (
                  <button onClick={() => handleSetPrimary(obs.id)} className="text-xs text-astro-muted hover:text-astro-accent">
                    Set Primary
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
