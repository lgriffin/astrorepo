/**
 * The bytes of the demo library's files: small FITS frames with stars in them, a baseline TIFF and
 * the pictures' pixels. Kept tiny (64 by 64) so the library builds and scans in seconds.
 */

export const DEMO_SIZE = 64

/** A starfield: dark background with deterministic noise and a few round stars; `seed` moves them. */
export function starfield(seed: number, size = DEMO_SIZE, background = 800): number[] {
  let s = (seed * 2654435761) % 2 ** 31 || 7
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2 ** 31
    return s / 2 ** 31
  }
  const stars = Array.from({ length: 6 }, () => ({ x: 6 + rand() * (size - 12), y: 6 + rand() * (size - 12), peak: 2000 + rand() * 20000 }))
  const out: number[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = background + (rand() - 0.5) * 40
      for (const st of stars) v += st.peak * Math.exp(-((x - st.x) ** 2 + (y - st.y) ** 2) / 4.5)
      out.push(Math.min(65535, v))
    }
  }
  return out
}

const card = (k: string, v: string | number | boolean) => {
  const value = typeof v === 'boolean' ? (v ? 'T' : 'F') : typeof v === 'number' ? String(v) : `'${v}'`
  return `${k.padEnd(8)}= ${value.padStart(20)}`.padEnd(80)
}

/** A 16-bit FITS image (BZERO 32768) of the given pixels, with the header cards given. */
export function fitsFile(cards: Record<string, string | number>, pixels: number[], size = DEMO_SIZE): Buffer {
  const all: Record<string, string | number | boolean> = { SIMPLE: true, BITPIX: 16, NAXIS: 2, NAXIS1: size, NAXIS2: size, BZERO: 32768, BSCALE: 1, ...cards }
  const header = Object.entries(all).map(([k, v]) => card(k, v)).join('') + 'END'.padEnd(80)
  const head = Buffer.from(header.padEnd(Math.ceil(header.length / 2880) * 2880, ' '), 'ascii')
  const data = Buffer.alloc(size * size * 2)
  pixels.forEach((v, i) => data.writeInt16BE(Math.max(0, Math.min(65535, Math.round(v))) - 32768, i * 2))
  return Buffer.concat([head, data, Buffer.alloc((2880 - (data.length % 2880)) % 2880)])
}

/** 8-bit grey levels from a starfield, stretched so the stars show. */
export function greyLevels(pixels: number[]): Uint8Array {
  const max = Math.max(...pixels)
  const min = Math.min(...pixels)
  return Uint8Array.from(pixels, v => Math.round(255 * Math.sqrt((v - min) / (max - min || 1))))
}

/** A baseline TIFF: one strip of 8-bit grey, little-endian, uncompressed. */
export function tiffFile(grey: Uint8Array, size = DEMO_SIZE): Buffer {
  const entries: Array<[number, number, number, number]> = [
    // tag, type (3 SHORT, 4 LONG), count, value
    [256, 4, 1, size], // ImageWidth
    [257, 4, 1, size], // ImageLength
    [258, 3, 1, 8], // BitsPerSample
    [259, 3, 1, 1], // Compression: none
    [262, 3, 1, 1], // Photometric: black is zero
    [273, 4, 1, 0], // StripOffsets, filled in below
    [277, 3, 1, 1], // SamplesPerPixel
    [278, 4, 1, size], // RowsPerStrip
    [279, 4, 1, grey.length] // StripByteCounts
  ]
  const ifdOffset = 8
  const ifdSize = 2 + entries.length * 12 + 4
  const dataOffset = ifdOffset + ifdSize
  const out = Buffer.alloc(dataOffset + grey.length)
  out.write('II', 0, 'ascii')
  out.writeUInt16LE(42, 2)
  out.writeUInt32LE(ifdOffset, 4)
  out.writeUInt16LE(entries.length, ifdOffset)
  entries.forEach(([tag, type, count, value], i) => {
    const o = ifdOffset + 2 + i * 12
    out.writeUInt16LE(tag, o)
    out.writeUInt16LE(type, o + 2)
    out.writeUInt32LE(count, o + 4)
    const v = tag === 273 ? dataOffset : value
    if (type === 3) out.writeUInt16LE(v, o + 8)
    else out.writeUInt32LE(v, o + 8)
  })
  out.writeUInt32LE(0, ifdOffset + 2 + entries.length * 12)
  Buffer.from(grey).copy(out, dataOffset)
  return out
}

/** Colour pixels for a finished picture: the stars tinted by the target's place in the list. */
export function pictureRgb(grey: Uint8Array, hue: number): Uint8Array {
  const tint = [[1, 0.75, 0.6], [0.7, 0.8, 1], [1, 0.6, 0.8], [0.8, 1, 0.75]][hue % 4]
  const out = new Uint8Array(grey.length * 3)
  grey.forEach((g, i) => tint.forEach((t, c) => { out[i * 3 + c] = Math.round(g * t) }))
  return out
}
