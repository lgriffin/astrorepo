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
import type { FrameSelection } from './frame-grading'

export interface EstimateSirilRunDeps {
  workspace: SirilWorkspace
  /** Grading, when wired: rejected lights are left out of the count and the space. */
  selection?: FrameSelection
}

export interface ScriptEstimate extends SpaceVerdict {
  script: SirilScriptId
  label: string
  /** Calibration folders the script needs that this target lacks; the script fails without them. */
  missing: string[]
  /** Siril's own space for the run; the verdict's neededBytes adds what Prep for Siril must copy. */
  scriptBytes: number
  stages: SpaceStage[]
}

export interface SirilRunEstimate {
  counts: FrameCounts
  /** Lights grading rejected, left out of the counts and the space. */
  rejectedLights: number
  sensor: Sensor
  /** Read from the lights' headers, else guessed from file size (and then approximate). */
  sensorKnown: boolean
  /** The largest lights' size, so a target with mixed frame sizes is never under-budgeted. */
  geometry: FrameGeometry | null
  /** Some lights' size is guessed from file size. */
  geometryApproximate: boolean
  /** The lights are not all one size. */
  geometryMixed: boolean
  /** Bytes Prep for Siril must copy: frames already in the work area or hard-linkable cost nothing. */
  prepBytes: number
  freeBytes: number | null
  /** What an earlier run left in the work folder's process and masters; not counted as free. */
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
    const { frames, rejected } = await selectFrames(deps, sourceDir)
    const placements = planSirilWorkspace(frames)
    const counts: FrameCounts = { lights: 0, darks: 0, flats: 0, biases: 0 }
    for (const p of placements) counts[p.folder]++

    const [details, space, prepBytes] = await Promise.all([
      deps.workspace.frameDetails(frames.map(f => f.path)),
      deps.workspace.workAreaSpace(workDir),
      deps.workspace.copyBytes(placements, workDir)
    ])
    const lightPaths = new Set(placements.filter(p => p.folder === 'lights').map(p => p.from))
    const lights = details.filter(d => lightPaths.has(d.path))

    const sizes = lights.map(d =>
      d.width !== null && d.height !== null ? { width: d.width, height: d.height } : geometryFromFileSize(d.sizeBytes)
    )
    const geometry: FrameGeometry | null =
      sizes.length > 0 ? sizes.reduce((big, g) => (g.width * g.height > big.width * big.height ? g : big)) : null

    // Seestar and Vespera are colour cameras, so a frame never indexed is taken as colour.
    const known = lights.filter(d => d.colour !== null)
    const sensor: Sensor = known.length > 0 && known.every(d => d.colour === false) ? 'mono' : 'colour'

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
          ...spaceVerdict(estimate.totalBytes + prepBytes, space.freeBytes)
        }
      })
      .sort((a, b) => Number(b.script === recommended.script) - Number(a.script === recommended.script))

    return {
      counts,
      rejectedLights: rejected,
      sensor,
      sensorKnown: known.length > 0,
      geometry,
      geometryApproximate: lights.some(d => d.width === null || d.height === null),
      geometryMixed: new Set(sizes.map(g => `${g.width}x${g.height}`)).size > 1,
      prepBytes,
      freeBytes: space.freeBytes,
      usedBytes: space.usedBytes,
      recommended,
      scripts
    }
  }
}

/**
 * The source folder's frames as a stack will use them: every frame, less the lights grading
 * rejected. Calibration frames are never graded, so never left out.
 */
export async function selectFrames(
  deps: { workspace: Pick<SirilWorkspace, 'listSourceFrames'>; selection?: FrameSelection },
  sourceDir: string
): Promise<{ frames: { path: string; name: string; imageType: string | null }[]; rejected: number }> {
  const all = await deps.workspace.listSourceFrames(sourceDir)
  if (!deps.selection) return { frames: all, rejected: 0 }
  const lights = planSirilWorkspace(all).filter(p => p.folder === 'lights').map(p => p.from)
  const rejected = await deps.selection.rejected(lights)
  return { frames: all.filter(f => !rejected.has(f.path)), rejected: lights.filter(p => rejected.has(p)).length }
}
