import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { useToast } from '../contexts/ToastContext'
import { invoke } from '../hooks/useIPC'
import type { TargetSummary, Equipment } from '@shared/types'

export function SessionForm(): React.ReactElement {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    locationFreetext: '',
    skyQuality: '',
    weather: '',
    seeing: '',
    transparency: '',
    moonPhase: '',
    moonDistance: '',
    exposureStrategy: '',
    totalFrames: '',
    acceptedFrames: '',
    rejectedFrames: '',
    totalExposureSec: '',
    guidingNotes: '',
    notes: ''
  })

  const [selectedTargets, setSelectedTargets] = useState<Array<{ id: string; name: string }>>([])
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([])
  const [allEquipment, setAllEquipment] = useState<Equipment[]>([])

  useEffect(() => {
    invoke<{ equipment: Equipment[] }>('equipment:list').then(r => setAllEquipment(r.equipment)).catch(() => {})
  }, [])

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await invoke('sessions:create', {
        date: form.date,
        location_freetext: form.locationFreetext || null,
        sky_quality: form.skyQuality ? parseFloat(form.skyQuality) : null,
        weather: form.weather || null,
        seeing: form.seeing || null,
        transparency: form.transparency || null,
        moon_phase: form.moonPhase ? parseFloat(form.moonPhase) : null,
        moon_distance: form.moonDistance ? parseFloat(form.moonDistance) : null,
        exposure_strategy: form.exposureStrategy || null,
        total_frames: form.totalFrames ? parseInt(form.totalFrames) : null,
        accepted_frames: form.acceptedFrames ? parseInt(form.acceptedFrames) : null,
        rejected_frames: form.rejectedFrames ? parseInt(form.rejectedFrames) : null,
        total_exposure_sec: form.totalExposureSec ? parseFloat(form.totalExposureSec) : null,
        guiding_notes: form.guidingNotes || null,
        notes: form.notes || null,
        target_ids: selectedTargets.map(t => t.id),
        equipment_ids: selectedEquipmentIds
      })
      addToast('Session recorded', 'success')
      navigate('/dashboard')
    } catch {
      addToast('Failed to save session', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageContainer title="Record Session" subtitle="Log a new observation session">
      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        <FormSection title="When & Where">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Date" value={form.date} onChange={(v) => update('date', v)} type="date" required />
            <FormField label="Location" value={form.locationFreetext} onChange={(v) => update('locationFreetext', v)} placeholder="Observatory name or location" />
          </div>
        </FormSection>

        <FormSection title="Conditions">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField label="Sky Quality (mag/arcsec²)" value={form.skyQuality} onChange={(v) => update('skyQuality', v)} type="number" />
            <FormSelect label="Weather" value={form.weather} onChange={(v) => update('weather', v)}
              options={['Clear','Partly Cloudy','Hazy','Thin Cloud','Variable']} />
            <FormSelect label="Seeing" value={form.seeing} onChange={(v) => update('seeing', v)}
              options={['Excellent','Good','Average','Poor','Very Poor']} />
            <FormSelect label="Transparency" value={form.transparency} onChange={(v) => update('transparency', v)}
              options={['Excellent','Good','Average','Poor','Very Poor']} />
            <FormField label="Moon Phase (%)" value={form.moonPhase} onChange={(v) => update('moonPhase', v)} type="number" />
            <FormField label="Moon Distance (°)" value={form.moonDistance} onChange={(v) => update('moonDistance', v)} type="number" />
          </div>
        </FormSection>

        <FormSection title="Targets Observed">
          <TargetSearchSelect
            selected={selectedTargets}
            onAdd={(t) => setSelectedTargets(prev => prev.some(p => p.id === t.id) ? prev : [...prev, t])}
            onRemove={(id) => setSelectedTargets(prev => prev.filter(t => t.id !== id))}
          />
          {selectedTargets.length > 0 && (
            <p className="text-xs text-astro-muted mt-2">First target is marked as primary.</p>
          )}
        </FormSection>

        <FormSection title="Equipment Used">
          <EquipmentCheckList
            equipment={allEquipment}
            selectedIds={selectedEquipmentIds}
            onToggle={(id) => setSelectedEquipmentIds(prev =>
              prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
            )}
          />
        </FormSection>

        <FormSection title="Capture">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField label="Exposure Strategy" value={form.exposureStrategy} onChange={(v) => update('exposureStrategy', v)} placeholder="e.g., 300s Ha, 180s OIII" />
            <FormField label="Total Frames" value={form.totalFrames} onChange={(v) => update('totalFrames', v)} type="number" />
            <FormField label="Accepted Frames" value={form.acceptedFrames} onChange={(v) => update('acceptedFrames', v)} type="number" />
            <FormField label="Rejected Frames" value={form.rejectedFrames} onChange={(v) => update('rejectedFrames', v)} type="number" />
            <FormField label="Total Exposure (sec)" value={form.totalExposureSec} onChange={(v) => update('totalExposureSec', v)} type="number" />
          </div>
        </FormSection>

        <FormSection title="Notes">
          <FormField label="Guiding Notes" value={form.guidingNotes} onChange={(v) => update('guidingNotes', v)} multiline />
          <FormField label="Session Notes" value={form.notes} onChange={(v) => update('notes', v)} multiline />
        </FormSection>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-astro-accent text-white rounded-lg hover:bg-astro-accent/80 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Session'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-astro-surface border border-astro-border text-astro-muted rounded-lg hover:text-astro-text"
          >
            Cancel
          </button>
        </div>
      </form>
    </PageContainer>
  )
}

function TargetSearchSelect({ selected, onAdd, onRemove }: {
  selected: Array<{ id: string; name: string }>
  onAdd: (t: { id: string; name: string }) => void
  onRemove: (id: string) => void
}): React.ReactElement {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<TargetSummary[]>([])
  const [showDropdown, setShowDropdown] = useState(false)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    try {
      const r = await invoke<{ targets: TargetSummary[]; total: number }>('targets:search', { query: q, limit: 10 })
      setResults(r.targets.filter(t => !selected.some(s => s.id === t.id)))
    } catch {
      setResults([])
    }
  }, [selected])

  useEffect(() => {
    const timer = setTimeout(() => doSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search, doSearch])

  return (
    <div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selected.map((t, i) => (
            <span key={t.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-astro-bg border border-astro-border rounded-full text-xs text-astro-text">
              {i === 0 && <span className="text-astro-accent font-semibold">P</span>}
              {t.name}
              <button onClick={() => onRemove(t.id)} className="text-astro-muted hover:text-astro-danger ml-0.5">✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setShowDropdown(true) }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder="Search targets to add..."
          className="w-full px-3 py-2 bg-astro-bg border border-astro-border rounded text-astro-text text-sm focus:outline-none focus:border-astro-accent"
        />
        {showDropdown && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-astro-surface border border-astro-border rounded-lg shadow-xl max-h-48 overflow-y-auto z-10">
            {results.map(t => (
              <button
                key={t.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onAdd({ id: t.id, name: t.canonicalName })
                  setSearch('')
                  setResults([])
                }}
                className="w-full text-left px-3 py-2 text-sm text-astro-text hover:bg-astro-accent/10 flex items-center justify-between"
              >
                <span>{t.canonicalName}</span>
                <span className="text-xs text-astro-muted">{t.objectType.replace(/_/g, ' ')}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EquipmentCheckList({ equipment, selectedIds, onToggle }: {
  equipment: Equipment[]
  selectedIds: string[]
  onToggle: (id: string) => void
}): React.ReactElement {
  if (equipment.length === 0) {
    return <p className="text-sm text-astro-muted">No equipment added yet. Add equipment from the Equipment page.</p>
  }

  const grouped = equipment.reduce<Record<string, Equipment[]>>((acc, eq) => {
    const type = eq.equipmentType.replace(/_/g, ' ')
    ;(acc[type] ??= []).push(eq)
    return acc
  }, {})

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([type, items]) => (
        <div key={type}>
          <p className="text-xs text-astro-muted uppercase tracking-wider mb-1.5">{type}</p>
          <div className="flex flex-wrap gap-2">
            {items.map(eq => (
              <label key={eq.id} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(eq.id)}
                  onChange={() => onToggle(eq.id)}
                  className="rounded border-astro-border bg-astro-bg text-astro-accent focus:ring-astro-accent"
                />
                <span className="text-sm text-astro-text">
                  {eq.name}
                  {eq.manufacturer && <span className="text-astro-muted"> ({eq.manufacturer})</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
      <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-3">{title}</h2>
      <div>{children}</div>
    </div>
  )
}

function FormField({ label, value, onChange, type = 'text', placeholder, required, multiline }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; required?: boolean; multiline?: boolean
}): React.ReactElement {
  const cls = "w-full px-3 py-2 bg-astro-bg border border-astro-border rounded text-astro-text text-sm focus:outline-none focus:border-astro-accent"
  return (
    <label className="block">
      <span className="text-xs text-astro-muted mb-1 block">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} className={`${cls} h-20 resize-y`} placeholder={placeholder} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={cls} placeholder={placeholder} required={required} />
      )}
    </label>
  )
}

function FormSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}): React.ReactElement {
  return (
    <label className="block">
      <span className="text-xs text-astro-muted mb-1 block">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-astro-bg border border-astro-border rounded text-astro-text text-sm focus:outline-none focus:border-astro-accent"
      >
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}
