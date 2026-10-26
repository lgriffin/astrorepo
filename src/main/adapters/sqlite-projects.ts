import type Database from 'better-sqlite3'
import { ulid } from 'ulid'
import type { NewProject, ProjectRecord, ProjectSource, ProjectSources, ProjectStore } from '@astro/application'
import type { CompletionRule, ProjectKind, ProjectStatus } from '@astro/domain'

interface ProjectRow {
  id: string
  name: string
  kind: ProjectKind
  status: ProjectStatus
  rule: string
  window_start: string | null
  window_end: string | null
  catalogue_id: string | null
  collection_id: string | null
  workspace_id: string | null
  created_at: string
  updated_at: string
}

/** ProjectStore over projects and project_targets; the rule is kept as JSON, progress never. */
export class SqliteProjectStore implements ProjectStore {
  constructor(private readonly db: Database.Database) {}

  private toRecord(r: ProjectRow): ProjectRecord {
    const targets = this.db.prepare('SELECT target_id FROM project_targets WHERE project_id = ? ORDER BY position, target_id').all(r.id) as { target_id: string }[]
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      status: r.status,
      rule: JSON.parse(r.rule) as CompletionRule,
      window: r.window_start && r.window_end ? { start: r.window_start, end: r.window_end } : null,
      catalogueId: r.catalogue_id,
      collectionId: r.collection_id,
      workspaceId: r.workspace_id,
      targetIds: targets.map(t => t.target_id),
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at)
    }
  }

  async list(): Promise<ProjectRecord[]> {
    return (this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC, id DESC').all() as ProjectRow[]).map(r => this.toRecord(r))
  }

  async get(id: string): Promise<ProjectRecord | null> {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
    return row ? this.toRecord(row) : null
  }

  async create(p: NewProject): Promise<ProjectRecord> {
    const id = ulid()
    const at = p.createdAt.toISOString()
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO projects (id, name, kind, status, rule, window_start, window_end, catalogue_id, collection_id, workspace_id, created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, p.name, p.kind, JSON.stringify(p.rule), p.window?.start ?? null, p.window?.end ?? null, p.catalogueId, p.collectionId, p.workspaceId, at, at)
      this.insertTargets(id, p.targetIds, at)
    })()
    return (await this.get(id)) as ProjectRecord
  }

  private insertTargets(id: string, targetIds: string[], at: string) {
    const last = (this.db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM project_targets WHERE project_id = ?').get(id) as { p: number }).p
    const insert = this.db.prepare('INSERT OR IGNORE INTO project_targets (project_id, target_id, position, added_at) VALUES (?, ?, ?, ?)')
    targetIds.forEach((t, i) => insert.run(id, t, last + 1 + i, at))
  }

  async update(id: string, change: Partial<Pick<ProjectRecord, 'name' | 'status' | 'rule' | 'window'>>, at: Date): Promise<void> {
    const columns: Record<string, unknown> = {}
    if (change.name !== undefined) columns.name = change.name
    if (change.status !== undefined) columns.status = change.status
    if (change.rule !== undefined) columns.rule = JSON.stringify(change.rule)
    if (change.window !== undefined) {
      columns.window_start = change.window?.start ?? null
      columns.window_end = change.window?.end ?? null
    }
    const sets = Object.keys(columns).map(c => `${c} = ?`)
    const values = Object.values(columns)
    sets.push('updated_at = ?')
    values.push(at.toISOString())
    this.db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
  }

  async addTargets(id: string, targetIds: string[], at: Date): Promise<void> {
    this.db.transaction(() => {
      this.insertTargets(id, targetIds, at.toISOString())
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(at.toISOString(), id)
    })()
  }

  async removeTarget(id: string, targetId: string, at: Date): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM project_targets WHERE project_id = ? AND target_id = ?').run(id, targetId)
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(at.toISOString(), id)
    })()
  }
}

/** ProjectSources over catalogues, catalogue_entries, collections and targets, read only. */
export class SqliteProjectSources implements ProjectSources {
  constructor(private readonly db: Database.Database) {}

  async catalogues(): Promise<ProjectSource[]> {
    return this.db
      .prepare('SELECT c.id, c.name, (SELECT COUNT(*) FROM catalogue_entries e WHERE e.catalogue_id = c.id) AS size FROM catalogues c ORDER BY c.name')
      .all() as ProjectSource[]
  }

  async catalogueTargets(catalogueId: string): Promise<string[]> {
    // M1, M2 … M110: shorter designations first keeps the numbers in order.
    const rows = this.db.prepare('SELECT target_id FROM catalogue_entries WHERE catalogue_id = ? ORDER BY LENGTH(designation), designation').all(catalogueId) as { target_id: string }[]
    return rows.map(r => r.target_id)
  }

  async collections(): Promise<ProjectSource[]> {
    return this.db
      .prepare('SELECT c.id, c.name, (SELECT COUNT(*) FROM collection_memberships m WHERE m.collection_id = c.id) AS size FROM collections c ORDER BY c.name')
      .all() as ProjectSource[]
  }

  async collectionTargets(collectionId: string): Promise<string[]> {
    const rows = this.db.prepare('SELECT target_id FROM collection_memberships WHERE collection_id = ? ORDER BY added_at, target_id').all(collectionId) as { target_id: string }[]
    return rows.map(r => r.target_id)
  }

  async targetNames(targetIds: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>()
    const get = this.db.prepare('SELECT canonical_name FROM targets WHERE id = ?')
    for (const id of new Set(targetIds)) {
      const row = get.get(id) as { canonical_name: string } | undefined
      if (row) names.set(id, row.canonical_name)
    }
    return names
  }
}
