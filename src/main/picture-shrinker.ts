import path from 'path'
import { nativeImage } from 'electron'
import type { Picture } from '@astro/application'

/** How many shrunk pictures are kept, so scrolling back through the gallery does not decode them again. */
const KEEP = 300

const kept = new Map<string, Picture>()

/**
 * Shrinks a gallery picture with Electron's image decoder (NFR-021). On Windows and macOS the
 * system's own thumbnailer does it off the main thread and from its cache; elsewhere the picture
 * is decoded and resized here. Sent as JPEG, which is a fraction of a PNG's size for a photograph.
 */
export async function shrinkPicture(filePath: string, maxWidth: number, modifiedMs: number): Promise<Picture> {
  const key = `${maxWidth}|${modifiedMs}|${filePath}`
  const hit = kept.get(key)
  if (hit) return hit
  let image: Electron.NativeImage
  let own: { width: number; height: number } | null = null
  if (process.platform === 'win32' || process.platform === 'darwin') {
    image = await nativeImage.createThumbnailFromPath(filePath, { width: maxWidth, height: maxWidth })
  } else {
    const full = nativeImage.createFromPath(filePath)
    own = full.isEmpty() ? null : full.getSize()
    image = own && own.width > maxWidth ? full.resize({ width: maxWidth, quality: 'good' }) : full
  }
  if (image.isEmpty()) throw new Error(`${path.basename(filePath)} could not be decoded. It may be damaged; open its folder to view it in another app.`)
  const picture: Picture = { data: image.toJPEG(88).toString('base64'), mime: 'image/jpeg', width: own?.width ?? null, height: own?.height ?? null }
  kept.set(key, picture)
  if (kept.size > KEEP) kept.delete(kept.keys().next().value as string)
  return picture
}
