import React, { useState, useEffect, useCallback } from 'react'
import { invoke } from '../../hooks/useIPC'
import { EmptyState } from '../common/Card'
import { Button, Field, Input, Select, Skeleton, Textarea } from '../ui'
import type { Equipment as EquipmentType, FOVResult, ImageScaleResult } from '@shared/types'

const equipmentTypes = [
  'camera', 'telescope', 'reducer', 'barlow', 'mount', 'guide_camera', 'guide_scope',
  'filter_wheel', 'filter', 'rotator', 'dew_heater', 'power_supply', 'mini_pc', 'observatory_dome'
]

/** An equipment type in words: guide_camera reads "Guide camera". */
const typeWords = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ')

const specFields: Array<{ key: string; label: string; unit: string; types: string[] }> = [
  { key: 'focal_length_mm', label: 'Focal length', unit: 'mm', types: ['telescope', 'barlow', 'guide_scope'] },
  { key: 'aperture_mm', label: 'Aperture', unit: 'mm', types: ['telescope', 'guide_scope'] },
  { key: 'pixel_size_um', label: 'Pixel size', unit: 'µm', types: ['camera', 'guide_camera'] },
  { key: 'sensor_width_mm', label: 'Sensor width', unit: 'mm', types: ['camera', 'guide_camera'] },
  { key: 'sensor_height_mm', label: 'Sensor height', unit: 'mm', types: ['camera', 'guide_camera'] },
  { key: 'sensor_width_px', label: 'Sensor width', unit: 'px', types: ['camera', 'guide_camera'] },
  { key: 'sensor_height_px', label: 'Sensor height', unit: 'px', types: ['camera', 'guide_camera'] },
  { key: 'reducer_factor', label: 'Reduction factor', unit: 'x', types: ['reducer', 'barlow'] }
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

/** Settings > Equipment (LF-024): your scopes, cameras and filters, and the field of view they give. */
export function EquipmentSettings(): React.ReactElement {
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

  const fact = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3">
      <dt className="text-astro-muted">{label}</dt>
      <dd className="text-astro-text text-right">{value}</dd>
    </div>
  )

  return (
    <section aria-labelledby="equipment-title" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="equipment-title" className="text-base font-semibold text-astro-text">Equipment</h2>
          <p className="text-xs text-astro-muted mt-1">
            Your scopes, cameras and filters. The Sky planner and mosaics take their field of view from here.
          </p>
        </div>
        {!showForm && <Button variant="primary" onClick={() => setShowForm(true)}>Add equipment</Button>}
      </div>

      {showForm && (
        <form onSubmit={editingId ? handleUpdate : handleCreate} className="space-y-4 rounded-lg border border-astro-border bg-astro-surface p-4">
          <h3 className="text-sm font-semibold text-astro-text">{editingId ? `Change ${form.name || 'equipment'}` : 'Add equipment'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name">{c => <Input id={c.id} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />}</Field>
            <Field label="Type">
              {c => (
                <Select id={c.id} value={form.equipmentType} onChange={e => setForm(f => ({ ...f, equipmentType: e.target.value }))}>
                  {equipmentTypes.map(t => <option key={t} value={t}>{typeWords(t)}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Make">{c => <Input id={c.id} value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} />}</Field>
            <Field label="Model">{c => <Input id={c.id} value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />}</Field>
          </div>

          {relevantSpecs.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {relevantSpecs.map(spec => (
                <Field key={spec.key} label={`${spec.label} (${spec.unit})`}>
                  {c => (
                    <Input
                      id={c.id}
                      type="number"
                      step="any"
                      value={form[spec.key as keyof FormState]}
                      onChange={e => setForm(f => ({ ...f, [spec.key]: e.target.value }))}
                    />
                  )}
                </Field>
              ))}
            </div>
          )}

          <Field label="Notes">{c => <Textarea id={c.id} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />}</Field>

          <div className="flex gap-2">
            <Button type="submit" variant="primary">{editingId ? 'Save changes' : 'Add'}</Button>
            <Button variant="ghost" onClick={cancelForm}>Cancel</Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Skeleton className="h-20 w-full" label="Loading your equipment" /><Skeleton className="h-20 w-full" /></div>
      ) : items.length === 0 ? (
        !showForm && <EmptyState>No equipment yet. Add your scope and camera so the planner can draw your field of view.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map(eq => (
            <li
              key={eq.id}
              className={`rounded-lg border bg-astro-surface p-4 transition-colors ${selectedId === eq.id ? 'border-astro-accent' : 'border-astro-border'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedId(selectedId === eq.id ? null : eq.id)}
                  aria-expanded={selectedId === eq.id}
                  className="min-w-0 text-left"
                >
                  <span className="block font-semibold text-astro-text hover:text-astro-accent">{eq.name}</span>
                  <span className="block text-xs text-astro-muted">
                    {typeWords(eq.equipmentType)}{eq.manufacturer ? ` · ${eq.manufacturer} ${eq.model ?? ''}` : ''}
                  </span>
                </button>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(eq)} aria-label={`Change ${eq.name}`}>Change</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowDelete(eq.id)} aria-label={`Delete ${eq.name}`}>Delete</Button>
                </div>
              </div>

              {(eq.focalLengthMm || eq.pixelSizeUm || eq.reducerFactor) && (
                <p className="mt-2 flex gap-3 text-xs text-astro-muted">
                  {eq.focalLengthMm && <span>{eq.focalLengthMm} mm</span>}
                  {eq.apertureMm && eq.focalLengthMm && <span>f/{(eq.focalLengthMm / eq.apertureMm).toFixed(1)}</span>}
                  {eq.pixelSizeUm && <span>{eq.pixelSizeUm} µm pixels</span>}
                  {eq.reducerFactor && <span>{eq.reducerFactor}×</span>}
                </p>
              )}

              {selectedId === eq.id && selected && (
                <dl className="mt-3 space-y-1 border-t border-astro-border pt-3 text-sm">
                  {selected.model && fact('Model', selected.model)}
                  {selected.apertureMm && fact('Aperture', `${selected.apertureMm} mm`)}
                  {selected.sensorWidthMm && selected.sensorHeightMm && fact('Sensor', `${selected.sensorWidthMm} × ${selected.sensorHeightMm} mm`)}
                  {selected.sensorWidthPx && selected.sensorHeightPx && fact('Resolution', `${selected.sensorWidthPx} × ${selected.sensorHeightPx} px`)}
                  {selected.notes && <p className="text-xs text-astro-muted pt-1">{selected.notes}</p>}
                </dl>
              )}

              {showDelete === eq.id && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-astro-danger">Delete {eq.name}?</span>
                  <Button size="sm" variant="danger" onClick={() => handleDelete(eq.id)}>Yes, delete</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowDelete(null)}>Keep it</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {telescopes.length > 0 && cameras.length > 0 && (
        <div className="rounded-lg border border-astro-border bg-astro-surface p-4">
          <h3 className="text-sm font-semibold text-astro-text mb-3">Field of view</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Telescope">
              {c => (
                <Select id={c.id} value={fovTelescope} onChange={e => setFovTelescope(e.target.value)}>
                  <option value="">Pick one</option>
                  {telescopes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Camera">
              {c => (
                <Select id={c.id} value={fovCamera} onChange={e => setFovCamera(e.target.value)}>
                  <option value="">Pick one</option>
                  {cameras.map(cam => <option key={cam.id} value={cam.id}>{cam.name}</option>)}
                </Select>
              )}
            </Field>
            {reducers.length > 0 && (
              <Field label="Reducer or Barlow">
                {c => (
                  <Select id={c.id} value={fovReducer} onChange={e => setFovReducer(e.target.value)}>
                    <option value="">None</option>
                    {reducers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                )}
              </Field>
            )}
          </div>
          <Button className="mt-3" onClick={calculateFOV} disabled={!fovTelescope || !fovCamera}>Work it out</Button>

          {fovResult && (
            <dl className="mt-3 space-y-1 border-t border-astro-border pt-3 text-sm">
              {fact('Field', `${fovResult.widthArcmin.toFixed(1)} × ${fovResult.heightArcmin.toFixed(1)} arcmin (${fovResult.widthDeg.toFixed(2)} × ${fovResult.heightDeg.toFixed(2)}°)`)}
              {fact('Focal length in use', `${fovResult.effectiveFocalLength.toFixed(0)} mm`)}
              {fovResult.focalRatio && fact('Focal ratio in use', `f/${fovResult.focalRatio.toFixed(1)}`)}
              {imageScale && fact('Image scale', `${imageScale.arcsecondsPerPixel.toFixed(2)}″ per pixel`)}
            </dl>
          )}
        </div>
      )}
    </section>
  )
}
