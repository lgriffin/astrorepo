import { getSqlite } from '../db/connection'
import { advanceStage } from './workflow'
import { addTargetToCollection } from './collection'

export function batchAdvanceStage(targetIds: string[], toStage: string, notes?: string): { succeeded: number; failed: number } {
  let succeeded = 0, failed = 0
  for (const id of targetIds) {
    try {
      advanceStage(id, toStage, notes)
      succeeded++
    } catch {
      failed++
    }
  }
  return { succeeded, failed }
}

export function batchAddToCollection(targetIds: string[], collectionId: string): { succeeded: number; failed: number } {
  let succeeded = 0, failed = 0
  for (const id of targetIds) {
    try {
      addTargetToCollection(collectionId, id)
      succeeded++
    } catch {
      failed++
    }
  }
  return { succeeded, failed }
}

export function batchDeleteTargets(targetIds: string[]): { succeeded: number; failed: number } {
  const sqlite = getSqlite()
  let succeeded = 0, failed = 0
  const del = sqlite.prepare('DELETE FROM targets WHERE id = ?')
  // A deleted target's queued jobs would start with nothing to show for them (its experiments go with it).
  const cancel = sqlite.prepare("UPDATE jobs SET state = 'cancelled', note = 'Its target was deleted.' WHERE target_id = ? AND state = 'queued'")
  for (const id of targetIds) {
    try {
      cancel.run(id)
      del.run(id)
      succeeded++
    } catch {
      failed++
    }
  }
  return { succeeded, failed }
}
