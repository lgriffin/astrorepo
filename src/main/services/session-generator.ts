import { ulid } from 'ulid'
import { getSqlite } from '../db/connection'
import type { AutoSessionPreview, GeneratedSessionResult } from '@shared/types'

/**
 * Parse a date from a session folder name.
 * Supports: "2025-01-15", "20250115", "Night_2025-01-15", etc.
 */
function parseDateFromFolder(sessionFolder: string): string | null {
  const match = sessionFolder.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/)
  if (!match) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

interface GroupRow {
  folder_name: string
  session_folder: string
  light_count: number
  total_exposure: number
  earliest_date_obs: string | null
  filters: string | null
  object_name: string | null
}

/**
 * Preview auto-generated sessions from a FITS scan without creating them.
 * Groups fits_files by (folder_name, session_folder) and returns stats for each.
 */
export function previewAutoSessions(scanId: string): AutoSessionPreview[] {
  const sqlite = getSqlite()

  const rows = sqlite.prepare(`
    SELECT
      folder_name,
      session_folder,
      SUM(CASE WHEN LOWER(image_type) LIKE '%light%' THEN 1 ELSE 0 END) AS light_count,
      SUM(CASE WHEN LOWER(image_type) LIKE '%light%' THEN COALESCE(exposure_sec, 0) ELSE 0 END) AS total_exposure,
      MIN(CASE WHEN LOWER(image_type) LIKE '%light%' THEN date_obs ELSE NULL END) AS earliest_date_obs,
      GROUP_CONCAT(DISTINCT CASE WHEN LOWER(image_type) LIKE '%light%' AND filter IS NOT NULL THEN filter END) AS filters,
      (SELECT ff2.object_name FROM fits_files ff2
       WHERE ff2.scan_id = f.scan_id
         AND ff2.folder_name = f.folder_name
         AND ff2.session_folder = f.session_folder
         AND ff2.object_name IS NOT NULL
       LIMIT 1) AS object_name
    FROM fits_files f
    WHERE f.scan_id = ?
      AND f.folder_name IS NOT NULL
      AND f.session_folder IS NOT NULL
    GROUP BY folder_name, session_folder
    ORDER BY folder_name, session_folder
  `).all(scanId) as GroupRow[]

  return rows.map((row) => {
    let date: string
    if (row.earliest_date_obs) {
      date = row.earliest_date_obs.substring(0, 10)
    } else {
      date = parseDateFromFolder(row.session_folder) ?? ''
    }

    // Try to find a matching target by object_name
    let targetId: string | null = null
    let targetName: string | null = row.object_name
    if (row.object_name) {
      const target = sqlite.prepare(
        `SELECT id, canonical_name FROM targets WHERE canonical_name = ? LIMIT 1`
      ).get(row.object_name) as { id: string; canonical_name: string } | undefined
      if (target) {
        targetId = target.id
        targetName = target.canonical_name
      }
    }

    // Check if an existing session already covers this session_folder
    const existing = sqlite.prepare(
      `SELECT id FROM observation_sessions WHERE session_folder = ? LIMIT 1`
    ).get(row.session_folder) as { id: string } | undefined

    const filters = row.filters ? row.filters.split(',').filter(Boolean) : []

    return {
      folderName: row.folder_name,
      sessionFolder: row.session_folder,
      date,
      targetName,
      targetId,
      lightCount: row.light_count ?? 0,
      totalExposureSec: row.total_exposure ?? 0,
      filters,
      existingSessionId: existing?.id ?? null
    }
  })
}

/**
 * Generate observation_sessions from a FITS scan.
 * Creates one session per unique (folder_name, session_folder) group.
 */
export function generateSessions(
  scanId: string,
  options?: { overwrite?: boolean }
): GeneratedSessionResult {
  const sqlite = getSqlite()
  const previews = previewAutoSessions(scanId)
  const overwrite = options?.overwrite ?? false

  const result: GeneratedSessionResult = {
    created: 0,
    skipped: 0,
    sessions: []
  }

  const insertSession = sqlite.prepare(
    `INSERT INTO observation_sessions
      (id, date, total_frames, total_exposure_sec, notes, source, session_folder, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const insertSessionTarget = sqlite.prepare(
    `INSERT INTO session_targets (session_id, target_id, is_primary) VALUES (?, ?, 1)`
  )

  const deleteExistingSession = sqlite.prepare(
    `DELETE FROM observation_sessions WHERE id = ?`
  )

  const transaction = sqlite.transaction(() => {
    for (const preview of previews) {
      if (preview.existingSessionId && !overwrite) {
        result.skipped++
        continue
      }

      // If overwrite and existing, delete the old session first
      if (preview.existingSessionId && overwrite) {
        deleteExistingSession.run(preview.existingSessionId)
      }

      const sessionId = ulid()
      const now = new Date().toISOString()
      const notes = `Auto-generated from FITS scan. Folder: ${preview.folderName}, Session: ${preview.sessionFolder}`

      insertSession.run(
        sessionId,
        preview.date,
        preview.lightCount,
        preview.totalExposureSec,
        notes,
        'auto_fits',
        preview.sessionFolder,
        now,
        now
      )

      // Link target if available
      if (preview.targetId) {
        insertSessionTarget.run(sessionId, preview.targetId)
      }

      result.created++
      result.sessions.push({
        id: sessionId,
        date: preview.date,
        folderName: preview.folderName
      })
    }
  })

  transaction()
  return result
}

/**
 * Quick status check: how many sessions can be generated vs already exist.
 */
export function getAutoSessionStatus(
  scanId: string
): { existing: number; pending: number; total: number } {
  const previews = previewAutoSessions(scanId)
  const existing = previews.filter((p) => p.existingSessionId !== null).length
  const pending = previews.filter((p) => p.existingSessionId === null).length
  return { existing, pending, total: previews.length }
}
