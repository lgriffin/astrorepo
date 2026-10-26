/**
 * Polygons on the sky (specs/037-mosaic-workspace): the area of a footprint, where two footprints
 * meet, and whether a point lies inside one. Edges are great circles. The gnomonic (TAN) plane
 * about a nearby point turns great circles into straight lines, so two convex footprints are
 * clipped there exactly and the result is measured back on the sphere. Every polygon here is
 * convex, as a camera's field is, and spans well under a hemisphere.
 */

import { deprojectPosition, projectPosition } from './sky-geometry'
import type { SkyPoint, SkyPolygon } from './mosaic-workspace'

const RAD = Math.PI / 180
/** Square degrees in a steradian. */
const SQ_DEG = (180 / Math.PI) ** 2

export interface PlanePoint {
  x: number
  y: number
}

const unit = (p: SkyPoint): [number, number, number] => {
  const [ra, dec] = [p.raDeg * RAD, p.decDeg * RAD]
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]
}
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** The middle of a set of positions: their unit vectors summed and turned back into RA and Dec. */
export function centroid(points: SkyPoint[]): SkyPoint {
  const sum = points.map(unit).reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0])
  const r = Math.hypot(sum[0], sum[1], sum[2])
  if (r < 1e-12) return points[0] ?? { raDeg: 0, decDeg: 0 }
  const ra = Math.atan2(sum[1], sum[0]) / RAD
  return { raDeg: ((ra % 360) + 360) % 360, decDeg: Math.asin(Math.max(-1, Math.min(1, sum[2] / r))) / RAD }
}

/**
 * The area of a convex polygon on the sphere, in square degrees: a fan of triangles from its first
 * vertex, each measured by its spherical excess (Van Oosterom and Strackee).
 */
export function sphericalArea(vertices: SkyPoint[]): number {
  if (vertices.length < 3) return 0
  const v = vertices.map(unit)
  let excess = 0
  for (let i = 1; i < v.length - 1; i++) {
    const [a, b, c] = [v[0], v[i], v[i + 1]]
    const triple = dot(a, cross(b, c))
    excess += 2 * Math.atan2(Math.abs(triple), 1 + dot(a, b) + dot(b, c) + dot(c, a))
  }
  return excess * SQ_DEG
}

/** A polygon laid on the tangent plane about a point (x east, y north, degrees); null when a vertex is on the far side. */
export function onPlane(about: SkyPoint, polygon: SkyPolygon): PlanePoint[] | null {
  const out: PlanePoint[] = []
  for (const v of polygon.vertices) {
    const p = projectPosition(about, v)
    // Further than about 80° from the tangent point a footprint is not something one plane draws.
    if (!p || Math.hypot(p.xi, p.eta) > 5.6 / RAD) return null
    out.push({ x: p.xi, y: p.eta })
  }
  return out
}

const signedArea = (pts: PlanePoint[]) => {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const [a, b] = [pts[i], pts[(i + 1) % pts.length]]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

/** The same polygon wound anticlockwise. */
export const anticlockwise = (pts: PlanePoint[]) => (signedArea(pts) < 0 ? [...pts].reverse() : pts)

/**
 * Where two convex polygons on a plane meet (Sutherland and Hodgman), as a convex polygon wound
 * anticlockwise; empty when they do not overlap or only touch.
 */
export function clipConvex(subject: PlanePoint[], clip: PlanePoint[]): PlanePoint[] {
  let output = anticlockwise(subject)
  const edges = anticlockwise(clip)
  for (let i = 0; i < edges.length && output.length > 0; i++) {
    const [a, b] = [edges[i], edges[(i + 1) % edges.length]]
    const side = (p: PlanePoint) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    const input = output
    output = []
    for (let j = 0; j < input.length; j++) {
      const [p, q] = [input[j], input[(j + 1) % input.length]]
      const [sp, sq] = [side(p), side(q)]
      if (sp >= 0) output.push(p)
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq)
        output.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) })
      }
    }
  }
  return output.length >= 3 && Math.abs(signedArea(output)) > 1e-14 ? output : []
}

/** Whether a point lies inside a convex polygon on a plane wound anticlockwise (edges count as inside). */
export function insideConvex(p: PlanePoint, polygon: PlanePoint[]): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const [a, b] = [polygon[i], polygon[(i + 1) % polygon.length]]
    if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < -1e-12) return false
  }
  return polygon.length >= 3
}

export interface SkyIntersection {
  polygon: SkyPolygon
  areaSqDeg: number
}

/**
 * Where two convex footprints meet on the sky and its area, or null when they do not overlap.
 * Both are laid on the tangent plane about the middle of the first, clipped there and the result
 * taken back to the sphere: exact, because great circles are straight on that plane.
 */
export function intersectFootprints(a: SkyPolygon, b: SkyPolygon): SkyIntersection | null {
  const about = centroid(a.vertices)
  const [pa, pb] = [onPlane(about, a), onPlane(about, b)]
  if (!pa || !pb) return null
  const meet = clipConvex(pb, pa)
  if (meet.length === 0) return null
  const vertices = meet.map(p => deprojectPosition(about, p.x, p.y))
  const areaSqDeg = sphericalArea(vertices)
  return areaSqDeg > 0 ? { polygon: { frame: 'ICRS', vertices }, areaSqDeg } : null
}
