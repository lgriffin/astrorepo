import { ulid } from 'ulid'
import { getSqlite } from '../db/connection'
import type { TargetRelationship, RelationshipWithTarget } from '@shared/types'

export function createRelationship(sourceTargetId: string, relatedTargetId: string, relationshipType: string): TargetRelationship {
  const sqlite = getSqlite()
  const id = ulid()
  const now = new Date().toISOString()

  sqlite
    .prepare('INSERT INTO target_relationships (id, source_target_id, related_target_id, relationship_type, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, sourceTargetId, relatedTargetId, relationshipType, now)

  return {
    id,
    sourceTargetId,
    relatedTargetId,
    relationshipType: relationshipType as TargetRelationship['relationshipType'],
    createdAt: now
  }
}

export function listRelationships(targetId: string): RelationshipWithTarget[] {
  const sqlite = getSqlite()

  const rows = sqlite
    .prepare(
      `SELECT r.id, r.source_target_id, r.related_target_id, r.relationship_type, r.created_at,
              t.id as t_id, t.canonical_name, t.object_type, t.constellation, t.magnitude,
              t.workflow_stage, t.is_custom
       FROM target_relationships r
       JOIN targets t ON (
         CASE WHEN r.source_target_id = ? THEN t.id = r.related_target_id
              ELSE t.id = r.source_target_id END
       )
       WHERE r.source_target_id = ? OR r.related_target_id = ?`
    )
    .all(targetId, targetId, targetId) as Array<Record<string, unknown>>

  return rows.map((r) => {
    const isSource = r.source_target_id === targetId
    const aliases = sqlite
      .prepare('SELECT alias FROM target_aliases WHERE target_id = ?')
      .all(r.t_id as string) as { alias: string }[]

    const relType = r.relationship_type as string
    let displayType = relType.replace(/_/g, ' ')
    if (!isSource) {
      const inverses: Record<string, string> = {
        contains: 'contained in',
        parent_region: 'part of',
        nearby: 'nearby'
      }
      displayType = inverses[relType] ?? displayType
    }

    return {
      id: r.id as string,
      sourceTargetId: r.source_target_id as string,
      relatedTargetId: r.related_target_id as string,
      relationshipType: relType as RelationshipWithTarget['relationshipType'],
      createdAt: r.created_at as string,
      relatedTarget: {
        id: r.t_id as string,
        canonicalName: r.canonical_name as string,
        objectType: r.object_type as RelationshipWithTarget['relatedTarget']['objectType'],
        constellation: r.constellation as string | null,
        magnitude: r.magnitude as number | null,
        workflowStage: r.workflow_stage as string,
        isCustom: (r.is_custom as number) === 1,
        aliases: aliases.map((a) => a.alias)
      },
      displayType
    }
  })
}

export function deleteRelationship(id: string): boolean {
  const sqlite = getSqlite()
  const result = sqlite.prepare('DELETE FROM target_relationships WHERE id = ?').run(id)
  return result.changes > 0
}
