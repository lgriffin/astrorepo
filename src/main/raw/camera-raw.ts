import path from 'path'
import { frameFileKind, rawFormatOf, rawHeaders, rawImageType, unreadRawReason } from '@astro/domain'
import type { FitsHeaderRecord, FitsParseResult } from '../fits/parser'
import { readCameraRawExif } from './tiff-exif'

/**
 * A camera RAW file read the way the scanner reads a FITS file (RIG-001): its EXIF becomes header
 * rows named as FITS names them, so it lands in the same index. A CR3 or RAF file comes back
 * unreadable with the reason (RIG-002), and so does a damaged file (RIG-003); the scanner then
 * lists it with the files it could not read.
 */
export async function parseCameraRawFile(filePath: string): Promise<FitsParseResult> {
  const name = path.basename(filePath)
  const fail = (error: string): FitsParseResult => ({ headers: [], headerMap: new Map(), imageStats: null, isValid: false, error })
  if (frameFileKind(name) === 'raw-unread') return fail(unreadRawReason(name))
  try {
    const exif = await readCameraRawExif(filePath)
    const headers: FitsHeaderRecord[] = rawHeaders(exif, rawFormatOf(name) ?? 'RAW', rawImageType(name, path.basename(path.dirname(filePath)))).map(h => ({
      keyword: h.keyword,
      value: h.value,
      comment: h.comment,
      raw: `${h.keyword.padEnd(8)}= ${typeof h.value === 'string' ? `'${h.value}'` : h.value} / ${h.comment}`
    }))
    return { headers, headerMap: new Map(headers.map(h => [h.keyword, h])), imageStats: null, isValid: true }
  } catch (error) {
    // A TiffReadError says what is wrong with the file; anything else is the disk's own reason.
    return fail(`Camera RAW (${rawFormatOf(name) ?? 'RAW'}) could not be read: ${error instanceof Error ? error.message : String(error)}`)
  }
}
