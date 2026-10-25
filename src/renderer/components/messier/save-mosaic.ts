import { mosaicLayout } from '@shared/messier-layout'
import type { MessierTileView } from '@shared/types'
import { PALETTES } from '@shared/themes'

/** A saved mosaic is a picture to keep, so it is always drawn in the dark theme, whatever the screen shows. */
const EXPORT = PALETTES.dark

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('A picture could not be drawn.'))
    img.src = src
  })

/**
 * The mosaic as one PNG (MES-009): every tile where mosaicLayout puts it, its picture cropped to a
 * square, or a dark square with its designation, and its label beneath.
 */
export async function mosaicPng(tiles: MessierTileView[], pictures: Map<number, string>): Promise<Blob> {
  const layout = mosaicLayout(tiles)
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This window cannot draw images.')
  ctx.fillStyle = EXPORT.bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const side = layout.tile - 4
  for (const [i, cell] of layout.cells.entries()) {
    const t = tiles[i]
    const src = pictures.get(cell.number)
    const img = src ? await loadImage(src).catch(() => null) : null
    if (img) {
      const crop = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - crop) / 2, (img.height - crop) / 2, crop, crop, cell.x + 2, cell.y + 2, side, side)
    } else {
      ctx.fillStyle = t.state === 'gap' ? EXPORT.bg : EXPORT.surface
      ctx.fillRect(cell.x + 2, cell.y + 2, side, side)
      ctx.fillStyle = t.state === 'gap' ? EXPORT.border : EXPORT.muted
      ctx.font = 'bold 40px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(t.designation, cell.x + layout.tile / 2, cell.y + layout.tile / 2 + 14)
    }
    ctx.textAlign = 'center'
    ctx.fillStyle = EXPORT.text
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(cell.label, cell.x + layout.tile / 2, cell.y + layout.tile + 21, layout.tile - 8)
  }
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The mosaic could not be saved.'))), 'image/png'))
}

/** Hands the PNG to the window's download, which asks where to save it. */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
