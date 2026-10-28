/**
 * Reading your FITS headers (specs/042-learning, L3): what each common keyword means and why it
 * matters to an astrophotographer. Keywords that come numbered (NAXIS1, CRVAL2, CD1_2) are filed
 * once under their family name (NAXISn, CRVALn, CDi_j). Keywords from the FITS standard cite it;
 * those that capture software adds by convention cite the FITS article, which describes them.
 */

export interface FitsKeyword {
  /** The keyword, or its family name for numbered ones (NAXISn, CDi_j). */
  key: string
  /** What the value is, in one line. */
  meaning: string
  /** Why it matters when you image, process or check a file. */
  why: string
  /** A concept that explains it further, when there is one. */
  concept: string | null
  /** True when the FITS standard itself defines it; false for a convention capture software follows. */
  standard: boolean
  sources: string[]
}

const STD = ['fits-standard']
const CONV = ['wiki-fits']

export const FITS_KEYWORDS: readonly FitsKeyword[] = [
  { key: 'SIMPLE', meaning: 'The file follows the FITS standard.', why: 'Every FITS file starts with it; a reader that sees anything else stops.', concept: 'fits-header', standard: true, sources: STD },
  { key: 'BITPIX', meaning: 'How each pixel is stored: 8, 16 or 32 are whole numbers of that many bits; −32 and −64 are floating point.', why: 'Raw subs are usually 16-bit whole numbers; stacks are usually −32, floating point, so faint signal averaged over many frames is not rounded away.', concept: 'fits-header', standard: true, sources: STD },
  { key: 'NAXIS', meaning: 'How many dimensions the data has: 2 for a single picture, 3 for a stack of planes, such as a debayered colour image.', why: 'A raw colour frame is still 2: its colours are in the Bayer pattern until it is debayered.', concept: 'bayer', standard: true, sources: STD },
  { key: 'NAXISn', meaning: 'The length of one dimension: NAXIS1 is the width in pixels, NAXIS2 the height, NAXIS3 (when there is one) the number of planes, such as the three colours of a debayered image.', why: 'Width × height × pixel scale gives the field of view.', concept: 'image-scale', standard: true, sources: STD },
  { key: 'BZERO', meaning: 'An offset added to every stored value to get the real one.', why: 'BZERO = 32768 is how unsigned 16-bit camera data fits in FITS, which stores 16-bit numbers as signed.', concept: null, standard: true, sources: STD },
  { key: 'BSCALE', meaning: 'A factor every stored value is multiplied by to get the real one.', why: 'Real value = BZERO + BSCALE × stored value; it is 1 for almost all camera data.', concept: null, standard: true, sources: STD },
  { key: 'DATE-OBS', meaning: 'When the exposure started, normally in UTC.', why: 'It ties the frame to a night, the Moon’s phase and the target’s height in the sky.', concept: null, standard: true, sources: STD },
  { key: 'DATE', meaning: 'When the file was written.', why: 'For a stack it is when it was made, not when the light was captured.', concept: null, standard: true, sources: STD },
  { key: 'OBJECT', meaning: 'The name of what was observed, as the capture software recorded it.', why: 'It is how files are matched to targets, so a typo here splits a target in two.', concept: null, standard: true, sources: STD },
  { key: 'TELESCOP', meaning: 'The telescope used.', why: 'Tells frames from different scopes apart, since they differ in field and scale.', concept: null, standard: true, sources: STD },
  { key: 'INSTRUME', meaning: 'The camera or instrument used.', why: 'Darks and flats must come from the same camera as the lights.', concept: null, standard: true, sources: STD },
  { key: 'OBSERVER', meaning: 'Who took it.', why: 'Useful when data is shared or comes from a remote observatory.', concept: null, standard: true, sources: STD },
  { key: 'EQUINOX', meaning: 'The epoch the coordinates are given for, usually 2000.', why: 'The sky’s coordinate grid slowly shifts as Earth’s axis wobbles, so coordinates name the date they hold for.', concept: 'wcs', standard: true, sources: STD },
  { key: 'CTYPEn', meaning: 'What an axis measures and the projection used, such as RA---TAN: right ascension on a tangent-plane projection.', why: 'A flat picture of the curved sky needs a projection; TAN is the usual one for telescope fields.', concept: 'wcs', standard: true, sources: STD },
  { key: 'CRVALn', meaning: 'The sky coordinates, in degrees, of the reference pixel.', why: 'Present once a frame is plate solved: the picture then knows where on the sky it is.', concept: 'wcs', standard: true, sources: STD },
  { key: 'CRPIXn', meaning: 'The reference pixel, where CRVAL applies.', why: 'Usually near the centre of the frame.', concept: 'wcs', standard: true, sources: STD },
  { key: 'CDELTn', meaning: 'Degrees of sky per pixel along an axis.', why: 'Times 3,600 it is the image scale in arcseconds per pixel, measured by the solver rather than worked out from the optics.', concept: 'image-scale', standard: true, sources: STD },
  { key: 'CROTAn', meaning: 'How far the frame is rotated on the sky, in degrees.', why: 'Matters when framing mosaics and matching frames from different nights.', concept: 'wcs', standard: true, sources: STD },
  { key: 'CDi_j', meaning: 'A matrix giving scale, rotation and any mirror flip in one, in degrees per pixel.', why: 'Modern solvers write this instead of CDELT and CROTA.', concept: 'wcs', standard: true, sources: STD },
  { key: 'EXPTIME', meaning: 'Exposure length in seconds.', why: 'Signal grows in proportion to it while shot noise grows only as its square root, which is why longer total integration gives cleaner images.', concept: 'noise', standard: false, sources: CONV },
  { key: 'EXPOSURE', meaning: 'Exposure length in seconds (an older name for EXPTIME).', why: 'Some software writes this one instead.', concept: null, standard: false, sources: CONV },
  { key: 'FILTER', meaning: 'The filter in the light path.', why: 'Frames are calibrated and stacked per filter, and narrowband filters pass single emission lines.', concept: 'emission-lines', standard: false, sources: CONV },
  { key: 'GAIN', meaning: 'The camera’s amplification setting, in the camera’s own units.', why: 'Higher gain lowers read noise on most CMOS cameras but leaves less room before bright stars saturate. Darks must match it.', concept: 'noise', standard: false, sources: CONV },
  { key: 'OFFSET', meaning: 'A fixed amount added to every pixel by the camera.', why: 'It keeps the darkest pixels above zero, so noise in the background is recorded rather than cut off. Darks must match it.', concept: 'noise', standard: false, sources: CONV },
  { key: 'CCD-TEMP', meaning: 'The sensor’s temperature during the exposure, in °C.', why: 'Thermal noise (dark current) rises steeply with temperature, so darks should match the lights’ temperature.', concept: 'dark-current', standard: false, sources: CONV },
  { key: 'SET-TEMP', meaning: 'The temperature the cooler was asked to hold, in °C.', why: 'If CCD-TEMP is far from it, the cooler could not keep up that night.', concept: 'dark-current', standard: false, sources: CONV },
  { key: 'XPIXSZ', meaning: 'Pixel width in micrometres, by convention after any binning.', why: 'With the focal length it sets how much sky each pixel sees.', concept: 'image-scale', standard: false, sources: CONV },
  { key: 'YPIXSZ', meaning: 'Pixel height in micrometres.', why: 'Almost always the same as XPIXSZ.', concept: 'image-scale', standard: false, sources: CONV },
  { key: 'XBINNING', meaning: 'How many pixels across were combined into one.', why: 'Binning 2 makes each pixel see twice as much sky across.', concept: 'image-scale', standard: false, sources: CONV },
  { key: 'YBINNING', meaning: 'How many pixels down were combined into one.', why: 'Normally the same as XBINNING.', concept: 'image-scale', standard: false, sources: CONV },
  { key: 'FOCALLEN', meaning: 'The telescope’s focal length in millimetres.', why: 'Longer focal length spreads the sky over more pixels: a smaller field, more detail if the seeing allows.', concept: 'image-scale', standard: false, sources: CONV },
  { key: 'APTDIA', meaning: 'The telescope’s aperture diameter in millimetres.', why: 'Aperture sets how much light is gathered and the finest detail the optics can resolve.', concept: null, standard: false, sources: CONV },
  { key: 'FOCRATIO', meaning: 'The focal ratio: focal length divided by aperture.', why: 'A lower number (a “faster” scope) puts more light on each pixel, so shorter subs reach the same signal.', concept: null, standard: false, sources: CONV },
  { key: 'BAYERPAT', meaning: 'The colour filter pattern over a one-shot-colour sensor, such as RGGB.', why: 'Debayering uses it to rebuild full colour; the wrong pattern gives strange colours.', concept: 'bayer', standard: false, sources: CONV },
  { key: 'IMAGETYP', meaning: 'What kind of frame it is: light, dark, flat or bias.', why: 'Calibration needs each kind kept apart.', concept: 'fits-header', standard: false, sources: CONV },
  { key: 'FRAME', meaning: 'What kind of frame it is (another name for IMAGETYP).', why: 'Calibration needs each kind kept apart.', concept: 'fits-header', standard: false, sources: CONV },
  { key: 'RA', meaning: 'Where the telescope pointed: right ascension.', why: 'The mount’s idea of the position; a plate solve gives the true one.', concept: 'wcs', standard: false, sources: CONV },
  { key: 'DEC', meaning: 'Where the telescope pointed: declination.', why: 'The mount’s idea of the position; a plate solve gives the true one.', concept: 'wcs', standard: false, sources: CONV },
  { key: 'OBJCTRA', meaning: 'The target’s right ascension as text.', why: 'An older way of recording where the target was.', concept: 'wcs', standard: false, sources: CONV },
  { key: 'OBJCTDEC', meaning: 'The target’s declination as text.', why: 'An older way of recording where the target was.', concept: 'wcs', standard: false, sources: CONV },
  { key: 'AIRMASS', meaning: 'How much air the light came through, compared with straight overhead.', why: 'It is 1 at the zenith and about 2 at 30° up: more air dims, reddens and blurs the target.', concept: 'airmass', standard: false, sources: CONV },
  { key: 'SITELAT', meaning: 'The observing site’s latitude.', why: 'With the time, it says how high the target stood.', concept: null, standard: false, sources: CONV },
  { key: 'SITELONG', meaning: 'The observing site’s longitude.', why: 'With the time, it says how high the target stood.', concept: null, standard: false, sources: CONV },
  { key: 'NCOMBINE', meaning: 'How many frames were combined into this one.', why: 'A stack of N frames has about √N times the signal-to-noise of one.', concept: 'noise', standard: false, sources: CONV },
  { key: 'STACKCNT', meaning: 'How many frames were stacked into this one (another name for NCOMBINE).', why: 'A stack of N frames has about √N times the signal-to-noise of one.', concept: 'noise', standard: false, sources: CONV },
  { key: 'CALSTAT', meaning: 'Which calibrations were applied: B for bias, D for dark, F for flat.', why: 'Tells you whether a frame is still raw.', concept: null, standard: false, sources: CONV },
  { key: 'SWCREATE', meaning: 'The software that wrote the file.', why: 'Different programs follow different conventions for the keywords above.', concept: null, standard: false, sources: CONV },
  { key: 'FOCPOS', meaning: 'The focuser position.', why: 'Focus shifts with temperature and filter; this records where it was.', concept: null, standard: false, sources: CONV }
]

/**
 * The family a keyword belongs to: NAXIS1 → NAXISn, CRVAL2 → CRVALn, CD1_2 → CDi_j; others as
 * they are, upper case. NAXIS alone stays NAXIS.
 */
export function keywordFamily(keyword: string): string {
  const k = keyword.trim().toUpperCase()
  if (/^CD\d+_\d+$/.test(k)) return 'CDi_j'
  const numbered = /^(NAXIS|CTYPE|CRVAL|CRPIX|CDELT|CROTA)\d+$/.exec(k)
  return numbered ? `${numbered[1]}n` : k
}

/** What a keyword means, or null for one the dictionary does not hold. */
export function keywordMeaning(keyword: string, keywords: readonly FitsKeyword[] = FITS_KEYWORDS): FitsKeyword | null {
  const family = keywordFamily(keyword)
  return keywords.find(k => k.key === family) ?? null
}

/** Arcseconds in a radian divided by a thousand: image scale = this × pixel µm ÷ focal mm. */
export const ARCSEC_PER_MICRON_PER_MM = 206.265

/** The seeing assumed when nothing better is known, in arcseconds: the middle of a typical amateur site's 1.5 to 3. */
export const TYPICAL_SEEING_ARCSEC = 2

export type Sampling = 'under' | 'matched' | 'over'

/** What one frame's optics and sensor give: how much sky a pixel sees and the whole field. */
export interface SetupNumbers {
  focalMm: number
  pixelUm: number
  /** Arcseconds of sky per pixel, worked out from the optics. */
  scaleArcsec: number
  /** The field in arcminutes, when the frame's size is known. */
  fieldArcmin: { width: number; height: number } | null
  /** Against the seeing: more than seeing ÷ 2 per pixel is under-sampled, less than seeing ÷ 3 over-sampled. */
  sampling: Sampling
  seeingArcsec: number
}

/**
 * A frame's image scale, field of view and sampling (LRN-012) from its focal length, pixel size
 * (taken, as XPIXSZ is by convention, to include any binning) and size; null when the focal length
 * or pixel size is missing or not positive.
 */
export function setupNumbers(input: {
  focalMm: number | null
  pixelUm: number | null
  widthPx?: number | null
  heightPx?: number | null
  seeingArcsec?: number
}): SetupNumbers | null {
  const { focalMm, pixelUm } = input
  if (focalMm == null || pixelUm == null || !(focalMm > 0) || !(pixelUm > 0)) return null
  const scale = (ARCSEC_PER_MICRON_PER_MM * pixelUm) / focalMm
  const w = input.widthPx
  const h = input.heightPx
  const field = w != null && h != null && w > 0 && h > 0 ? { width: (w * scale) / 60, height: (h * scale) / 60 } : null
  const seeing = input.seeingArcsec ?? TYPICAL_SEEING_ARCSEC
  const sampling: Sampling = scale > seeing / 2 ? 'under' : scale < seeing / 3 ? 'over' : 'matched'
  return { focalMm, pixelUm, scaleArcsec: scale, fieldArcmin: field, sampling, seeingArcsec: seeing }
}

/** One header line as a file holds it. */
export interface HeaderLine {
  keyword: string
  value: string | null
}

/** A file's header read for a learner (LRN-011, LRN-012). */
export interface ExplainedHeaders {
  /** What each keyword the dictionary holds means, by the keyword as the file writes it, once each. */
  keywords: { keyword: string; entry: FitsKeyword }[]
  /** The scale and field from the header's optics, when it names a focal length and a pixel size. */
  setup: SetupNumbers | null
  /** The scale a plate solve measured, in arcseconds per pixel, when the file is solved. */
  solvedScaleArcsec: number | null
}

/** A header value as a number: quotes and spaces trimmed; null when it is not one. */
export function headerNumber(value: string | null | undefined): number | null {
  if (value == null) return null
  const text = value.trim().replace(/^'(.*)'$/, '$1').trim()
  if (text === '') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

/**
 * Explains a file's header: the meaning of each keyword the dictionary holds, the image scale and
 * field its optics give, and the scale a plate solve measured (from the CD matrix's first column, or
 * from CDELT1 when there is no matrix), so the two can be compared.
 */
export function explainHeaders(lines: readonly HeaderLine[], keywords: readonly FitsKeyword[] = FITS_KEYWORDS): ExplainedHeaders {
  const values = new Map<string, number | null>()
  const found: ExplainedHeaders['keywords'] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const key = line.keyword.trim().toUpperCase()
    // The last card of a name wins, as in the FITS parser that indexed the file.
    values.set(key, headerNumber(line.value))
    if (seen.has(key)) continue
    seen.add(key)
    const entry = keywordMeaning(key, keywords)
    if (entry) found.push({ keyword: key, entry })
  }
  const num = (key: string): number | null => values.get(key) ?? null
  const setup = setupNumbers({ focalMm: num('FOCALLEN'), pixelUm: num('XPIXSZ'), widthPx: num('NAXIS1'), heightPx: num('NAXIS2') })
  return { keywords: found, setup, solvedScaleArcsec: solvedScale(num('CDELT1'), num('CD1_1'), num('CD2_1')) }
}

/**
 * Arcseconds per pixel from a solve: the CD matrix's first column when the matrix is there, as the
 * sky overlay reads it, otherwise CDELT1.
 */
function solvedScale(cdelt1: number | null, cd11: number | null, cd21: number | null): number | null {
  const step = cd11 != null || cd21 != null ? Math.hypot(cd11 ?? 0, cd21 ?? 0) : Math.abs(cdelt1 ?? 0)
  return step > 0 ? step * 3600 : null
}
