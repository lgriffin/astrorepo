import zlib from 'zlib'

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** A PNG from raw rows, each row filtered with the next of the five filter types in turn. */
export function png(width: number, height: number, type: number, depth: number, rows: number[][], options: { interlace?: number; palette?: number[] } = {}): Buffer {
  const chunk = (kind: string, body: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(body.length)
    return Buffer.concat([len, Buffer.from(kind, 'ascii'), body, Buffer.alloc(4)])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = depth
  ihdr[9] = type
  ihdr[12] = options.interlace ?? 0
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]!
  const bpp = (channels * depth) / 8
  const lines: Buffer[] = []
  let prior = Buffer.alloc(rows[0].length)
  rows.forEach((row, y) => {
    const raw = Buffer.from(row)
    const filter = y % 5
    const out = Buffer.alloc(raw.length + 1)
    out[0] = filter
    for (let i = 0; i < raw.length; i++) {
      const a = i >= bpp ? raw[i - bpp] : 0
      const b = prior[i]
      const c = i >= bpp ? prior[i - bpp] : 0
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]
      out[i + 1] = (raw[i] - pred) & 0xff
    }
    lines.push(out)
    prior = raw
  })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(options.palette ? [chunk('PLTE', Buffer.from(options.palette))] : []),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(lines))),
    chunk('IEND', Buffer.alloc(0))
  ])
}
