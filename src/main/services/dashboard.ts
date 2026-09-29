import { getSqlite } from '../db/connection'
import { getTotalFitsFileCount } from './fits-analyzer'
import type { DashboardStats, CatalogueProgress } from '@shared/types'

export function getDashboardStats(): DashboardStats {
  const sqlite = getSqlite()

  const totals = sqlite.prepare(
    `SELECT
       COUNT(*) as total,
       COUNT(CASE WHEN workflow_stage IN ('published','printed','archived') THEN 1 END) as completed,
       COUNT(CASE WHEN workflow_stage NOT IN ('not_observed','published','printed','archived') THEN 1 END) as in_progress,
       COUNT(CASE WHEN workflow_stage = 'not_observed' THEN 1 END) as planned
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

  // storageBytes: total from fits_files
  const storageRow = sqlite.prepare('SELECT COALESCE(SUM(file_size_bytes), 0) as total FROM fits_files').get() as { total: number }

  // averageIntegrationSec: average total exposure per target folder
  const avgIntRow = sqlite.prepare(
    `SELECT COALESCE(AVG(folder_total), 0) as avg_sec FROM (
      SELECT COALESCE(SUM(exposure_sec), 0) as folder_total
      FROM fits_files WHERE folder_name IS NOT NULL
      GROUP BY folder_name
    )`
  ).get() as { avg_sec: number }

  // largestDataset: folder with most files
  const largestRow = sqlite.prepare(
    'SELECT folder_name as name, COUNT(*) as cnt FROM fits_files WHERE folder_name IS NOT NULL GROUP BY folder_name ORDER BY cnt DESC LIMIT 1'
  ).get() as { name: string; cnt: number } | undefined

  // deepestIntegration: folder with most total exposure
  const deepestRow = sqlite.prepare(
    'SELECT folder_name as name, COALESCE(SUM(exposure_sec), 0) as total FROM fits_files WHERE folder_name IS NOT NULL GROUP BY folder_name ORDER BY total DESC LIMIT 1'
  ).get() as { name: string; total: number } | undefined

  // longestProject: target with greatest date range span
  const longestRow = sqlite.prepare(
    `SELECT folder_name as name,
      CAST(julianday(MAX(date_obs)) - julianday(MIN(date_obs)) AS INTEGER) as days
     FROM fits_files WHERE folder_name IS NOT NULL AND date_obs IS NOT NULL
     GROUP BY folder_name ORDER BY days DESC LIMIT 1`
  ).get() as { name: string; days: number } | undefined

  // oldestUnfinished: target not at published/archived stage
  const oldestRow = sqlite.prepare(
    "SELECT canonical_name as name, created_at FROM targets WHERE workflow_stage NOT IN ('published','printed','archived') ORDER BY created_at ASC LIMIT 1"
  ).get() as { name: string; created_at: string } | undefined

  const dataAwareness = sqlite.prepare(
    `SELECT
       COUNT(CASE WHEN raw_files > 0 THEN 1 END) as with_raw,
       COUNT(CASE WHEN stacked_files > 0 THEN 1 END) as with_stacked,
       COUNT(CASE WHEN tif_files > 0 THEN 1 END) as with_tif,
       COUNT(CASE WHEN image_files > 0 THEN 1 END) as with_images
     FROM target_home_data`
  ).get() as Record<string, number>

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
    storageBytes: storageRow.total,
    averageIntegrationSec: Math.round(avgIntRow.avg_sec),
    mostUsedEquipment: equipRows.map((r) => ({ name: r.name, sessionCount: r.session_count })),
    largestDataset: largestRow ? { targetName: largestRow.name, frameCount: largestRow.cnt } : null,
    deepestIntegration: deepestRow && deepestRow.total > 0 ? { targetName: deepestRow.name, exposureSec: deepestRow.total } : null,
    longestProject: longestRow && longestRow.days > 0 ? { targetName: longestRow.name, days: longestRow.days } : null,
    oldestUnfinished: oldestRow ? { targetName: oldestRow.name, createdAt: oldestRow.created_at } : null,
    targetsWithRawData: dataAwareness.with_raw,
    targetsWithStackedData: dataAwareness.with_stacked,
    targetsWithTifData: dataAwareness.with_tif,
    targetsWithImageData: dataAwareness.with_images
  }
}

export function getCatalogueProgressStats(): CatalogueProgress[] {
  const sqlite = getSqlite()
  const rows = sqlite.prepare(
    `SELECT c.id as catalogue_id, c.name as catalogue_name, c.abbreviation,
            COUNT(ce.id) as total,
            COUNT(CASE WHEN t.workflow_stage != 'not_observed' THEN 1 END) as observed,
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
    observed: r.observed as number,
    completed: r.completed as number,
    total: r.total as number
  }))
}
