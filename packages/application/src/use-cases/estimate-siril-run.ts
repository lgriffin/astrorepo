import {
  checkCalibration,
  commonImageScale,
  drizzleAdvice,
  estimateStackMemory,
  memoryFit,
  planNights,
  rejectionAdvice,
  sirilFolderFor,
  estimateSirilSpace,
  geometryFromFileSize,
  missingCalibration,
  planSirilWorkspace,
  recommendSirilScript,
  SIRIL_SCRIPTS,
  spaceVerdict,
  type CalibrationCheck,
  type CalibrationFrame,
  type DrizzleAdvice,
  type FrameCounts,
  type FrameIndexSettings,
  type MemoryFit,
  type MemoryNeed,
  type NightsPlan,
  type RejectionAdvice,
  type FrameGeometry,
  type Sensor,
  type SirilScriptId,
  type SpaceStage,
  type SpaceVerdict
} from '@astro/domain'
import type { MemoryProbe } from '../ports/memory'
import type { SirilWorkspace } from '../ports/siril-workspace'
import type { FrameSelection } from './frame-grading'

export interface EstimateSirilRunDeps {
  workspace: SirilWorkspace
  /** Grading, when wired: rejected lights are left out of the count and the space. */
  selection?: FrameSelection
  /** The PC's memory, when wired, for the memory check (ADV-001). */
  memory?: MemoryProbe
}

export interface ScriptEstimate extends SpaceVerdict {
  script: SirilScriptId
  label: string
  /** Calibration folders the script needs that this target lacks; the script fails without them. */
  missing: string[]
  /** Siril's own space for the run; the verdict's neededBytes adds what Prep for Siril must copy. */
  scriptBytes: number
  stages: SpaceStage[]
  /** Memory the stack needs and whether the PC has it (ADV-001, ADV-002); null without a frame size. */
  memory: (MemoryNeed & { fit: MemoryFit; text: string }) | null
}

/** Advice beside the stacking plan (specs/020-stacking-advice). */
export interface StackAdvice {
  /** Arc seconds per pixel most lights share; null when the headers do not say. */
  scaleArcsec: number | null
  /** With the Bayer drizzle script's extra disk over the recommended script, when both are known. */
  drizzle: DrizzleAdvice & { extraBytes: number | null }
  rejection: RejectionAdvice
  calibration: CalibrationCheck[]
  /** Each night's lights and flats, when grading is wired. */
  nights: NightsPlan | null
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
  advice: StackAdvice
}

export type EstimateSirilRun = (sourceDir: string, workDir: string) => Promise<SirilRunEstimate>

/**
 * Before anything is written: which stock Siril script fits the target's frames and how much disk
 * each needs, stage by stage, against the free space where the work area lives. Frames are counted
 * the way Prep for Siril would lay them out, so the estimate matches what Siril will see.
 */
export function makeEstimateSirilRun(deps: EstimateSirilRunDeps): EstimateSirilRun {
  return async (sourceDir, workDir) => {
    const selected = await selectFrames(deps, sourceDir)
    const rejected = selected.rejected
    const frames = selected.frames.filter(f => !selected.rejectedPaths.has(f.path))
    const placements = planSirilWorkspace(selected.frames).filter(p => !selected.rejectedPaths.has(p.from))
    const counts: FrameCounts = { lights: 0, darks: 0, flats: 0, biases: 0 }
    for (const p of placements) counts[p.folder]++

    const [details, space, prepBytes, memory] = await Promise.all([
      deps.workspace.frameDetails(frames.map(f => f.path)),
      deps.workspace.workAreaSpace(workDir),
      deps.workspace.copyBytes(placements, workDir),
      deps.memory ? deps.memory.read() : Promise.resolve(null)
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
        const need = geometry ? estimateStackMemory(s.id, counts.lights, geometry) : null
        return {
          script: s.id,
          label: s.label,
          missing: missingCalibration(s, counts),
          scriptBytes: estimate.totalBytes,
          stages: estimate.stages,
          memory: need ? { ...need, ...memoryFit(need, memory) } : null,
          ...spaceVerdict(estimate.totalBytes + prepBytes, space.freeBytes)
        }
      })
      .sort((a, b) => Number(b.script === recommended.script) - Number(a.script === recommended.script))

    const advice = await adviseStack({ deps, lights, details, placements, sensor, keptLights: counts.lights, scripts, recommended: recommended.script, allLights: lightPathsOf(await deps.workspace.listSourceFrames(sourceDir)) })

    return {
      advice,
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
 * The source folder's frames and the lights grading rejects among them. Calibration frames are
 * never graded, so never left out. `frames` holds every frame, so its layout names each light the
 * way an earlier run did; leave `rejectedPaths` out of it to get what a stack uses.
 */
export async function selectFrames(
  deps: { workspace: Pick<SirilWorkspace, 'listSourceFrames'>; selection?: FrameSelection },
  sourceDir: string
): Promise<{ frames: { path: string; name: string; imageType: string | null }[]; rejected: number; rejectedPaths: Set<string> }> {
  const all = await deps.workspace.listSourceFrames(sourceDir)
  if (!deps.selection) return { frames: all, rejected: 0, rejectedPaths: new Set() }
  const lights = planSirilWorkspace(all).filter(p => p.folder === 'lights').map(p => p.from)
  const flagged = await deps.selection.rejected(lights)
  const rejectedPaths = new Set(lights.filter(p => flagged.has(p)))
  return { frames: all, rejected: rejectedPaths.size, rejectedPaths }
}

const lightPathsOf = (frames: { path: string; name: string; imageType: string | null }[]) =>
  frames.filter(f => sirilFolderFor(f.name, f.imageType) === 'lights').map(f => f.path)

const KIND_OF = { darks: 'dark', flats: 'flat', biases: 'bias' } as const

/** Advice beside the plan: image scale, drizzle, rejection, calibration and nights. */
async function adviseStack(input: {
  deps: EstimateSirilRunDeps
  lights: { path: string; settings: FrameIndexSettings | null }[]
  details: { path: string; settings: FrameIndexSettings | null }[]
  placements: { from: string; folder: 'lights' | 'darks' | 'flats' | 'biases' }[]
  sensor: Sensor
  keptLights: number
  scripts: ScriptEstimate[]
  recommended: SirilScriptId | null
  /** Every light in the folder, rejected or not, for the nights. */
  allLights: string[]
}): Promise<StackAdvice> {
  const settingsOf = new Map(input.details.map(d => [d.path, d.settings]))
  const lightSettings = input.lights.flatMap(l => (l.settings ? [l.settings] : []))
  const calibration: CalibrationFrame[] = []
  const flats: { capturedAt: Date | null }[] = []
  for (const p of input.placements) {
    if (p.folder === 'lights') continue
    const s = settingsOf.get(p.from) ?? null
    calibration.push({ kind: KIND_OF[p.folder], exposureSec: s?.exposureSec ?? null, gain: s?.gain ?? null, sensorTempC: s?.sensorTempC ?? null, filter: s?.filter ?? null })
    if (p.folder === 'flats') flats.push({ capturedAt: s?.capturedAt ?? null })
  }
  const scaleArcsec = commonImageScale(lightSettings)
  const drizzleScript = input.scripts.find(s => s.script === 'OSC_Preprocessing_BayerDrizzle')
  const chosen = input.scripts.find(s => s.script === input.recommended)
  const nights = input.deps.selection && input.allLights.length > 0 ? planNights(await input.deps.selection.reportFor(input.allLights), flats) : null
  return {
    scaleArcsec,
    drizzle: {
      ...drizzleAdvice(input.sensor, scaleArcsec, input.keptLights),
      extraBytes: drizzleScript && chosen && chosen !== drizzleScript ? Math.max(0, drizzleScript.neededBytes - chosen.neededBytes) : null
    },
    rejection: rejectionAdvice(input.keptLights),
    calibration: checkCalibration(lightSettings, calibration),
    nights
  }
}
