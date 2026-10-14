import type { ImagePixels, TilePicture, TilePictures } from '@astro/application'
import { pictureFormat } from '@astro/domain'
import { encodeGreyscalePng, encodeRgbPng } from '../fits/png-encoder'

/** Draws a JPEG or TIFF small, as the desktop host can (Electron's native images); throws when it cannot decode it. */
export type NativeThumbnailer = (path: string, maxWidth: number) => Promise<TilePicture>

/**
 * TilePictures over the app's own image readers (specs/032-messier-mosaic). PNG and FITS are read
 * through ImagePixels, on its worker thread in the app (NFR-019), and sent back as a small PNG: a
 * finished image with its own tones, a master auto-stretched. JPEG and TIFF need a decoder the
 * app does not have, so the desktop host lends one; without it they are refused with a reason.
 */
export class NodeTilePictures implements TilePictures {
  constructor(
    private readonly pixels: Pick<ImagePixels, 'preview'>,
    private readonly native: NativeThumbnailer | null = null
  ) {}

  async draw(path: string, options: { maxWidth: number; stretch: boolean }): Promise<TilePicture> {
    const format = pictureFormat(path)
    if (format === 'png' || format === 'fits') {
      const { preview } = await this.pixels.preview(path, { maxWidth: options.maxWidth, stretch: options.stretch ? 'auto' : 'linear' })
      const png = preview.channels === 3 ? encodeRgbPng(preview.width, preview.height, preview.data) : encodeGreyscalePng(preview.width, preview.height, preview.data)
      return { mime: 'image/png', data: new Uint8Array(png), width: preview.width, height: preview.height }
    }
    if (format === 'jpeg' || format === 'tiff') {
      if (!this.native) throw new Error(`${format === 'jpeg' ? 'JPEG' : 'TIFF'} images are drawn by the desktop app only.`)
      return this.native(path, options.maxWidth)
    }
    throw new Error('The mosaic draws JPEG, PNG, TIFF and FITS images only.')
  }
}
