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

/**
 * A finished PNG as floating-point planes: grey as one, colour as red, green and blue (alpha
 * dropped). Reads 8 and 16-bit images, including palette ones; refuses interlaced files and
 * anything over the app's size limit before inflating a byte. Reads the file; never writes it.
 */
export async function readPngImage(filePath: string): Promise<RasterImage> {
  const bytes = await fs.promises.readFile(filePath)
  if (!isPng(bytes)) throw new Error('This is not a PNG file.')
  let offset = 8
  let width = 0
  let height = 0
  let depth = 0
  let type = -1
  let interlace = 0
  let palette: Buffer | null = null
  const data: Buffer[] = []
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const kind = bytes.toString('ascii', offset + 4, offset + 8)
    const body = bytes.subarray(offset + 8, offset + 8 + length)
    if (body.length < length) throw new Error('The PNG file is truncated.')
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      depth = body[8]
      type = body[9]
      interlace = body[12]
    } else if (kind === 'PLTE') palette = body
    else if (kind === 'IDAT') data.push(body)
    else if (kind === 'IEND') break
    offset += 12 + length
  }
  const channels = CHANNELS[type]
  if (!width || !height || channels === undefined) throw new Error('The PNG file has no image header the app reads.')
  if (interlace !== 0) throw new Error('The PNG is interlaced, which the app does not read. Save it again without interlacing.')
  if (!(depth === 8 || depth === 16) || (type === 3 && depth !== 8)) throw new Error(`The PNG uses ${depth}-bit samples; the app reads 8 and 16-bit images.`)
  if (type === 3 && !palette) throw new Error('The PNG has no palette for its colours.')
  const outChannels = type === 2 || type === 6 || type === 3 ? 3 : 1
  if (width * height * outChannels > MAX_SAMPLES) {
    throw new Error(`The image is ${width} × ${height}, larger than the app measures (${MAX_SAMPLES / 1e6} megapixels).`)
  }

  let raw: Buffer
  try {
    raw = zlib.inflateSync(Buffer.concat(data))
  } catch {
    throw new Error('The PNG pixel data is truncated or damaged.')
  }
  const bps = depth / 8
  const bpp = channels * bps
  const stride = width * bpp
  if (raw.length < height * (stride + 1)) throw new Error('The PNG pixel data is truncated.')
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
