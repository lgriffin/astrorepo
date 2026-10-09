import fs from 'fs'
import zlib from 'zlib'
import type { RasterImage } from '@astro/domain'
import { MAX_SAMPLES } from './image-reader'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Whether these bytes open a PNG file. */
export function isPng(head: Buffer): boolean {
  return head.length >= 8 && head.subarray(0, 8).equals(PNG_MAGIC)
}

/** Samples per pixel for each PNG colour type: grey, RGB, palette, grey with alpha, RGBA. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Room over the raster's own size that a valid deflate stream of it can need, with chunk slack. */
const compressedAllowance = (raster: number) => raster + Math.ceil(raster / 1000) + 1024

/**
 * A finished PNG as floating-point planes: grey as one, colour as red, green and blue (alpha
 * dropped). Reads 8 and 16-bit images, including palette ones; refuses interlaced files. The
 * header is read and checked first, so an image over the app's size limit is refused before any
 * pixel data is read; the compressed data may be no larger than the raster it claims, and
 * inflating stops at the raster's size, so a small file cannot unpack into gigabytes. Reads the
 * file; never writes it.
 */
export async function readPngImage(filePath: string): Promise<RasterImage> {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const size = (await handle.stat()).size
    const head = Buffer.alloc(33)
    const { bytesRead } = await handle.read(head, 0, 33, 0)
    if (!isPng(head.subarray(0, bytesRead))) throw new Error('This is not a PNG file.')
    // IHDR comes first in every PNG: 13 bytes after its length and name.
    if (bytesRead < 33 || head.readUInt32BE(8) !== 13 || head.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error(bytesRead < 33 ? 'The PNG file is truncated.' : 'The PNG file has no image header the app reads.')
    }
    const width = head.readUInt32BE(16)
    const height = head.readUInt32BE(20)
    const depth = head[24]
    const type = head[25]
    const interlace = head[28]
    const channels = CHANNELS[type]
    if (!width || !height || channels === undefined) throw new Error('The PNG file has no image header the app reads.')
    if (interlace !== 0) throw new Error('The PNG is interlaced, which the app does not read. Save it again without interlacing.')
    if (!(depth === 8 || depth === 16) || (type === 3 && depth !== 8)) throw new Error(`The PNG uses ${depth}-bit samples; the app reads 8 and 16-bit images.`)
    const outChannels = type === 2 || type === 6 || type === 3 ? 3 : 1
    if (width * height * outChannels > MAX_SAMPLES) {
      throw new Error(`The image is ${width} × ${height}, larger than the app measures (${MAX_SAMPLES / 1e6} megapixels).`)
    }
    // Each row is its samples and a filter byte.
    const raster = height * (width * channels * (depth / 8) + 1)
    const allowance = compressedAllowance(raster)

    let palette: Buffer | null = null
    const data: Buffer[] = []
    let compressed = 0
    const chunk = Buffer.alloc(8)
    for (let offset = 33; offset + 8 <= size; ) {
      await handle.read(chunk, 0, 8, offset)
      const length = chunk.readUInt32BE(0)
      const kind = chunk.toString('ascii', 4, 8)
      if (offset + 8 + length > size) throw new Error('The PNG file is truncated.')
      if (kind === 'IDAT') {
        compressed += length
        if (compressed > allowance) throw new Error('The PNG pixel data is larger than its image size allows, so the file is damaged.')
      }
      if (kind === 'IDAT' || (kind === 'PLTE' && length <= 768)) {
        const body = Buffer.alloc(length)
        await handle.read(body, 0, length, offset + 8)
        if (kind === 'IDAT') data.push(body)
        else palette = body
      } else if (kind === 'IEND') break
      offset += 12 + length
    }
    if (type === 3 && !palette) throw new Error('The PNG has no palette for its colours.')
    return decode(data, palette, { width, height, depth, type, channels, outChannels, raster })
  } finally {
    await handle.close()
  }
}

function decode(
  data: Buffer[],
  palette: Buffer | null,
  { width, height, depth, type, channels, outChannels, raster }: { width: number; height: number; depth: number; type: number; channels: number; outChannels: number; raster: number }
): RasterImage {
  let raw: Buffer
  try {
    // Inflating stops at the raster's size: more than that is not this image.
    raw = zlib.inflateSync(Buffer.concat(data), { maxOutputLength: raster })
  } catch {
    throw new Error('The PNG pixel data is truncated or damaged.')
  }
  const bps = depth / 8
  const bpp = channels * bps
  const stride = width * bpp
  if (raw.length < raster) throw new Error('The PNG pixel data is truncated.')
  const planes = Array.from({ length: outChannels }, () => new Float32Array(width * height))
  let prior = Buffer.alloc(stride)
  const line = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1)
    const filter = raw[start]
    for (let i = 0; i < stride; i++) {
      const x = raw[start + 1 + i]
      const a = i >= bpp ? line[i - bpp] : 0
      const b = prior[i]
      const c = i >= bpp ? prior[i - bpp] : 0
      line[i] = (filter === 0 ? x : filter === 1 ? x + a : filter === 2 ? x + b : filter === 3 ? x + ((a + b) >> 1) : filter === 4 ? x + paeth(a, b, c) : x) & 0xff
    }
    if (filter > 4) throw new Error('The PNG pixel data is damaged.')
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const sample = (k: number) => (bps === 2 ? line.readUInt16BE((x * channels + k) * 2) : line[x * channels + k])
      if (type === 3) {
        const p = line[x] * 3
        planes[0][i] = palette![p] ?? 0
        planes[1][i] = palette![p + 1] ?? 0
        planes[2][i] = palette![p + 2] ?? 0
      } else for (let k = 0; k < outChannels; k++) planes[k][i] = sample(k)
    }
    prior = Buffer.from(line)
  }
  return { width, height, planes, bayer: null, saturation: depth === 16 ? 65535 : 255, black: 0, bottomUp: false }
}
