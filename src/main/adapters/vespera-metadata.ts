import type { VesperaMetadata } from '@astro/application'
import { parseHeaderCard } from '../fits/parser'

const IMAGE_DESCRIPTION = 0x010e
const ASCII = 2
/** A JPEG has only so many segments before its image data; more means it is not one. */
const MAX_SEGMENTS = 64
const MAX_ENTRIES = 1000

/**
 * The ImageDescription tag of a JPEG's EXIF (APP1), from its first bytes: the Vespera writes the
 * object's name and the stack's frame count there. Null for anything that is not a JPEG with one;
 * never throws, and never reads past the bytes it was given.
 */
export function jpegImageDescription(bytes: Uint8Array): string | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let at = 2
  for (let n = 0; n < MAX_SEGMENTS && at + 4 <= bytes.length; n++) {
    if (bytes[at] !== 0xff) return null
    const marker = bytes[at + 1]
    if (marker === 0xd9 || marker === 0xda) return null
    const length = (bytes[at + 2] << 8) | bytes[at + 3]
    if (length < 2) return null
    const start = at + 4
    const end = Math.min(bytes.length, at + 2 + length)
    if (marker === 0xe1 && end - start > 6 && String.fromCharCode(...bytes.subarray(start, start + 6)) === 'Exif\0\0') {
      return tiffImageDescription(bytes.subarray(start + 6, end))
    }
    at += 2 + length
  }
  return null
}

function tiffImageDescription(tiff: Uint8Array): string | null {
  if (tiff.length < 8) return null
  const little = tiff[0] === 0x49 && tiff[1] === 0x49
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return null
  const u16 = (o: number) => (o + 2 <= tiff.length ? (little ? tiff[o] | (tiff[o + 1] << 8) : (tiff[o] << 8) | tiff[o + 1]) : -1)
  const u32 = (o: number) =>
    o + 4 <= tiff.length ? (little ? (tiff[o] | (tiff[o + 1] << 8) | (tiff[o + 2] << 16)) + tiff[o + 3] * 0x1000000 : ((tiff[o] << 16) | (tiff[o + 1] << 8) | tiff[o + 2]) * 0x100 + tiff[o + 3]) : -1
  if (u16(2) !== 42) return null
  const ifd = u32(4)
  const entries = u16(ifd)
  if (ifd < 0 || entries < 0 || entries > MAX_ENTRIES) return null
  for (let i = 0; i < entries; i++) {
    const e = ifd + 2 + i * 12
    if (e + 12 > tiff.length) return null
    if (u16(e) !== IMAGE_DESCRIPTION || u16(e + 2) !== ASCII) continue
    const count = u32(e + 4)
    const offset = count <= 4 ? e + 8 : u32(e + 8)
    if (count <= 0 || offset < 0 || offset + count > tiff.length) return null
    const text = new TextDecoder('latin1').decode(tiff.subarray(offset, offset + count)).replace(/\0[\s\S]*$/, '').trim()
    return text === '' ? null : text
  }
  return null
}

/** The OBJECT card of a FITS header's first blocks, read with the scanner's card parser. Null when there is none. */
export function fitsHeaderObject(bytes: Uint8Array): string | null {
  const text = new TextDecoder('latin1').decode(bytes)
  if (!text.startsWith('SIMPLE  =')) return null
  for (let at = 0; at + 80 <= text.length; at += 80) {
    const card = text.slice(at, at + 80)
    const keyword = card.slice(0, 8).trimEnd()
    if (keyword === 'END') return null
    if (keyword !== 'OBJECT') continue
    const { value } = parseHeaderCard(card)
    const name = typeof value === 'string' ? value.trim() : value === null ? '' : String(value)
    return name === '' ? null : name
  }
  return null
}

/** VesperaMetadata over the bytes a read from the scope returned. */
export class NodeVesperaMetadata implements VesperaMetadata {
  exifDescription(bytes: Uint8Array): string | null {
    return jpegImageDescription(bytes)
  }

  fitsObject(bytes: Uint8Array): string | null {
    return fitsHeaderObject(bytes)
  }
}
