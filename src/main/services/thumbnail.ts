import { getSqlite } from '../db/connection'
import { generateThumbnail } from '../fits/thumbnail'

export function getOrCreateThumbnail(
  fileId: string
): { width: number; height: number; dataBase64: string } | null {
  const db = getSqlite()

  // Check cache
  const cached = db.prepare(
    'SELECT width, height, data_base64 FROM fits_thumbnails WHERE file_id = ?'
  ).get(fileId) as { width: number; height: number; data_base64: string } | undefined

  if (cached) {
    return { width: cached.width, height: cached.height, dataBase64: cached.data_base64 }
  }

  // Get file path from fits_files
  const file = db.prepare(
    'SELECT file_path FROM fits_files WHERE id = ?'
  ).get(fileId) as { file_path: string } | undefined

  if (!file) return null

  // Generate thumbnail
  const result = generateThumbnail(file.file_path)
  if (!result) return null

  const dataBase64 = result.pngBuffer.toString('base64')
  const now = new Date().toISOString()

  // Store in cache
  db.prepare(
    `INSERT INTO fits_thumbnails (file_id, width, height, data_base64, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(fileId, result.width, result.height, dataBase64, now)

  return { width: result.width, height: result.height, dataBase64 }
}

export function deleteThumbnail(fileId: string): boolean {
  const db = getSqlite()
  const result = db.prepare('DELETE FROM fits_thumbnails WHERE file_id = ?').run(fileId)
  return result.changes > 0
}

export function regenerateThumbnail(
  fileId: string
): { width: number; height: number; dataBase64: string } | null {
  const db = getSqlite()

  // Delete existing
  db.prepare('DELETE FROM fits_thumbnails WHERE file_id = ?').run(fileId)

  // Get file path
  const file = db.prepare(
    'SELECT file_path FROM fits_files WHERE id = ?'
  ).get(fileId) as { file_path: string } | undefined

  if (!file) return null

  // Generate fresh
  const result = generateThumbnail(file.file_path)
  if (!result) return null

  const dataBase64 = result.pngBuffer.toString('base64')
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO fits_thumbnails (file_id, width, height, data_base64, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(fileId, result.width, result.height, dataBase64, now)

  return { width: result.width, height: result.height, dataBase64 }
}
