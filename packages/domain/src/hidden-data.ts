import { observingNightOf } from './observing-night'
import { unstackedSubs } from './discovery'
import type { DuplicateReport, QuarantinedFile } from './ingest'
import { totalSec, type TargetFrames } from './stacking-readiness'

/** A light sub that no target claims yet. */
export interface UnassignedLight {
  exposureSec: number
  capturedAt: Date | null
  /** The folder it sits in, which is often the best hint to what it shows. */
  folder: string | null
  objectName: string | null
  /** True when quality analysis flagged the sub for rejection. */
  rejected: boolean
}

export type CalibrationKind = 'dark' | 'flat' | 'bias'

/** Acquisition settings of a frame. Null means the header did not say. */
export interface FrameSettings {
  exposureSec: number | null
  gain: number | null
  sensorTempC: number | null
  filter: string | null
}

export interface CalibrationFrame extends FrameSettings {
  kind: CalibrationKind
}

/** One distinct combination of light-frame settings and how many lights used it. */
export interface LightSetting extends FrameSettings {
  count: number
}

export interface CalibrationMatchPolicy {
  /** How far a dark's sensor temperature may be from the lights' and still calibrate them. */
  darkTempToleranceC: number
  /** How far a dark's exposure may be from the lights'. */
  darkExposureToleranceSec: number
}

export const DEFAULT_CALIBRATION_MATCH: CalibrationMatchPolicy = {
  darkTempToleranceC: 2,
  darkExposureToleranceSec: 1
}

export interface OrphanCalibrationGroup extends FrameSettings {
  kind: CalibrationKind
  count: number
}

export interface HiddenDataReport {
  /** Targets with nights of subs that no stack includes yet. */
  neverStacked: { targetId: string; targetName: string; nights: number; integrationSec: number }[]
  unstackedNights: number
  unstackedSec: number
  unassigned: {
    subCount: number
    integrationSec: number
    nights: number
    byFolder: { folder: string; subCount: number; integrationSec: number }[]
  }
  orphanCalibration: OrphanCalibrationGroup[]
  /** Rejected subs across targets, plus rejected subs no target claims yet (`unassigned`). */
  rejected: { subCount: number; integrationSec: number; targets: number; unassigned: number }
  /** Files the scanner could not read, with the first few reasons. */
  quarantined: { count: number; examples: QuarantinedFile[] }
  /** Identical files found at more than one path, from the last duplicate check. */
  duplicates: { files: number; reclaimableBytes: number; groups: number }
}

/** How many quarantined files the report names individually. */
export const QUARANTINE_EXAMPLES = 3

/** Unknown on either side is not a mismatch: a missing header should not orphan a frame. */
const near = (a: number | null, b: number | null, tolerance: number) => a === null || b === null || Math.abs(a - b) <= tolerance
const sameText = (a: string | null, b: string | null) =>
  !a?.trim() || !b?.trim() || a.trim().toLowerCase() === b.trim().toLowerCase()

/** Whether a calibration frame could calibrate lights taken with these settings. */
export function calibrates(frame: CalibrationFrame, light: FrameSettings, policy = DEFAULT_CALIBRATION_MATCH): boolean {
  switch (frame.kind) {
    case 'dark':
      return (
        near(frame.gain, light.gain, 0) &&
        near(frame.sensorTempC, light.sensorTempC, policy.darkTempToleranceC) &&
        near(frame.exposureSec, light.exposureSec, policy.darkExposureToleranceSec)
      )
    case 'flat':
      return sameText(frame.filter, light.filter)
    case 'bias':
      return near(frame.gain, light.gain, 0)
  }
}

const settingsKey = (f: CalibrationFrame) =>
  [f.kind, f.exposureSec ?? '-', f.gain ?? '-', f.sensorTempC === null ? '-' : Math.round(f.sensorTempC), f.filter?.trim() || '-'].join('|')

/** Calibration frames that match no lights at all, grouped by their settings. */
export function findOrphanCalibration(
  calibration: CalibrationFrame[],
  lights: LightSetting[],
  policy = DEFAULT_CALIBRATION_MATCH
): OrphanCalibrationGroup[] {
  const groups = new Map<string, OrphanCalibrationGroup>()
  for (const frame of calibration) {
    if (lights.some(l => calibrates(frame, l, policy))) continue
    const key = settingsKey(frame)
    const g = groups.get(key) ?? {
      kind: frame.kind,
      exposureSec: frame.exposureSec,
      gain: frame.gain,
      sensorTempC: frame.sensorTempC === null ? null : Math.round(frame.sensorTempC),
      filter: frame.filter?.trim() || null,
      count: 0
    }
    g.count += 1
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
}

/**
 * What is sitting in the files unnoticed: nights never stacked, subs with no target, calibration
 * frames that match no lights, subs quality analysis rejected, files that could not be read and
 * duplicate copies. Pure: no I/O, no clock.
 */
export function reportHiddenData(input: {
  targets: TargetFrames[]
  unassigned: UnassignedLight[]
  calibration: CalibrationFrame[]
  lightSettings: LightSetting[]
  quarantined?: QuarantinedFile[]
  duplicates?: DuplicateReport
  policy?: CalibrationMatchPolicy
}): HiddenDataReport {
  const neverStacked: HiddenDataReport['neverStacked'] = []
  let rejectedSubs = 0
  let rejectedSec = 0
  let rejectedTargets = 0

  for (const t of input.targets) {
    const pending = unstackedSubs(t)
    const nights = new Set(pending.flatMap(s => (s.capturedAt ? [observingNightOf(s.capturedAt)] : [])))
    if (nights.size > 0) {
      neverStacked.push({ targetId: t.targetId, targetName: t.targetName, nights: nights.size, integrationSec: totalSec(pending) })
    }
    const rejected = t.subs.filter(s => s.rejected)
    if (rejected.length > 0) {
      rejectedSubs += rejected.length
      rejectedSec += totalSec(rejected)
      rejectedTargets += 1
    }
  }
  neverStacked.sort((a, b) => b.integrationSec - a.integrationSec || a.targetName.localeCompare(b.targetName))

  const byFolder = new Map<string, { folder: string; subCount: number; integrationSec: number }>()
  const unassignedNights = new Set<string>()
  let rejectedUnassigned = 0
  for (const u of input.unassigned) {
    if (u.rejected) {
      rejectedUnassigned += 1
      rejectedSubs += 1
      rejectedSec += u.exposureSec
    }
    const folder = u.folder?.trim() || u.objectName?.trim() || 'Unknown folder'
    const f = byFolder.get(folder) ?? { folder, subCount: 0, integrationSec: 0 }
    f.subCount += 1
    f.integrationSec += u.exposureSec
    byFolder.set(folder, f)
    if (u.capturedAt) unassignedNights.add(observingNightOf(u.capturedAt))
  }

  return {
    neverStacked,
    unstackedNights: neverStacked.reduce((n, t) => n + t.nights, 0),
    unstackedSec: neverStacked.reduce((n, t) => n + t.integrationSec, 0),
    unassigned: {
      subCount: input.unassigned.length,
      integrationSec: input.unassigned.reduce((n, u) => n + u.exposureSec, 0),
      nights: unassignedNights.size,
      byFolder: [...byFolder.values()].sort((a, b) => b.integrationSec - a.integrationSec || a.folder.localeCompare(b.folder))
    },
    orphanCalibration: findOrphanCalibration(input.calibration, input.lightSettings, input.policy),
    rejected: { subCount: rejectedSubs, integrationSec: rejectedSec, targets: rejectedTargets, unassigned: rejectedUnassigned },
    quarantined: {
      count: input.quarantined?.length ?? 0,
      examples: [...(input.quarantined ?? [])].sort((a, b) => a.path.localeCompare(b.path)).slice(0, QUARANTINE_EXAMPLES)
    },
    duplicates: {
      files: input.duplicates?.duplicateFiles ?? 0,
      reclaimableBytes: input.duplicates?.reclaimableBytes ?? 0,
      groups: input.duplicates?.groups.length ?? 0
    }
  }
}
