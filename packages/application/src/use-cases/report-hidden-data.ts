import { groupDuplicates, reportHiddenData, type HiddenDataReport } from '@astro/domain'
import type { FileHashStore } from '../ports/file-hashing'
import type { FrameCatalogue } from '../ports/frame-catalogue'

export interface ReportHiddenDataDeps {
  frames: FrameCatalogue
  /** Duplicates come from stored hashes only; opening the cockpit never reads files. */
  hashes: FileHashStore
}

export type ReportHiddenData = () => Promise<HiddenDataReport>

/** The "hidden in your files" card: data that is there but not yet turned into anything. */
export function makeReportHiddenData(deps: ReportHiddenDataDeps): ReportHiddenData {
  return async () => {
    const [targets, unassigned, calibration, lightSettings, quarantined, hashes] = await Promise.all([
      deps.frames.listTargetFrames(),
      deps.frames.listUnassignedLights(),
      deps.frames.listCalibrationFrames(),
      deps.frames.listLightSettings(),
      deps.frames.listQuarantinedFiles(),
      deps.hashes.listHashes()
    ])
    return reportHiddenData({ targets, unassigned, calibration, lightSettings, quarantined, duplicates: groupDuplicates(hashes) })
  }
}
