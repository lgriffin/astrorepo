import fs from 'fs'
import path from 'path'
import { extractAstronomicalName } from './astro-names'
import { normalizeCatalogName } from './fits-linker'
import { getSetting } from './settings'
import { getSqlite } from '../db/connection'
import type { ImageScanResult, ImageTargetGroup, ImageFileInfo } from '@shared/types'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff'])
const MAX_FILE_SIZE = 50 * 1024 * 1024

function collectImageFiles(dir: string): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results

  function walk(current: string): void {
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath)
      }
    }
  }
  walk(dir)
  return results
}

export function scanImages(): ImageScanResult {
  const homePath = getSetting('home_folder_path')
  if (!homePath) return { targets: [], unmatched: [], totalImages: 0 }

  const imagesDir = path.join(homePath, 'images')
  if (!fs.existsSync(imagesDir)) return { targets: [], unmatched: [], totalImages: 0 }

  const groupMap = new Map<string, ImageTargetGroup>()
  const unmatched: ImageFileInfo[] = []

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(imagesDir, { withFileTypes: true })
  } catch {
    return { targets: [], unmatched: [], totalImages: 0 }
  }

  for (const entry of entries) {
    const fullPath = path.join(imagesDir, entry.name)

    if (entry.isDirectory()) {
      const extracted = extractAstronomicalName(entry.name)
      const files = collectImageFiles(fullPath)

      if (extracted) {
        const normalized = normalizeCatalogName(extracted)
        const existing = groupMap.get(normalized)
        const imageInfos = files.map(f => ({
          path: f,
          filename: path.basename(f),
          folder: entry.name
        }))

        if (existing) {
          existing.images.push(...imageInfos)
        } else {
          groupMap.set(normalized, {
            name: extracted,
            normalizedName: normalized,
            folderPath: fullPath,
            images: imageInfos
          })
        }
      } else {
        for (const filePath of files) {
          const filename = path.basename(filePath, path.extname(filePath))
          const nameFromFile = extractAstronomicalName(filename)

          if (nameFromFile) {
            const normalized = normalizeCatalogName(nameFromFile)
            const existing = groupMap.get(normalized)
            const info: ImageFileInfo = {
              path: filePath,
              filename: path.basename(filePath),
              folder: entry.name
            }
            if (existing) {
              existing.images.push(info)
            } else {
              groupMap.set(normalized, {
                name: nameFromFile,
                normalizedName: normalized,
                folderPath: fullPath,
                images: [info]
              })
            }
          } else {
            unmatched.push({
              path: filePath,
              filename: path.basename(filePath),
              folder: entry.name
            })
          }
        }
      }
    } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const filename = path.basename(entry.name, path.extname(entry.name))
      const nameFromFile = extractAstronomicalName(filename)

      if (nameFromFile) {
        const normalized = normalizeCatalogName(nameFromFile)
        const existing = groupMap.get(normalized)
        const info: ImageFileInfo = {
          path: fullPath,
          filename: entry.name,
          folder: ''
        }
        if (existing) {
          existing.images.push(info)
        } else {
          groupMap.set(normalized, {
            name: nameFromFile,
            normalizedName: normalized,
            folderPath: imagesDir,
            images: [info]
          })
        }
      } else {
        unmatched.push({
          path: fullPath,
          filename: entry.name,
          folder: ''
        })
      }
    }
  }

  const targets = Array.from(groupMap.values()).sort((a, b) =>
    a.normalizedName.localeCompare(b.normalizedName)
  )
  const totalImages = targets.reduce((sum, t) => sum + t.images.length, 0) + unmatched.length

  wireImagesToTargets(targets)

  return { targets, unmatched, totalImages }
}

function wireImagesToTargets(groups: ImageTargetGroup[]): void {
  const sqlite = getSqlite()
  const now = new Date().toISOString()

  const findTarget = sqlite.prepare(
    'SELECT id, thumbnail_path FROM targets WHERE canonical_name = ?'
  )
  const findHomeData = sqlite.prepare(
    'SELECT target_id, image_files FROM target_home_data WHERE target_id = ?'
  )
  const updateHomeDataImages = sqlite.prepare(
    'UPDATE target_home_data SET image_files = ?, images_path = ?, scanned_at = ? WHERE target_id = ?'
  )
  const insertHomeData = sqlite.prepare(
    'INSERT INTO target_home_data (target_id, raw_files, stacked_files, tif_files, image_files, images_path, scanned_at) VALUES (?, 0, 0, 0, ?, ?, ?)'
  )
  const updateThumbnail = sqlite.prepare(
    'UPDATE targets SET thumbnail_path = ?, updated_at = ? WHERE id = ?'
  )

  for (const group of groups) {
    const target = findTarget.get(group.normalizedName) as { id: string; thumbnail_path: string | null } | undefined
    if (!target) continue

    const existing = findHomeData.get(target.id) as { target_id: string; image_files: number } | undefined

    if (existing) {
      if (existing.image_files === group.images.length) continue
      updateHomeDataImages.run(group.images.length, group.folderPath, now, target.id)
    } else {
      insertHomeData.run(target.id, group.images.length, group.folderPath, now)
    }

    if (!target.thumbnail_path && group.images.length > 0) {
      const displayable = group.images.find(img => {
        const ext = path.extname(img.filename).toLowerCase()
        return ext === '.png' || ext === '.jpg' || ext === '.jpeg'
      })
      if (displayable) {
        updateThumbnail.run(displayable.path, now, target.id)
      }
    }
  }
}

function getMimeType(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png': return 'image/png'
    case '.tif': case '.tiff': return 'image/tiff'
    default: return 'image/jpeg'
  }
}

export function readImageThumbnail(filePath: string): { data: string; mime: string } | { unsupported: true; filename: string } | null {
  if (!fs.existsSync(filePath)) return null

  const ext = path.extname(filePath).toLowerCase()
  if (!IMAGE_EXTENSIONS.has(ext)) return null

  if (ext === '.tif' || ext === '.tiff') {
    return { unsupported: true, filename: path.basename(filePath) }
  }

  try {
    const stats = fs.statSync(filePath)
    if (stats.size > MAX_FILE_SIZE) return null

    const buffer = fs.readFileSync(filePath)
    return {
      data: buffer.toString('base64'),
      mime: getMimeType(ext)
    }
  } catch {
    return null
  }
}
