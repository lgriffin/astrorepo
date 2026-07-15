import { ulid } from 'ulid'
import { getSqlite } from '../db/connection'
import type { ObservationSession, SessionSummary } from '@shared/types'

interface SessionInput {
  date: string
  observatoryId?: string | null
  locationFreetext?: string | null
  skyQuality?: number | null
  weather?: string | null
  seeing?: string | null
  transparency?: string | null
  moonPhase?: number | null
  moonDistance?: number | null
  guidingNotes?: string | null
  exposureStrategy?: string | null
  totalFrames?: number | null
  acceptedFrames?: number | null
  rejectedFrames?: number | null
  totalExposureSec?: number | null
  notes?: string | null
  targetIds?: string[]
  equipmentIds?: string[]
}

interface SessionListResult {
  sessions: SessionSummary[]
  total: number
}

export function createSession(input: SessionInput): ObservationSession {
  const sqlite = getSqlite()
  const id = ulid()
  const now = new Date().toISOString()

  const insertSession = sqlite.prepare(
    `INSERT INTO observation_sessions (id, date, observatory_id, location_freetext, sky_quality,
     weather, seeing, transparency, moon_phase, moon_distance, guiding_notes, exposure_strategy,
     total_frames, accepted_frames, rejected_frames, total_exposure_sec, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const insertTarget = sqlite.prepare(
    'INSERT INTO session_targets (session_id, target_id, is_primary) VALUES (?, ?, ?)'
  )

  const insertEquipment = sqlite.prepare(
    'INSERT INTO session_equipment (session_id, equipment_id, role) VALUES (?, ?, NULL)'
  )

  const transaction = sqlite.transaction(() => {
    insertSession.run(
      id, input.date, input.observatoryId ?? null, input.locationFreetext ?? null,
      input.skyQuality ?? null, input.weather ?? null, input.seeing ?? null,
      input.transparency ?? null, input.moonPhase ?? null, input.moonDistance ?? null,
      input.guidingNotes ?? null, input.exposureStrategy ?? null,
      input.totalFrames ?? null, input.acceptedFrames ?? null, input.rejectedFrames ?? null,
      input.totalExposureSec ?? null, input.notes ?? null, now, now
    )

    if (input.targetIds) {
      input.targetIds.forEach((tid, i) => {
        insertTarget.run(id, tid, i === 0 ? 1 : 0)
      })
    }

    if (input.equipmentIds) {
      input.equipmentIds.forEach((eid) => {
        insertEquipment.run(id, eid)
      })
    }
  })

  transaction()
  return getSessionById(id)!
}

export function updateSession(id: string, fields: Partial<SessionInput>): ObservationSession | null {
  const sqlite = getSqlite()
  const existing = getSessionById(id)
  if (!existing) return null

  const updates: string[] = []
  const values: unknown[] = []

  const fieldMap: Record<string, string> = {
    date: 'date',
    observatoryId: 'observatory_id',
    locationFreetext: 'location_freetext',
    skyQuality: 'sky_quality',
    weather: 'weather',
    seeing: 'seeing',
    transparency: 'transparency',
    moonPhase: 'moon_phase',
    moonDistance: 'moon_distance',
    guidingNotes: 'guiding_notes',
    exposureStrategy: 'exposure_strategy',
    totalFrames: 'total_frames',
    acceptedFrames: 'accepted_frames',
    rejectedFrames: 'rejected_frames',
    totalExposureSec: 'total_exposure_sec',
    notes: 'notes'
  }

  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in fields) {
      updates.push(`${col} = ?`)
      values.push((fields as Record<string, unknown>)[key])
    }
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)
    sqlite.prepare(`UPDATE observation_sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  }

  return getSessionById(id)
}

export function listSessions(opts: {
  targetId?: string
  fromDate?: string
  toDate?: string
  limit?: number
  offset?: number
}): SessionListResult {
  const sqlite = getSqlite()
  const conditions: string[] = []
  const params: unknown[] = []

  let baseQuery = `FROM observation_sessions s`

  if (opts.targetId) {
    baseQuery += ` JOIN session_targets st ON st.session_id = s.id`
    conditions.push('st.target_id = ?')
    params.push(opts.targetId)
  }

  if (opts.fromDate) {
    conditions.push('s.date >= ?')
    params.push(opts.fromDate)
  }
  if (opts.toDate) {
    conditions.push('s.date <= ?')
    params.push(opts.toDate)
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''

  const countRow = sqlite
    .prepare(`SELECT COUNT(DISTINCT s.id) as cnt ${baseQuery}${whereClause}`)
    .get(...params) as { cnt: number }

  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0

  const rows = sqlite
    .prepare(
      `SELECT DISTINCT s.id, s.date, s.location_freetext, s.total_frames, s.total_exposure_sec,
              (SELECT COUNT(*) FROM session_targets st2 WHERE st2.session_id = s.id) as target_count
       ${baseQuery}${whereClause}
       ORDER BY s.date DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Array<{
    id: string
    date: string
    location_freetext: string | null
    total_frames: number | null
    total_exposure_sec: number | null
    target_count: number
  }>

  return {
    sessions: rows.map((r) => ({
      id: r.id,
      date: r.date,
      locationName: r.location_freetext,
      totalFrames: r.total_frames,
      totalExposureSec: r.total_exposure_sec,
      targetCount: r.target_count
    })),
    total: countRow.cnt
  }
}

export function getSessionById(id: string): ObservationSession | null {
  const sqlite = getSqlite()
  const row = sqlite
    .prepare(
      `SELECT id, date, observatory_id, location_freetext, sky_quality, weather, seeing,
              transparency, moon_phase, moon_distance, guiding_notes, exposure_strategy,
              total_frames, accepted_frames, rejected_frames, total_exposure_sec, notes,
              created_at, updated_at
       FROM observation_sessions WHERE id = ?`
    )
    .get(id) as Record<string, unknown> | undefined

  if (!row) return null

  return {
    id: row.id as string,
    date: row.date as string,
    observatoryId: row.observatory_id as string | null,
    locationFreetext: row.location_freetext as string | null,
    skyQuality: row.sky_quality as number | null,
    weather: row.weather as string | null,
    seeing: row.seeing as string | null,
    transparency: row.transparency as string | null,
    moonPhase: row.moon_phase as number | null,
    moonDistance: row.moon_distance as number | null,
    guidingNotes: row.guiding_notes as string | null,
    exposureStrategy: row.exposure_strategy as string | null,
    totalFrames: row.total_frames as number | null,
    acceptedFrames: row.accepted_frames as number | null,
    rejectedFrames: row.rejected_frames as number | null,
    totalExposureSec: row.total_exposure_sec as number | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}
