import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedTarget, seedEquipment } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite
}))

const { createSession, updateSession, listSessions, getSessionById } = await import('../../src/main/services/session')

describe('Session Recording (Integration)', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: Session Creation with Targets and Equipment', () => {
    // Event: User records a new observation session with targets and equipment
    // Action: System inserts session row, links target associations via session_targets,
    //         links equipment via session_equipment within a transaction
    // Response: Returns complete ObservationSession object
    // State: session, session_targets, session_equipment rows all committed atomically

    it('Given targets and equipment exist, When a session is created with associations, Then all junction rows are created', () => {
      const t1 = seedTarget(sqlite, { canonicalName: 'M31' })
      const t2 = seedTarget(sqlite, { canonicalName: 'M32' })
      const eq1 = seedEquipment(sqlite, { name: 'ASI2600MC', equipmentType: 'camera' })
      const eq2 = seedEquipment(sqlite, { name: 'RC8', equipmentType: 'telescope' })

      const session = createSession({
        date: '2025-01-15',
        locationFreetext: 'Bortle 3 site',
        skyQuality: 21.5,
        weather: 'Clear',
        seeing: 'good',
        transparency: 'excellent',
        totalFrames: 120,
        acceptedFrames: 110,
        rejectedFrames: 10,
        totalExposureSec: 7200,
        notes: 'Great night',
        targetIds: [t1, t2],
        equipmentIds: [eq1, eq2]
      })

      expect(session.id).toBeTruthy()
      expect(session.date).toBe('2025-01-15')
      expect(session.skyQuality).toBe(21.5)
      expect(session.totalFrames).toBe(120)

      const targetLinks = sqlite.prepare('SELECT * FROM session_targets WHERE session_id = ? ORDER BY is_primary DESC').all(session.id) as Array<Record<string, unknown>>
      expect(targetLinks).toHaveLength(2)
      expect((targetLinks[0] as { is_primary: number }).is_primary).toBe(1)
      expect((targetLinks[1] as { is_primary: number }).is_primary).toBe(0)

      const equipLinks = sqlite.prepare('SELECT * FROM session_equipment WHERE session_id = ?').all(session.id) as Array<Record<string, unknown>>
      expect(equipLinks).toHaveLength(2)
    })

    it('Given no associations, When a bare session is created, Then only the session row exists', () => {
      const session = createSession({ date: '2025-02-01' })

      expect(session.id).toBeTruthy()
      expect(session.date).toBe('2025-02-01')

      const targetLinks = sqlite.prepare('SELECT COUNT(*) as cnt FROM session_targets WHERE session_id = ?').get(session.id) as { cnt: number }
      expect(targetLinks.cnt).toBe(0)
    })
  })

  describe('EARS: Session Retrieval', () => {
    // Event: User navigates to a session detail view
    // Action: System queries session by ID
    // Response: Returns full ObservationSession or null
    // State: No mutation

    it('Given a session exists, When retrieved by ID, Then all fields are returned', () => {
      const session = createSession({
        date: '2025-03-10',
        weather: 'Partly cloudy',
        moonPhase: 0.75,
        totalExposureSec: 3600
      })

      const found = getSessionById(session.id)
      expect(found).not.toBeNull()
      expect(found!.weather).toBe('Partly cloudy')
      expect(found!.moonPhase).toBe(0.75)
      expect(found!.totalExposureSec).toBe(3600)
    })

    it('Given no session exists, When retrieved by missing ID, Then returns null', () => {
      expect(getSessionById('nonexistent')).toBeNull()
    })
  })

  describe('EARS: Session Listing with Filters', () => {
    // Event: User views session list with optional target and date filters
    // Action: System constructs dynamic query with optional JOINs and WHERE clauses
    // Response: Returns paginated SessionSummary array with total count
    // State: No mutation

    it('Given multiple sessions exist, When listing without filters, Then all sessions are returned sorted by date DESC', () => {
      createSession({ date: '2025-01-01' })
      createSession({ date: '2025-06-15' })
      createSession({ date: '2025-03-10' })

      const result = listSessions({})
      expect(result.total).toBe(3)
      expect(result.sessions[0].date).toBe('2025-06-15')
      expect(result.sessions[2].date).toBe('2025-01-01')
    })

    it('Given sessions linked to a target, When filtering by target_id, Then only matching sessions are returned', () => {
      const t1 = seedTarget(sqlite, { canonicalName: 'FilterTarget' })
      const t2 = seedTarget(sqlite, { canonicalName: 'OtherTarget' })

      createSession({ date: '2025-01-01', targetIds: [t1] })
      createSession({ date: '2025-02-01', targetIds: [t2] })
      createSession({ date: '2025-03-01', targetIds: [t1] })

      const result = listSessions({ targetId: t1 })
      expect(result.total).toBe(2)
      expect(result.sessions.every((s) => s.date !== '2025-02-01')).toBe(true)
    })

    it('Given sessions span multiple dates, When filtering by date range, Then only sessions within range are returned', () => {
      createSession({ date: '2025-01-01' })
      createSession({ date: '2025-06-15' })
      createSession({ date: '2025-12-25' })

      const result = listSessions({ fromDate: '2025-03-01', toDate: '2025-09-01' })
      expect(result.total).toBe(1)
      expect(result.sessions[0].date).toBe('2025-06-15')
    })

    it('Given sessions exist, When paginating with limit and offset, Then correct subset is returned', () => {
      createSession({ date: '2025-01-01' })
      createSession({ date: '2025-02-01' })
      createSession({ date: '2025-03-01' })

      const page = listSessions({ limit: 1, offset: 1 })
      expect(page.sessions).toHaveLength(1)
      expect(page.total).toBe(3)
    })
  })

  describe('EARS: Session Update', () => {
    // Event: User edits session fields
    // Action: System updates only provided fields, advances updated_at
    // Response: Returns updated ObservationSession
    // State: Only specified fields changed in database

    it('Given a session exists, When notes are updated, Then the notes change and updated_at advances', () => {
      const session = createSession({ date: '2025-04-01', notes: 'Original' })

      const updated = updateSession(session.id, { notes: 'Revised notes' })

      expect(updated!.notes).toBe('Revised notes')
      expect(updated!.updatedAt >= session.updatedAt).toBe(true)
    })

    it('Given a nonexistent session, When updating, Then returns null', () => {
      const result = updateSession('no-such-session', { notes: 'test' })
      expect(result).toBeNull()
    })
  })

  describe('EARS: Multi-Target Session (Multi-Target Imaging)', () => {
    // Event: User records a session containing multiple targets (e.g., wide field capturing M81 + M82)
    // Action: System creates session_targets rows with is_primary marking the first target
    // Response: Session is associated with all targets
    // State: Each target's session list includes this session

    it('Given three targets, When a session is created with all three, Then the first is primary and all are linked', () => {
      const t1 = seedTarget(sqlite, { canonicalName: 'M81' })
      const t2 = seedTarget(sqlite, { canonicalName: 'M82' })
      const t3 = seedTarget(sqlite, { canonicalName: 'IFN' })

      const session = createSession({ date: '2025-05-01', targetIds: [t1, t2, t3] })

      const links = sqlite.prepare('SELECT target_id, is_primary FROM session_targets WHERE session_id = ? ORDER BY is_primary DESC').all(session.id) as Array<{ target_id: string; is_primary: number }>
      expect(links).toHaveLength(3)
      expect(links[0].target_id).toBe(t1)
      expect(links[0].is_primary).toBe(1)
      expect(links.filter((l) => l.is_primary === 0)).toHaveLength(2)

      const t2Sessions = listSessions({ targetId: t2 })
      expect(t2Sessions.total).toBe(1)
    })
  })
})
