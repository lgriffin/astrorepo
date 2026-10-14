/** A JPEG's first bytes with an EXIF (APP1) block whose IFD0 holds this ImageDescription, little- or big-endian. */
export function jpegWithDescription(description: string | null, bigEndian = false): Uint8Array {
  const soi = [0xff, 0xd8]
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...'JFIF\0'.split('').map(c => c.charCodeAt(0)), 1, 1, 0, 0, 1, 0, 1, 0, 0]
  if (description === null) return new Uint8Array([...soi, ...app0, 0xff, 0xda, 0x00, 0x02])
  const text = [...new TextEncoder().encode(description), 0]
  const u16 = (n: number) => (bigEndian ? [n >> 8, n & 0xff] : [n & 0xff, n >> 8])
  const u32 = (n: number) => (bigEndian ? [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff] : [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24])
  // Header (8) + one IFD of two entries (2 + 24 + 4), then the text.
  const textAt = 8 + 2 + 24 + 4
  const tiff = [
    ...(bigEndian ? [0x4d, 0x4d] : [0x49, 0x49]), ...u16(42), ...u32(8),
    ...u16(2),
    ...u16(0x010f), ...u16(2), ...u32(4), 0x56, 0x41, 0x4f, 0x00, // Make "VAO"
    ...u16(0x010e), ...u16(2), ...u32(text.length), ...u32(textAt),
    ...u32(0),
    ...text
  ]
  const exif = [...'Exif\0\0'.split('').map(c => c.charCodeAt(0)), ...tiff]
  const app1 = [0xff, 0xe1, ...[(exif.length + 2) >> 8, (exif.length + 2) & 0xff], ...exif]
  return new Uint8Array([...soi, ...app0, ...app1, 0xff, 0xda, 0x00, 0x02])
}

/** A FITS file's first header block, with this OBJECT card when given. */
export function fitsWithObject(object: string | null): Uint8Array {
  const card = (s: string) => s.padEnd(80, ' ').slice(0, 80)
  const cards = [
    card('SIMPLE  =                    T'),
    card('BITPIX  =                   16'),
    card('NAXIS   =                    0'),
    ...(object === null ? [] : [card(`OBJECT  = '${object.replace(/'/g, "''")}'`)]),
    card('END')
  ]
  return new TextEncoder().encode(cards.join('').padEnd(2880, ' '))
}
