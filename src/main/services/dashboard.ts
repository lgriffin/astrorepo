import { getSqlite } from '../db/connection'
import { getTotalFitsFileCount } from './fits-analyzer'
import type { DashboardStats, CatalogueProgress } from '@shared/types'

export function getDashboardStats(): DashboardStats {
  const sqlite = getSqlite()

  const totals = sqlite.prepare(
    `SELECT
       COUNT(*) as total,
       COUNT(CASE WHEN workflow_stage IN ('published','printed','archived') THEN 1 END) as completed,
       COUNT(CASE WHEN workflow_stage NOT IN ('planned','published','printed','archived') THEN 1 END) as in_progress,
       COUNT(CASE WHEN workflow_stage = 'planned' THEN 1 END) as planned
     FROM targets`
  ).get() as Record<string, number>

  const typeRows = sqlite.prepare(
    'SELECT object_type, COUNT(*) as cnt FROM targets GROUP BY object_type'
  ).all() as Array<{ object_type: string; cnt: number }>

  const objectsByType: Record<string, number> = {}
  for (const r of typeRows) objectsByType[r.object_type] = r.cnt

  const catRows = sqlite.prepare(
    `SELECT c.abbreviation,
            COUNT(ce.id) as total,
            COUNT(CASE WHEN t.workflow_stage IN ('published','printed','archived') THEN 1 END) as completed
     FROM catalogues c
     LEFT JOIN catalogue_entries ce ON ce.catalogue_id = c.id
     LEFT JOIN targets t ON t.id = ce.target_id
     GROUP BY c.id`
  ).all() as Array<{ abbreviation: string; total: number; completed: number }>

  const objectsByCatalogue: Record<string, { completed: number; total: number }> = {}
  for (const r of catRows) objectsByCatalogue[r.abbreviation] = { completed: r.completed, total: r.total }

  const sessionStats = sqlite.prepare(
    `SELECT COUNT(DISTINCT date) as nights,
            COALESCE(SUM(total_exposure_sec), 0) as total_exposure
     FROM observation_sessions`
  ).get() as { nights: number; total_exposure: number }

  const equipRows = sqlite.prepare(
    `SELECT e.name, COUNT(se.session_id) as session_count
     FROM equipment e
     JOIN session_equipment se ON se.equipment_id = e.id
     GROUP BY e.id
     ORDER BY session_count DESC
     LIMIT 5`
  ).all() as Array<{ name: string; session_count: number }>

  return {
    totalTargets: totals.total,
    completedTargets: totals.completed,
    inProgressTargets: totals.in_progress,
    plannedTargets: totals.planned,
    objectsByType,
    objectsByCatalogue,
    observationNights: sessionStats.nights,
    totalFitsFiles: getTotalFitsFileCount(),
    totalExposureSec: sessionStats.total_exposure,
    storageBytes: 0,
    averageIntegrationSec: 0,
    mostUsedEquipment: equipRows.map((r) => ({ name: r.name, sessionCount: r.session_count })),
    largestDataset: null,
    deepestIntegration: null,
    longestProject: null,
    oldestUnfinished: null
  }
}

export function getCatalogueProgressStats(): CatalogueProgress[] {
  const sqlite = getSqlite()
  const rows = sqlite.prepare(
    `SELECT c.id as catalogue_id, c.name as catalogue_name, c.abbreviation,
            COUNT(ce.id) as total,
            COUNT(CASE WHEN t.workflow_stage IN ('published','printed','archived') THEN 1 END) as completed
     FROM catalogues c
     LEFT JOIN catalogue_entries ce ON ce.catalogue_id = c.id
     LEFT JOIN targets t ON t.id = ce.target_id
     GROUP BY c.id
     ORDER BY c.name`
  ).all() as Array<Record<string, unknown>>

  return rows.map((r) => ({
    catalogueId: r.catalogue_id as string,
    catalogueName: r.catalogue_name as string,
    abbreviation: r.abbreviation as string,
    completed: r.completed as number,
    total: r.total as number
  }))
}
