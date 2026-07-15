import React, { useState, useEffect } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import type { Equipment as EquipmentType } from '@shared/types'

const equipmentTypes = [
  'camera', 'telescope', 'reducer', 'barlow', 'mount', 'guide_camera', 'guide_scope',
  'filter_wheel', 'filter', 'rotator', 'dew_heater', 'power_supply', 'mini_pc', 'observatory_dome'
]

export function Equipment(): React.ReactElement {
  const [items, setItems] = useState<EquipmentType[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', equipmentType: 'telescope', manufacturer: '', model: '' })

  const fetchEquipment = () => {
    invoke<{ equipment: EquipmentType[] }>('equipment:list')
      .then((r) => setItems(r.equipment))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchEquipment() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await invoke('equipment:create', {
      name: form.name,
      equipment_type: form.equipmentType,
      manufacturer: form.manufacturer || undefined,
      model: form.model || undefined
    })
    setForm({ name: '', equipmentType: 'telescope', manufacturer: '', model: '' })
    setShowForm(false)
    fetchEquipment()
  }

  return (
    <PageContainer
      title="Equipment"
      subtitle={`${items.length} items registered`}
      actions={
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 bg-astro-accent text-white rounded text-sm hover:bg-astro-accent/80"
        >
          {showForm ? 'Cancel' : 'Add Equipment'}
        </button>
      }
    >
      {showForm && (
        <form onSubmit={handleCreate} className="bg-astro-surface border border-astro-border rounded-lg p-4 mb-6 max-w-xl">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="block">
              <span className="text-xs text-astro-muted">Name</span>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required
                className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent" />
            </label>
            <label className="block">
              <span className="text-xs text-astro-muted">Type</span>
              <select value={form.equipmentType} onChange={(e) => setForm((f) => ({ ...f, equipmentType: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent">
                {equipmentTypes.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-astro-muted">Manufacturer</span>
              <input value={form.manufacturer} onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent" />
            </label>
            <label className="block">
              <span className="text-xs text-astro-muted">Model</span>
              <input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent" />
            </label>
          </div>
          <button type="submit" className="px-4 py-2 bg-astro-accent text-white rounded text-sm">Save</button>
        </form>
      )}

      {loading ? (
        <div className="text-astro-muted">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-astro-muted">No equipment registered yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((eq) => (
            <div key={eq.id} className="bg-astro-surface border border-astro-border rounded-lg p-4">
              <h3 className="font-semibold text-astro-text">{eq.name}</h3>
              <span className="text-xs text-astro-muted capitalize">{eq.equipmentType.replace(/_/g, ' ')}</span>
              {eq.manufacturer && <p className="text-xs text-astro-muted mt-1">{eq.manufacturer} {eq.model || ''}</p>}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
