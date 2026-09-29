import { reportHiddenData, type HiddenDataReport } from '@astro/domain'
import type { FrameCatalogue } from '../ports/frame-catalogue'

export interface ReportHiddenDataDeps {
  frames: FrameCatalogue
}

export type ReportHiddenData = () => Promise<HiddenDataReport>

/** The "hidden in your files" card: data that is there but not yet turned into anything. */
export function makeReportHiddenData(deps: ReportHiddenDataDeps): ReportHiddenData {
  return async () => {
    const [targets, unassigned, calibration, lightSettings] = await Promise.all([
      deps.frames.listTargetFrames(),
      deps.frames.listUnassignedLights(),
      deps.frames.listCalibrationFrames(),
      deps.frames.listLightSettings()
    ])
    return reportHiddenData({ targets, unassigned, calibration, lightSettings })
  }
}
