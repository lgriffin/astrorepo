import fs from 'fs'
import pathMod from 'path'
import { ulid } from 'ulid'
import { getSqlite } from '../db/connection'
import type { Target, TargetSummary, TargetAlias, CatalogueEntry } from '@shared/types'

interface SearchResult {
  targets: TargetSummary[]
  total: number
}

interface SearchOptions {
  objectType?: string
  workflowStage?: string
  sortBy?: string
  sortDir?: string
}

const SORT_COLUMNS: Record<string, string> = {
  name: 't.canonical_name',
  magnitude: 't.magnitude',
  constellation: 't.constellation',
  workflow_stage: 't.workflow_stage'
}

function buildOrderClause(sortBy?: string, sortDir?: string): string {
  const col = SORT_COLUMNS[sortBy ?? ''] ?? 't.canonical_name'
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC'
  if (sortBy === 'magnitude') return `${col} IS NULL, ${col} ${dir}`
  return `${col} ${dir}`
}

function buildFilterClauses(opts: SearchOptions): { where: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []
  if (opts.objectType) {
    clauses.push('t.object_type = ?')
    params.push(opts.objectType)
  }
  if (opts.workflowStage) {
    clauses.push('t.workflow_stage = ?')
    params.push(opts.workflowStage)
  }
  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', params }
}

export function searchTargets(query: string, limit = 50, offset = 0, opts: SearchOptions = {}): SearchResult {
  const sqlite = getSqlite()
  const order = buildOrderClause(opts.sortBy, opts.sortDir)

  if (!query.trim()) {
    const { where, params } = buildFilterClauses(opts)
    const total = (sqlite.prepare(`SELECT COUNT(*) as cnt FROM targets t ${where}`).get(...params) as { cnt: number }).cnt
    const rows = sqlite
      .prepare(
        `SELECT t.id, t.canonical_name, t.object_type, t.constellation, t.magnitude,
                t.workflow_stage, t.is_custom
         FROM targets t
         ${where}
         ORDER BY ${order}
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as RawTarget[]

    return {
      targets: rows.map((r) => toTargetSummary(r, sqlite)),
      total
    }
  }

  const ftsQuery = buildFtsQuery(query)
  const { where: filterWhere, params: filterParams } = buildFilterClauses(opts)
  const ftsFilter = filterWhere ? 'AND ' + filterWhere.replace('WHERE ', '') : ''

  const countRow = sqlite
    .prepare(
      `SELECT COUNT(*) as cnt FROM targets_fts fts
       JOIN targets t ON t.rowid = fts.rowid
       WHERE targets_fts MATCH ? ${ftsFilter}`
    )
    .get(ftsQuery, ...filterParams) as { cnt: number } | undefined

  const total = countRow?.cnt ?? 0

  const rows = sqlite
    .prepare(
      `SELECT t.id, t.canonical_name, t.object_type, t.constellation, t.magnitude,
              t.workflow_stage, t.is_custom
       FROM targets_fts fts
       JOIN targets t ON t.rowid = fts.rowid
       WHERE targets_fts MATCH ? ${ftsFilter}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`
    )
    .all(ftsQuery, ...filterParams, limit, offset) as RawTarget[]

  if (rows.length === 0 && total === 0) {
    return searchByAlias(query, limit, offset, sqlite, opts)
  }

  return {
    targets: rows.map((r) => toTargetSummary(r, sqlite)),
    total
  }
}

function searchByAlias(query: string, limit: number, offset: number, sqlite: ReturnType<typeof getSqlite>, opts: SearchOptions = {}): SearchResult {
  const pattern = `%${query}%`
  const { where: filterWhere, params: filterParams } = buildFilterClauses(opts)
  const extraFilter = filterWhere ? 'AND ' + filterWhere.replace('WHERE ', '') : ''
  const order = buildOrderClause(opts.sortBy, opts.sortDir)

  const countRow = sqlite
    .prepare(
      `SELECT COUNT(DISTINCT t.id) as cnt
       FROM targets t
       LEFT JOIN target_aliases ta ON ta.target_id = t.id
       WHERE (t.canonical_name LIKE ? OR ta.alias LIKE ?) ${extraFilter}`
    )
    .get(pattern, pattern, ...filterParams) as { cnt: number }

  const rows = sqlite
    .prepare(
      `SELECT DISTINCT t.id, t.canonical_name, t.object_type, t.constellation, t.magnitude,
              t.workflow_stage, t.is_custom
       FROM targets t
       LEFT JOIN target_aliases ta ON ta.target_id = t.id
       WHERE (t.canonical_name LIKE ? OR ta.alias LIKE ?) ${extraFilter}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`
    )
    .all(pattern, pattern, ...filterParams, limit, offset) as RawTarget[]

  return {
    targets: rows.map((r) => toTargetSummary(r, sqlite)),
    total: countRow.cnt
  }
}

export function getTargetById(id: string): Target | null {
  const sqlite = getSqlite()
  const row = sqlite
    .prepare(
      `SELECT id, canonical_name, object_type, ra_hours, dec_degrees, magnitude,
              angular_size_arcmin, constellation, description, simbad_id, ned_id,
              workflow_stage, is_custom, folder_path, thumbnail_path, notes, created_at, updated_at
       FROM targets WHERE id = ?`
    )
    .get(id) as RawTargetFull | undefined

  if (!row) return null
  return toTarget(row)
}

export function createTarget(input: {
  canonicalName: string
  objectType: string
  raHours?: number | null
  decDegrees?: number | null
  magnitude?: number | null
  angularSizeArcmin?: number | null
  constellation?: string | null
  description?: string | null
  simbadId?: string | null
  nedId?: string | null
}): Target {
  const sqlite = getSqlite()
  const id = ulid()
  const now = new Date().toISOString()

  sqlite
    .prepare(
      `INSERT INTO targets (id, canonical_name, object_type, ra_hours, dec_degrees, magnitude,
        angular_size_arcmin, constellation, description, simbad_id, ned_id,
        workflow_stage, is_custom, folder_path, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_observed', 1, NULL, NULL, ?, ?)`
    )
    .run(
      id,
      input.canonicalName,
      input.objectType,
      input.raHours ?? null,
      input.decDegrees ?? null,
      input.magnitude ?? null,
      input.angularSizeArcmin ?? null,
      input.constellation ?? null,
      input.description ?? null,
      input.simbadId ?? null,
      input.nedId ?? null,
      now,
      now
    )

  return getTargetById(id)!
}

export function updateTarget(id: string, fields: Partial<Omit<Target, 'id' | 'createdAt' | 'updatedAt'>>): Target | null {
  const sqlite = getSqlite()
  const existing = getTargetById(id)
  if (!existing) return null

  const updates: string[] = []
  const values: unknown[] = []

  const fieldMap: Record<string, string> = {
    canonicalName: 'canonical_name',
    objectType: 'object_type',
    raHours: 'ra_hours',
    decDegrees: 'dec_degrees',
    magnitude: 'magnitude',
    angularSizeArcmin: 'angular_size_arcmin',
    constellation: 'constellation',
    description: 'description',
    simbadId: 'simbad_id',
    nedId: 'ned_id',
    workflowStage: 'workflow_stage',
    isCustom: 'is_custom',
    folderPath: 'folder_path',
    notes: 'notes'
  }

  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in fields) {
      updates.push(`${col} = ?`)
      values.push((fields as Record<string, unknown>)[key])
    }
  }

  if (updates.length === 0) return existing

  updates.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)

  sqlite
    .prepare(`UPDATE targets SET ${updates.join(', ')} WHERE id = ?`)
    .run(...values)

  return getTargetById(id)
}

export function getAliasesForTarget(targetId: string): TargetAlias[] {
  const sqlite = getSqlite()
  const rows = sqlite
    .prepare('SELECT id, target_id, alias, source FROM target_aliases WHERE target_id = ?')
    .all(targetId) as { id: string; target_id: string; alias: string; source: string | null }[]

  return rows.map((r) => ({
    id: r.id,
    targetId: r.target_id,
    alias: r.alias,
    source: r.source
  }))
}

export function addAlias(targetId: string, alias: string, source?: string): TargetAlias | null {
  const sqlite = getSqlite()

  const conflict = sqlite
    .prepare('SELECT id FROM target_aliases WHERE alias = ?')
    .get(alias) as { id: string } | undefined
  if (conflict) return null

  const id = ulid()
  sqlite
    .prepare('INSERT INTO target_aliases (id, target_id, alias, source) VALUES (?, ?, ?, ?)')
    .run(id, targetId, alias, source ?? null)

  return { id, targetId, alias, source: source ?? null }
}

export function mergeTargets(keepId: string, mergeId: string): Target | null {
  const sqlite = getSqlite()
  const keep = getTargetById(keepId)
  const merge = getTargetById(mergeId)
  if (!keep || !merge || keepId === mergeId) return null

  const transaction = sqlite.transaction(() => {
    sqlite.prepare('UPDATE target_aliases SET target_id = ? WHERE target_id = ?').run(keepId, mergeId)
    sqlite.prepare('INSERT OR IGNORE INTO target_aliases (id, target_id, alias, source) VALUES (?, ?, ?, ?)').run(
      ulid(), keepId, merge.canonicalName, 'merge'
    )

    sqlite.prepare('UPDATE OR IGNORE catalogue_entries SET target_id = ? WHERE target_id = ?').run(keepId, mergeId)
    sqlite.prepare('DELETE FROM catalogue_entries WHERE target_id = ?').run(mergeId)

    sqlite.prepare('UPDATE OR IGNORE collection_memberships SET target_id = ? WHERE target_id = ?').run(keepId, mergeId)
    sqlite.prepare('DELETE FROM collection_memberships WHERE target_id = ?').run(mergeId)

    sqlite.prepare('UPDATE OR IGNORE session_targets SET target_id = ? WHERE target_id = ?').run(keepId, mergeId)
    sqlite.prepare('DELETE FROM session_targets WHERE target_id = ?').run(mergeId)

    sqlite.prepare('UPDATE workflow_transitions SET target_id = ? WHERE target_id = ?').run(keepId, mergeId)

    sqlite.prepare('UPDATE OR IGNORE target_relationships SET source_target_id = ? WHERE source_target_id = ?').run(keepId, mergeId)
    sqlite.prepare('UPDATE OR IGNORE target_relationships SET related_target_id = ? WHERE related_target_id = ?').run(keepId, mergeId)
    sqlite.prepare('DELETE FROM target_relationships WHERE source_target_id = related_target_id').run()
    sqlite.prepare('DELETE FROM target_relationships WHERE source_target_id = ? OR related_target_id = ?').run(mergeId, mergeId)

    sqlite.prepare('DELETE FROM targets WHERE id = ?').run(mergeId)
  })

  transaction()
  return getTargetById(keepId)
}

export function getCatalogueEntriesForTarget(targetId: string): CatalogueEntry[] {
  const sqlite = getSqlite()
  const rows = sqlite
    .prepare('SELECT id, catalogue_id, target_id, designation FROM catalogue_entries WHERE target_id = ?')
    .all(targetId) as { id: string; catalogue_id: string; target_id: string; designation: string }[]

  return rows.map((r) => ({
    id: r.id,
    catalogueId: r.catalogue_id,
    targetId: r.target_id,
    designation: r.designation
  }))
}

function buildFtsQuery(query: string): string {
  const cleaned = query.replace(/[^\w\s-]/g, '').trim()
  if (!cleaned) return '""'
  const terms = cleaned.split(/\s+/)
  return terms.map((t) => `"${t}"*`).join(' ')
}

interface RawTarget {
  id: string
  canonical_name: string
  object_type: string
  constellation: string | null
  magnitude: number | null
  workflow_stage: string
  is_custom: number
}

interface RawTargetFull extends RawTarget {
  ra_hours: number | null
  dec_degrees: number | null
  angular_size_arcmin: number | null
  description: string | null
  simbad_id: string | null
  ned_id: string | null
  folder_path: string | null
  thumbnail_path: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function toTargetSummary(row: RawTarget, sqlite: ReturnType<typeof getSqlite>): TargetSummary {
  const aliases = sqlite
    .prepare('SELECT alias FROM target_aliases WHERE target_id = ?')
    .all(row.id) as { alias: string }[]

  return {
    id: row.id,
    canonicalName: row.canonical_name,
    objectType: row.object_type as TargetSummary['objectType'],
    constellation: row.constellation,
    magnitude: row.magnitude,
    workflowStage: row.workflow_stage,
    isCustom: row.is_custom === 1,
    aliases: aliases.map((a) => a.alias)
  }
}

function toTarget(row: RawTargetFull): Target {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    objectType: row.object_type as Target['objectType'],
    raHours: row.ra_hours,
    decDegrees: row.dec_degrees,
    magnitude: row.magnitude,
    angularSizeArcmin: row.angular_size_arcmin,
    constellation: row.constellation,
    description: row.description,
    simbadId: row.simbad_id,
    nedId: row.ned_id,
    workflowStage: row.workflow_stage,
    isCustom: row.is_custom === 1,
    folderPath: row.folder_path,
    thumbnailPath: row.thumbnail_path,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function getTargetThumbnail(targetId: string): { data: string | null; mime?: string } {
  const sqlite = getSqlite()
  const row = sqlite.prepare('SELECT thumbnail_path FROM targets WHERE id = ?').get(targetId) as { thumbnail_path: string | null } | undefined
  if (!row?.thumbnail_path) return { data: null }
  try {
    const buf = fs.readFileSync(row.thumbnail_path)
    const ext = pathMod.extname(row.thumbnail_path).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : ext === '.tif' || ext === '.tiff' ? 'image/tiff' : 'image/jpeg'
    return { data: buf.toString('base64'), mime }
  } catch {
    return { data: null }
  }
}
