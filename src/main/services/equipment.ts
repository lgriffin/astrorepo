import { ulid } from 'ulid'
import { getSqlite } from '../db/connection'
import type { Equipment, SessionSummary } from '@shared/types'

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
  let query = 'SELECT id, name, equipment_type, manufacturer, model, serial_number, notes, is_active, created_at FROM equipment'
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
    .prepare('SELECT id, name, equipment_type, manufacturer, model, serial_number, notes, is_active, created_at FROM equipment WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined

  if (!row) return null
  return toEquipment(row)
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
    createdAt: row.created_at as string
  }
}
