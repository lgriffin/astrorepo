/**
 * Camera RAW frames from DSLR and mirrorless cameras (specs/026-other-rigs). Most RAW formats are
 * TIFF underneath, so their metadata is read from the TIFF and EXIF tags without decoding a pixel.
 * Canon's CR3 (ISO base media) and Fujifilm's RAF are found but not read. Siril reads every one of
 * them itself, through LibRaw, when its stock scripts run `convert`. Pure rules.
 */

/** RAW formats built on TIFF, whose metadata the app reads. */
export const READABLE_RAW_EXTENSIONS = ['.cr2', '.nef', '.nrw', '.arw', '.srf', '.sr2', '.dng', '.pef', '.orf', '.rw2', '.srw', '.erf', '.3fr', '.mef', '.mos', '.iiq'] as const
/** RAW formats the app finds but does not read: not TIFF underneath. */
export const UNREAD_RAW_EXTENSIONS = ['.cr3', '.raf'] as const
export const FITS_EXTENSIONS = ['.fit', '.fits', '.fts'] as const

export type FrameFileKind = 'fits' | 'raw' | 'raw-unread'

const extensionOf = (fileName: string) => {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? '' : fileName.slice(dot).toLowerCase()
}

/** Whether a file is a frame the app indexes or hands to Siril, and of what kind; null for anything else. */
export function frameFileKind(fileName: string): FrameFileKind | null {
  const ext = extensionOf(fileName)
  if ((FITS_EXTENSIONS as readonly string[]).includes(ext)) return 'fits'
  if ((READABLE_RAW_EXTENSIONS as readonly string[]).includes(ext)) return 'raw'
  if ((UNREAD_RAW_EXTENSIONS as readonly string[]).includes(ext)) return 'raw-unread'
  return null
}

/** The RAW format's name as cameras label it, for example "CR2"; null for a FITS file. */
export function rawFormatOf(fileName: string): string | null {
  const kind = frameFileKind(fileName)
  return kind === 'raw' || kind === 'raw-unread' ? extensionOf(fileName).slice(1).toUpperCase() : null
}

/** Why a CR3 or RAF file is listed but not indexed. */
export function unreadRawReason(fileName: string): string {
  const format = rawFormatOf(fileName) ?? 'RAW'
  return `Camera RAW (${format}) found; its metadata is not read, so it is not indexed. Siril still reads it when it stacks the folder. Convert it to DNG to have it indexed.`
}

/** The tags the TIFF and EXIF reader hands over, already decoded; null when the file does not record one. */
export interface RawExif {
  make: string | null
  model: string | null
  /** DateTimeOriginal as written, "YYYY:MM:DD HH:MM:SS". */
  dateTimeOriginal: string | null
  /** SubSecTimeOriginal, the digits after the second. */
  subSec: string | null
  /** OffsetTimeOriginal (or OffsetTime), for example "+01:00". */
  offsetTime: string | null
  exposureSec: number | null
  iso: number | null
  width: number | null
  height: number | null
  /** EXIF Temperature (0x9400), in °C. Maker-note temperatures are not read. */
  temperatureC: number | null
  /** The lens focal length (FocalLength), in millimetres. */
  focalMm: number | null
  /** Pixel pitch from FocalPlaneXResolution and its unit, in micrometres. */
  pixelUm: number | null
}

/**
 * The capture time as the index stores DATE-OBS. With an offset recorded the time is turned into
 * UTC and marked so; without one it is the camera's clock as written, and `zoneKnown` says so.
 */
export function rawCaptureTime(exif: Pick<RawExif, 'dateTimeOriginal' | 'subSec' | 'offsetTime'>): { dateObs: string; zoneKnown: boolean } | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(exif.dateTimeOriginal?.trim() ?? '')
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m.map(Number)
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || s > 59) return null
  const digits = /^\d+$/.test(exif.subSec?.trim() ?? '') ? (exif.subSec as string).trim() : ''
  const ms = digits ? Math.min(999, Math.round(Number(`0.${digits}`) * 1000)) : 0
  let utc = Date.UTC(y, mo - 1, d, h, mi, s, ms)
  const written = exif.offsetTime?.trim() ?? ''
  const offset = /^([+-])(\d{2}):?(\d{2})$/.exec(written)
  // A time zone lies within ±14:00 and has whole minutes under 60; anything else is not one.
  if (offset && (Number(offset[2]) > 14 || Number(offset[3]) > 59 || (Number(offset[2]) === 14 && Number(offset[3]) > 0))) return null
  if (offset) utc -= (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3])) * 60_000
  const iso = new Date(utc).toISOString()
  return offset ? { dateObs: iso, zoneKnown: true } : { dateObs: iso.slice(0, -1), zoneKnown: false }
}

/** Days in a month of the Gregorian calendar, leap years included. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export type RawImageType = 'Light' | 'Dark' | 'Flat' | 'Bias'

/** A frame-type word in a file name: "DARK_300s_0001.CR2", "M31_LIGHT_0001.CR2", "flat-12.nef". */
const NAME_WORD = /(?:^|[^a-z])(light|dark|flat|bias|offset)(?:s|es)?(?![a-z])/i
/** A folder's word for its frames: "Darks", "Bias", "DarkFrames", "Flat frame". */
const FOLDER_WORD = /^(light|dark|flat|bias|offset)(?:s|es)?(?:frames?)?$/i
/**
 * The other words a folder named for its frames may carry: anything with a digit ("ISO800",
 * "300s", "2024"), a filter ("L", "Ha", "OIII") or a word about frames ("frames", "master").
 * "Dark Shark" carries "Shark", so it is a target's folder, not a folder of darks.
 */
const FOLDER_QUALIFIER = /^(?:\S*\d\S*|frames?|master|masters|calib|calibration|raw|iso|gain|l|r|g|b|lum|luminance|red|green|blue|clear|ha|halpha|oiii|o3|sii|s2|nii|n2|hb|hbeta|uv|ir|uvir|ircut|lp)$/i

const TYPE_OF: Record<string, RawImageType> = { light: 'Light', dark: 'Dark', flat: 'Flat', bias: 'Bias', offset: 'Bias' }

/**
 * The frame type a folder is named for: one frame-type word, with nothing else but qualifiers such
 * as an ISO, an exposure, a date or a filter ("Darks", "Darks_ISO800", "Flats-L", "flats_2024-03-10",
 * "Bias frames"). Null for any other folder, so a target named for a nebula ("Dark Shark") is none.
 */
export function frameTypeOfFolder(folder: string | null | undefined): RawImageType | null {
  const words = (folder ?? '').trim().split(/[\s_\-.]+/).filter(Boolean)
  const typed = words.filter(w => FOLDER_WORD.test(w))
  if (typed.length !== 1 || !words.every(w => FOLDER_WORD.test(w) || FOLDER_QUALIFIER.test(w))) return null
  return TYPE_OF[(FOLDER_WORD.exec(typed[0]) as RegExpExecArray)[1].toLowerCase()]
}

/**
 * A camera RAW frame's type, which no tag records: from a frame-type word in its file name, else
 * from the folder it sits in when that folder is named for its frames. Only the nearest folder
 * counts, and only a folder named for its frames, so a target folder named for a nebula ("Dark
 * Shark") never turns its lights into darks. Null when neither says, so the folder the frame is
 * laid out from decides ("Darks/ISO800/IMG_0001.CR2" is a dark), and a light otherwise.
 */
export function rawImageType(fileName: string, parentFolder: string | null): RawImageType | null {
  const word = NAME_WORD.exec(fileName)
  return word ? TYPE_OF[word[1].toLowerCase()] : frameTypeOfFolder(parentFolder)
}

export interface RawHeader {
  keyword: string
  value: string | number
  comment: string
}

/**
 * The index's header rows for a RAW frame, named as FITS names them so every rule that reads FITS
 * headers reads these too: ISO goes in as GAIN, the camera as INSTRUME, the pixel pitch as XPIXSZ.
 */
export function rawHeaders(exif: RawExif, format: string, imageType: RawImageType | null): RawHeader[] {
  const out: RawHeader[] = [{ keyword: 'RAWFMT', value: format, comment: 'Camera RAW format' }]
  const camera = [exif.make?.trim(), exif.model?.trim()].filter(Boolean) as string[]
  // Most cameras repeat the make in the model ("Canon" + "Canon EOS 6D").
  const name = camera.length === 2 && camera[1].toLowerCase().startsWith(camera[0].toLowerCase()) ? camera[1] : camera.join(' ')
  if (name) out.push({ keyword: 'INSTRUME', value: name, comment: 'Camera make and model (EXIF)' })
  // No IMAGETYP when neither name says, so the folder the frame is laid out from decides.
  if (imageType) out.push({ keyword: 'IMAGETYP', value: imageType, comment: 'From the file or folder name' })
  const time = rawCaptureTime(exif)
  if (time) out.push({ keyword: 'DATE-OBS', value: time.dateObs, comment: time.zoneKnown ? 'UTC, from the EXIF time and its offset' : "Camera clock; the EXIF does not record its time zone" })
  if (exif.exposureSec !== null && exif.exposureSec > 0) out.push({ keyword: 'EXPTIME', value: exif.exposureSec, comment: 'ExposureTime (EXIF), seconds' })
  if (exif.iso !== null && exif.iso > 0) {
    out.push({ keyword: 'GAIN', value: exif.iso, comment: 'ISO, used as gain' })
    out.push({ keyword: 'ISOSPEED', value: exif.iso, comment: 'ISO (EXIF)' })
  }
  if (exif.width !== null && exif.width > 0) out.push({ keyword: 'NAXIS1', value: exif.width, comment: 'Image width (TIFF)' })
  if (exif.height !== null && exif.height > 0) out.push({ keyword: 'NAXIS2', value: exif.height, comment: 'Image height (TIFF)' })
  if (exif.temperatureC !== null) out.push({ keyword: 'CCD-TEMP', value: exif.temperatureC, comment: 'Temperature (EXIF), °C' })
  if (exif.focalMm !== null && exif.focalMm > 0) out.push({ keyword: 'FOCALLEN', value: exif.focalMm, comment: 'FocalLength (EXIF), mm' })
  if (exif.pixelUm !== null && exif.pixelUm > 0) out.push({ keyword: 'XPIXSZ', value: Math.round(exif.pixelUm * 100) / 100, comment: 'From FocalPlaneXResolution, µm' })
  return out
}

/** Pixel pitch in micrometres from FocalPlaneXResolution and FocalPlaneResolutionUnit (2 inch, 3 cm, 4 mm, 5 µm). */
export function pixelPitchUm(resolution: number | null, unit: number | null): number | null {
  if (resolution === null || !(resolution > 0)) return null
  const per = { 2: 25_400, 3: 10_000, 4: 1_000, 5: 1 }[unit ?? 2]
  if (per === undefined) return null
  const um = per / resolution
  // Real sensors sit between about 1 and 30 µm; anything else is a tag written for the JPEG.
  return um >= 1 && um <= 30 ? um : null
}

/**
 * What the stacking plan says about camera RAW lights: how many, in what formats, and that Siril's
 * colour script reads them. Null when none of the names is camera RAW.
 */
export function cameraRawSummary(lightNames: string[]): { count: number; unread: number; formats: string[] } | null {
  const formats = new Set<string>()
  let count = 0
  let unread = 0
  for (const name of lightNames) {
    const format = rawFormatOf(name)
    if (!format) continue
    count++
    if (frameFileKind(name) === 'raw-unread') unread++
    formats.add(format)
  }
  return count === 0 ? null : { count, unread, formats: [...formats].sort() }
}
