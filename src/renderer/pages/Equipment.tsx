import React, { useState, useEffect, useCallback } from 'react'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import type { Equipment as EquipmentType, FOVResult, ImageScaleResult } from '@shared/types'

const equipmentTypes = [
  'camera', 'telescope', 'reducer', 'barlow', 'mount', 'guide_camera', 'guide_scope',
  'filter_wheel', 'filter', 'rotator', 'dew_heater', 'power_supply', 'mini_pc', 'observatory_dome'
]

const specFields: Array<{ key: string; label: string; unit: string; types: string[] }> = [
  { key: 'focal_length_mm', label: 'Focal Length', unit: 'mm', types: ['telescope', 'barlow', 'guide_scope'] },
  { key: 'aperture_mm', label: 'Aperture', unit: 'mm', types: ['telescope', 'guide_scope'] },
  { key: 'pixel_size_um', label: 'Pixel Size', unit: 'µm', types: ['camera', 'guide_camera'] },
  { key: 'sensor_width_mm', label: 'Sensor Width', unit: 'mm', types: ['camera', 'guide_camera'] },
  { key: 'sensor_height_mm', label: 'Sensor Height', unit: 'mm', types: ['camera', 'guide_camera'] },
  { key: 'sensor_width_px', label: 'Sensor Width', unit: 'px', types: ['camera', 'guide_camera'] },
  { key: 'sensor_height_px', label: 'Sensor Height', unit: 'px', types: ['camera', 'guide_camera'] },
  { key: 'reducer_factor', label: 'Reduction Factor', unit: 'x', types: ['reducer', 'barlow'] }
]

interface FormState {
  name: string
  equipmentType: string
  manufacturer: string
  model: string
  notes: string
  focal_length_mm: string
  aperture_mm: string
  pixel_size_um: string
  sensor_width_mm: string
  sensor_height_mm: string
  sensor_width_px: string
  sensor_height_px: string
  reducer_factor: string
}

const emptyForm: FormState = {
  name: '', equipmentType: 'telescope', manufacturer: '', model: '', notes: '',
  focal_length_mm: '', aperture_mm: '', pixel_size_um: '',
  sensor_width_mm: '', sensor_height_mm: '',
  sensor_width_px: '', sensor_height_px: '', reducer_factor: ''
}

function formFromEquipment(eq: EquipmentType): FormState {
  return {
    name: eq.name,
    equipmentType: eq.equipmentType,
    manufacturer: eq.manufacturer ?? '',
    model: eq.model ?? '',
    notes: eq.notes ?? '',
    focal_length_mm: eq.focalLengthMm?.toString() ?? '',
    aperture_mm: eq.apertureMm?.toString() ?? '',
    pixel_size_um: eq.pixelSizeUm?.toString() ?? '',
    sensor_width_mm: eq.sensorWidthMm?.toString() ?? '',
    sensor_height_mm: eq.sensorHeightMm?.toString() ?? '',
    sensor_width_px: eq.sensorWidthPx?.toString() ?? '',
    sensor_height_px: eq.sensorHeightPx?.toString() ?? '',
    reducer_factor: eq.reducerFactor?.toString() ?? ''
  }
}

function formToFields(form: FormState): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    name: form.name,
    equipment_type: form.equipmentType,
    manufacturer: form.manufacturer || null,
    model: form.model || null,
    notes: form.notes || null,
    focal_length_mm: form.focal_length_mm ? parseFloat(form.focal_length_mm) : null,
    aperture_mm: form.aperture_mm ? parseFloat(form.aperture_mm) : null,
    pixel_size_um: form.pixel_size_um ? parseFloat(form.pixel_size_um) : null,
    sensor_width_mm: form.sensor_width_mm ? parseFloat(form.sensor_width_mm) : null,
    sensor_height_mm: form.sensor_height_mm ? parseFloat(form.sensor_height_mm) : null,
    sensor_width_px: form.sensor_width_px ? parseInt(form.sensor_width_px) : null,
    sensor_height_px: form.sensor_height_px ? parseInt(form.sensor_height_px) : null,
    reducer_factor: form.reducer_factor ? parseFloat(form.reducer_factor) : null
  }
  return fields
}

export function Equipment(): React.ReactElement {
  const [items, setItems] = useState<EquipmentType[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({ ...emptyForm })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState<string | null>(null)

  // FOV calculator state
  const [fovTelescope, setFovTelescope] = useState('')
  const [fovCamera, setFovCamera] = useState('')
  const [fovReducer, setFovReducer] = useState('')
  const [fovResult, setFovResult] = useState<FOVResult | null>(null)
  const [imageScale, setImageScale] = useState<ImageScaleResult | null>(null)

  const fetchEquipment = useCallback(async () => {
    const r = await invoke<{ equipment: EquipmentType[] }>('equipment:list')
    setItems(r.equipment)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchEquipment()
  }, [fetchEquipment])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await invoke('equipment:create', {
      name: form.name,
      equipment_type: form.equipmentType,
      manufacturer: form.manufacturer || undefined,
      model: form.model || undefined,
      notes: form.notes || undefined
    })
    const fields = formToFields(form)
    const items = await invoke<{ equipment: EquipmentType[] }>('equipment:list')
    const created = items.equipment.find(eq => eq.name === form.name)
    if (created) {
      await invoke('equipment:update', { id: created.id, fields })
    }
    setForm({ ...emptyForm })
    setShowForm(false)
    fetchEquipment()
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    await invoke('equipment:update', { id: editingId, fields: formToFields(form) })
    setEditingId(null)
    setForm({ ...emptyForm })
    setShowForm(false)
    fetchEquipment()
  }

  const handleDelete = async (id: string) => {
    await invoke('equipment:delete', { id })
    setShowDelete(null)
    if (selectedId === id) setSelectedId(null)
    fetchEquipment()
  }

  const startEdit = (eq: EquipmentType) => {
    setEditingId(eq.id)
    setForm(formFromEquipment(eq))
    setShowForm(true)
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm({ ...emptyForm })
  }

  const calculateFOV = async () => {
    if (!fovTelescope || !fovCamera) return
    try {
      const [fov, scale] = await Promise.all([
        invoke<FOVResult>('equipment:calculate-fov', {
          telescope_id: fovTelescope,
          camera_id: fovCamera,
          reducer_id: fovReducer || undefined
        }),
        invoke<ImageScaleResult>('equipment:calculate-image-scale', {
          telescope_id: fovTelescope,
          camera_id: fovCamera
        })
      ])
      setFovResult(fov)
      setImageScale(scale)
    } catch {
      setFovResult(null)
      setImageScale(null)
    }
  }

  const selected = items.find(eq => eq.id === selectedId)
  const telescopes = items.filter(eq => ['telescope', 'guide_scope'].includes(eq.equipmentType))
  const cameras = items.filter(eq => ['camera', 'guide_camera'].includes(eq.equipmentType))
  const reducers = items.filter(eq => ['reducer', 'barlow'].includes(eq.equipmentType))
  const relevantSpecs = specFields.filter(f => f.types.includes(form.equipmentType))

  return (
    <PageContainer
      title="Equipment"
      subtitle={`${items.length} items registered`}
      actions={
        <button
          onClick={() => showForm ? cancelForm() : setShowForm(true)}
          className="px-3 py-1.5 bg-astro-accent text-white rounded text-sm hover:bg-astro-accent/80"
        >
          {showForm ? 'Cancel' : 'Add Equipment'}
        </button>
      }
    >
      {showForm && (
        <form onSubmit={editingId ? handleUpdate : handleCreate} className="bg-astro-surface border border-astro-border rounded-lg p-4 mb-6 max-w-2xl">
          <h3 className="text-sm font-semibold text-astro-muted mb-3">{editingId ? 'Edit Equipment' : 'Add Equipment'}</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="block">
              <span className="text-xs text-astro-muted">Name</span>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent" />
            </label>
            <label className="block">
              <span className="text-xs text-astro-muted">Type</span>
              <select value={form.equipmentType} onChange={e => setForm(f => ({ ...f, equipmentType: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent">
                {equipmentTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-astro-muted">Manufacturer</span>
              <input value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent" />
            </label>
            <label className="block">
              <span className="text-xs text-astro-muted">Model</span>
              <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent" />
            </label>
          </div>

          {relevantSpecs.length > 0 && (
            <>
              <h4 className="text-xs text-astro-muted mb-2 mt-4">Specifications</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                {relevantSpecs.map(spec => (
                  <label key={spec.key} className="block">
                    <span className="text-xs text-astro-muted">{spec.label} ({spec.unit})</span>
                    <input
                      type="number"
                      step="any"
                      value={form[spec.key as keyof FormState]}
                      onChange={e => setForm(f => ({ ...f, [spec.key]: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent"
                    />
                  </label>
                ))}
              </div>
            </>
          )}

          <label className="block mb-3">
            <span className="text-xs text-astro-muted">Notes</span>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className="w-full mt-1 px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent" />
          </label>

          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-astro-accent text-white rounded text-sm">
              {editingId ? 'Update' : 'Save'}
            </button>
            <button type="button" onClick={cancelForm} className="px-4 py-2 border border-astro-border text-astro-muted rounded text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Equipment List */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="text-astro-muted">Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-astro-muted">No equipment registered yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map(eq => (
                <div
                  key={eq.id}
                  onClick={() => setSelectedId(eq.id)}
                  className={`bg-astro-surface border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedId === eq.id ? 'border-astro-accent' : 'border-astro-border hover:border-astro-border/80'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-astro-text">{eq.name}</h3>
                      <span className="text-xs text-astro-muted capitalize">{eq.equipmentType.replace(/_/g, ' ')}</span>
                      {eq.manufacturer && (
                        <p className="text-xs text-astro-muted mt-1">{eq.manufacturer} {eq.model ?? ''}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); startEdit(eq) }}
                        className="text-xs text-astro-muted hover:text-astro-accent px-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setShowDelete(eq.id) }}
                        className="text-xs text-astro-muted hover:text-red-400 px-1"
                      >
                        Del
                      </button>
                    </div>
                  </div>

                  {/* Show key specs inline */}
                  {(eq.focalLengthMm || eq.pixelSizeUm || eq.reducerFactor) && (
                    <div className="flex gap-3 mt-2 text-[10px] text-astro-muted">
                      {eq.focalLengthMm && <span>{eq.focalLengthMm}mm</span>}
                      {eq.apertureMm && <span>f/{(eq.focalLengthMm! / eq.apertureMm).toFixed(1)}</span>}
                      {eq.pixelSizeUm && <span>{eq.pixelSizeUm}µm</span>}
                      {eq.reducerFactor && <span>{eq.reducerFactor}x</span>}
                    </div>
                  )}

                  {showDelete === eq.id && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-red-400">Delete?</span>
                      <button onClick={e => { e.stopPropagation(); handleDelete(eq.id) }}
                        className="text-xs px-2 py-1 bg-red-500 text-white rounded">Yes</button>
                      <button onClick={e => { e.stopPropagation(); setShowDelete(null) }}
                        className="text-xs px-2 py-1 border border-astro-border text-astro-muted rounded">No</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel & FOV Calculator */}
        <div className="space-y-4">
          {selected && (
            <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
              <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-3">Details</h2>
              <h3 className="font-semibold text-astro-text mb-1">{selected.name}</h3>
              <p className="text-xs text-astro-muted capitalize mb-3">{selected.equipmentType.replace(/_/g, ' ')}</p>

              <div className="space-y-1 text-sm">
                {selected.manufacturer && <p><span className="text-astro-muted">Make:</span> <span className="text-astro-text">{selected.manufacturer}</span></p>}
                {selected.model && <p><span className="text-astro-muted">Model:</span> <span className="text-astro-text">{selected.model}</span></p>}
                {selected.focalLengthMm && <p><span className="text-astro-muted">Focal Length:</span> <span className="text-astro-text">{selected.focalLengthMm} mm</span></p>}
                {selected.apertureMm && (
                  <>
                    <p><span className="text-astro-muted">Aperture:</span> <span className="text-astro-text">{selected.apertureMm} mm</span></p>
                    {selected.focalLengthMm && <p><span className="text-astro-muted">Focal Ratio:</span> <span className="text-astro-text">f/{(selected.focalLengthMm / selected.apertureMm).toFixed(1)}</span></p>}
                  </>
                )}
                {selected.pixelSizeUm && <p><span className="text-astro-muted">Pixel Size:</span> <span className="text-astro-text">{selected.pixelSizeUm} µm</span></p>}
                {selected.sensorWidthMm && selected.sensorHeightMm && (
                  <p><span className="text-astro-muted">Sensor:</span> <span className="text-astro-text">{selected.sensorWidthMm} x {selected.sensorHeightMm} mm</span></p>
                )}
                {selected.sensorWidthPx && selected.sensorHeightPx && (
                  <p><span className="text-astro-muted">Resolution:</span> <span className="text-astro-text">{selected.sensorWidthPx} x {selected.sensorHeightPx} px</span></p>
                )}
                {selected.reducerFactor && <p><span className="text-astro-muted">Factor:</span> <span className="text-astro-text">{selected.reducerFactor}x</span></p>}
                {selected.notes && <p className="text-astro-muted text-xs mt-2">{selected.notes}</p>}
              </div>
            </div>
          )}

          {/* FOV Calculator */}
          {telescopes.length > 0 && cameras.length > 0 && (
            <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
              <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-3">FOV Calculator</h2>
              <div className="space-y-2">
                <label className="block">
                  <span className="text-xs text-astro-muted">Telescope</span>
                  <select value={fovTelescope} onChange={e => setFovTelescope(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 bg-astro-bg border border-astro-border rounded text-sm text-astro-text">
                    <option value="">Select...</option>
                    {telescopes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-astro-muted">Camera</span>
                  <select value={fovCamera} onChange={e => setFovCamera(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 bg-astro-bg border border-astro-border rounded text-sm text-astro-text">
                    <option value="">Select...</option>
                    {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                {reducers.length > 0 && (
                  <label className="block">
                    <span className="text-xs text-astro-muted">Reducer/Barlow (optional)</span>
                    <select value={fovReducer} onChange={e => setFovReducer(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 bg-astro-bg border border-astro-border rounded text-sm text-astro-text">
                      <option value="">None</option>
                      {reducers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </label>
                )}
                <button onClick={calculateFOV} disabled={!fovTelescope || !fovCamera}
                  className="px-3 py-1.5 bg-astro-accent text-white text-sm rounded hover:bg-astro-accent/80 disabled:opacity-50">
                  Calculate
                </button>

                {fovResult && (
                  <div className="mt-3 space-y-1 text-sm border-t border-astro-border pt-3">
                    <p><span className="text-astro-muted">FOV:</span> <span className="text-astro-text">{fovResult.widthArcmin.toFixed(1)} x {fovResult.heightArcmin.toFixed(1)} arcmin</span></p>
                    <p><span className="text-astro-muted">FOV:</span> <span className="text-astro-text">{fovResult.widthDeg.toFixed(2)} x {fovResult.heightDeg.toFixed(2)}°</span></p>
                    <p><span className="text-astro-muted">Eff. FL:</span> <span className="text-astro-text">{fovResult.effectiveFocalLength.toFixed(0)} mm</span></p>
                    {fovResult.focalRatio && <p><span className="text-astro-muted">Eff. f/:</span> <span className="text-astro-text">f/{fovResult.focalRatio.toFixed(1)}</span></p>}
                  </div>
                )}

                {imageScale && (
                  <div className="space-y-1 text-sm">
                    <p><span className="text-astro-muted">Image Scale:</span> <span className="text-astro-text">{imageScale.arcsecondsPerPixel.toFixed(2)} "/px</span></p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  )
}
