import React, { useState } from 'react'
import { invoke } from '../../hooks/useIPC'
import { useToast } from '../../contexts/ToastContext'
import { Card } from '../common/Card'
import { SessionList } from '../session/SessionList'
import type { Target } from '@shared/types'

/** Notes and nights: what you know about the target, your notes, and the nights you logged (UX-009). */
export function NotesTab({ target, onChange }: { target: Target; onChange: (t: Target) => void }): React.ReactElement {
  const typeLabel = target.objectType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return (
    <div className="space-y-6">
      <EditableTextSection title="Notes" value={target.notes} fieldName="notes" targetId={target.id} onSaved={v => onChange({ ...target, notes: v })} />
      <EditableTextSection
        title="Description"
        value={target.description}
        fieldName="description"
        targetId={target.id}
        onSaved={v => onChange({ ...target, description: v })}
      />
      <Card title="Nights logged">
        <SessionList targetId={target.id} />
      </Card>
      <Card title="Details">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Object type" value={typeLabel} />
          {target.constellation && <Field label="Constellation" value={target.constellation} />}
          {target.magnitude !== null && <Field label="Magnitude" value={target.magnitude.toFixed(1)} />}
          {target.raHours !== null && <Field label="RA (hours)" value={target.raHours.toFixed(4)} />}
          {target.decDegrees !== null && <Field label="Dec (degrees)" value={target.decDegrees.toFixed(4)} />}
          {target.angularSizeArcmin !== null && <Field label="Angular size" value={`${target.angularSizeArcmin.toFixed(1)} arcmin`} />}
          {target.isCustom && <Field label="Custom target" value="Yes" />}
        </div>
      </Card>
    </div>
  )
}

function EditableTextSection({ title, value, fieldName, targetId, onSaved }: {
  title: string
  value: string | null
  fieldName: string
  targetId: string
  onSaved: (v: string | null) => void
}): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()

  const handleSave = async () => {
    setSaving(true)
    try {
      await invoke('targets:update', { id: targetId, fields: { [fieldName]: draft || null } })
      onSaved(draft || null)
      addToast(`${title} updated`, 'success')
      setEditing(false)
    } catch {
      addToast(`Failed to update ${title.toLowerCase()}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      title={title}
      action={
        !editing && (
          <button
            onClick={() => { setDraft(value ?? ''); setEditing(true) }}
            className="text-xs text-astro-muted hover:text-astro-accent transition-colors"
          >
            {value ? 'Edit' : 'Add'}
          </button>
        )
      }
    >
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text h-28 resize-y focus:outline-none focus:border-astro-accent"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs bg-astro-accent text-white rounded hover:bg-astro-accent/80 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-xs text-astro-muted hover:text-astro-text"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : value ? (
        <p className="text-sm text-astro-text leading-relaxed whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-sm text-astro-muted italic">No {title.toLowerCase()} yet. Click Add to write one.</p>
      )}
    </Card>
  )
}

export function Field({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <span className="text-xs text-astro-muted">{label}</span>
      <p className="text-sm text-astro-text capitalize">{value}</p>
    </div>
  )
}
