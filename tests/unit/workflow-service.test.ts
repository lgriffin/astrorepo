import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { setupTestDb, teardownTestDb, seedTarget } from '../helpers/setup'

let sqlite: Database.Database

vi.mock('../../src/main/db/connection', () => ({
  getSqlite: () => sqlite,
  getDb: () => null
}))

const { advanceStage, getTransitionHistory, listStages, addStage, removeStage } = await import('../../src/main/services/workflow')

describe('WorkflowService', () => {
  beforeEach(() => {
    sqlite = setupTestDb()
  })
  afterEach(() => {
    teardownTestDb()
  })

  describe('EARS: Stage Advancement', () => {
    // Event: User clicks "advance" on a target's workflow stepper
    // Action: System records a transition and updates the target's workflow_stage
    // Response: Returns the transition record and updated target
    // State: Target's stage is updated, transition row is created

    it('Given a target at planned stage, When advanced to scheduled, Then stage updates and transition is recorded', () => {
      const targetId = seedTarget(sqlite, { canonicalName: 'M1', workflowStage: 'planned' })

      const result = advanceStage(targetId, 'scheduled', 'Queued for next clear night')

      expect(result).not.toBeNull()
      expect(result!.transition.fromStage).toBe('planned')
      expect(result!.transition.toStage).toBe('scheduled')
      expect(result!.transition.notes).toBe('Queued for next clear night')

      const row = sqlite.prepare('SELECT workflow_stage FROM targets WHERE id = ?').get(targetId) as { workflow_stage: string }
      expect(row.workflow_stage).toBe('scheduled')
    })

    it('Given a nonexistent target, When advancement is attempted, Then returns null', () => {
      expect(advanceStage('no-such-id', 'observed')).toBeNull()
    })
  })

  describe('EARS: Transition History', () => {
    // Event: User views the workflow history of a target
    // Action: System queries all transitions ordered chronologically
    // Response: Returns array of WorkflowTransition objects
    // State: No mutation

    it('Given a target with multiple transitions, When history is queried, Then all transitions are returned in order', () => {
      const targetId = seedTarget(sqlite, { canonicalName: 'M42', workflowStage: 'planned' })
      advanceStage(targetId, 'scheduled')
      advanceStage(targetId, 'observed')
      advanceStage(targetId, 'raw_captured')

      const history = getTransitionHistory(targetId)
      expect(history).toHaveLength(3)
      expect(history[0].toStage).toBe('scheduled')
      expect(history[1].toStage).toBe('observed')
      expect(history[2].toStage).toBe('raw_captured')
    })
  })

  describe('EARS: Stage Management', () => {
    // Event: User lists or adds/removes custom workflow stages
    // Action: System reads/writes workflow_stages table
    // Response: Returns stage objects
    // State: Custom stages can be added/removed; default stages cannot be removed

    it('Given default stages exist, When listing stages, Then 12 default stages are returned in order', () => {
      const stages = listStages()
      expect(stages).toHaveLength(12)
      expect(stages[0].name).toBe('planned')
      expect(stages[11].name).toBe('archived')
    })

    it('Given a custom stage is added, When listing stages, Then it appears in the list', () => {
      const stage = addStage('peer_review', 9)
      expect(stage.name).toBe('peer_review')
      expect(stage.isDefault).toBe(false)

      const all = listStages()
      expect(all.some((s) => s.name === 'peer_review')).toBe(true)
    })

    it('Given a custom stage exists, When removed, Then it disappears from the list', () => {
      const stage = addStage('temp_stage', 99)
      expect(removeStage(stage.id)).toBe(true)

      const all = listStages()
      expect(all.some((s) => s.name === 'temp_stage')).toBe(false)
    })

    it('Given a default stage, When removal is attempted, Then it is not removed', () => {
      const stages = listStages()
      const defaultStage = stages.find((s) => s.isDefault)!
      expect(removeStage(defaultStage.id)).toBe(false)
    })
  })
})
