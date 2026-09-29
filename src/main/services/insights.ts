import { getSqlite } from '../db/connection'
import type {
  MonthlyActivity, BestNight, EquipmentEffectiveness,
  QualityTrendPoint, FilterUsage, TargetProgress, InsightsSummary
} from '@shared/types'

export function getInsightsSummary(): InsightsSummary {
  const sqlite = getSqlite()

  const totals = sqlite.prepare(`
    SELECT COUNT(*) as totalFiles,
           COALESCE(SUM(exposure_sec), 0) as totalExposureSec,
           MIN(date_obs) as firstDate
    FROM fits_files
    WHERE image_type LIKE '%light%' OR image_type LIKE '%Light%' OR image_type IS NULL
  `).get() as { totalFiles: number; totalExposureSec: number; firstDate: string | null }

  const targetCount = (sqlite.prepare(
    'SELECT COUNT(DISTINCT target_id) as cnt FROM fits_files WHERE target_id IS NOT NULL'
  ).get() as { cnt: number }).cnt

  const sessionCount = (sqlite.prepare(
    'SELECT COUNT(*) as cnt FROM observation_sessions'
  ).get() as { cnt: number }).cnt

  const mostImaged = sqlite.prepare(`
    SELECT t.canonical_name
    FROM fits_files f
    JOIN targets t ON t.id = f.target_id
    GROUP BY f.target_id
    ORDER BY COUNT(*) DESC
    LIMIT 1
  `).get() as { canonical_name: string } | undefined

  const mostFilter = sqlite.prepare(`
    SELECT filter FROM fits_files
    WHERE filter IS NOT NULL
    GROUP BY filter
    ORDER BY COUNT(*) DESC
    LIMIT 1
  `).get() as { filter: string } | undefined

  const bestNight = sqlite.prepare(`
    SELECT substr(date_obs, 1, 10) as night
    FROM fits_files
    WHERE date_obs IS NOT NULL AND exposure_sec IS NOT NULL
    GROUP BY substr(date_obs, 1, 10)
    ORDER BY SUM(exposure_sec) DESC
    LIMIT 1
  `).get() as { night: string } | undefined

  return {
    totalImagingHours: totals.totalExposureSec / 3600,
    totalFiles: totals.totalFiles,
    totalTargets: targetCount,
    totalSessions: sessionCount,
    activeSinceDate: totals.firstDate ? totals.firstDate.substring(0, 10) : null,
    mostImagedTarget: mostImaged?.canonical_name ?? null,
    mostUsedFilter: mostFilter?.filter ?? null,
    bestNightDate: bestNight?.night ?? null
  }
}

export function getMonthlyActivity(months = 12): MonthlyActivity[] {
  const sqlite = getSqlite()

  const rows = sqlite.prepare(`
    SELECT substr(date_obs, 1, 7) as month,
           COUNT(*) as totalFiles,
           COALESCE(SUM(exposure_sec), 0) as totalExposureSec,
           COUNT(DISTINCT object_name) as uniqueTargets,
           COUNT(DISTINCT session_folder) as sessions
    FROM fits_files
    WHERE date_obs IS NOT NULL
    GROUP BY substr(date_obs, 1, 7)
    ORDER BY month DESC
    LIMIT ?
  `).all(months) as Array<{
    month: string
    totalFiles: number
    totalExposureSec: number
    uniqueTargets: number
    sessions: number
  }>

  return rows.reverse()
}

export function getBestNights(limit = 10): BestNight[] {
  const sqlite = getSqlite()

  const nights = sqlite.prepare(`
    SELECT substr(date_obs, 1, 10) as date,
           SUM(exposure_sec) as totalExposureSec,
           COUNT(*) as fileCount,
           AVG(quality_score) as avgQuality
    FROM fits_files
    WHERE date_obs IS NOT NULL AND exposure_sec IS NOT NULL
    GROUP BY substr(date_obs, 1, 10)
    HAVING totalExposureSec > 0
    ORDER BY totalExposureSec DESC
    LIMIT ?
  `).all(limit) as Array<{
    date: string; totalExposureSec: number; fileCount: number; avgQuality: number | null
  }>

  return nights.map(n => {
    const targets = sqlite.prepare(`
      SELECT DISTINCT COALESCE(object_name, folder_name) as name
      FROM fits_files
      WHERE substr(date_obs, 1, 10) = ? AND (object_name IS NOT NULL OR folder_name IS NOT NULL)
    `).all(n.date) as { name: string }[]

    const filters = sqlite.prepare(`
      SELECT DISTINCT filter FROM fits_files
      WHERE substr(date_obs, 1, 10) = ? AND filter IS NOT NULL
    `).all(n.date) as { filter: string }[]

    return {
      ...n,
      targets: targets.map(t => t.name),
      filters: filters.map(f => f.filter)
    }
  })
}

export function getEquipmentEffectiveness(): EquipmentEffectiveness[] {
  const sqlite = getSqlite()

  return sqlite.prepare(`
    SELECT e.name as equipmentName,
           e.equipment_type as equipmentType,
           COUNT(DISTINCT se.session_id) as sessionCount,
           COALESCE(SUM(f.exposure_sec), 0) as totalExposureSec,
           AVG(f.fwhm_estimate) as avgFwhm,
           AVG(f.quality_score) as avgQuality
    FROM equipment e
    JOIN session_equipment se ON se.equipment_id = e.id
    JOIN observation_sessions os ON os.id = se.session_id
    LEFT JOIN session_targets st ON st.session_id = os.id
    LEFT JOIN fits_files f ON f.target_id = st.target_id
      AND substr(f.date_obs, 1, 10) = os.date
    GROUP BY e.id
    ORDER BY sessionCount DESC
  `).all() as EquipmentEffectiveness[]
}

export function getQualityTrends(months = 12): QualityTrendPoint[] {
  const sqlite = getSqlite()

  return sqlite.prepare(`
    SELECT substr(date_obs, 1, 7) as month,
           AVG(fwhm_estimate) as medianFwhm,
           AVG(pixel_stddev) as medianNoise,
           AVG(star_count_estimate) as avgStarCount,
           COUNT(*) as totalFiles
    FROM fits_files
    WHERE date_obs IS NOT NULL
      AND (fwhm_estimate IS NOT NULL OR pixel_stddev IS NOT NULL OR star_count_estimate IS NOT NULL)
    GROUP BY substr(date_obs, 1, 7)
    ORDER BY month DESC
    LIMIT ?
  `).all(months).reverse() as QualityTrendPoint[]
}

export function getFilterUsageBreakdown(): FilterUsage[] {
  const sqlite = getSqlite()

  return sqlite.prepare(`
    SELECT filter,
           COUNT(*) as fileCount,
           COALESCE(SUM(exposure_sec), 0) as totalExposureSec,
           COALESCE(AVG(exposure_sec), 0) as avgExposureSec,
           COUNT(DISTINCT COALESCE(object_name, folder_name)) as targets
    FROM fits_files
    WHERE filter IS NOT NULL
    GROUP BY filter
    ORDER BY totalExposureSec DESC
  `).all() as FilterUsage[]
}

export function getTargetProgress(limit = 20): TargetProgress[] {
  const sqlite = getSqlite()

  const rows = sqlite.prepare(`
    SELECT t.id as targetId,
           t.canonical_name as targetName,
           t.workflow_stage as workflowStage,
           COALESCE(SUM(f.exposure_sec), 0) as totalExposureSec,
           COUNT(f.id) as fileCount,
           MIN(f.date_obs) as firstImaged,
           MAX(f.date_obs) as lastImaged
    FROM targets t
    JOIN fits_files f ON f.target_id = t.id
    GROUP BY t.id
    ORDER BY totalExposureSec DESC
    LIMIT ?
  `).all(limit) as Array<{
    targetId: string; targetName: string; workflowStage: string
    totalExposureSec: number; fileCount: number
    firstImaged: string | null; lastImaged: string | null
  }>

  return rows.map(r => {
    const filters = sqlite.prepare(`
      SELECT filter, COALESCE(SUM(exposure_sec), 0) as total
      FROM fits_files
      WHERE target_id = ? AND filter IS NOT NULL
      GROUP BY filter
    `).all(r.targetId) as { filter: string; total: number }[]

    const filterBreakdown: Record<string, number> = {}
    for (const f of filters) {
      filterBreakdown[f.filter] = f.total
    }

    return { ...r, filterBreakdown }
  })
}
