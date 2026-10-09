/** Builds a minimal valid FITS file in memory: header cards, END, padded to 2880-byte blocks. */
export function fitsBytes(cards: Record<string, string | number | boolean>, pixelBytes = 0): Buffer {
  const card = (k: string, v: string | number | boolean) => {
    const value = typeof v === 'boolean' ? (v ? 'T' : 'F') : typeof v === 'number' ? String(v) : `'${v}'`
    return `${k.padEnd(8)}= ${value.padStart(20)}`.padEnd(80)
  }
  const all = { SIMPLE: true, BITPIX: 16, NAXIS: 0, ...cards }
  const header = Object.entries(all).map(([k, v]) => card(k, v)).join('') + 'END'.padEnd(80)
  const padded = header.padEnd(Math.ceil(header.length / 2880) * 2880, ' ')
  return Buffer.concat([Buffer.from(padded, 'ascii'), Buffer.alloc(Math.ceil(pixelBytes / 2880) * 2880)])
}

/**
 * A FITS file holding real pixels: 16-bit unsigned (BZERO 32768) or 32-bit float, one or more
 * planes, from values given row by row.
 */
export function fitsImage(width: number, height: number, planes: ArrayLike<number>[], options: { float?: boolean; cards?: Record<string, string | number | boolean> } = {}): Buffer {
  const float = options.float ?? false
  const bytes = float ? 4 : 2
  const cards: Record<string, string | number | boolean> = {
    BITPIX: float ? -32 : 16,
    NAXIS: planes.length > 1 ? 3 : 2,
    NAXIS1: width,
    NAXIS2: height,
    ...(planes.length > 1 ? { NAXIS3: planes.length } : {}),
    ...(float ? {} : { BZERO: 32768, BSCALE: 1 }),
    ...options.cards
  }
  const data = Buffer.alloc(width * height * planes.length * bytes)
  planes.forEach((plane, p) => {
    for (let i = 0; i < width * height; i++) {
      const o = (p * width * height + i) * bytes
      if (float) data.writeFloatBE(plane[i], o)
      else data.writeInt16BE(Math.max(0, Math.min(65535, Math.round(plane[i]))) - 32768, o)
    }
  })
  const header = fitsBytes(cards)
  return Buffer.concat([header, data, Buffer.alloc((2880 - (data.length % 2880)) % 2880)])
}
