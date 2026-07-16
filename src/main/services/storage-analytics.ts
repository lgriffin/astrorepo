import { getSqlite } from '../db/connection'
import { ulid } from 'ulid'
import type { StorageSnapshot, StorageCurrentStats, StorageGrowthProjection } from '@shared/types'

function normalizeImageType(raw: string | null): string {
  if (!raw) return 'other'
  const lower = raw.toLowerCase().trim()
  if (lower.includes('light') || lower === 'light frame' || lower === 'light') return 'light'
  if (lower.includes('dark') || lower === 'dark frame' || lower === 'dark') return 'dark'
  if (lower.includes('flat') || lower === 'flat frame' || lower === 'flat') return 'flat'
  if (lower.includes('bias') || lower === 'bias frame' || lower === 'bias' || lower.includes('offset')) return 'bias'
  return 'other'
}

export function captureStorageSnapshot(): StorageSnapshot {
  const sqlite = getSqlite()
  const now = new Date().toISOString()
  const id = ulid()
  const snapshotDate = now.split('T')[0]

  const totalRow = sqlite.prepare(
    'SELECT COUNT(*) as cnt, COALESCE(SUM(file_size_bytes), 0) as total FROM fits_files'
  ).get() as { cnt: number; total: number }

  const typeRows = sqlite.prepare(
    'SELECT image_type, COALESCE(SUM(file_size_bytes), 0) as total FROM fits_files GROUP BY image_type'
  ).all() as Array<{ image_type: string | null; total: number }>

  let lightsSizeBytes = 0
  let darksSizeBytes = 0
  let flatsSizeBytes = 0
  let biasSizeBytes = 0
  let otherSizeBytes = 0

  for (const row of typeRows) {
    const normalized = normalizeImageType(row.image_type)
    switch (normalized) {
      case 'light': lightsSizeBytes += row.total; break
      case 'dark': darksSizeBytes += row.total; break
      case 'flat': flatsSizeBytes += row.total; break
      case 'bias': biasSizeBytes += row.total; break
      default: otherSizeBytes += row.total; break
    }
  }

  sqlite.prepare(
    `INSERT INTO storage_snapshots (id, snapshot_date, total_files, total_size_bytes,
      lights_size_bytes, darks_size_bytes, flats_size_bytes, bias_size_bytes, other_size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, snapshotDate, totalRow.cnt, totalRow.total,
    lightsSizeBytes, darksSizeBytes, flatsSizeBytes, biasSizeBytes, otherSizeBytes, now)

  return {
    id,
    snapshotDate,
    totalFiles: totalRow.cnt,
    totalSizeBytes: totalRow.total,
    lightsSizeBytes,
    darksSizeBytes,
    flatsSizeBytes,
    biasSizeBytes,
    otherSizeBytes
  }
}

export function getCurrentStorageStats(): StorageCurrentStats {
  const sqlite = getSqlite()

  const totalRow = sqlite.prepare(
    'SELECT COUNT(*) as cnt, COALESCE(SUM(file_size_bytes), 0) as total FROM fits_files'
  ).get() as { cnt: number; total: number }

  const typeRows = sqlite.prepare(
    'SELECT image_type, COALESCE(SUM(file_size_bytes), 0) as size_bytes, COUNT(*) as cnt FROM fits_files GROUP BY image_type'
  ).all() as Array<{ image_type: string | null; size_bytes: number; cnt: number }>

  const byImageTypeMap = new Map<string, { sizeBytes: number; count: number }>()
  for (const row of typeRows) {
    const normalized = normalizeImageType(row.image_type)
    const existing = byImageTypeMap.get(normalized) ?? { sizeBytes: 0, count: 0 }
    existing.sizeBytes += row.size_bytes
    existing.count += row.cnt
    byImageTypeMap.set(normalized, existing)
  }

  const byImageType = Array.from(byImageTypeMap.entries()).map(([type, data]) => ({
    type,
    sizeBytes: data.sizeBytes,
    count: data.count
  }))

  const targetRows = sqlite.prepare(
    'SELECT folder_name as name, COALESCE(SUM(file_size_bytes), 0) as size_bytes, COUNT(*) as cnt FROM fits_files WHERE folder_name IS NOT NULL GROUP BY folder_name ORDER BY size_bytes DESC'
  ).all() as Array<{ name: string; size_bytes: number; cnt: number }>

  const byTarget = targetRows.map((r) => ({
    name: r.name,
    sizeBytes: r.size_bytes,
    count: r.cnt
  }))

  const filterRows = sqlite.prepare(
    'SELECT filter, COALESCE(SUM(file_size_bytes), 0) as size_bytes, COUNT(*) as cnt FROM fits_files WHERE filter IS NOT NULL GROUP BY filter ORDER BY size_bytes DESC'
  ).all() as Array<{ filter: string; size_bytes: number; cnt: number }>

  const byFilter = filterRows.map((r) => ({
    filter: r.filter,
    sizeBytes: r.size_bytes,
    count: r.cnt
  }))

  return {
    totalSizeBytes: totalRow.total,
    totalFiles: totalRow.cnt,
    byImageType,
    byTarget,
    byFilter
  }
}

export function getStorageHistory(limit?: number): StorageSnapshot[] {
  const sqlite = getSqlite()
  const sql = limit
    ? 'SELECT * FROM storage_snapshots ORDER BY snapshot_date DESC LIMIT ?'
    : 'SELECT * FROM storage_snapshots ORDER BY snapshot_date DESC'

  const rows = limit
    ? sqlite.prepare(sql).all(limit)
    : sqlite.prepare(sql).all()

  return (rows as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    snapshotDate: r.snapshot_date as string,
    totalFiles: r.total_files as number,
    totalSizeBytes: r.total_size_bytes as number,
    lightsSizeBytes: r.lights_size_bytes as number,
    darksSizeBytes: r.darks_size_bytes as number,
    flatsSizeBytes: r.flats_size_bytes as number,
    biasSizeBytes: r.bias_size_bytes as number,
    otherSizeBytes: r.other_size_bytes as number
  }))
}

export function getGrowthProjection(): StorageGrowthProjection {
  const sqlite = getSqlite()
  const rows = sqlite.prepare(
    'SELECT snapshot_date, total_size_bytes FROM storage_snapshots ORDER BY snapshot_date ASC'
  ).all() as Array<{ snapshot_date: string; total_size_bytes: number }>

  if (rows.length < 2) {
    return {
      dailyGrowthBytes: 0,
      weeklyGrowthBytes: 0,
      monthlyGrowthBytes: 0,
      projectedFullDate: null,
      dataPoints: rows.length
    }
  }

  const earliest = rows[0]
  const latest = rows[rows.length - 1]

  const earliestDate = new Date(earliest.snapshot_date)
  const latestDate = new Date(latest.snapshot_date)
  const daysBetween = Math.max(1, (latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24))

  const dailyGrowthBytes = (latest.total_size_bytes - earliest.total_size_bytes) / daysBetween

  return {
    dailyGrowthBytes: Math.round(dailyGrowthBytes),
    weeklyGrowthBytes: Math.round(dailyGrowthBytes * 7),
    monthlyGrowthBytes: Math.round(dailyGrowthBytes * 30),
    projectedFullDate: null,
    dataPoints: rows.length
  }
}

export function getStorageByTarget(): Array<{ name: string; sizeBytes: number; fileCount: number }> {
  const sqlite = getSqlite()
  const rows = sqlite.prepare(
    'SELECT folder_name as name, COALESCE(SUM(file_size_bytes), 0) as size_bytes, COUNT(*) as file_count FROM fits_files WHERE folder_name IS NOT NULL GROUP BY folder_name ORDER BY size_bytes DESC'
  ).all() as Array<{ name: string; size_bytes: number; file_count: number }>

  return rows.map((r) => ({
    name: r.name,
    sizeBytes: r.size_bytes,
    fileCount: r.file_count
  }))
}

export function getStorageByFilter(): Array<{ filter: string; sizeBytes: number; fileCount: number }> {
  const sqlite = getSqlite()
  const rows = sqlite.prepare(
    'SELECT filter, COALESCE(SUM(file_size_bytes), 0) as size_bytes, COUNT(*) as file_count FROM fits_files WHERE filter IS NOT NULL GROUP BY filter ORDER BY size_bytes DESC'
  ).all() as Array<{ filter: string; size_bytes: number; file_count: number }>

  return rows.map((r) => ({
    filter: r.filter,
    sizeBytes: r.size_bytes,
    fileCount: r.file_count
  }))
}
