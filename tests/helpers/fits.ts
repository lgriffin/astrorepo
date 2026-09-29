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
