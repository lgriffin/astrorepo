import { ulid } from 'ulid'
import { getSqlite } from '../db/connection'
import type { Observatory } from '@shared/types'

export function createObservatory(input: {
  name: string
  latitude: number
  longitude: number
  altitudeM: number
  timezone?: string | null
}): Observatory {
  const sqlite = getSqlite()
  const id = ulid()
  const now = new Date().toISOString()

  const existingCount = (sqlite.prepare('SELECT COUNT(*) as cnt FROM observatories').get() as { cnt: number }).cnt
  const isPrimary = existingCount === 0 ? 1 : 0

  sqlite
    .prepare('INSERT INTO observatories (id, name, latitude, longitude, altitude_m, timezone, is_primary, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)')
    .run(id, input.name, input.latitude, input.longitude, input.altitudeM, input.timezone ?? null, isPrimary, now)

  return getObservatoryById(id)!
}

export function listObservatories(): Observatory[] {
  const sqlite = getSqlite()
  const rows = sqlite
    .prepare('SELECT id, name, latitude, longitude, altitude_m, timezone, is_primary, notes, created_at FROM observatories ORDER BY name')
    .all() as Array<Record<string, unknown>>

  return rows.map(toObservatory)
}

export function setPrimaryObservatory(id: string): Observatory | null {
  const sqlite = getSqlite()
  const transaction = sqlite.transaction(() => {
    sqlite.prepare('UPDATE observatories SET is_primary = 0').run()
    sqlite.prepare('UPDATE observatories SET is_primary = 1 WHERE id = ?').run(id)
  })
  transaction()
  return getObservatoryById(id)
}

export function getPrimaryObservatory(): Observatory | null {
  const sqlite = getSqlite()
  const row = sqlite
    .prepare('SELECT id, name, latitude, longitude, altitude_m, timezone, is_primary, notes, created_at FROM observatories WHERE is_primary = 1')
    .get() as Record<string, unknown> | undefined

  if (!row) return null
  return toObservatory(row)
}

function getObservatoryById(id: string): Observatory | null {
  const sqlite = getSqlite()
  const row = sqlite
    .prepare('SELECT id, name, latitude, longitude, altitude_m, timezone, is_primary, notes, created_at FROM observatories WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined

  if (!row) return null
  return toObservatory(row)
}

function toObservatory(row: Record<string, unknown>): Observatory {
  return {
    id: row.id as string,
    name: row.name as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    altitudeM: row.altitude_m as number,
    timezone: row.timezone as string | null,
    isPrimary: (row.is_primary as number) === 1,
    notes: row.notes as string | null,
    createdAt: row.created_at as string
  }
}
