import fs from 'fs'
import path from 'path'
import { nativeImage } from 'electron'
import type { Picture } from '@astro/application'
import { MAX_UNSHRUNK_BYTES } from './adapters/node-picture-folder'

/** How much shrunk picture data is kept, so scrolling back through the gallery does not decode it again. */
const KEEP_BYTES = 64 * 1024 * 1024

/** Least recently used first: a hit moves to the end, and the oldest go once the total is over KEEP_BYTES. */
const kept = new Map<string, Picture>()
let keptBytes = 0

function keep(key: string, picture: Picture): void {
  if (kept.has(key)) return
  kept.set(key, picture)
  keptBytes += picture.data.length
  for (const [oldest, p] of kept) {
    if (keptBytes <= KEEP_BYTES || oldest === key) break
    kept.delete(oldest)
    keptBytes -= p.data.length
  }
}

/**
 * Shrinks a gallery picture with Electron's image decoder (NFR-021). On Windows and macOS the
 * system's own thumbnailer does it off the main thread and from its cache; elsewhere the picture
 * is decoded and resized here. Sent as JPEG, which is a fraction of a PNG's size for a photograph.
 */
export async function shrinkPicture(filePath: string, maxWidth: number, modifiedMs: number): Promise<Picture> {
  const key = `${maxWidth}|${modifiedMs}|${filePath}`
  const hit = kept.get(key)
  if (hit) {
    kept.delete(key)
    kept.set(key, hit)
    return hit
  }
  let image: Electron.NativeImage
  let own: { width: number; height: number } | null = null
  if (process.platform === 'win32' || process.platform === 'darwin') {
    image = await nativeImage.createThumbnailFromPath(filePath, { width: maxWidth, height: maxWidth })
  } else {
    // Decoded here on the main thread, so a huge export is not decoded at all.
    if (fs.statSync(filePath).size > MAX_UNSHRUNK_BYTES) throw new Error(`${path.basename(filePath)} is too large to show here. Open its folder to view it.`)
    const full = nativeImage.createFromPath(filePath)
    own = full.isEmpty() ? null : full.getSize()
    image = own && own.width > maxWidth ? full.resize({ width: maxWidth, quality: 'good' }) : full
  }
  if (image.isEmpty()) throw new Error(`${path.basename(filePath)} could not be decoded. It may be damaged; open its folder to view it in another app.`)
  const picture: Picture = { data: image.toJPEG(88).toString('base64'), mime: 'image/jpeg', width: own?.width ?? null, height: own?.height ?? null }
  keep(key, picture)
  return picture
}
