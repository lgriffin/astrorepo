import React, { useEffect, useState, type MutableRefObject } from 'react'
import { invoke } from '../../hooks/useIPC'
import type { Equipment, FOVResult, WorkspaceGridInput } from '@shared/types'

const input = 'px-2 py-1 bg-astro-bg border border-astro-border rounded text-sm text-astro-text focus:outline-none focus:border-astro-accent'
const small = 'px-2 py-1 text-xs bg-astro-accent/10 text-astro-accent border border-astro-accent/30 rounded hover:bg-astro-accent/20 transition-colors disabled:opacity-50'

interface GridEditorProps {
  grid: WorkspaceGridInput
  onChange: (grid: WorkspaceGridInput) => void
  /** A nudge along the grid's own axes, in degrees. */
  onShift: (rightDeg: number, upDeg: number) => void
  /**
   * Set to a function that reads the typed centre now and gives the grid with it, or null when it
   * cannot be read, so a save never sends the centre from before the typing.
   */
  flushRef?: MutableRefObject<FlushCentre | null>
}

/** Reads the typed centre into the grid; null when it cannot be read. */
export type FlushCentre = () => Promise<WorkspaceGridInput | null>

const fmt = (n: number, places: number) => String(Math.round(n * 10 ** places) / 10 ** places)

/**
 * The numbers that define a mosaic grid (specs/037-mosaic-workspace): the centre typed in any
 * usual form (read by the core), the up axis's position angle, rows, columns, the overlap each
 * way and the field from Equipment or typed in. Every change is laid out again by the core.
 */
export function GridEditor({ grid, onChange, onShift, flushRef }: GridEditorProps): React.ReactElement {
  const [ra, setRa] = useState(fmt(grid.ra_deg, 5))
  const [dec, setDec] = useState(fmt(grid.dec_deg, 5))
  const [centreProblem, setCentreProblem] = useState<string | null>(null)
  // Only typing changes the centre: leaving an untouched field must not round a precise centre.
  const [typed, setTyped] = useState(false)
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [scope, setScope] = useState('')
  const [camera, setCamera] = useState('')

  // The centre fields follow the grid when it moves from elsewhere (a drag, a nudge, a revision).
  useEffect(() => {
    setRa(fmt(grid.ra_deg, 5))
    setDec(fmt(grid.dec_deg, 5))
    setTyped(false)
  }, [grid.ra_deg, grid.dec_deg])

  useEffect(() => {
    invoke<{ equipment: Equipment[] }>('equipment:list')
      .then(r => setEquipment(r.equipment))
      .catch(() => setEquipment([]))
  }, [])

  const readCentre: FlushCentre = async () => {
    if (!typed) return grid
    const parsed = await invoke<{ raDeg: number | null; decDeg: number | null }>('workspace:parse-centre', { ra, dec })
    if (parsed.raDeg === null || parsed.decDeg === null) {
      setCentreProblem(parsed.raDeg === null ? 'Type RA as hh:mm:ss, 5.59h or degrees.' : 'Type Dec as ±dd:mm:ss or degrees from -90 to +90.')
      return null
    }
    setCentreProblem(null)
    setTyped(false)
    if (parsed.raDeg === grid.ra_deg && parsed.decDeg === grid.dec_deg) return grid
    const next = { ...grid, ra_deg: parsed.raDeg, dec_deg: parsed.decDeg }
    onChange(next)
    return next
  }
  useEffect(() => {
    if (flushRef) flushRef.current = readCentre
  })

  const pickEquipment = async (scopeId: string, cameraId: string) => {
    setScope(scopeId)
    setCamera(cameraId)
    if (!scopeId || !cameraId) return
    const fov = await invoke<FOVResult | null>('equipment:calculate-fov', { telescope_id: scopeId, camera_id: cameraId })
    if (!fov) return
    const names = [scopeId, cameraId].map(id => equipment.find(e => e.id === id)?.name ?? '').filter(Boolean).join(' with ')
    onChange({ ...grid, field_width_deg: fov.widthDeg, field_height_deg: fov.heightDeg, field_source: 'equipment', field_label: names || null })
  }

  const num = (key: keyof WorkspaceGridInput, value: string, scale = 1) => {
    const n = Number(value)
    if (value.trim() === '' || !Number.isFinite(n)) return
    const next = { ...grid, [key]: n * scale }
    if (key === 'field_width_deg' || key === 'field_height_deg') Object.assign(next, { field_source: 'manual', field_label: null })
    onChange(next)
  }

  const scopes = equipment.filter(e => e.equipmentType === 'telescope')
  const cameras = equipment.filter(e => e.equipmentType === 'camera')
  const halfX = grid.field_width_deg / 2
  const halfY = grid.field_height_deg / 2

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-astro-muted">Centre RA (ICRS)</span>
          <input value={ra} onChange={e => (setRa(e.target.value), setTyped(true))} onBlur={readCentre} onKeyDown={e => e.key === 'Enter' && readCentre()} className={`${input} w-36 font-mono`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-astro-muted">Centre Dec</span>
          <input value={dec} onChange={e => (setDec(e.target.value), setTyped(true))} onBlur={readCentre} onKeyDown={e => e.key === 'Enter' && readCentre()} className={`${input} w-36 font-mono`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-astro-muted" title="The angle of each panel's up edge, measured from north through east">Position angle (°)</span>
          <input type="number" step={1} value={fmt(grid.position_angle_deg, 2)} onChange={e => num('position_angle_deg', e.target.value)} className={`${input} w-24`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-astro-muted">Rows</span>
          <input type="number" min={1} max={12} value={grid.rows} onChange={e => num('rows', e.target.value)} className={`${input} w-16`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-astro-muted">Columns</span>
          <input type="number" min={1} max={12} value={grid.columns} onChange={e => num('columns', e.target.value)} className={`${input} w-16`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-astro-muted">Overlap across (%)</span>
          <input type="number" min={0} max={60} step={1} value={fmt(grid.overlap_x * 100, 1)} onChange={e => num('overlap_x', e.target.value, 0.01)} className={`${input} w-20`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-astro-muted">Overlap down (%)</span>
          <input type="number" min={0} max={60} step={1} value={fmt(grid.overlap_y * 100, 1)} onChange={e => num('overlap_y', e.target.value, 0.01)} className={`${input} w-20`} />
        </label>
      </div>
      {centreProblem && <p className="text-xs text-astro-warning">{centreProblem}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-astro-muted">Panel width (′)</span>
          <input type="number" min={1} step={1} value={fmt(grid.field_width_deg * 60, 2)} onChange={e => num('field_width_deg', e.target.value, 1 / 60)} className={`${input} w-24`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-astro-muted">Panel height (′)</span>
          <input type="number" min={1} step={1} value={fmt(grid.field_height_deg * 60, 2)} onChange={e => num('field_height_deg', e.target.value, 1 / 60)} className={`${input} w-24`} />
        </label>
        {(scopes.length > 0 || cameras.length > 0) && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-astro-muted">Scope</span>
              <select value={scope} onChange={e => pickEquipment(e.target.value, camera)} className={input}>
                <option value="">Field typed in</option>
                {scopes.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-astro-muted">Camera</span>
              <select value={camera} onChange={e => pickEquipment(scope, e.target.value)} className={input}>
                <option value="">Field typed in</option>
                {cameras.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-astro-muted">Move half a panel</span>
        <button className={small} onClick={() => onShift(0, halfY)} title="Toward the grid's top edge">
          Up
        </button>
        <button className={small} onClick={() => onShift(0, -halfY)}>
          Down
        </button>
        <button className={small} onClick={() => onShift(-halfX, 0)}>
          Left
        </button>
        <button className={small} onClick={() => onShift(halfX, 0)}>
          Right
        </button>
        <span className="text-xs text-astro-muted ml-3">Turn</span>
        <button className={small} onClick={() => onChange({ ...grid, position_angle_deg: grid.position_angle_deg - 5 })}>
          −5°
        </button>
        <button className={small} onClick={() => onChange({ ...grid, position_angle_deg: grid.position_angle_deg + 5 })}>
          +5°
        </button>
        <span className="text-xs text-astro-muted ml-3">Grid</span>
        <button className={small} disabled={grid.rows >= 12} onClick={() => onChange({ ...grid, rows: grid.rows + 1 })}>
          Add a row
        </button>
        <button className={small} disabled={grid.rows <= 1} onClick={() => onChange({ ...grid, rows: grid.rows - 1 })}>
          Remove a row
        </button>
        <button className={small} disabled={grid.columns >= 12} onClick={() => onChange({ ...grid, columns: grid.columns + 1 })}>
          Add a column
        </button>
        <button className={small} disabled={grid.columns <= 1} onClick={() => onChange({ ...grid, columns: grid.columns - 1 })}>
          Remove a column
        </button>
      </div>
    </div>
  )
}
