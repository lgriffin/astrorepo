/** One TIFF tag: numbers (RATIONAL as [numerator, denominator] pairs) or ASCII text. */
export interface TiffEntry {
  tag: number
  type: 2 | 3 | 4 | 5 | 10
  values: string | number[] | [number, number][]
}

export interface TiffSpec {
  littleEndian?: boolean
  /** The two bytes after the byte order: 42 for TIFF, 0x55 for RW2, 0x4f52 for ORF. */
  magic?: number
  ifd0: TiffEntry[]
  exif?: TiffEntry[]
  /** SubIFDs hung off IFD0 (tag 0x014A), as NEF and DNG keep their full-size raw. */
  subIfds?: TiffEntry[][]
  /** A second IFD chained after IFD0, as CR2 does. */
  next?: TiffEntry[]
  /** Pixel bytes the file carries after its tags, to give it a realistic size. */
  padding?: number
}

/**
 * A small TIFF-based camera RAW file for tests: the TIFF header, IFD0 with its EXIF IFD, SubIFDs
 * and a chained IFD, with values longer than four bytes stored after each directory.
 */
export function tiffBytes(spec: TiffSpec): Buffer {
  const le = spec.littleEndian ?? true
  const buf = Buffer.alloc(64 * 1024 + (spec.padding ?? 0))
  const w16 = (v: number, o: number) => (le ? buf.writeUInt16LE(v, o) : buf.writeUInt16BE(v, o))
  const w32 = (v: number, o: number) => (le ? buf.writeUInt32LE(v >>> 0, o) : buf.writeUInt32BE(v >>> 0, o))
  buf.write(le ? 'II' : 'MM', 0, 'latin1')
  w16(spec.magic ?? 42, 2)
  let cursor = 8

  const valueBytes = (e: TiffEntry): { count: number; bytes: Buffer } => {
    if (e.type === 2) {
      const text = Buffer.from(`${e.values as string}\0`, 'latin1')
      return { count: text.length, bytes: text }
    }
    const values = e.values as number[] | [number, number][]
    const size = e.type === 3 ? 2 : e.type === 4 ? 4 : 8
    const out = Buffer.alloc(values.length * size)
    const put16 = (v: number, o: number) => void (le ? out.writeUInt16LE(v, o) : out.writeUInt16BE(v, o))
    const put32 = (v: number, o: number) => void (le ? out.writeUInt32LE(v, o) : out.writeUInt32BE(v, o))
    const putS32 = (v: number, o: number) => void (le ? out.writeInt32LE(v, o) : out.writeInt32BE(v, o))
    values.forEach((v, i) => {
      if (e.type === 3) put16(v as number, i * 2)
      else if (e.type === 4) put32(v as number, i * 4)
      else {
        const [n, d] = v as [number, number]
        const put = e.type === 5 ? put32 : putS32
        put(n, i * 8)
        put(d, i * 8 + 4)
      }
    })
    return { count: values.length, bytes: out }
  }

  /** Writes a directory at the cursor and returns where it starts. */
  const writeIfd = (entries: TiffEntry[], next = 0): number => {
    const sorted = [...entries].sort((a, b) => a.tag - b.tag)
    const start = cursor
    w16(sorted.length, start)
    cursor = start + 2 + sorted.length * 12 + 4
    sorted.forEach((e, i) => {
      const at = start + 2 + i * 12
      const { count, bytes } = valueBytes(e)
      w16(e.tag, at)
      w16(e.type, at + 2)
      w32(count, at + 4)
      if (bytes.length <= 4) bytes.copy(buf, at + 8)
      else {
        bytes.copy(buf, cursor)
        w32(cursor, at + 8)
        cursor += bytes.length + (bytes.length % 2)
      }
    })
    w32(next, start + 2 + sorted.length * 12)
    return start
  }

  const exifAt = spec.exif ? writeIfd(spec.exif) : null
  const subs = (spec.subIfds ?? []).map(s => writeIfd(s))
  const nextAt = spec.next ? writeIfd(spec.next) : 0
  const ifd0 = [...spec.ifd0]
  if (exifAt !== null) ifd0.push({ tag: 0x8769, type: 4, values: [exifAt] })
  if (subs.length > 0) ifd0.push({ tag: 0x014a, type: 4, values: subs })
  const ifd0At = writeIfd(ifd0, nextAt)
  w32(ifd0At, 4)
  return buf.subarray(0, cursor + (spec.padding ?? 0))
}

/** A Canon CR2-like file: a small preview in IFD0, the EXIF IFD, and the full raw size in a chained IFD. */
export function cr2Bytes(over: { exposure?: [number, number]; iso?: number; date?: string; offset?: string | null; temperature?: [number, number] | null } = {}): Buffer {
  const exif: TiffEntry[] = [
    { tag: 0x829a, type: 5, values: [over.exposure ?? [120, 1]] },
    { tag: 0x8827, type: 3, values: [over.iso ?? 800] },
    { tag: 0x9003, type: 2, values: over.date ?? '2024:03:10 21:15:03' },
    { tag: 0x920a, type: 5, values: [[135, 1]] },
    { tag: 0xa20e, type: 5, values: [[3888, 1]] },
    { tag: 0xa210, type: 3, values: [2] }
  ]
  if (over.offset !== null) exif.push({ tag: 0x9011, type: 2, values: over.offset ?? '+01:00' })
  if (over.temperature) exif.push({ tag: 0x9400, type: 10, values: [over.temperature] })
  return tiffBytes({
    ifd0: [
      { tag: 0x0100, type: 3, values: [1620] },
      { tag: 0x0101, type: 3, values: [1080] },
      { tag: 0x010f, type: 2, values: 'Canon' },
      { tag: 0x0110, type: 2, values: 'Canon EOS 6D' },
      { tag: 0x0132, type: 2, values: '2024:03:11 09:00:00' }
    ],
    exif,
    next: [
      { tag: 0x0100, type: 4, values: [5568] },
      { tag: 0x0101, type: 4, values: [3708] }
    ],
    padding: 4096
  })
}
