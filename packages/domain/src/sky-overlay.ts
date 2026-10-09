/**
 * A coordinate grid and catalogue labels over a solved image (spec 025). Given where an image
 * points, how it is turned and how many arc seconds a pixel spans, the gnomonic (TAN) projection
 * every plate solver writes places right ascension and declination lines, and catalogued objects,
 * on the image's own pixels. Pure trigonometry; reading headers is an adapter's job.
 */

/**
 * Where a solved image points. Plate solving (spec 024) gives the same shape as its SolvedField;
 * a FITS header's WCS gives it here. Pixels are counted from the image's top-left corner as it is
 * displayed (FITS rows bottom to top), so the field's centre is at (widthPx / 2, heightPx / 2).
 */
export interface FieldGeometry {
  /** Right ascension and declination of the image centre, in degrees. */
  raDeg: number
  decDeg: number
  /** The solver's CROTA2, in degrees: for an image as seen, the angle from up to north, counter-clockwise. */
  rotationDeg: number
  /** Arc seconds per pixel. */
  scaleArcsec: number
  widthPx: number
  heightPx: number
  /** East is to the right of north, as in a mirrored image; absent means the sky as seen, east left. */
  flipped?: boolean
  /**
   * A FITS header's own transform, kept whole so unequal axis scales or skew place the grid
   * exactly: the tangent point, the displayed pixel it falls on, and the CD matrix in degrees per
   * pixel (FITS axes, y up). Absent for a plate solve, which gives only the figures above.
   */
  wcs?: { raDeg: number; decDeg: number; x: number; y: number; cd: [number, number, number, number] }
}

export interface PixelPoint {
  x: number
  y: number
}

const RAD = Math.PI / 180

/** The four numbers that turn pixel offsets into degrees on the sky (the WCS CD matrix). */
function cdMatrix(field: FieldGeometry): [number, number, number, number] {
  const s = field.scaleArcsec / 3600
  const t = field.rotationDeg * RAD
  const c1 = field.flipped ? s : -s
  return [c1 * Math.cos(t), -s * Math.sin(t), c1 * Math.sin(t), s * Math.cos(t)]
}

/** The projection a field is drawn by: the header's own, else one about the centre from the scale and rotation. */
const tangentOf = (field: FieldGeometry): NonNullable<FieldGeometry['wcs']> =>
  field.wcs ?? { raDeg: field.raDeg, decDeg: field.decDeg, x: field.widthPx / 2, y: field.heightPx / 2, cd: cdMatrix(field) }

/** Where a point on the sky falls on the image, or null when it is on the far side of the sky. */
export function skyToPixel(field: FieldGeometry, raDeg: number, decDeg: number): PixelPoint | null {
  const t = tangentOf(field)
  const a = (raDeg - t.raDeg) * RAD
  const d = decDeg * RAD
  const d0 = t.decDeg * RAD
  const cosC = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a)
  if (cosC <= 1e-6) return null
  const xi = (Math.cos(d) * Math.sin(a)) / cosC / RAD
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a)) / cosC / RAD
  const [m11, m12, m21, m22] = t.cd
  const det = m11 * m22 - m12 * m21
  const dx = (m22 * xi - m12 * eta) / det
  const dy = (-m21 * xi + m11 * eta) / det
  // FITS y runs up the image; displayed y runs down.
  return { x: t.x + dx, y: t.y - dy }
}

/** The point on the sky under a pixel. */
export function pixelToSky(field: FieldGeometry, x: number, y: number): { raDeg: number; decDeg: number } {
  const t = tangentOf(field)
  const [m11, m12, m21, m22] = t.cd
  const dx = x - t.x
  const dy = t.y - y
  const xi = (m11 * dx + m12 * dy) * RAD
  const eta = (m21 * dx + m22 * dy) * RAD
  const d0 = t.decDeg * RAD
  const rho = Math.hypot(xi, eta)
  if (rho === 0) return { raDeg: t.raDeg, decDeg: t.decDeg }
  const c = Math.atan(rho)
  const dec = Math.asin(Math.cos(c) * Math.sin(d0) + (eta * Math.sin(c) * Math.cos(d0)) / rho)
  const ra = t.raDeg * RAD + Math.atan2(xi * Math.sin(c), rho * Math.cos(d0) * Math.cos(c) - eta * Math.sin(d0) * Math.sin(c))
  return { raDeg: (((ra / RAD) % 360) + 360) % 360, decDeg: dec / RAD }
}

// ── From a FITS header ──────────────────────────────────────────────────

/**
 * The field a FITS header's world coordinate system describes, from CRVAL1/2 with either the CD
 * matrix or CDELT1/2 and CROTA2. The header's transform is kept whole, so pixels that are not
 * square or a skewed matrix still place the grid exactly; the centre, scale and rotation are
 * worked out from it for saying where the image points. Null when the header has no usable TAN
 * solution or a declination off the sky.
 */
export function overlayFieldFromWcs(header: Record<string, number | string | boolean | undefined>): FieldGeometry | null {
  const num = (k: string): number | null => (typeof header[k] === 'number' && Number.isFinite(header[k]) ? (header[k] as number) : null)
  const ctype = typeof header.CTYPE1 === 'string' ? header.CTYPE1.toUpperCase() : null
  // Other projections (SIN, ZEA…) would place the grid wrongly; TAN-SIP is TAN with small corrections.
  if (ctype !== null && !ctype.includes('TAN')) return null
  const ra = num('CRVAL1')
  const dec = num('CRVAL2')
  const width = num('NAXIS1')
  const height = num('NAXIS2')
  if (ra === null || dec === null || Math.abs(dec) > 90 || !width || !height || width <= 0 || height <= 0) return null

  let cd: [number, number, number, number] | null = null
  const cd11 = num('CD1_1')
  const cd22 = num('CD2_2')
  if (cd11 !== null || cd22 !== null) {
    cd = [cd11 ?? 0, num('CD1_2') ?? 0, num('CD2_1') ?? 0, cd22 ?? 0]
  } else {
    const c1 = num('CDELT1')
    const c2 = num('CDELT2')
    if (c1 !== null && c2 !== null) {
      const t = (num('CROTA2') ?? num('CROTA1') ?? 0) * RAD
      cd = [c1 * Math.cos(t), -c2 * Math.sin(t), c1 * Math.sin(t), c2 * Math.cos(t)]
    }
  }
  if (!cd) return null
  const det = cd[0] * cd[3] - cd[1] * cd[2]
  if (!(Math.abs(det) > 0)) return null
  const scaleDeg = Math.sqrt(Math.abs(det))
  // The sky as seen has a negative determinant (east to the left of north); positive is mirrored.
  const flipped = det > 0
  const crpix1 = num('CRPIX1') ?? (width + 1) / 2
  const crpix2 = num('CRPIX2') ?? (height + 1) / 2
  // Displayed pixel of the reference point: FITS pixel centres are whole numbers counted from 1,
  // and FITS rows run bottom to top.
  const wcs = { raDeg: ra, decDeg: dec, x: crpix1 - 0.5, y: height - crpix2 + 0.5, cd }
  const exact: FieldGeometry = { raDeg: ra, decDeg: dec, rotationDeg: 0, scaleArcsec: scaleDeg * 3600, widthPx: width, heightPx: height, flipped, wcs }
  const centre = pixelToSky(exact, width / 2, height / 2)
  // North turns across a field away from the equator, so the rotation is measured at the centre.
  const north = skyToPixel(exact, centre.raDeg, centre.decDeg + scaleDeg)
  let rotation = Math.atan2(-cd[1], cd[3]) / RAD
  if (north) {
    const along = Math.atan2(-(north.x - width / 2), -(north.y - height / 2)) / RAD
    rotation = flipped ? -along : along
  }
  return { ...exact, raDeg: centre.raDeg, decDeg: centre.decDeg, rotationDeg: rotation }
}

// ── The grid ────────────────────────────────────────────────────────────

export interface GridLine {
  kind: 'ra' | 'dec'
  valueDeg: number
  /** "5h 35m" or "+22° 30′". */
  label: string
  /** Points along the line, in displayed pixels, only where it is on the visible side of the sky. */
  points: PixelPoint[]
}

/** Declination steps in degrees, and right ascension steps in minutes of time. */
const DEC_STEPS = [1 / 60, 2 / 60, 5 / 60, 10 / 60, 15 / 60, 20 / 60, 30 / 60, 1, 2, 5, 10, 15, 30]
const RA_STEPS_MIN = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 360]

/** The smallest step that gives no more than about `lines` lines across `span`. */
function step(span: number, steps: number[], lines: number): number {
  return steps.find(s => span / s <= lines) ?? steps[steps.length - 1]
}

export function formatRa(raDeg: number): string {
  // Whole minutes of time first, so 5h 59m 40s reads 6h rather than 5h 60m.
  const totalMin = Math.round((((raDeg % 360) + 360) % 360) * 4) % (24 * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`
}

export function formatDec(decDeg: number): string {
  const sign = decDeg < 0 ? '−' : '+'
  const totalMin = Math.round(Math.abs(decDeg) * 60)
  const d = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${sign}${d}°` : `${sign}${d}° ${String(m).padStart(2, '0')}′`
}

/** Right ascension relative to the centre, in (-180, 180]. */
const relRa = (ra: number, centre: number) => {
  const r = (((ra - centre) % 360) + 540) % 360 - 180
  return r === -180 ? 180 : r
}

/**
 * Right ascension and declination lines across the field, about `lines` of each. Each line is a
 * run of points the renderer joins; it may extend past the image, which the view clips.
 */
export function gridLines(field: FieldGeometry, lines = 5): GridLine[] {
  const { widthPx: w, heightPx: h } = field
  const edge: PixelPoint[] = []
  for (let i = 0; i <= 8; i++) {
    const f = i / 8
    edge.push({ x: f * w, y: 0 }, { x: f * w, y: h }, { x: 0, y: f * h }, { x: w, y: f * h })
  }
  const sky = edge.map(p => pixelToSky(field, p.x, p.y))
  const poleIn = [90, -90].find(dec => {
    const p = skyToPixel(field, 0, dec)
    return p !== null && p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h
  })
  let decMin = Math.min(...sky.map(s => s.decDeg))
  let decMax = Math.max(...sky.map(s => s.decDeg))
  if (poleIn === 90) decMax = 90
  if (poleIn === -90) decMin = -90
  const rel = sky.map(s => relRa(s.raDeg, field.raDeg))
  const raSpan = poleIn !== undefined ? 360 : Math.max(...rel) - Math.min(...rel)
  const raFrom = poleIn !== undefined ? -180 : Math.min(...rel)

  const decStep = step(decMax - decMin, DEC_STEPS, lines)
  const raStep = step(raSpan * 4, RA_STEPS_MIN, lines) / 4
  const out: GridLine[] = []
  const samples = 48

  const firstDec = Math.ceil(decMin / decStep - 1e-9) * decStep
  for (let dec = firstDec; dec <= decMax + 1e-9; dec += decStep) {
    if (Math.abs(dec) >= 90 - 1e-9) continue
    const points: PixelPoint[] = []
    for (let i = 0; i <= samples; i++) {
      const p = skyToPixel(field, field.raDeg + raFrom + (raSpan * i) / samples, dec)
      if (p) points.push(p)
    }
    if (points.length > 1) out.push({ kind: 'dec', valueDeg: round(dec), label: formatDec(dec), points })
  }

  const centreRa = field.raDeg
  const firstRa = Math.ceil((centreRa + raFrom) / raStep - 1e-9) * raStep
  for (let ra = firstRa; ra <= centreRa + raFrom + raSpan + 1e-9; ra += raStep) {
    if (raSpan >= 360 && ra >= firstRa + 360 - 1e-9) break
    const points: PixelPoint[] = []
    const lo = Math.max(-89.9, decMin)
    const hi = Math.min(89.9, decMax)
    for (let i = 0; i <= samples; i++) {
      const p = skyToPixel(field, ra, lo + ((hi - lo) * i) / samples)
      if (p) points.push(p)
    }
    const value = (((round(ra) % 360) + 360) % 360)
    if (points.length > 1) out.push({ kind: 'ra', valueDeg: value, label: formatRa(value), points })
  }
  return out
}

const round = (v: number) => Math.round(v * 1e6) / 1e6

// ── Catalogue labels ────────────────────────────────────────────────────

export interface CatalogueObject {
  /** "M42", "NGC 7000", "IC 434". */
  designation: string
  /** A common name when it has one ("Orion Nebula"), else null. */
  name: string | null
  raDeg: number
  decDeg: number
  /** Largest extent in arc minutes; null when the catalogue does not say. */
  sizeArcmin: number | null
}

export interface PlacedObject extends CatalogueObject {
  x: number
  y: number
  /** Half the object's size, in pixels; null when its size is unknown. */
  radiusPx: number | null
}

/**
 * The catalogued objects whose centre falls inside the field, largest first, each once: an object
 * listed in two catalogues (M42 and NGC 1976) keeps the first designation given.
 */
export function objectsInField(field: FieldGeometry, objects: CatalogueObject[]): PlacedObject[] {
  const placed: PlacedObject[] = []
  const seen: PixelPoint[] = []
  for (const o of objects) {
    const p = skyToPixel(field, o.raDeg, o.decDeg)
    if (!p || p.x < 0 || p.y < 0 || p.x > field.widthPx || p.y > field.heightPx) continue
    // The same object under another catalogue's number lands on the same spot.
    if (seen.some(s => Math.hypot(s.x - p.x, s.y - p.y) < 2)) continue
    seen.push(p)
    placed.push({ ...o, x: p.x, y: p.y, radiusPx: o.sizeArcmin !== null ? (o.sizeArcmin * 30) / field.scaleArcsec : null })
  }
  return placed.sort((a, b) => (b.sizeArcmin ?? 0) - (a.sizeArcmin ?? 0))
}

export interface SkyOverlay {
  grid: GridLine[]
  objects: PlacedObject[]
}

/** The grid and labels for a field, scaled to an image drawn `scale` times its size (a preview). */
export function skyOverlay(field: FieldGeometry, objects: CatalogueObject[], scale = 1): SkyOverlay {
  const at = (p: PixelPoint) => ({ x: p.x * scale, y: p.y * scale })
  return {
    grid: gridLines(field).map(l => ({ ...l, points: l.points.map(at) })),
    objects: objectsInField(field, objects).map(o => ({ ...o, ...at(o), radiusPx: o.radiusPx === null ? null : o.radiusPx * scale }))
  }
}
