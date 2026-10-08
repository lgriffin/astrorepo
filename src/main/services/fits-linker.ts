import { getSqlite } from '../db/connection'
import type { FitsFileSummary, FitsLinkingStatus } from '@shared/types'

/**
 * Normalize catalog designations for matching.
 * Strips spaces around common catalog prefixes so "NGC 7000" matches "NGC7000".
 */
export function normalizeCatalogName(name: string): string {
  return name
    .trim()
    .replace(/^(NGC|IC|M|Sh2)\s+/i, (_, prefix) => prefix.toUpperCase())
    .toUpperCase()
}

function nameLookup(): Map<string, string> {
  const sqlite = getSqlite()
  const targetRows = sqlite.prepare(
    'SELECT id, canonical_name FROM targets'
  ).all() as Array<{ id: string; canonical_name: string }>

  const aliasRows = sqlite.prepare(
    'SELECT target_id, alias FROM target_aliases'
  ).all() as Array<{ target_id: string; alias: string }>

  const nameToTarget = new Map<string, string>()
  for (const t of targetRows) {
    nameToTarget.set(normalizeCatalogName(t.canonical_name), t.id)
  }
  for (const a of aliasRows) {
    nameToTarget.set(normalizeCatalogName(a.alias), a.target_id)
  }
  return nameToTarget
}

/** The two matching passes, as lists of (target, file) links to write. */
function* linkPasses(scanId: string | undefined, nameToTarget: Map<string, string>): Generator<Array<[string, string]>> {
  const sqlite = getSqlite()
  const scanFilter = scanId ? ' AND scan_id = ?' : ''
  const scanParams = scanId ? [scanId] : []
  // Pass 1: object_name; pass 2: folder_name for files still unlinked after pass 1.
  for (const column of ['object_name', 'folder_name'] as const) {
    const unlinked = sqlite.prepare(
      `SELECT id, ${column} AS name FROM fits_files WHERE target_id IS NULL AND ${column} IS NOT NULL${scanFilter}`
    ).all(...scanParams) as Array<{ id: string; name: string }>
    const links: Array<[string, string]> = []
    for (const file of unlinked) {
      const targetId = nameToTarget.get(normalizeCatalogName(file.name))
      if (targetId) links.push([targetId, file.id])
    }
    yield links
  }
}

function unlinkedCount(scanId?: string): number {
  const scanFilter = scanId ? ' AND scan_id = ?' : ''
  return (getSqlite().prepare(
    `SELECT COUNT(*) as cnt FROM fits_files WHERE target_id IS NULL${scanFilter}`
  ).get(...(scanId ? [scanId] : [])) as { cnt: number }).cnt
}

/**
 * Auto-link FITS files to targets by matching object_name and folder_name
 * against target canonical_name and target_aliases.
 *
 * Two passes:
 *  1. Match object_name to canonical_name/alias (case-insensitive, catalog-normalized)
 *  2. Match folder_name to canonical_name/alias for remaining unlinked files
 *
 * Only updates files where target_id IS NULL.
 */
export function linkFitsFilesToTargets(scanId?: string): { linked: number; unlinked: number } {
  const sqlite = getSqlite()
  const updateStmt = sqlite.prepare('UPDATE fits_files SET target_id = ? WHERE id = ?')
  let linked = 0
  for (const links of linkPasses(scanId, nameLookup())) {
    sqlite.transaction(() => { for (const [targetId, fileId] of links) updateStmt.run(targetId, fileId) })()
    linked += links.length
  }
  return { linked, unlinked: unlinkedCount(scanId) }
}

/** The same links, written a chunk at a time with a pause between chunks, for a large scan. */
export async function linkFitsFilesToTargetsPaced(scanId: string, checkpoint: () => Promise<void>, chunk = 250): Promise<{ linked: number; unlinked: number }> {
  const sqlite = getSqlite()
  const updateStmt = sqlite.prepare('UPDATE fits_files SET target_id = ? WHERE id = ?')
  let linked = 0
  for (const links of linkPasses(scanId, nameLookup())) {
    for (let i = 0; i < links.length; i += chunk) {
      sqlite.transaction(() => { for (const [targetId, fileId] of links.slice(i, i + chunk)) updateStmt.run(targetId, fileId) })()
      linked += Math.min(chunk, links.length - i)
      await checkpoint()
    }
  }
  return { linked, unlinked: unlinkedCount(scanId) }
}

/**
 * Manually link a FITS file to a target.
 */
export function manualLinkFile(fileId: string, targetId: string): boolean {
  const sqlite = getSqlite()
  const result = sqlite.prepare(
    'UPDATE fits_files SET target_id = ? WHERE id = ?'
  ).run(targetId, fileId)
  return result.changes > 0
}

/**
 * Remove target link from a FITS file (set target_id to NULL).
 */
export function unlinkFile(fileId: string): boolean {
  const sqlite = getSqlite()
  const result = sqlite.prepare(
    'UPDATE fits_files SET target_id = NULL WHERE id = ?'
  ).run(fileId)
  return result.changes > 0
}

/**
 * Get linking status for a scan: how many files are linked vs unlinked,
 * and a breakdown by target name.
 */
export function getLinkingStatus(scanId: string): FitsLinkingStatus {
  const sqlite = getSqlite()

  const linkedCount = (sqlite.prepare(
    'SELECT COUNT(*) as cnt FROM fits_files WHERE scan_id = ? AND target_id IS NOT NULL'
  ).get(scanId) as { cnt: number }).cnt

  const unlinkedCount = (sqlite.prepare(
    'SELECT COUNT(*) as cnt FROM fits_files WHERE scan_id = ? AND target_id IS NULL'
  ).get(scanId) as { cnt: number }).cnt

  const byTargetRows = sqlite.prepare(
    `SELECT t.canonical_name, COUNT(*) as cnt
     FROM fits_files f
     JOIN targets t ON f.target_id = t.id
     WHERE f.scan_id = ?
     GROUP BY t.canonical_name`
  ).all(scanId) as Array<{ canonical_name: string; cnt: number }>

  const byTarget: Record<string, number> = {}
  for (const row of byTargetRows) {
    byTarget[row.canonical_name] = row.cnt
  }

  return { linked: linkedCount, unlinked: unlinkedCount, byTarget }
}

/**
 * Get paginated list of unlinked FITS files for a scan.
 */
export function getUnlinkedFiles(scanId: string, limit = 50, offset = 0): FitsFileSummary[] {
  const sqlite = getSqlite()

  const rows = sqlite.prepare(
    `SELECT id, file_name, folder_name, session_folder, object_name, exposure_sec,
            date_obs, filter, image_type, is_stacked, file_size_bytes, target_id
     FROM fits_files
     WHERE scan_id = ? AND target_id IS NULL
     ORDER BY file_name ASC
     LIMIT ? OFFSET ?`
  ).all(scanId, limit, offset) as Array<Record<string, unknown>>

  return rows.map(r => ({
    id: r.id as string,
    fileName: r.file_name as string,
    folderName: r.folder_name as string | null,
    sessionFolder: r.session_folder as string | null,
    objectName: r.object_name as string | null,
    exposureSec: r.exposure_sec as number | null,
    dateObs: r.date_obs as string | null,
    filter: r.filter as string | null,
    imageType: r.image_type as string | null,
    isStacked: Boolean(r.is_stacked),
    fileSizeBytes: r.file_size_bytes as number,
    targetId: r.target_id as string | null,
    targetName: null
  }))
}
