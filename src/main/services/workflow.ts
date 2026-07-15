import { ulid } from 'ulid'
import { getSqlite } from '../db/connection'
import type { WorkflowStage, WorkflowTransition } from '@shared/types'

export function advanceStage(targetId: string, toStage: string, notes?: string): { target: unknown; transition: WorkflowTransition } | null {
  const sqlite = getSqlite()

  const target = sqlite.prepare('SELECT id, workflow_stage FROM targets WHERE id = ?').get(targetId) as { id: string; workflow_stage: string } | undefined
  if (!target) return null

  const now = new Date().toISOString()
  const transitionId = ulid()

  const transaction = sqlite.transaction(() => {
    sqlite.prepare('INSERT INTO workflow_transitions (id, target_id, from_stage, to_stage, transitioned_at, notes) VALUES (?, ?, ?, ?, ?, ?)').run(
      transitionId, targetId, target.workflow_stage, toStage, now, notes ?? null
    )
    sqlite.prepare('UPDATE targets SET workflow_stage = ?, updated_at = ? WHERE id = ?').run(toStage, now, targetId)
  })

  transaction()

  const updated = sqlite.prepare('SELECT * FROM targets WHERE id = ?').get(targetId)
  const transition: WorkflowTransition = {
    id: transitionId,
    targetId,
    fromStage: target.workflow_stage,
    toStage,
    transitionedAt: now,
    notes: notes ?? null
  }

  return { target: updated, transition }
}

export function getTransitionHistory(targetId: string): WorkflowTransition[] {
  const sqlite = getSqlite()
  const rows = sqlite
    .prepare('SELECT id, target_id, from_stage, to_stage, transitioned_at, notes FROM workflow_transitions WHERE target_id = ? ORDER BY transitioned_at')
    .all(targetId) as Array<Record<string, unknown>>

  return rows.map((r) => ({
    id: r.id as string,
    targetId: r.target_id as string,
    fromStage: r.from_stage as string | null,
    toStage: r.to_stage as string,
    transitionedAt: r.transitioned_at as string,
    notes: r.notes as string | null
  }))
}

export function listStages(): WorkflowStage[] {
  const sqlite = getSqlite()
  const rows = sqlite
    .prepare('SELECT id, name, sort_order, is_default FROM workflow_stages ORDER BY sort_order')
    .all() as Array<Record<string, unknown>>

  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    sortOrder: r.sort_order as number,
    isDefault: (r.is_default as number) === 1
  }))
}

export function addStage(name: string, sortOrder: number): WorkflowStage {
  const sqlite = getSqlite()
  const id = ulid()
  sqlite.prepare('INSERT INTO workflow_stages (id, name, sort_order, is_default) VALUES (?, ?, ?, 0)').run(id, name, sortOrder)
  return { id, name, sortOrder, isDefault: false }
}

export function removeStage(id: string): boolean {
  const sqlite = getSqlite()
  const result = sqlite.prepare('DELETE FROM workflow_stages WHERE id = ? AND is_default = 0').run(id)
  return result.changes > 0
}
