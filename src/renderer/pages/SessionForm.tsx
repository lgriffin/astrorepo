import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'

export function SessionForm(): React.ReactElement {
  const navigate = useNavigate()
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

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await invoke('sessions:create', {
        date: form.date,
        locationFreetext: form.locationFreetext || null,
        skyQuality: form.skyQuality ? parseFloat(form.skyQuality) : null,
        weather: form.weather || null,
        seeing: form.seeing || null,
        transparency: form.transparency || null,
        moonPhase: form.moonPhase ? parseFloat(form.moonPhase) : null,
        moonDistance: form.moonDistance ? parseFloat(form.moonDistance) : null,
        exposureStrategy: form.exposureStrategy || null,
        totalFrames: form.totalFrames ? parseInt(form.totalFrames) : null,
        acceptedFrames: form.acceptedFrames ? parseInt(form.acceptedFrames) : null,
        rejectedFrames: form.rejectedFrames ? parseInt(form.rejectedFrames) : null,
        totalExposureSec: form.totalExposureSec ? parseFloat(form.totalExposureSec) : null,
        guidingNotes: form.guidingNotes || null,
        notes: form.notes || null
      })
      navigate('/dashboard')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageContainer title="Record Session" subtitle="Log a new observation session">
      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        <Section title="When & Where">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Date" value={form.date} onChange={(v) => update('date', v)} type="date" required />
            <FormField label="Location" value={form.locationFreetext} onChange={(v) => update('locationFreetext', v)} placeholder="Observatory name or location" />
          </div>
        </Section>

        <Section title="Conditions">
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
        </Section>

        <Section title="Capture">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField label="Exposure Strategy" value={form.exposureStrategy} onChange={(v) => update('exposureStrategy', v)} placeholder="e.g., 300s Ha, 180s OIII" />
            <FormField label="Total Frames" value={form.totalFrames} onChange={(v) => update('totalFrames', v)} type="number" />
            <FormField label="Accepted Frames" value={form.acceptedFrames} onChange={(v) => update('acceptedFrames', v)} type="number" />
            <FormField label="Rejected Frames" value={form.rejectedFrames} onChange={(v) => update('rejectedFrames', v)} type="number" />
            <FormField label="Total Exposure (sec)" value={form.totalExposureSec} onChange={(v) => update('totalExposureSec', v)} type="number" />
          </div>
        </Section>

        <Section title="Notes">
          <FormField label="Guiding Notes" value={form.guidingNotes} onChange={(v) => update('guidingNotes', v)} multiline />
          <FormField label="Session Notes" value={form.notes} onChange={(v) => update('notes', v)} multiline />
        </Section>

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

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
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
