import fs from 'fs'
import { nativeImage, type NativeImage } from 'electron'
import type { TilePicture } from '@astro/application'

/** The largest file decoded in full when the system has no thumbnail: decoding blocks the main process. */
export const NATIVE_DECODE_MAX_BYTES = 25 * 1024 * 1024

const SYSTEM_THUMBNAILS = process.platform === 'win32' || process.platform === 'darwin'

/**
 * A JPEG or TIFF drawn small with Electron's native images, for the Messier mosaic's tiles
 * (specs/032-messier-mosaic). On Windows and macOS the system's own thumbnailer is asked first,
 * which reads TIFF too and does not block the main process. Elsewhere, or when it fails, a JPEG
 * up to NATIVE_DECODE_MAX_BYTES is decoded with nativeImage, which cannot read TIFF; anything else
 * is refused with the reason, so the tile tries its next image. Reads the file; never writes it.
 */
export async function nativeThumbnail(path: string, maxWidth: number): Promise<TilePicture> {
  let image: NativeImage | null = null
  if (SYSTEM_THUMBNAILS) {
    image = await nativeImage.createThumbnailFromPath(path, { width: maxWidth, height: maxWidth }).catch(() => null)
  }
  if (!image || image.isEmpty()) {
    if (/\.tiff?$/i.test(path)) throw new Error('TIFF images are drawn on Windows and macOS only. Save a JPEG or PNG copy beside it.')
    const size = (await fs.promises.stat(path)).size
    if (size > NATIVE_DECODE_MAX_BYTES) throw new Error(`The image is too large to draw here (${Math.round(size / 1024 / 1024)} MB). Save a smaller JPEG or PNG copy beside it.`)
    image = nativeImage.createFromPath(path)
  }
  if (image.isEmpty()) throw new Error('The image could not be decoded here. Save a JPEG or PNG copy beside it.')
  if (image.getSize().width > maxWidth) image = image.resize({ width: maxWidth, quality: 'good' })
  const { width, height } = image.getSize()
  return { mime: 'image/jpeg', data: new Uint8Array(image.toJPEG(85)), width, height }
}
