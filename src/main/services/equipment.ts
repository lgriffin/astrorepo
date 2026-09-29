import { ulid } from 'ulid'
import { getSqlite } from '../db/connection'
import type { Equipment, SessionSummary, FOVResult, ImageScaleResult } from '@shared/types'

const EQUIPMENT_COLS = 'id, name, equipment_type, manufacturer, model, serial_number, notes, is_active, focal_length_mm, aperture_mm, sensor_width_mm, sensor_height_mm, pixel_size_um, sensor_width_px, sensor_height_px, reducer_factor, created_at'

export function createEquipment(input: {
  name: string
  equipmentType: string
  manufacturer?: string | null
  model?: string | null
  notes?: string | null
}): Equipment {
  const sqlite = getSqlite()
  const id = ulid()
  const now = new Date().toISOString()

  sqlite
    .prepare('INSERT INTO equipment (id, name, equipment_type, manufacturer, model, serial_number, notes, is_active, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, 1, ?)')
    .run(id, input.name, input.equipmentType, input.manufacturer ?? null, input.model ?? null, input.notes ?? null, now)

  return getEquipmentById(id)!
}

export function listEquipment(type?: string): Equipment[] {
  const sqlite = getSqlite()
  let query = `SELECT ${EQUIPMENT_COLS} FROM equipment`
  const params: unknown[] = []

  if (type) {
    query += ' WHERE equipment_type = ?'
    params.push(type)
  }

  query += ' ORDER BY name'
  const rows = sqlite.prepare(query).all(...params) as Array<Record<string, unknown>>

  return rows.map(toEquipment)
}

export function getUsageHistory(equipmentId: string): SessionSummary[] {
  const sqlite = getSqlite()
  const rows = sqlite
    .prepare(
      `SELECT s.id, s.date, s.location_freetext, s.total_frames, s.total_exposure_sec,
              (SELECT COUNT(*) FROM session_targets st WHERE st.session_id = s.id) as target_count
       FROM observation_sessions s
       JOIN session_equipment se ON se.session_id = s.id
       WHERE se.equipment_id = ?
       ORDER BY s.date DESC`
    )
    .all(equipmentId) as Array<Record<string, unknown>>

  return rows.map((r) => ({
    id: r.id as string,
    date: r.date as string,
    locationName: r.location_freetext as string | null,
    totalFrames: r.total_frames as number | null,
    totalExposureSec: r.total_exposure_sec as number | null,
    targetCount: r.target_count as number
  }))
}

function getEquipmentById(id: string): Equipment | null {
  const sqlite = getSqlite()
  const row = sqlite
    .prepare(`SELECT ${EQUIPMENT_COLS} FROM equipment WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined

  if (!row) return null
  return toEquipment(row)
}

export function updateEquipment(id: string, fields: Record<string, unknown>): Equipment {
  const sqlite = getSqlite()
  const columnMap: Record<string, string> = {
    name: 'name',
    equipment_type: 'equipment_type',
    manufacturer: 'manufacturer',
    model: 'model',
    notes: 'notes',
    is_active: 'is_active',
    focal_length_mm: 'focal_length_mm',
    aperture_mm: 'aperture_mm',
    sensor_width_mm: 'sensor_width_mm',
    sensor_height_mm: 'sensor_height_mm',
    pixel_size_um: 'pixel_size_um',
    sensor_width_px: 'sensor_width_px',
    sensor_height_px: 'sensor_height_px',
    reducer_factor: 'reducer_factor'
  }

  const sets: string[] = []
  const values: unknown[] = []
  for (const [key, val] of Object.entries(fields)) {
    const col = columnMap[key]
    if (col) {
      sets.push(`${col} = ?`)
      values.push(val)
    }
  }

  if (sets.length > 0) {
    values.push(id)
    sqlite.prepare(`UPDATE equipment SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }

  return getEquipmentById(id)!
}

export function deleteEquipment(id: string): boolean {
  const sqlite = getSqlite()
  const usage = sqlite.prepare('SELECT COUNT(*) as cnt FROM session_equipment WHERE equipment_id = ?').get(id) as { cnt: number }
  if (usage.cnt > 0) {
    sqlite.prepare('DELETE FROM session_equipment WHERE equipment_id = ?').run(id)
  }
  const result = sqlite.prepare('DELETE FROM equipment WHERE id = ?').run(id)
  return result.changes > 0
}

export function calculateFOV(telescopeId: string, cameraId: string, reducerId?: string): FOVResult | null {
  const telescope = getEquipmentById(telescopeId)
  const camera = getEquipmentById(cameraId)
  if (!telescope?.focalLengthMm || !camera?.sensorWidthMm || !camera?.sensorHeightMm) return null

  let effectiveFL = telescope.focalLengthMm
  if (reducerId) {
    const reducer = getEquipmentById(reducerId)
    if (reducer?.reducerFactor) effectiveFL *= reducer.reducerFactor
  }

  const widthDeg = (camera.sensorWidthMm / effectiveFL) * 57.2958
  const heightDeg = (camera.sensorHeightMm / effectiveFL) * 57.2958

  return {
    widthArcmin: Math.round(widthDeg * 60 * 10) / 10,
    heightArcmin: Math.round(heightDeg * 60 * 10) / 10,
    widthDeg: Math.round(widthDeg * 1000) / 1000,
    heightDeg: Math.round(heightDeg * 1000) / 1000,
    effectiveFocalLength: Math.round(effectiveFL * 10) / 10,
    focalRatio: telescope.apertureMm ? Math.round((effectiveFL / telescope.apertureMm) * 10) / 10 : null
  }
}

export function calculateImageScale(telescopeId: string, cameraId: string): ImageScaleResult | null {
  const telescope = getEquipmentById(telescopeId)
  const camera = getEquipmentById(cameraId)
  if (!telescope?.focalLengthMm || !camera?.pixelSizeUm) return null

  const arcsecondsPerPixel = (camera.pixelSizeUm / telescope.focalLengthMm) * 206.265

  return {
    arcsecondsPerPixel: Math.round(arcsecondsPerPixel * 100) / 100,
    effectiveFocalLength: telescope.focalLengthMm
  }
}

function toEquipment(row: Record<string, unknown>): Equipment {
  return {
    id: row.id as string,
    name: row.name as string,
    equipmentType: row.equipment_type as Equipment['equipmentType'],
    manufacturer: row.manufacturer as string | null,
    model: row.model as string | null,
    serialNumber: row.serial_number as string | null,
    notes: row.notes as string | null,
    isActive: (row.is_active as number) === 1,
    focalLengthMm: row.focal_length_mm as number | null,
    apertureMm: row.aperture_mm as number | null,
    sensorWidthMm: row.sensor_width_mm as number | null,
    sensorHeightMm: row.sensor_height_mm as number | null,
    pixelSizeUm: row.pixel_size_um as number | null,
    sensorWidthPx: row.sensor_width_px as number | null,
    sensorHeightPx: row.sensor_height_px as number | null,
    reducerFactor: row.reducer_factor as number | null,
    createdAt: row.created_at as string
  }
}
