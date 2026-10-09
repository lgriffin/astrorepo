/**
 * Comets (specs/026-other-rigs): an orbit read from the Minor Planet Center's one-line format,
 * where the comet is at each light's time, and the file Siril's comet registration is given. The
 * orbit is a two-body orbit around the Sun, solved with universal variables so elliptic, parabolic
 * and hyperbolic comets take the same path. The Earth's position comes from the ephemeris port;
 * everything here is arithmetic.
 */

import { daysInMonth } from './camera-raw'

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Osculating elements as the MPC publishes them: J2000 ecliptic angles, times in TT. */
export interface CometOrbit {
  /** The designation and name as written at the end of the line, for example "C/2023 A3 (Tsuchinshan-ATLAS)". */
  name: string
  perihelionAt: Date
  /** Perihelion distance, AU. */
  q: number
  e: number
  inclinationDeg: number
  /** Longitude of the ascending node, Ω. */
  nodeDeg: number
  /** Argument of perihelion, ω. */
  periDeg: number
  /** The elements' epoch, YYYY-MM-DD; null when the line gives none. */
  epoch: string | null
}

const DAY_MS = 86_400_000
/** The Gaussian gravitational constant: the Sun's √GM in AU^1.5 per day. */
export const GAUSS_K = 0.01720209895
/** The speed of light in AU per day. */
const LIGHT_AU_PER_DAY = 173.1446326846693
const OBLIQUITY_J2000 = (23.4392911 * Math.PI) / 180
/** TT minus UTC since 2017 (leap seconds plus 32.184 s). Perihelion times are TT; light times are UTC. */
export const TT_MINUS_UTC_SEC = 69.184
const RAD = Math.PI / 180

export type CometParse = { ok: true; orbit: CometOrbit } | { ok: false; error: string }

const NUMBER = '([-+]?\\d+(?:\\.\\d*)?)'
/**
 * The MPC's one-line comet format (CometEls.txt): designation, perihelion year, month and day,
 * q, e, ω, Ω, i, the epoch as YYYYMMDD, H and G, then the name. Read by its fields rather than
 * its columns, so a line whose leading spaces were lost when it was copied still reads.
 */
const MPC_LINE = new RegExp(
  `^\\s*(\\S{1,12}?)?\\s*(\\d{4})\\s+(\\d{1,2})\\s+${NUMBER}\\s+${NUMBER}\\s+${NUMBER}\\s+${NUMBER}\\s+${NUMBER}\\s+${NUMBER}(?:\\s+(\\d{8}))?(?:\\s+${NUMBER}\\s+${NUMBER})?\\s*(.*)$`
)

/** Reads one line of the MPC's comet elements, saying which part is wrong when it cannot. */
export function parseMpcComet(line: string): CometParse {
  const text = line.replace(/\s+$/, '')
  if (!text.trim()) return { ok: false, error: 'Paste the comet’s line from the Minor Planet Center’s comet elements (CometEls.txt).' }
  const m = MPC_LINE.exec(text)
  if (!m) {
    return {
      ok: false,
      error: 'This does not read as an MPC comet line: it should give the perihelion year, month and day, then q, e, the argument of perihelion, the node and the inclination.'
    }
  }
  const [, , year, month, day, q, e, peri, node, inc, epoch, , , rest] = m
  const mo = Number(month)
  const d = Number(day)
  // The day may carry a fraction (perihelion at 6 h is day .25), but its whole part must be in the month.
  if (mo < 1 || mo > 12 || d < 1 || Math.floor(d) > daysInMonth(Number(year), mo)) return { ok: false, error: `The perihelion date ${year} ${month} ${day} is not a date.` }
  const perihelionAt = new Date(Date.UTC(Number(year), mo - 1, 1) + (d - 1) * DAY_MS)
  const orbit: CometOrbit = {
    name: (rest ?? '').split(/\s{2,}/)[0].trim() || (m[1] ?? '').trim() || 'Comet',
    perihelionAt,
    q: Number(q),
    e: Number(e),
    inclinationDeg: Number(inc),
    nodeDeg: Number(node),
    periDeg: Number(peri),
    epoch: epoch ? `${epoch.slice(0, 4)}-${epoch.slice(4, 6)}-${epoch.slice(6, 8)}` : null
  }
  const wrong = orbitProblem(orbit)
  return wrong ? { ok: false, error: wrong } : { ok: true, orbit }
}

/** Why an orbit cannot be a comet's, or null when it can. */
export function orbitProblem(o: CometOrbit): string | null {
  if (!(o.q > 0) || o.q > 100) return `The perihelion distance q (${o.q}) should be a positive number of AU.`
  if (!(o.e >= 0) || o.e > 10) return `The eccentricity e (${o.e}) should be between 0 and 10.`
  if (!(o.inclinationDeg >= 0 && o.inclinationDeg <= 180)) return `The inclination (${o.inclinationDeg}°) should be between 0° and 180°.`
  for (const [label, v] of [['node', o.nodeDeg], ['argument of perihelion', o.periDeg]] as const) {
    if (!(v >= 0 && v <= 360)) return `The ${label} (${v}°) should be between 0° and 360°.`
  }
  if (Number.isNaN(o.perihelionAt.getTime())) return 'The perihelion date is not a date.'
  return null
}

/** Stumpff's c2 and c3, with their series near zero where the closed forms lose digits. */
function stumpff(z: number): { c2: number; c3: number } {
  if (z > 1e-3) {
    const s = Math.sqrt(z)
    return { c2: (1 - Math.cos(s)) / z, c3: (s - Math.sin(s)) / (s * z) }
  }
  if (z < -1e-3) {
    const s = Math.sqrt(-z)
    return { c2: (Math.cosh(s) - 1) / -z, c3: (Math.sinh(s) - s) / (s * -z) }
  }
  return { c2: 1 / 2 - z / 24 + (z * z) / 720 - (z * z * z) / 40320, c3: 1 / 6 - z / 120 + (z * z) / 5040 - (z * z * z) / 362880 }
}

/**
 * Where the comet is in the plane of its orbit, `dtDays` after perihelion: x towards perihelion,
 * y along the motion at perihelion, in AU. Kepler's equation in universal variables, solved by
 * Laguerre's method (Conway 1986), which converges from the parabolic guess for any eccentricity.
 */
export function orbitPlanePosition(q: number, e: number, dtDays: number): { x: number; y: number; r: number } {
  const alpha = (1 - e) / q
  let dt = dtDays
  if (alpha > 0) {
    // Whole revolutions change nothing; this keeps the solver near perihelion's side of the orbit.
    const period = (2 * Math.PI) / (GAUSS_K * alpha ** 1.5)
    dt -= Math.round(dt / period) * period
  }
  const target = GAUSS_K * dt
  // The parabolic solution (e χ³/6 + q χ = target) by Cardano, a good start for every orbit.
  let chi: number
  if (e < 1e-12) chi = target / q
  else {
    const p = (6 * q) / e
    const h = (-6 * target) / e
    const root = Math.sqrt((h * h) / 4 + (p * p * p) / 27)
    chi = Math.cbrt(-h / 2 + root) + Math.cbrt(-h / 2 - root)
  }
  for (let i = 0; i < 60; i++) {
    const z = alpha * chi * chi
    const { c2, c3 } = stumpff(z)
    const f = e * chi ** 3 * c3 + q * chi - target
    const f1 = q + e * chi * chi * c2
    const f2 = e * chi * (1 - z * c3)
    const disc = Math.sqrt(Math.abs(16 * f1 * f1 - 20 * f * f2))
    const step = (5 * f) / (f1 + Math.sign(f1 || 1) * disc)
    chi -= step
    if (Math.abs(step) < 1e-13 * (1 + Math.abs(chi))) break
  }
  const { c2, c3 } = stumpff(alpha * chi * chi)
  return {
    x: q - chi * chi * c2,
    y: (target - chi ** 3 * c3) * Math.sqrt((1 + e) / q),
    r: q + e * chi * chi * c2
  }
}

/** The comet's heliocentric position at a TT instant, J2000 equatorial, AU. */
export function cometHeliocentric(o: CometOrbit, ttMs: number): Vec3 {
  const { x, y } = orbitPlanePosition(o.q, o.e, (ttMs - o.perihelionAt.getTime()) / DAY_MS)
  const [cO, sO] = [Math.cos(o.nodeDeg * RAD), Math.sin(o.nodeDeg * RAD)]
  const [cw, sw] = [Math.cos(o.periDeg * RAD), Math.sin(o.periDeg * RAD)]
  const [ci, si] = [Math.cos(o.inclinationDeg * RAD), Math.sin(o.inclinationDeg * RAD)]
  const xe = (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y
  const ye = (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y
  const ze = sw * si * x + cw * si * y
  const [ce, se] = [Math.cos(OBLIQUITY_J2000), Math.sin(OBLIQUITY_J2000)]
  return { x: xe, y: ye * ce - ze * se, z: ye * se + ze * ce }
}

export interface SkyPosition {
  raDeg: number
  decDeg: number
  /** Distance from the observer, AU. */
  distanceAu: number
}

/**
 * The comet's astrometric J2000 position seen from `observer` (heliocentric, J2000 equatorial, AU)
 * at a UTC instant: the comet is taken where it was when the light now arriving left it.
 */
export function cometPosition(o: CometOrbit, at: Date, observer: Vec3): SkyPosition {
  const tt = at.getTime() + TT_MINUS_UTC_SEC * 1000
  let tau = 0
  let v: Vec3 = { x: 0, y: 0, z: 0 }
  let dist = 0
  for (let i = 0; i < 4; i++) {
    const c = cometHeliocentric(o, tt - tau * DAY_MS)
    v = { x: c.x - observer.x, y: c.y - observer.y, z: c.z - observer.z }
    dist = Math.hypot(v.x, v.y, v.z)
    tau = dist / LIGHT_AU_PER_DAY
  }
  const ra = Math.atan2(v.y, v.x) / RAD
  return { raDeg: (ra + 360) % 360, decDeg: Math.asin(v.z / dist) / RAD, distanceAu: dist }
}

/** The middle of an exposure, which is where a trailed comet's light centres. */
export function midExposure(start: Date, exposureSec: number | null): Date {
  return new Date(start.getTime() + ((exposureSec ?? 0) * 1000) / 2)
}

export interface CometMotion {
  /** Arc seconds per hour across the sky. */
  arcsecPerHour: number
  /** Direction of motion, degrees from north through east. */
  positionAngleDeg: number
  /** Hours from the first light to the last. */
  spanHours: number
  /** Arc seconds the comet moved over that span. */
  arcsec: number
}

/** The comet's motion from the first position to the last; null with fewer than two or no time between. */
export function cometMotion(points: { at: Date; raDeg: number; decDeg: number }[]): CometMotion | null {
  if (points.length < 2) return null
  const sorted = [...points].sort((a, b) => a.at.getTime() - b.at.getTime())
  const a = sorted[0]
  const b = sorted[sorted.length - 1]
  const hours = (b.at.getTime() - a.at.getTime()) / 3_600_000
  if (hours <= 0) return null
  const [d1, d2, dra] = [a.decDeg * RAD, b.decDeg * RAD, (b.raDeg - a.raDeg) * RAD]
  const cos = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(dra)
  const arcsec = (Math.acos(Math.max(-1, Math.min(1, cos))) / RAD) * 3600
  const pa = Math.atan2(Math.sin(dra) * Math.cos(d2), Math.cos(d1) * Math.sin(d2) - Math.sin(d1) * Math.cos(d2) * Math.cos(dra)) / RAD
  return { arcsecPerHour: arcsec / hours, positionAngleDeg: (pa + 360) % 360, spanHours: hours, arcsec }
}

export interface CometFramePosition {
  /** The light's name in the work area's lights folder. */
  frame: string
  /** Mid-exposure, UTC. */
  at: Date
  raDeg: number
  decDeg: number
}

const csvField = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** The positions file: one row per light, frame name, UTC date, RA and Dec in degrees, in time order. */
export function cometPositionsCsv(rows: CometFramePosition[]): string {
  const lines = [...rows]
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.frame.localeCompare(b.frame))
    .map(r => [csvField(r.frame), r.at.toISOString(), r.raDeg.toFixed(6), r.decDeg.toFixed(6)].join(','))
  return ['frame,date_utc,ra_deg,dec_deg', ...lines].join('\n') + '\n'
}

/** The positions file's name in the stack's work folder. */
export const COMET_POSITIONS_FILE = 'comet_positions.csv'
