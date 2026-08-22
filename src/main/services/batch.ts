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
  for (const id of targetIds) {
    try {
      del.run(id)
      succeeded++
    } catch {
      failed++
    }
  }
  return { succeeded, failed }
}
