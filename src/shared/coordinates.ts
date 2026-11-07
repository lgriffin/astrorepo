/**
 * Reading a site's coordinates pasted in one go (specs/046-everyday-ux, EUX-002, EUX-003): a pair
 * copied from a map ("53.3498, -6.2603"), a map link with "@lat,lon", hemisphere letters
 * ("53.35 N, 6.26 W") or degrees, minutes and seconds ("53°20′59″N 6°15′37″W").
 */
export type CoordinateReading =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; problem: string }

const UNREADABLE = 'Paste a latitude and a longitude, such as 53.35, -6.26 or 53°20′59″N 6°15′37″W.'

const NUMBER = String.raw`(\d+(?:\.\d+)?)`
/**
 * One whole coordinate, anchored at both ends so nothing stray slips through (EUX-003): an optional
 * hemisphere letter before or after, an optional sign, degrees, then minutes and seconds each set off
 * by its mark or a space.
 */
const COORDINATE = new RegExp(
  String.raw`^([NSEW])?\s*([+-])?` + NUMBER + String.raw`(?:\s*[°º])?` +
  String.raw`(?:(?:(?<=[°º])\s*|\s+)` + NUMBER + String.raw`(?:\s*['′])?` +
  String.raw`(?:(?:(?<=['′])\s*|\s+)` + NUMBER + String.raw`(?:\s*(?:["″]|''|′′))?)?)?` +
  String.raw`\s*([NSEW])?$`
)

/** One coordinate in decimal degrees, signed by its own sign or its hemisphere letter, not rounded. */
function readOne(part: string): { value: number; axis: 'lat' | 'lon' | null } | string {
  const match = part.trim().toUpperCase().match(COORDINATE)
  if (!match) return UNREADABLE
  const [, before, sign, d, m, s, after] = match
  if (before && after) return UNREADABLE
  const letter = before ?? after
  // Only the last number may carry a fraction: 53.5°20′ is not a coordinate.
  if ((m !== undefined && d.includes('.')) || (s !== undefined && m.includes('.'))) return UNREADABLE
  // A sign that disagrees with the letter (-53 N, +6 W), or says it twice (-53 S), is refused.
  if (letter && (sign === '-' || (sign === '+' && (letter === 'S' || letter === 'W')))) return UNREADABLE
  const minutes = Number(m ?? 0)
  const seconds = Number(s ?? 0)
  if (minutes >= 60 || seconds >= 60) return 'Minutes and seconds run from 0 to 59.'
  const magnitude = Number(d) + minutes / 60 + seconds / 3600
  const negative = sign === '-' || letter === 'S' || letter === 'W'
  return {
    value: negative ? -magnitude : magnitude,
    axis: letter === 'N' || letter === 'S' ? 'lat' : letter === 'E' || letter === 'W' ? 'lon' : null
  }
}

/** Splits pasted text into its latitude part and its longitude part, in the order written. */
function halves(text: string): [string, string] | null {
  const link = text.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
  if (link) return [link[1], link[2]]
  const byMark = text.split(/[,;]/)
  if (byMark.length === 2) return [byMark[0], byMark[1]]
  if (byMark.length > 2) return null
  // "53°20′59″N 6°15′37″W": the first hemisphere letter ends the first part.
  const lettered = text.match(/^(.*?[NSns])\s*(.+)$/) ?? text.match(/^(.*?[EWew])\s*(.+)$/)
  if (lettered && /[NSEWnsew]/.test(lettered[2])) return [lettered[1], lettered[2]]
  // "53.35 -6.26": two plain numbers.
  const plain = text.trim().split(/\s+/)
  return plain.length === 2 ? [plain[0], plain[1]] : null
}

export function readCoordinates(pasted: string): CoordinateReading {
  const parts = halves(pasted.trim())
  if (!parts) return { ok: false, problem: UNREADABLE }
  const first = readOne(parts[0])
  const second = readOne(parts[1])
  if (typeof first === 'string') return { ok: false, problem: first }
  if (typeof second === 'string') return { ok: false, problem: second }
  if (first.axis !== null && first.axis === second.axis) return { ok: false, problem: UNREADABLE }
  // Written longitude first ("6.26 W, 53.35 N"): the letters say which is which.
  const [lat, lon] = first.axis === 'lon' || second.axis === 'lat' ? [second, first] : [first, second]
  if (Math.abs(lat.value) > 90) return { ok: false, problem: 'Latitude runs from -90 (south) to 90 (north).' }
  if (Math.abs(lon.value) > 180) return { ok: false, problem: 'Longitude runs from -180 (west) to 180 (east).' }
  // Rounded only once the range is checked, so 90°0′0.001″ is refused rather than read as 90.
  return { ok: true, latitude: Number(lat.value.toFixed(6)), longitude: Number(lon.value.toFixed(6)) }
}
