import fs from 'fs'
import { pixelPitchUm, type RawExif } from '@astro/domain'

/** Random access to a file's bytes, so only the tags are read, never the pixels. */
export interface ByteSource {
  size: number
  read(offset: number, length: number): Promise<Buffer>
}

/** The file is not TIFF underneath, or its tags point outside it. */
export class TiffReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TiffReadError'
  }
}

/** Bytes per value of each TIFF field type (BYTE, ASCII, SHORT, LONG, RATIONAL, SBYTE, UNDEFINED, SSHORT, SLONG, SRATIONAL, FLOAT, DOUBLE, IFD). */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 }
/** TIFF's 42, and the variants Olympus (ORF) and Panasonic (RW2) write in its place. */
const MAGICS = new Set([42, 0x4f52, 0x5352, 0x55])
const MAX_IFDS = 32
const MAX_ENTRIES = 1000

const TAG = {
  newSubfileType: 0x00fe,
  width: 0x0100,
  height: 0x0101,
  make: 0x010f,
  model: 0x0110,
  dateTime: 0x0132,
  subIfds: 0x014a,
  exposureTime: 0x829a,
  exifIfd: 0x8769,
  iso: 0x8827,
  isoSpeed: 0x8833,
  dateTimeOriginal: 0x9003,
  offsetTime: 0x9010,
  offsetTimeOriginal: 0x9011,
  focalLength: 0x920a,
  subSecTimeOriginal: 0x9291,
  temperature: 0x9400,
  pixelXDimension: 0xa002,
  pixelYDimension: 0xa003,
  focalPlaneXResolution: 0xa20e,
  focalPlaneResolutionUnit: 0xa210
} as const

type Value = string | number[]

/**
 * Reads the TIFF and EXIF tags of a TIFF-based camera RAW file (CR2, NEF, ARW, DNG, PEF, ORF,
 * RW2 and the like): IFD0 and the IFDs chained after it, their SubIFDs and the EXIF IFD. Maker
 * notes are never opened. Throws TiffReadError when the file is not TIFF underneath.
 */
export async function readTiffExif(src: ByteSource): Promise<RawExif> {
  if (src.size < 8) throw new TiffReadError('The file is too short to be a camera RAW file.')
  const head = await src.read(0, 8)
  const order = head.toString('latin1', 0, 2)
  if (order !== 'II' && order !== 'MM') throw new TiffReadError('Not a TIFF-based camera RAW file: it does not start with a TIFF header.')
  const le = order === 'II'
  const u16 = (b: Buffer, o: number) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o))
  const u32 = (b: Buffer, o: number) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o))
  const i32 = (b: Buffer, o: number) => (le ? b.readInt32LE(o) : b.readInt32BE(o))
  if (!MAGICS.has(u16(head, 2))) throw new TiffReadError('Not a TIFF-based camera RAW file: its TIFF header is not one the app knows.')

  const readAt = async (offset: number, length: number) => {
    if (offset < 0 || length < 0 || offset + length > src.size) throw new TiffReadError('A tag in this file points past its end, so the file is damaged or cut short.')
    return src.read(offset, length)
  }

  const decode = (type: number, count: number, b: Buffer): Value => {
    if (type === 2) return b.toString('latin1', 0, count).replace(/\0[\s\S]*$/, '').trim()
    const out: number[] = []
    for (let i = 0; i < count; i++) {
      switch (type) {
        case 1: case 6: case 7: out.push(b[i]); break
        case 3: out.push(u16(b, i * 2)); break
        case 8: out.push(le ? b.readInt16LE(i * 2) : b.readInt16BE(i * 2)); break
        case 4: case 13: out.push(u32(b, i * 4)); break
        case 9: out.push(i32(b, i * 4)); break
        case 5: { const d = u32(b, i * 8 + 4); out.push(d === 0 ? NaN : u32(b, i * 8) / d); break }
        case 10: { const d = i32(b, i * 8 + 4); out.push(d === 0 ? NaN : i32(b, i * 8) / d); break }
        case 11: out.push(le ? b.readFloatLE(i * 4) : b.readFloatBE(i * 4)); break
        case 12: out.push(le ? b.readDoubleLE(i * 8) : b.readDoubleBE(i * 8)); break
      }
    }
    return out
  }

  const readIfd = async (offset: number): Promise<{ tags: Map<number, Value>; next: number }> => {
    const count = u16(await readAt(offset, 2), 0)
    if (count > MAX_ENTRIES) throw new TiffReadError('An image directory in this file is far too long, so the file is damaged.')
    const block = await readAt(offset + 2, count * 12 + 4)
    const tags = new Map<number, Value>()
    for (let i = 0; i < count; i++) {
      const e = i * 12
      const tag = u16(block, e)
      const type = u16(block, e + 2)
      const n = u32(block, e + 4)
      const size = TYPE_SIZE[type]
      // Unknown types and long arrays (strip offsets, colour tables) are never needed here.
      if (!size || n === 0 || n > 4096) continue
      const bytes = size * n
      const data = bytes <= 4 ? block.subarray(e + 8, e + 12) : await readAt(u32(block, e + 8), bytes)
      tags.set(tag, decode(type, n, data))
    }
    return { tags, next: u32(block, count * 12) }
  }

  const ifds: Map<number, Value>[] = []
  let exif: Map<number, Value> | null = null
  const seen = new Set<number>()
  const queue: number[] = [u32(head, 4)]
  while (queue.length > 0 && seen.size < MAX_IFDS) {
    const offset = queue.shift() as number
    if (offset === 0 || seen.has(offset)) continue
    seen.add(offset)
    const { tags, next } = await readIfd(offset)
    ifds.push(tags)
    const subs = tags.get(TAG.subIfds)
    if (Array.isArray(subs)) queue.push(...subs)
    const exifAt = tags.get(TAG.exifIfd)
    if (Array.isArray(exifAt) && exifAt[0] && !exif && !seen.has(exifAt[0])) {
      seen.add(exifAt[0])
      exif = (await readIfd(exifAt[0])).tags
    }
    queue.push(next)
  }

  const all = exif ? [exif, ...ifds] : ifds
  const text = (tag: number) => {
    for (const t of all) {
      const v = t.get(tag)
      if (typeof v === 'string' && v) return v
    }
    return null
  }
  const num = (tag: number) => {
    for (const t of all) {
      const v = t.get(tag)
      if (Array.isArray(v) && Number.isFinite(v[0])) return v[0]
    }
    return null
  }

  // The full-size image is the largest one: IFD0 is often a small preview (CR2, NEF, DNG).
  let width: number | null = null
  let height: number | null = null
  const sizes: [number | null, number | null][] = ifds.map(t => [first(t.get(TAG.width)), first(t.get(TAG.height))])
  sizes.push([num(TAG.pixelXDimension), num(TAG.pixelYDimension)])
  for (const [w, h] of sizes) {
    if (w && h && w * h > (width ?? 0) * (height ?? 0)) [width, height] = [w, h]
  }

  const iso = num(TAG.iso) ?? num(TAG.isoSpeed)
  return {
    make: text(TAG.make),
    model: text(TAG.model),
    dateTimeOriginal: text(TAG.dateTimeOriginal) ?? text(TAG.dateTime),
    subSec: text(TAG.subSecTimeOriginal),
    offsetTime: text(TAG.offsetTimeOriginal) ?? text(TAG.offsetTime),
    exposureSec: num(TAG.exposureTime),
    iso: iso && iso > 0 ? iso : null,
    width,
    height,
    temperatureC: num(TAG.temperature),
    focalMm: num(TAG.focalLength),
    pixelUm: pixelPitchUm(num(TAG.focalPlaneXResolution), num(TAG.focalPlaneResolutionUnit))
  }
}

function first(v: Value | undefined): number | null {
  return Array.isArray(v) && Number.isFinite(v[0]) ? v[0] : null
}

/** Reads a camera RAW file's tags from disk, reading only the bytes the tags need. */
export async function readCameraRawExif(filePath: string): Promise<RawExif> {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const { size } = await handle.stat()
    return await readTiffExif({
      size,
      read: async (offset, length) => {
        const buffer = Buffer.alloc(length)
        const { bytesRead } = await handle.read(buffer, 0, length, offset)
        return buffer.subarray(0, bytesRead)
      }
    })
  } finally {
    await handle.close()
  }
}
