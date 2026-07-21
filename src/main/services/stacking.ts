import { ulid } from 'ulid'
import { getSqlite } from '../db/connection'
import type {
  StackingSummary, StackingSummaryRow, StackedWithSubFrames, SubFrameInfo,
  TargetIntegrationProgress, FilterProgress, IntegrationGoal
} from '@shared/types'

const LIGHT_FRAME_PREDICATE = "(f.image_type = 'Light Frame' OR f.image_type = 'light' OR f.image_type IS NULL)"

function filterKey(filter: string | null): string {
  return filter ?? 'No Filter'
}

interface RawStackedRow {
  id: string
  file_name: string
  target_id: string | null
  target_name: string | null
  filter: string | null
  ncombine: number | null
  total_exposure: number | null
  software: string | null
  calstat: string | null
  session_folder: string | null
  date_obs: string | null
  file_size_bytes: number
}

export function getStackingSummary(): StackingSummary {
  const sqlite = getSqlite()

  const rows = sqlite.prepare(
    `SELECT f.id, f.file_name, f.target_id, t.canonical_name as target_name,
            f.filter, f.ncombine, f.total_exposure, f.software, f.calstat,
            f.session_folder, f.date_obs, f.file_size_bytes
     FROM fits_files f
     LEFT JOIN targets t ON f.target_id = t.id
     WHERE f.is_stacked = 1
     ORDER BY t.canonical_name, f.filter, f.date_obs DESC`
  ).all() as RawStackedRow[]

  const summaryRows: StackingSummaryRow[] = rows.map(r => ({
    fileId: r.id,
    fileName: r.file_name,
    targetId: r.target_id,
    targetName: r.target_name,
    filter: r.filter,
    ncombine: r.ncombine,
    totalExposureSec: r.total_exposure,
    software: r.software,
    calstat: r.calstat,
    sessionFolder: r.session_folder,
    dateObs: r.date_obs,
    fileSizeBytes: r.file_size_bytes
  }))

  const softwareSet = new Set<string>()
  const filterSet = new Set<string>()
  let totalNcombine = 0
  let totalIntegration = 0

  for (const r of rows) {
    if (r.software) softwareSet.add(r.software)
    if (r.filter) filterSet.add(r.filter)
    if (r.ncombine) totalNcombine += r.ncombine
    if (r.total_exposure) totalIntegration += r.total_exposure
  }

  return {
    totalStacked: rows.length,
    totalNcombine,
    totalIntegrationSec: totalIntegration,
    softwareUsed: [...softwareSet].sort(),
    filtersUsed: [...filterSet].sort(),
    rows: summaryRows
  }
}

interface RawStackedFile {
  id: string
  file_name: string
  target_id: string | null
  target_name: string | null
  object_name: string | null
  filter: string | null
  session_folder: string | null
  ncombine: number | null
  total_exposure: number | null
}

interface RawSubFrame {
  id: string
  file_name: string
  exposure_sec: number | null
  date_obs: string | null
  quality_score: number | null
  quality_flag: string | null
  fwhm_estimate: number | null
  noise_level: number | null
}

export function getSubFramesForStacked(stackedFileId: string): StackedWithSubFrames | null {
  const sqlite = getSqlite()

  const stacked = sqlite.prepare(
    `SELECT f.id, f.file_name, f.target_id, t.canonical_name as target_name,
            f.object_name, f.filter, f.session_folder, f.ncombine, f.total_exposure
     FROM fits_files f
     LEFT JOIN targets t ON f.target_id = t.id
     WHERE f.id = ? AND f.is_stacked = 1`
  ).get(stackedFileId) as RawStackedFile | undefined

  if (!stacked) return null

  const conditions: string[] = ['f.is_stacked = 0', LIGHT_FRAME_PREDICATE]
  const params: unknown[] = []

  if (stacked.target_id) {
    conditions.push('f.target_id = ?')
    params.push(stacked.target_id)
  } else if (stacked.object_name) {
    conditions.push('f.object_name = ?')
    params.push(stacked.object_name)
  } else {
    return {
      stackedFileId: stacked.id,
      stackedFileName: stacked.file_name,
      targetId: stacked.target_id,
      targetName: stacked.target_name,
      filter: stacked.filter,
      sessionFolder: stacked.session_folder,
      ncombine: stacked.ncombine,
      totalExposureSec: stacked.total_exposure,
      subFrames: [],
      matchedCount: 0
    }
  }

  if (stacked.filter) {
    conditions.push('f.filter = ?')
    params.push(stacked.filter)
  } else {
    conditions.push('f.filter IS NULL')
  }

  if (stacked.session_folder) {
    conditions.push('f.session_folder = ?')
    params.push(stacked.session_folder)
  }

  const subRows = sqlite.prepare(
    `SELECT f.id, f.file_name, f.exposure_sec, f.date_obs,
            f.quality_score, f.quality_flag, f.fwhm_estimate, f.noise_level
     FROM fits_files f
     WHERE ${conditions.join(' AND ')}
     ORDER BY f.date_obs ASC`
  ).all(...params) as RawSubFrame[]

  const subFrames: SubFrameInfo[] = subRows.map(r => ({
    fileId: r.id,
    fileName: r.file_name,
    exposureSec: r.exposure_sec,
    dateObs: r.date_obs,
    qualityScore: r.quality_score,
    qualityFlag: r.quality_flag,
    fwhmEstimate: r.fwhm_estimate,
    noiseLevel: r.noise_level
  }))

  return {
    stackedFileId: stacked.id,
    stackedFileName: stacked.file_name,
    targetId: stacked.target_id,
    targetName: stacked.target_name,
    filter: stacked.filter,
    sessionFolder: stacked.session_folder,
    ncombine: stacked.ncombine,
    totalExposureSec: stacked.total_exposure,
    subFrames,
    matchedCount: subFrames.length
  }
}

interface RawLightAgg {
  target_id: string
  target_name: string
  filter: string | null
  frame_count: number
  integration_sec: number
}

interface RawStackedAgg {
  target_id: string
  filter: string | null
  stacked_count: number
}

interface RawSessionCount {
  target_id: string
  session_count: number
}

interface RawGoalRow {
  id: string
  target_id: string
  filter: string
  goal_seconds: number
  created_at: string
  updated_at: string
}

export function getIntegrationProgress(): TargetIntegrationProgress[] {
  const sqlite = getSqlite()

  const lightRows = sqlite.prepare(
    `SELECT f.target_id, t.canonical_name as target_name, f.filter,
            COUNT(*) as frame_count,
            COALESCE(SUM(f.exposure_sec), 0) as integration_sec
     FROM fits_files f
     JOIN targets t ON f.target_id = t.id
     WHERE f.is_stacked = 0
       AND ${LIGHT_FRAME_PREDICATE}
       AND f.target_id IS NOT NULL
     GROUP BY f.target_id, f.filter`
  ).all() as RawLightAgg[]

  const stackedRows = sqlite.prepare(
    `SELECT target_id, filter, COUNT(*) as stacked_count
     FROM fits_files
     WHERE is_stacked = 1 AND target_id IS NOT NULL
     GROUP BY target_id, filter`
  ).all() as RawStackedAgg[]

  const sessionRows = sqlite.prepare(
    `SELECT f.target_id, COUNT(DISTINCT f.session_folder) as session_count
     FROM fits_files f
     WHERE f.target_id IS NOT NULL AND f.session_folder IS NOT NULL
       AND f.is_stacked = 0 AND ${LIGHT_FRAME_PREDICATE}
     GROUP BY f.target_id`
  ).all() as RawSessionCount[]

  const goalRows = sqlite.prepare(
    `SELECT id, target_id, filter, goal_seconds, created_at, updated_at
     FROM integration_goals`
  ).all() as RawGoalRow[]

  const stackedMap = new Map<string, number>()
  for (const r of stackedRows) {
    stackedMap.set(`${r.target_id}|${filterKey(r.filter)}`, r.stacked_count)
  }

  const goalMap = new Map<string, number>()
  for (const r of goalRows) {
    goalMap.set(`${r.target_id}|${r.filter}`, r.goal_seconds)
  }

  const sessionMap = new Map<string, number>()
  for (const r of sessionRows) {
    sessionMap.set(r.target_id, r.session_count)
  }

  const targetMap = new Map<string, { name: string; filters: FilterProgress[]; totalSec: number }>()

  for (const r of lightRows) {
    const filterKey = r.filter ?? 'No Filter'
    const key = `${r.target_id}|${filterKey}`
    const goalSec = goalMap.get(key) ?? null
    const stackedCount = stackedMap.get(key) ?? 0

    const fp: FilterProgress = {
      filter: filterKey,
      integrationSec: r.integration_sec,
      goalSec,
      frameCount: r.frame_count,
      stackedCount,
      percentComplete: goalSec ? Math.min(100, Math.round((r.integration_sec / goalSec) * 100)) : null
    }

    const existing = targetMap.get(r.target_id)
    if (existing) {
      existing.filters.push(fp)
      existing.totalSec += r.integration_sec
    } else {
      targetMap.set(r.target_id, {
        name: r.target_name,
        filters: [fp],
        totalSec: r.integration_sec
      })
    }
  }

  const results: TargetIntegrationProgress[] = []
  for (const [targetId, data] of targetMap) {
    results.push({
      targetId,
      targetName: data.name,
      totalIntegrationSec: data.totalSec,
      filters: data.filters.sort((a, b) => a.filter.localeCompare(b.filter)),
      sessionCount: sessionMap.get(targetId) ?? 0
    })
  }

  return results.sort((a, b) => a.targetName.localeCompare(b.targetName))
}

export function getIntegrationGoals(targetId: string): IntegrationGoal[] {
  const sqlite = getSqlite()
  const rows = sqlite.prepare(
    `SELECT id, target_id, filter, goal_seconds, created_at, updated_at
     FROM integration_goals WHERE target_id = ? ORDER BY filter`
  ).all(targetId) as RawGoalRow[]

  return rows.map(r => ({
    id: r.id,
    targetId: r.target_id,
    filter: r.filter,
    goalSeconds: r.goal_seconds,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))
}

export function setIntegrationGoal(targetId: string, filter: string, goalSeconds: number): IntegrationGoal {
  const sqlite = getSqlite()
  const now = new Date().toISOString()
  const id = ulid()

  sqlite.prepare(
    `INSERT INTO integration_goals (id, target_id, filter, goal_seconds, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(target_id, filter) DO UPDATE SET goal_seconds = ?, updated_at = ?`
  ).run(id, targetId, filter, goalSeconds, now, now, goalSeconds, now)

  const row = sqlite.prepare(
    `SELECT id, target_id, filter, goal_seconds, created_at, updated_at
     FROM integration_goals WHERE target_id = ? AND filter = ?`
  ).get(targetId, filter) as RawGoalRow

  return {
    id: row.id,
    targetId: row.target_id,
    filter: row.filter,
    goalSeconds: row.goal_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function deleteIntegrationGoal(goalId: string): boolean {
  const sqlite = getSqlite()
  const result = sqlite.prepare('DELETE FROM integration_goals WHERE id = ?').run(goalId)
  return result.changes > 0
}
