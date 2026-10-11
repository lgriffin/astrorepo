/**
 * SQL fragments and value readers shared by the SQLite adapters. They live here, not in one
 * adapter, so no adapter imports another (tests/architecture).
 */

/** FITS DATE-OBS is UTC but usually written without a zone; read it as UTC, not local time. */
export function parseUtc(value: string | null): Date | null {
  if (!value) return null
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value)
  const d = new Date(hasZone ? value : `${value}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** IMAGETYP names a calibration frame; these words win over "light", as in the domain's frameKind. */
const NAMES_CALIBRATION = `(LOWER(f.image_type) LIKE '%dark%' OR LOWER(f.image_type) LIKE '%flat%' OR LOWER(f.image_type) LIKE '%bias%' OR LOWER(f.image_type) LIKE '%offset%')`

/** IMAGETYP words that make a frame a light (or, for IS_INTEGRATED_LIGHT, an integrated one). */
const typedAs = (words: string[]) =>
  `(f.image_type IS NULL OR ((${words.map(w => `LOWER(f.image_type) LIKE '%${w}%'`).join(' OR ')}) AND NOT ${NAMES_CALIBRATION}))`

/** Light frames as the scanners record them: untyped, or typed as light and not as calibration (frameKind). */
export const IS_LIGHT = typedAs(['light'])

/** A header card's number, without the quotes some writers put around it. */
export const HEADER_NUMBER = (keyword: string) =>
  `(SELECT CAST(TRIM(REPLACE(h.value, '''', '')) AS REAL) FROM fits_headers h WHERE h.file_id = f.id AND h.keyword = '${keyword}' LIMIT 1)`

/**
 * An integration, not just a flagged file: the scanner also marks a calibrated sub (CALSTAT alone)
 * as stacked, and master calibration frames are stacks too, so neither is offered.
 */
export const IS_INTEGRATED_LIGHT = `(${typedAs(['light', 'stack', 'integrat'])}
  AND (COALESCE(f.ncombine, 0) > 1
       OR (f.total_exposure IS NOT NULL AND f.exposure_sec IS NOT NULL AND f.total_exposure > f.exposure_sec)
       OR LOWER(COALESCE(f.image_type, '')) LIKE '%stack%'
       OR LOWER(COALESCE(f.image_type, '')) LIKE '%integrat%'))`
