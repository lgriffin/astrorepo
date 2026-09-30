import {
  estimateSirilSpace,
  geometryFromFileSize,
  missingCalibration,
  planSirilWorkspace,
  recommendSirilScript,
  SIRIL_SCRIPTS,
  spaceVerdict,
  type FrameCounts,
  type FrameGeometry,
  type Sensor,
  type SirilScriptId,
  type SpaceStage,
  type SpaceVerdict
} from '@astro/domain'
import type { SirilWorkspace } from '../ports/siril-workspace'

export interface EstimateSirilRunDeps {
  workspace: SirilWorkspace
}

export interface ScriptEstimate extends SpaceVerdict {
  script: SirilScriptId
  label: string
  /** Calibration folders the script needs that this target lacks; the script fails without them. */
  missing: string[]
  /** Siril's own space for the run; the verdict adds what Prep for Siril must copy. */
  scriptBytes: number
  stages: SpaceStage[]
}

export interface SirilRunEstimate {
  counts: FrameCounts
  sensor: Sensor
  /** Read from the lights' headers, else guessed from file size (and then approximate). */
  sensorKnown: boolean
  geometry: FrameGeometry | null
  geometryApproximate: boolean
  /** Bytes Prep for Siril must copy: nothing when frames can be hard-linked on the same volume. */
  prepBytes: number
  freeBytes: number | null
  usedBytes: number
  recommended: { script: SirilScriptId | null; reason: string }
  /** Scripts for this sensor, recommended first, with what each needs and whether it fits. */
  scripts: ScriptEstimate[]
}

export type EstimateSirilRun = (sourceDir: string, workDir: string) => Promise<SirilRunEstimate>

/**
 * Before anything is written: which stock Siril script fits the target's frames and how much disk
 * each needs, stage by stage, against the free space where the work area lives. Frames are counted
 * the way Prep for Siril would lay them out, so the estimate matches what Siril will see.
 */
export function makeEstimateSirilRun(deps: EstimateSirilRunDeps): EstimateSirilRun {
  return async (sourceDir, workDir) => {
    const frames = await deps.workspace.listSourceFrames(sourceDir)
    const placements = planSirilWorkspace(frames)
    const counts: FrameCounts = { lights: 0, darks: 0, flats: 0, biases: 0 }
    for (const p of placements) counts[p.folder]++

    const [details, space] = await Promise.all([
      deps.workspace.frameDetails(frames.map(f => f.path)),
      deps.workspace.workAreaSpace(sourceDir, workDir)
    ])
    const lightPaths = new Set(placements.filter(p => p.folder === 'lights').map(p => p.from))
    const lights = details.filter(d => lightPaths.has(d.path))

    const measured = lights.find(d => d.width !== null && d.height !== null)
    const geometry: FrameGeometry | null = measured
      ? { width: measured.width ?? 0, height: measured.height ?? 0 }
      : lights.length > 0
        ? geometryFromFileSize(lights[0].sizeBytes)
        : null

    // Seestar and Vespera are colour cameras, so a frame never indexed is taken as colour.
    const known = lights.filter(d => d.colour !== null)
    const sensor: Sensor = known.length > 0 && known.every(d => d.colour === false) ? 'mono' : 'colour'

    const prepBytes = space.sameVolume ? 0 : details.reduce((n, d) => n + d.sizeBytes, 0)
    const recommended = recommendSirilScript(counts, sensor)

    const scripts: ScriptEstimate[] = SIRIL_SCRIPTS.filter(s => s.sensor === sensor)
      .map(s => {
        const estimate = geometry ? estimateSirilSpace(s.id, counts, geometry) : { totalBytes: 0, stages: [] }
        return {
          script: s.id,
          label: s.label,
          missing: missingCalibration(s, counts),
          scriptBytes: estimate.totalBytes,
          stages: estimate.stages,
          ...spaceVerdict(estimate.totalBytes + prepBytes, space.usedBytes, space.freeBytes)
        }
      })
      .sort((a, b) => Number(b.script === recommended.script) - Number(a.script === recommended.script))

    return {
      counts,
      sensor,
      sensorKnown: known.length > 0,
      geometry,
      geometryApproximate: !measured && geometry !== null,
      prepBytes,
      freeBytes: space.freeBytes,
      usedBytes: space.usedBytes,
      recommended,
      scripts
    }
  }
}
