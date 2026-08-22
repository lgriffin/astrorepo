import { ulid } from 'ulid'
import { getSqlite } from '../db/connection'
import type { Collection, CollectionWithStats, TargetSummary } from '@shared/types'

export function createCollection(name: string, description?: string): Collection {
  const sqlite = getSqlite()
  const id = ulid()
  const now = new Date().toISOString()

  sqlite
    .prepare('INSERT INTO collections (id, name, description, is_auto, source_catalogue_id, created_at, updated_at) VALUES (?, ?, ?, 0, NULL, ?, ?)')
    .run(id, name, description ?? null, now, now)

  return getCollectionById(id)!
}

export function listCollections(): CollectionWithStats[] {
  const sqlite = getSqlite()
  const rows = sqlite
    .prepare(
      `SELECT c.id, c.name, c.description, c.is_auto, c.source_catalogue_id, c.created_at, c.updated_at,
              COUNT(cm.target_id) as total,
              COUNT(CASE WHEN t.workflow_stage != 'not_observed' THEN 1 END) as observed,
              COUNT(CASE WHEN t.workflow_stage IN ('published','printed','archived') THEN 1 END) as completed
       FROM collections c
       LEFT JOIN collection_memberships cm ON cm.collection_id = c.id
       LEFT JOIN targets t ON t.id = cm.target_id
       GROUP BY c.id
       ORDER BY c.name`
    )
    .all() as Array<Record<string, unknown>>

  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | null,
    isAuto: (r.is_auto as number) === 1,
    sourceCatalogueId: r.source_catalogue_id as string | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    observed: r.observed as number,
    completed: r.completed as number,
    total: r.total as number
  }))
}

export function getCollectionWithTargets(id: string, limit = 100, offset = 0): {
  collection: Collection
  targets: TargetSummary[]
  observed: number
  completed: number
  total: number
} | null {
  const collection = getCollectionById(id)
  if (!collection) return null

  const sqlite = getSqlite()
  const stats = sqlite
    .prepare(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN t.workflow_stage != 'not_observed' THEN 1 END) as observed,
              COUNT(CASE WHEN t.workflow_stage IN ('published','printed','archived') THEN 1 END) as completed
       FROM collection_memberships cm
       JOIN targets t ON t.id = cm.target_id
       WHERE cm.collection_id = ?`
    )
    .get(id) as { total: number; observed: number; completed: number }

  const rows = sqlite
    .prepare(
      `SELECT t.id, t.canonical_name, t.object_type, t.constellation, t.magnitude,
              t.workflow_stage, t.is_custom
       FROM collection_memberships cm
       JOIN targets t ON t.id = cm.target_id
       WHERE cm.collection_id = ?
       ORDER BY t.canonical_name
       LIMIT ? OFFSET ?`
    )
    .all(id, limit, offset) as Array<Record<string, unknown>>

  const targets: TargetSummary[] = rows.map((r) => {
    const aliases = sqlite
      .prepare('SELECT alias FROM target_aliases WHERE target_id = ?')
      .all(r.id as string) as { alias: string }[]

    return {
      id: r.id as string,
      canonicalName: r.canonical_name as string,
      objectType: r.object_type as TargetSummary['objectType'],
      constellation: r.constellation as string | null,
      magnitude: r.magnitude as number | null,
      workflowStage: r.workflow_stage as string,
      isCustom: (r.is_custom as number) === 1,
      aliases: aliases.map((a) => a.alias)
    }
  })

  return { collection, targets, observed: stats.observed, completed: stats.completed, total: stats.total }
}

export function addTargetToCollection(collectionId: string, targetId: string): boolean {
  const sqlite = getSqlite()
  const now = new Date().toISOString()
  try {
    sqlite
      .prepare('INSERT OR IGNORE INTO collection_memberships (collection_id, target_id, added_at) VALUES (?, ?, ?)')
      .run(collectionId, targetId, now)
    return true
  } catch {
    return false
  }
}

export function removeTargetFromCollection(collectionId: string, targetId: string): boolean {
  const sqlite = getSqlite()
  const result = sqlite
    .prepare('DELETE FROM collection_memberships WHERE collection_id = ? AND target_id = ?')
    .run(collectionId, targetId)
  return result.changes > 0
}

export function autoGenerateCatalogueCollections(): void {
  const sqlite = getSqlite()

  const existingAuto = sqlite
    .prepare('SELECT COUNT(*) as cnt FROM collections WHERE is_auto = 1')
    .get() as { cnt: number }

  if (existingAuto.cnt > 0) return

  const catalogues = sqlite
    .prepare('SELECT id, name FROM catalogues WHERE is_builtin = 1')
    .all() as { id: string; name: string }[]

  const now = new Date().toISOString()

  const insertCollection = sqlite.prepare(
    'INSERT INTO collections (id, name, description, is_auto, source_catalogue_id, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)'
  )
  const insertMembership = sqlite.prepare(
    'INSERT OR IGNORE INTO collection_memberships (collection_id, target_id, added_at) VALUES (?, ?, ?)'
  )

  const transaction = sqlite.transaction(() => {
    for (const cat of catalogues) {
      const collId = ulid()
      insertCollection.run(collId, `${cat.name} Collection`, `Auto-generated from ${cat.name} catalogue`, cat.id, now, now)

      const entries = sqlite
        .prepare('SELECT target_id FROM catalogue_entries WHERE catalogue_id = ?')
        .all(cat.id) as { target_id: string }[]

      for (const entry of entries) {
        insertMembership.run(collId, entry.target_id, now)
      }
    }
  })

  transaction()
}

export function syncTargetsToCollections(targetIds: string[]): void {
  if (targetIds.length === 0) return
  const sqlite = getSqlite()

  const autoCollections = sqlite
    .prepare('SELECT id, source_catalogue_id FROM collections WHERE is_auto = 1 AND source_catalogue_id IS NOT NULL')
    .all() as { id: string; source_catalogue_id: string }[]

  if (autoCollections.length === 0) return

  const collectionByCatalogue = new Map<string, string>()
  for (const ac of autoCollections) {
    collectionByCatalogue.set(ac.source_catalogue_id, ac.id)
  }

  const getCatalogueEntries = sqlite.prepare('SELECT catalogue_id FROM catalogue_entries WHERE target_id = ?')
  const insertMembership = sqlite.prepare(
    'INSERT OR IGNORE INTO collection_memberships (collection_id, target_id, added_at) VALUES (?, ?, datetime(\'now\'))'
  )

  const transaction = sqlite.transaction(() => {
    for (const targetId of targetIds) {
      const entries = getCatalogueEntries.all(targetId) as { catalogue_id: string }[]
      for (const entry of entries) {
        const collectionId = collectionByCatalogue.get(entry.catalogue_id)
        if (collectionId) {
          insertMembership.run(collectionId, targetId)
        }
      }
    }
  })

  transaction()
}

function getCollectionById(id: string): Collection | null {
  const sqlite = getSqlite()
  const row = sqlite
    .prepare('SELECT id, name, description, is_auto, source_catalogue_id, created_at, updated_at FROM collections WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined

  if (!row) return null

  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | null,
    isAuto: (row.is_auto as number) === 1,
    sourceCatalogueId: row.source_catalogue_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}
