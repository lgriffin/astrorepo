/**
 * Placing captures on a mosaic (specs/037-mosaic-workspace, slice X2): where each solved light
 * group or master lands on a revision's panels, by the intersection of its footprint with each
 * panel's on the sky. Never by file name or nearest centre alone. Manual assignments are kept
 * apart from what is computed, so recomputing never loses them. Pure.
 */

import { rectangleOnSky, type PlannedPanel, type SkyPolygon } from './mosaic-workspace'
import { angularDistanceDeg, normaliseAngle, type SolvedField } from './sky-geometry'
import { centroid, intersectFootprints, sphericalArea } from './sky-polygons'

/**
 * A solved field's footprint: its rectangle on its own tangent plane with its up axis at minus
 * the solver's rotation. A mirrored image has its right axis to the east, so its corners are in
 * the image's own order: top left, top right, bottom right, bottom left as the image is shown.
 */
export function solvedFootprint(field: SolvedField): SkyPolygon {
  const widthDeg = (field.widthPx * field.scaleArcsec) / 3600
  const heightDeg = (field.heightPx * field.scaleArcsec) / 3600
  return rectangleOnSky({ raDeg: field.raDeg, decDeg: field.decDeg }, widthDeg, heightDeg, normaliseAngle(-field.rotationDeg), field.flipped === true)
}

/** A capture's footprint meeting one panel. */
export interface PanelIntersection {
  panelId: string
  /** Square degrees, measured on the sphere. */
  areaSqDeg: number
  /** Of the panel's area that this capture covers, 0 to 1. */
  panelCoverage: number
  /** Of the capture's own area that falls in this panel, 0 to 1. */
  captureFraction: number
}

/** A capture's part in a panel below this share of the capture is an edge brush, not an overlap. */
export const MIN_CAPTURE_FRACTION = 0.02
/**
 * A capture with at least this share of itself in one panel, and clearly more there than in the
 * next panel, is placed there without review. Panels overlap, so a capture between two can have
 * more than half of itself in each.
 */
export const AUTO_ACCEPT_FRACTION = 0.6
export const AUTO_ACCEPT_LEAD = 0.2

export interface Placement {
  intersections: PanelIntersection[]
  /** The panel most of the capture falls in; null when it meets none. */
  primary: string | null
  /** Strong: placed without review. Weak: it meets panels but no one panel clearly holds most of it. */
  strength: 'strong' | 'weak' | 'none'
  /** Every panel the footprint reaches at all, edge brushes included, so a hand placement there is no conflict. */
  reaches: string[]
}

/**
 * Every panel a footprint meets, with the area of each overlap, ordered by how much of the
 * capture each holds. One capture can meet several panels; all are kept (MO-005).
 */
export function placeFootprint(footprint: SkyPolygon, panels: PlannedPanel[]): Placement {
  const ownArea = sphericalArea(footprint.vertices)
  const intersections: PanelIntersection[] = []
  const reaches: string[] = []
  const middle = centroid(footprint.vertices)
  const reach = radiusOf(footprint, middle)
  if (ownArea > 0) {
    for (const panel of panels) {
      // Footprints whose circles do not meet cannot overlap; most panels are skipped here.
      const panelMiddle = centroid(panel.footprint.vertices)
      if (angularDistanceDeg(middle.raDeg, middle.decDeg, panelMiddle.raDeg, panelMiddle.decDeg) > reach + radiusOf(panel.footprint, panelMiddle)) continue
      const meet = intersectFootprints(panel.footprint, footprint)
      if (!meet) continue
      reaches.push(panel.id)
      const panelArea = sphericalArea(panel.footprint.vertices)
      const captureFraction = Math.min(1, meet.areaSqDeg / ownArea)
      if (captureFraction < MIN_CAPTURE_FRACTION) continue
      intersections.push({ panelId: panel.id, areaSqDeg: meet.areaSqDeg, panelCoverage: panelArea > 0 ? Math.min(1, meet.areaSqDeg / panelArea) : 0, captureFraction })
    }
  }
  intersections.sort((a, b) => b.captureFraction - a.captureFraction || a.panelId.localeCompare(b.panelId))
  const [best, next] = intersections
  const clear = best && best.captureFraction >= AUTO_ACCEPT_FRACTION && best.captureFraction - (next?.captureFraction ?? 0) >= AUTO_ACCEPT_LEAD
  return { intersections, primary: best?.panelId ?? null, strength: !best ? 'none' : clear ? 'strong' : 'weak', reaches: reaches.sort() }
}

/** How far the furthest corner of a footprint is from its middle, in degrees. */
function radiusOf(footprint: SkyPolygon, middle: { raDeg: number; decDeg: number }): number {
  return Math.max(0, ...footprint.vertices.map(v => angularDistanceDeg(middle.raDeg, middle.decDeg, v.raDeg, v.decDeg)))
}

/** What the user said about a capture: put it on a panel, or leave it out of the mosaic. */
export interface AssignmentOverride {
  captureId: string
  action: 'assign' | 'exclude'
  /** The panel it is put on; null for exclude. */
  panelId: string | null
  reason: string | null
  /** The revision it was made on, so a later revision can ask for it to be looked at again. */
  revision: number
  at: Date
}

export type ReviewState = 'accepted' | 'needs-review' | 'excluded' | 'conflict'

export interface Assignment {
  /** The panel the capture counts toward for operations; computed, or the user's. */
  panelId: string | null
  source: 'computed' | 'user-override'
  state: ReviewState
  /** Why it is not simply accepted, in a sentence. */
  note: string | null
}

/**
 * The capture's working assignment: the user's override where there is one, else the computed
 * primary panel. An override that puts a capture on a panel its footprint does not meet is kept
 * but marked a conflict (MO-009); one made on an earlier revision is shown for review (MO-010).
 */
export function assignmentOf(placement: Placement, override: AssignmentOverride | null, revision: number, panelIds: Set<string>): Assignment {
  if (override?.action === 'exclude') return { panelId: null, source: 'user-override', state: 'excluded', note: override.reason ? `Left out: ${override.reason}` : 'Left out of this mosaic.' }
  if (override?.action === 'assign' && override.panelId) {
    if (!panelIds.has(override.panelId)) {
      return { panelId: null, source: 'user-override', state: 'needs-review', note: `Put on ${override.panelId}, which revision ${revision} no longer has.` }
    }
    if (!placement.reaches.includes(override.panelId)) {
      return { panelId: override.panelId, source: 'user-override', state: 'conflict', note: `Put on ${override.panelId} by hand, but its solved footprint does not reach that panel.` }
    }
    if (override.revision !== revision) {
      return { panelId: override.panelId, source: 'user-override', state: 'needs-review', note: `Put on ${override.panelId} on revision ${override.revision}; check it still belongs there.` }
    }
    return { panelId: override.panelId, source: 'user-override', state: 'accepted', note: null }
  }
  if (placement.strength === 'strong') return { panelId: placement.primary, source: 'computed', state: 'accepted', note: null }
  if (placement.strength === 'weak') {
    const share = Math.round((placement.intersections[0]?.captureFraction ?? 0) * 100)
    const second = placement.intersections[1]
    const note = second
      ? `${share}% of it falls in ${placement.primary} and ${Math.round(second.captureFraction * 100)}% in ${second.panelId}: check which panel it belongs to.`
      : `Only ${share}% of it falls in ${placement.primary}: check which panel it belongs to.`
    return { panelId: placement.primary, source: 'computed', state: 'needs-review', note }
  }
  return { panelId: null, source: 'computed', state: 'needs-review', note: 'Its footprint meets no panel of this revision.' }
}

/** A capture whose computed primary panel would change between two revisions' panels. */
export interface PanelChange {
  captureId: string
  from: string | null
  to: string | null
}

/** Captures that would move panel, or leave the grid, if the panels changed from `before` to `after` (MO-010). */
export function panelChanges(footprints: { captureId: string; footprint: SkyPolygon }[], before: PlannedPanel[], after: PlannedPanel[]): PanelChange[] {
  const changes: PanelChange[] = []
  for (const f of footprints) {
    const [from, to] = [placeFootprint(f.footprint, before).primary, placeFootprint(f.footprint, after).primary]
    if (from !== to) changes.push({ captureId: f.captureId, from, to })
  }
  return changes
}
