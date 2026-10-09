import type { MosaicPlanResult, QueueSolvesResult, TargetGeometry } from '@astro/application'
import {
  fieldHeightDeg,
  fieldWidthDeg,
  formatDecDms,
  formatRaHms,
  ROTATION_TOLERANCE_DEG,
  SOLVER_LABEL,
  type MosaicNight,
  type SolvedField
} from '@astro/domain'
import type { MosaicPlanView, SolveQueuedView, TargetGeometryView } from '@shared/types'
import { formatDuration, plural } from './stacking-suggestion-presenter'

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p
const centre = (raDeg: number, decDeg: number) => `${formatRaHms(raDeg)} ${formatDecDms(decDeg)}`

/** "43′ × 76′", or degrees for a field wider than two degrees. */
export function fieldSize(widthDeg: number, heightDeg: number): string {
  if (Math.max(widthDeg, heightDeg) >= 2) return `${widthDeg.toFixed(1)}° × ${heightDeg.toFixed(1)}°`
  return `${Math.round(widthDeg * 60)}′ × ${Math.round(heightDeg * 60)}′`
}

const signed = (deg: number) => `${deg > 0 ? '+' : ''}${deg.toFixed(1)}°`

/** The target's Where it points card. */
export function toTargetGeometryView(g: TargetGeometry): TargetGeometryView {
  const solved = g.solves.filter(s => s.field)
  const failed = g.solves.length - solved.length
  const parts: string[] = []
  if (g.solves.length === 0) parts.push('No file of this target has been placed on the sky yet.')
  else parts.push(`${plural(solved.length, 'file')} placed on the sky${failed > 0 ? `, ${failed} could not be solved` : ''}.`)
  if (g.unsolved > 0) parts.push(`${plural(g.unsolved, 'file')} still to solve: one light from each folder of each night, and each master.`)

  const m = g.misfiled
  const misfiled = m
    ? `May be filed under the wrong name: ${m.far} of ${plural(m.of, 'solved file')} point ${m.nearestDeg.toFixed(1)}° or more from where the catalogue puts it, wider than their ${m.fieldDeg.toFixed(1)}° field. Check the object name in the headers, or link the files to the right target.`
    : null

  const nights = g.rotation.nights
  const note =
    nights.length < 2
      ? null
      : g.rotation.spreadDeg > ROTATION_TOLERANCE_DEG
        ? `The field turns by up to ${g.rotation.spreadDeg.toFixed(1)}° between nights. Siril registers it, but the edges of the stack will be ragged; match the camera angle to keep the full field.`
        : 'The field has the same rotation every night (a half turn from a meridian flip counts as the same).'

  const inMosaic = new Set(g.mosaic.grouping.mosaic)
  const panels = g.mosaic.grouping.panels.map(p => ({
    id: p.id,
    centre: centre(p.raDeg, p.decDeg),
    integration: formatDuration(p.integrationSec),
    lights: p.lightCount,
    nights: p.nights.length,
    otherTargets: p.targetIds.filter(id => id !== g.targetId),
    tile: p.tile,
    inMosaic: inMosaic.has(p.id)
  }))
  const mosaicCount = panels.filter(p => p.inMosaic).length
  return {
    targetId: g.targetId,
    summary: parts.join(' '),
    unsolved: g.unsolved,
    solves: g.solves.map(s => ({
      path: s.path,
      name: fileName(s.path),
      kind: s.kind,
      night: s.night,
      solved: s.field !== null,
      centre: s.field ? centre(s.field.raDeg, s.field.decDeg) : null,
      scale: s.field ? `${s.field.scaleArcsec.toFixed(2)}"/px` : null,
      rotation: s.field ? signed(s.field.rotationDeg) : null,
      field: s.field ? fieldSize(fieldWidthDeg(s.field as SolvedField), fieldHeightDeg(s.field as SolvedField)) : null,
      source: s.source === 'header' ? 'Its own headers' : SOLVER_LABEL[s.source],
      error: s.error
    })),
    misfiled,
    rotation: { nights: nights.map(n => ({ night: n.night, rotation: signed(n.rotationDeg) })), note },
    panels,
    mosaic:
      mosaicCount >= 2
        ? `${plural(mosaicCount, 'panel')} of one mosaic${g.mosaic.linkedTargetIds.length > 0 ? `, with lights filed under ${plural(g.mosaic.linkedTargetIds.length, 'other target')} linked to this one` : ''}.`
        : null,
    linkedTargetIds: g.mosaic.linkedTargetIds
  }
}

export function toSolveQueuedView(r: QueueSolvesResult): SolveQueuedView {
  return { message: r.message, queued: r.job !== null }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (night: string) => {
  const [, m, d] = night.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

/** Runs of consecutive clear nights, as "10 Oct to 24 Oct" or "2 Nov". */
export function nightRanges(nights: MosaicNight[]): string[] {
  const ranges: string[] = []
  let start: string | null = null
  let prev: string | null = null
  const close = () => {
    if (start && prev) ranges.push(start === prev ? day(start) : `${day(start)} to ${day(prev)}`)
  }
  for (const n of nights) {
    if (n.clear) {
      start ??= n.night
      prev = n.night
    } else {
      close()
      start = null
      prev = null
    }
  }
  close()
  return ranges
}

const MISSING: Record<Exclude<MosaicPlanResult['status'], 'ok'>, string> = {
  'no-target': 'That target is not in the index.',
  'no-position': 'This target has no catalogue position, so its tiles cannot be placed. Add its RA and Dec on its page.',
  'no-size': 'This target has no catalogue size, so the planner cannot tell how many panels it needs.',
  'no-field': 'No field of view is known. Pick a scope and camera from Equipment, or plate solve some of its lights.'
}

const FIELD_FROM = { request: 'the scope and camera picked', saved: 'the saved plan', solves: "this target's solved lights" } as const

/** The Sky planner's mosaic card. */
export function toMosaicPlanView(r: MosaicPlanResult): MosaicPlanView {
  if (r.status !== 'ok') {
    return {
      status: r.status,
      message: MISSING[r.status],
      targetId: 'target' in r ? r.target.id : null,
      targetName: 'target' in r ? r.target.name : null,
      summary: null,
      fitsOneField: false,
      fieldFrom: null,
      field: null,
      rotationDeg: 0,
      overlap: 0,
      saved: false,
      tiles: [],
      goalNote: null,
      nights: null
    }
  }
  const { plan, target } = r
  const size = (target.sizeArcmin ?? 0) / 60
  const summary = plan.fitsOneField
    ? `${target.name} (${fieldSize(size, size)}) fits in one ${fieldSize(plan.field.widthDeg, plan.field.heightDeg)} field, so it needs no mosaic.`
    : `${plan.columns} × ${plan.rows} panels at ${Math.round(plan.overlap * 100)}% overlap, turned ${plan.rotationDeg}°, covering ${fieldSize(plan.coverWidthDeg, plan.coverHeightDeg)} of a target ${fieldSize(size, size)} across.`
  const clear = r.nights?.filter(n => n.clear).length ?? 0
  const ranges = r.nights ? nightRanges(r.nights) : []
  return {
    status: 'ok',
    message: null,
    targetId: target.id,
    targetName: target.name,
    summary,
    fitsOneField: plan.fitsOneField,
    fieldFrom: FIELD_FROM[r.fieldFrom],
    field: plan.field,
    rotationDeg: plan.rotationDeg,
    overlap: plan.overlap,
    saved: r.saved !== null,
    tiles: plan.tiles.map(t => {
      const cover = r.tiles.find(c => c.tile === t.index)
      return {
        tile: t.index,
        row: t.row,
        column: t.column,
        ra: formatRaHms(t.raDeg),
        dec: formatDecDms(t.decDeg),
        captured: cover && cover.capturedSec > 0 ? formatDuration(cover.capturedSec) : 'Nothing yet',
        lights: cover?.lightCount ?? 0,
        needed: cover?.neededSec === null || cover?.neededSec === undefined ? null : cover.neededSec === 0 ? 'Done' : formatDuration(cover.neededSec)
      }
    }),
    goalNote:
      target.goalSec === null
        ? "Set an integration goal on the target's Stacks page to see the hours each panel needs."
        : `Each panel needs ${formatDuration(target.goalSec)} for your goal, ${formatDuration(target.goalSec * plan.tiles.length)} in all.`,
    nights: r.nights
      ? {
          clear,
          of: r.nights.length,
          ranges,
          summary:
            clear === 0
              ? `No night in the next ${r.nights.length} keeps every panel above 30° for an hour in darkness.`
              : `Every panel is above 30° for at least an hour in darkness on ${plural(clear, 'night')} of the next ${r.nights.length}.`
        }
      : null
  }
}
