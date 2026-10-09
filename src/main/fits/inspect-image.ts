import fs from 'fs'
import { inspectImage, previewImage, type ImageInspection, type ImagePreview, type PreviewChannel, type RasterImage } from '@astro/domain'
import type { WcsHeader } from '@astro/application'
import { readFitsImage } from './image-reader'
import { isPng, readPngImage } from './png-reader'

/** Header cards a world coordinate system is read from. */
const WCS_KEYS = ['CTYPE1', 'CTYPE2', 'CRVAL1', 'CRVAL2', 'CRPIX1', 'CRPIX2', 'CD1_1', 'CD1_2', 'CD2_1', 'CD2_2', 'CDELT1', 'CDELT2', 'CROTA1', 'CROTA2', 'NAXIS1', 'NAXIS2']

const INTEGER_RANGE: Record<number, [number, number]> = { 8: [0, 255], 16: [-32768, 32767], 32: [-2147483648, 2147483647] }

/**
 * An image as the inspector reads it: a FITS file (any the frame measurer reads) or a PNG, with
 * the WCS cards of a FITS header. Reads the file; never writes it. CPU-bound: the app runs it on
 * a worker thread (NFR-019).
 */
export async function readRaster(path: string): Promise<{ image: RasterImage; header: WcsHeader }> {
  const head = Buffer.alloc(8)
  const handle = await fs.promises.open(path, 'r')
  try {
    await handle.read(head, 0, 8, 0)
  } finally {
    await handle.close()
  }
  if (isPng(head)) return { image: await readPngImage(path), header: {} }

  const fits = await readFitsImage(path)
  const num = (k: string, fallback: number) => (typeof fits.headers.get(k) === 'number' ? (fits.headers.get(k) as number) : fallback)
  const range = INTEGER_RANGE[fits.bitpix]
  const bscale = num('BSCALE', 1)
  const bzero = num('BZERO', 0)
  // The least an integer pixel can hold, after BSCALE and BZERO; floating-point data starts at 0.
  const black = range ? Math.min(range[0] * bscale + bzero, range[1] * bscale + bzero) : 0
  const header: WcsHeader = {}
  for (const key of WCS_KEYS) {
    const v = fits.headers.get(key)
    if (typeof v === 'number' || typeof v === 'string') header[key] = v
  }
  return {
    image: { width: fits.width, height: fits.height, planes: fits.planes, bayer: fits.bayer, saturation: fits.saturation, black, bottomUp: true },
    header
  }
}

export async function inspectPath(path: string): Promise<ImageInspection> {
  return inspectImage((await readRaster(path)).image)
}

export async function previewPath(path: string, options: { maxWidth: number; channel?: PreviewChannel }): Promise<{ preview: ImagePreview; header: WcsHeader }> {
  const { image, header } = await readRaster(path)
  return { preview: previewImage(image, options), header }
}
