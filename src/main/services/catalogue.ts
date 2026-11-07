import { getSqlite } from '../db/connection'
import type { Catalogue, CatalogueProgress } from '@shared/types'

/* The built-in catalogues as listed in the app. Seeding and repair: makeRepairCatalogues (specs/047-catalogue-names). */

export function listCatalogues(): Catalogue[] {
  const sqlite = getSqlite()
  const rows = sqlite
    .prepare('SELECT id, name, abbreviation, description, total_objects, is_builtin, created_at FROM catalogues ORDER BY name')
    .all() as Array<{
    id: string
    name: string
    abbreviation: string
    description: string | null
    total_objects: number | null
    is_builtin: number
    created_at: string
  }>

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    abbreviation: r.abbreviation,
    description: r.description,
    totalObjects: r.total_objects,
    isBuiltin: r.is_builtin === 1,
    createdAt: r.created_at
  }))
}

export function getCatalogueProgress(): CatalogueProgress[] {
  const sqlite = getSqlite()
  const rows = sqlite
    .prepare(
      `SELECT c.id as catalogue_id, c.name as catalogue_name, c.abbreviation,
              COUNT(ce.id) as total,
              COUNT(CASE WHEN t.workflow_stage != 'not_observed' THEN 1 END) as observed,
              COUNT(CASE WHEN t.workflow_stage IN ('published','printed','archived') THEN 1 END) as completed
       FROM catalogues c
       LEFT JOIN catalogue_entries ce ON ce.catalogue_id = c.id
       LEFT JOIN targets t ON t.id = ce.target_id
       GROUP BY c.id
       ORDER BY c.name`
    )
    .all() as Array<{
    catalogue_id: string
    catalogue_name: string
    abbreviation: string
    total: number
    observed: number
    completed: number
  }>

  return rows.map((r) => ({
    catalogueId: r.catalogue_id,
    catalogueName: r.catalogue_name,
    abbreviation: r.abbreviation,
    observed: r.observed,
    completed: r.completed,
    total: r.total
  }))
}
