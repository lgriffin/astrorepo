import { nativeImage, type NativeImage } from 'electron'
import type { TilePicture } from '@astro/application'

/**
 * A JPEG or TIFF drawn small with Electron's native images, for the Messier mosaic's tiles
 * (specs/032-messier-mosaic). On Windows and macOS the system's own thumbnailer is asked first,
 * which reads TIFF too and does not block the main process; elsewhere, or when it fails, the file
 * is decoded with nativeImage, which reads JPEG and PNG. Reads the file; never writes it.
 */
export async function nativeThumbnail(path: string, maxWidth: number): Promise<TilePicture> {
  let image: NativeImage | null = null
  if (process.platform === 'win32' || process.platform === 'darwin') {
    image = await nativeImage.createThumbnailFromPath(path, { width: maxWidth, height: maxWidth }).catch(() => null)
  }
  if (!image || image.isEmpty()) image = nativeImage.createFromPath(path)
  if (image.isEmpty()) throw new Error('The image could not be decoded here. Save a JPEG or PNG copy beside it.')
  if (image.getSize().width > maxWidth) image = image.resize({ width: maxWidth, quality: 'good' })
  const { width, height } = image.getSize()
  return { mime: 'image/jpeg', data: new Uint8Array(image.toJPEG(85)), width, height }
}
