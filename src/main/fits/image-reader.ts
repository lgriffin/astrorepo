import fs from 'fs'

const BLOCK = 2880
const CARD = 80
/** Beyond this many header blocks a file is not treated as FITS (the scanner uses the same limit). */
const MAX_HEADER_BLOCKS = 200

export interface FitsImage {
  width: number
  height: number
  /** One plane per channel (NAXIS3), each width × height, rows bottom to top as FITS stores them. */
  planes: Float32Array[]
  bitpix: number
  /** BAYERPAT when the header names one (a colour sensor's raw frame). */
  bayer: string | null
  /** The largest value a pixel can hold: DATAMAX when given, else the integer type's range; null for floats without DATAMAX. */
  saturation: number | null
  headers: Map<string, string | number | boolean>
}

function cardValue(card: string): string | number | boolean | null {
  if (card[8] !== '=') return null
  const raw = card.slice(10)
  const text = raw.trimStart()
  if (text.startsWith("'")) {
    let out = ''
    for (let i = 1; i < text.length; i++) {
      if (text[i] === "'") {
        if (text[i + 1] === "'") {
          out += "'"
          i++
          continue
        }
        break
      }
      out += text[i]
    }
    return out.trimEnd()
  }
  const value = text.split('/')[0].trim()
  if (value === 'T') return true
  if (value === 'F') return false
  const n = Number(value.replace(/D/i, 'E'))
  return value !== '' && Number.isFinite(n) ? n : null
}

/** Reads the primary header, and the byte offset where the pixel data starts. */
async function readHeader(handle: fs.promises.FileHandle): Promise<{ headers: Map<string, string | number | boolean>; dataOffset: number }> {
  const headers = new Map<string, string | number | boolean>()
  const block = Buffer.alloc(BLOCK)
  for (let i = 0; i < MAX_HEADER_BLOCKS; i++) {
    const { bytesRead } = await handle.read(block, 0, BLOCK, i * BLOCK)
    if (bytesRead < BLOCK) throw new Error('The header is truncated.')
    if (i === 0 && block.toString('ascii', 0, 6) !== 'SIMPLE') throw new Error('This is not a FITS file.')
    for (let c = 0; c < BLOCK / CARD; c++) {
      const card = block.toString('ascii', c * CARD, (c + 1) * CARD)
      const key = card.slice(0, 8).trimEnd()
      if (key === 'END') return { headers, dataOffset: (i + 1) * BLOCK }
      const value = cardValue(card)
      if (key && value !== null && !headers.has(key)) headers.set(key, value)
    }
  }
  throw new Error(`No END card in the first ${MAX_HEADER_BLOCKS} header blocks.`)
}

const INTEGER_RANGE: Record<number, [number, number]> = { 8: [0, 255], 16: [-32768, 32767], 32: [-2147483648, 2147483647] }

/**
 * The most samples the app decodes from one image: 200 megapixels, already more than any
 * astronomy camera's frame in three channels. Each sample is held as a 32-bit float, so this
 * bounds the memory a malformed or unusually large header can ask for.
 */
export const MAX_SAMPLES = 200_000_000
/** Pixel data is read and decoded this many bytes at a time, so the raw bytes are never held whole. */
const READ_CHUNK = 4 * 1024 * 1024

/**
 * The primary image of a FITS file as floating-point planes, with BSCALE and BZERO applied. Reads
 * the file; never writes it. Throws with a reason the user can act on.
 */
export async function readFitsImage(filePath: string): Promise<FitsImage> {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const { headers, dataOffset } = await readHeader(handle)
    const num = (key: string, fallback: number) => (typeof headers.get(key) === 'number' ? (headers.get(key) as number) : fallback)
    const bitpix = num('BITPIX', 0)
    const naxis = num('NAXIS', 0)
    const width = num('NAXIS1', 0)
    const height = num('NAXIS2', 0)
    const channels = naxis >= 3 ? num('NAXIS3', 1) : 1
    if (naxis < 2 || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error('The file has no image in its primary header.')
    }
    // A fourth axis or more would hold further images; the app reads one image of up to four channels.
    for (let axis = 4; axis <= naxis; axis++) {
      if (num(`NAXIS${axis}`, 1) !== 1) throw new Error(`The image has ${naxis} axes; the app reads images of up to three.`)
    }
    if (![8, 16, 32, -32, -64].includes(bitpix)) throw new Error(`BITPIX ${bitpix} is not a pixel format the app reads.`)
    if (!Number.isInteger(channels) || channels < 1 || channels > 4) throw new Error(`${channels} channels is more than the app reads.`)
    const planeSize = width * height
    if (planeSize * channels > MAX_SAMPLES) {
      throw new Error(`The image is ${width} × ${height}${channels > 1 ? ` × ${channels}` : ''}, larger than the app measures (${MAX_SAMPLES / 1e6} megapixels).`)
    }

    const bytes = Math.abs(bitpix) / 8
    const bscale = num('BSCALE', 1)
    const bzero = num('BZERO', 0)
    const planes = Array.from({ length: channels }, () => new Float32Array(planeSize))
    const total = planeSize * channels
    const perChunk = Math.floor(READ_CHUNK / bytes)
    const chunk = Buffer.alloc(Math.min(total, perChunk) * bytes)
    for (let first = 0; first < total; first += perChunk) {
      const count = Math.min(perChunk, total - first)
      const { bytesRead } = await handle.read(chunk, 0, count * bytes, dataOffset + first * bytes)
      if (bytesRead < count * bytes) throw new Error('The pixel data is truncated.')
      for (let k = 0; k < count; k++) {
        const o = k * bytes
        const raw =
          bitpix === 8 ? chunk.readUInt8(o)
          : bitpix === 16 ? chunk.readInt16BE(o)
          : bitpix === 32 ? chunk.readInt32BE(o)
          : bitpix === -32 ? chunk.readFloatBE(o)
          : chunk.readDoubleBE(o)
        const i = first + k
        planes[Math.floor(i / planeSize)][i % planeSize] = raw * bscale + bzero
      }
    }
    const range = INTEGER_RANGE[bitpix]
    const dataMax = headers.get('DATAMAX')
    // A negative BSCALE turns the type's lowest raw value into the highest physical one.
    const saturation = typeof dataMax === 'number' ? dataMax : range ? Math.max(range[0] * bscale + bzero, range[1] * bscale + bzero) : null
    const bayer = headers.get('BAYERPAT')
    return {
      width,
      height,
      planes,
      bitpix,
      bayer: typeof bayer === 'string' && bayer.trim() !== '' ? bayer.trim() : null,
      saturation,
      headers
    }
  } finally {
    await handle.close()
  }
}
