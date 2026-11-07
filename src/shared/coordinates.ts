/**
 * Reading a site's coordinates pasted in one go (specs/046-everyday-ux, EUX-002, EUX-003): a pair
 * copied from a map ("53.3498, -6.2603"), a map link with "@lat,lon", hemisphere letters
 * ("53.35 N, 6.26 W") or degrees, minutes and seconds ("53°20′59″N 6°15′37″W").
 */
export type CoordinateReading =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; problem: string }

const UNREADABLE = 'Paste a latitude and a longitude, such as 53.35, -6.26 or 53°20′59″N 6°15′37″W.'

/** One coordinate in decimal degrees, signed by its own sign or its hemisphere letter. */
function readOne(part: string): { value: number; axis: 'lat' | 'lon' | null } | string {
  const text = part.trim().toUpperCase()
  const hemisphere = text.match(/[NSEW]/g)
  if (hemisphere && hemisphere.length > 1) return UNREADABLE
  // Anything but numbers, signs, degree, minute and second marks and one hemisphere letter is not a coordinate.
  if (/[^0-9.+\-\s°º'′"″NSEW]/.test(text)) return UNREADABLE
  const numbers = text.match(/[+-]?\d+(?:\.\d+)?/g)
  if (!numbers || numbers.length > 3) return UNREADABLE
  const [d, m = '0', s = '0'] = numbers
  const minutes = Number(m)
  const seconds = Number(s)
  // Only the degrees may carry a sign or a fraction when minutes follow.
  if (numbers.length > 1 && (/[+-]/.test(m + s) || /\./.test(d))) return UNREADABLE
  if (minutes >= 60 || seconds >= 60) return 'Minutes and seconds run from 0 to 59.'
  const magnitude = Math.abs(Number(d)) + minutes / 60 + seconds / 3600
  const letter = hemisphere?.[0]
  const negative = d.startsWith('-') || letter === 'S' || letter === 'W'
  if (d.startsWith('-') && (letter === 'S' || letter === 'W')) return UNREADABLE
  return {
    value: Number((negative ? -magnitude : magnitude).toFixed(6)),
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
  return { ok: true, latitude: lat.value, longitude: lon.value }
}
