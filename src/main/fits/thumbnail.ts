import fs from 'fs'
import { parseFitsHeaders } from './parser'
import { encodeGreyscalePng } from './png-encoder'
import { readPixelValue } from './pixel-reader'

const BLOCK_SIZE = 2880
const RECORD_SIZE = 80

export function generateThumbnail(
  filePath: string,
  targetSize?: number
): { width: number; height: number; pngBuffer: Buffer } | null {
  const { headers, headerMap } = parseFitsHeaders(filePath)

  const bitpix = (headerMap.get('BITPIX')?.value as number) ?? 0
  const naxis1 = (headerMap.get('NAXIS1')?.value as number) ?? 0
  const naxis2 = (headerMap.get('NAXIS2')?.value as number) ?? 0
  const bscale = (headerMap.get('BSCALE')?.value as number) ?? 1
  const bzero = (headerMap.get('BZERO')?.value as number) ?? 0

  if (!naxis1 || !naxis2) return null

  // Compute header block count from parsed headers
  const headerBytes = headers.length * RECORD_SIZE + RECORD_SIZE // +1 for END record
  const headerBlockCount = Math.ceil(headerBytes / BLOCK_SIZE)
  const dataOffset = headerBlockCount * BLOCK_SIZE

  const size = targetSize || 256
  const step = Math.max(1, Math.floor(Math.max(naxis1, naxis2) / size))
  const outW = Math.ceil(naxis1 / step)
  const outH = Math.ceil(naxis2 / step)

  const bytesPerPixel = Math.abs(bitpix) / 8
  const pixBuf = Buffer.alloc(bytesPerPixel)

  const fd = fs.openSync(filePath, 'r')
  try {
    const fileSize = fs.fstatSync(fd).size

    // Sample pixels and collect values
    const values: number[] = new Array(outW * outH)
    let idx = 0

    for (let oy = 0; oy < outH; oy++) {
      // FITS stores bottom-to-top, flip vertically for display
      const srcY = (naxis2 - 1) - oy * step
      for (let ox = 0; ox < outW; ox++) {
        const srcX = ox * step
        const pixelOffset = dataOffset + (srcY * naxis1 + srcX) * bytesPerPixel

        if (pixelOffset + bytesPerPixel > fileSize) {
          values[idx] = 0
        } else {
          fs.readSync(fd, pixBuf, 0, bytesPerPixel, pixelOffset)
          const raw = readPixelValue(pixBuf, 0, bitpix)
          values[idx] = raw * bscale + bzero
        }
        idx++
      }
    }

    // Percentile clipping
    const sorted = Float64Array.from(values)
    sorted.sort()
    const blackIdx = Math.floor(0.05 * sorted.length)
    const whiteIdx = Math.floor(0.995 * sorted.length)
    const black = sorted[blackIdx]
    const white = sorted[Math.min(whiteIdx, sorted.length - 1)]

    // Arcsinh stretch
    const a = 5.0
    const asinhA = Math.asinh(a)
    const range = white - black
    const pixels = new Uint8Array(outW * outH)

    for (let i = 0; i < values.length; i++) {
      const normalized = range > 0 ? (values[i] - black) / range : 0
      const clamped = Math.max(0, Math.min(1, normalized))
      const stretched = Math.asinh(a * clamped) / asinhA
      pixels[i] = Math.max(0, Math.min(255, Math.round(stretched * 255)))
    }

    const pngBuffer = encodeGreyscalePng(outW, outH, pixels)
    return { width: outW, height: outH, pngBuffer }
  } finally {
    fs.closeSync(fd)
  }
}
