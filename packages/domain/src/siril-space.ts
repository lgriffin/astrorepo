/**
 * How much disk Siril's stock preprocessing scripts need, stage by stage, and which script fits a
 * target's frames. The stage sizes follow Leigh's Siril space estimator
 * (github.com/lgriffin/Siril_Scripts, utilities/space_estimator.py): every intermediate file is
 * assumed kept, so the figures are the worst case.
 */

import type { SirilFolder } from './ingest'

export type SirilScriptId =
  | 'OSC_Preprocessing'
  | 'OSC_Preprocessing_WithoutFlat'
  | 'OSC_Preprocessing_WithoutDBF'
  | 'OSC_Preprocessing_BayerDrizzle'
  | 'OSC_Extract_Ha'
  | 'OSC_Extract_HaOIII'
  | 'Mono_Preprocessing'

export type Sensor = 'colour' | 'mono'
type Calibration = Exclude<SirilFolder, 'lights'>

export interface SirilScript {
  id: SirilScriptId
  label: string
  sensor: Sensor
  /** Calibration folders the script reads; it fails without them. */
  needs: Calibration[]
}

export const SIRIL_SCRIPTS: SirilScript[] = [
  { id: 'OSC_Preprocessing', label: 'Colour, with biases, flats and darks', sensor: 'colour', needs: ['biases', 'flats', 'darks'] },
  { id: 'OSC_Preprocessing_WithoutFlat', label: 'Colour, darks only', sensor: 'colour', needs: ['darks'] },
  { id: 'OSC_Preprocessing_WithoutDBF', label: 'Colour, no calibration frames', sensor: 'colour', needs: [] },
  { id: 'OSC_Preprocessing_BayerDrizzle', label: 'Colour, Bayer drizzle', sensor: 'colour', needs: ['biases', 'flats', 'darks'] },
  { id: 'OSC_Extract_Ha', label: 'Colour, Ha extracted (dual-band)', sensor: 'colour', needs: ['biases', 'flats', 'darks'] },
  { id: 'OSC_Extract_HaOIII', label: 'Colour, Ha and OIII extracted (dual-band)', sensor: 'colour', needs: ['biases', 'flats', 'darks'] },
  { id: 'Mono_Preprocessing', label: 'Mono, with biases, flats and darks', sensor: 'mono', needs: ['biases', 'flats', 'darks'] }
]

export type FrameCounts = Record<SirilFolder, number>

export interface FrameGeometry {
  width: number
  height: number
}

export interface SpaceStage {
  name: string
  bytes: number
  cumulativeBytes: number
  files: number
}

export interface SpaceEstimate {
  script: SirilScriptId
  totalBytes: number
  stages: SpaceStage[]
}

/** Stage sizes for one script. 16-bit mono after convert; 32-bit after calibrate, mono or RGB. */
export function estimateSirilSpace(script: SirilScriptId, counts: FrameCounts, geometry: FrameGeometry): SpaceEstimate {
  const px = geometry.width * geometry.height
  const mono16 = px * 2
  const mono32 = px * 4
  const rgb32 = px * 12
  const stages: SpaceStage[] = []
  let total = 0
  const add = (name: string, bytes: number, files: number) => {
    total += bytes
    stages.push({ name, bytes, cumulativeBytes: total, files })
  }
  const { biases: nb, flats: nf, darks: nd, lights: nl } = counts
  const masters = () => {
    if (nb > 0) {
      add('Convert biases', nb * mono16, nb)
      add('Stack biases (master)', mono32, 1)
    }
    if (nf > 0) {
      add('Convert flats', nf * mono16, nf)
      add('Calibrate flats', nf * mono32, nf)
      add('Stack flats (master)', mono32, 1)
    }
    if (nd > 0) {
      add('Convert darks', nd * mono16, nd)
      add('Stack darks (master)', mono32, 1)
    }
  }

  switch (script) {
    case 'OSC_Preprocessing':
      masters()
      add('Convert lights', nl * mono16, nl)
      add('Calibrate lights (debayer)', nl * rgb32, nl)
      add('Register lights', nl * rgb32, nl)
      add('Stack result (32-bit RGB)', rgb32, 1)
      add('Save final', rgb32, 1)
      break
    case 'Mono_Preprocessing':
      masters()
      add('Convert lights', nl * mono16, nl)
      add('Calibrate lights', nl * mono32, nl)
      add('Register lights', nl * mono32, nl)
      add('Stack result (32-bit)', mono32, 1)
      add('Save final', mono32, 1)
      break
    case 'OSC_Preprocessing_WithoutFlat':
      if (nd > 0) {
        add('Convert darks', nd * mono16, nd)
        add('Stack darks', mono32, 1)
      }
      add('Convert lights', nl * mono16, nl)
      add('Calibrate lights (debayer)', nl * rgb32, nl)
      add('Register lights', nl * rgb32, nl)
      add('Stack result', rgb32, 1)
      break
    case 'OSC_Preprocessing_WithoutDBF':
      add('Convert lights', nl * mono16, nl)
      add('Calibrate lights (debayer)', nl * rgb32, nl)
      add('Register lights', nl * rgb32, nl)
      add('Stack result', rgb32, 1)
      break
    case 'OSC_Preprocessing_BayerDrizzle':
      masters()
      add('Convert lights', nl * mono16, nl)
      add('Calibrate lights (CFA)', nl * mono32, nl)
      add('Register (Bayer drizzle)', nl * rgb32, nl)
      add('Stack result (32-bit RGB)', rgb32, 1)
      add('Save final', rgb32, 1)
      break
    case 'OSC_Extract_Ha':
      masters()
      add('Convert lights', nl * mono16, nl)
      add('Calibrate lights (CFA)', nl * mono32, nl)
      add('Extract Ha (upscale)', nl * mono32, nl)
      add('Register Ha', nl * mono32, nl)
      add('Stack Ha (32-bit)', mono32, 1)
      add('Save final', mono32, 1)
      break
    case 'OSC_Extract_HaOIII':
      masters()
      add('Convert lights', nl * mono16, nl)
      add('Calibrate lights (CFA)', nl * mono32, nl)
      add('Extract Ha + OIII', nl * mono32 * 2, nl)
      add('Register Ha', nl * mono32, nl)
      add('Stack Ha (32-bit)', mono32, 1)
      add('Register OIII', nl * mono32, nl)
      add('Stack OIII (32-bit)', mono32, 1)
      add('Align + normalize results', mono32 * 4, 1)
      break
  }
  return { script, totalBytes: total, stages }
}

/**
 * Frame size from a FITS file's bytes when its header was never indexed: a 16-bit frame holds
 * two bytes a pixel, taken as square. Good to the frame count's order of magnitude, not better.
 */
export function geometryFromFileSize(sizeBytes: number): FrameGeometry {
  const side = Math.max(1, Math.round(Math.sqrt(sizeBytes / 2)))
  return { width: side, height: side }
}

const LIST = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/** Calibration folders a script needs that the target does not have. */
export function missingCalibration(script: SirilScript, counts: FrameCounts): Calibration[] {
  return script.needs.filter(c => counts[c] === 0)
}

export interface ScriptChoice {
  script: SirilScriptId | null
  reason: string
}

/**
 * The stock script that uses as much of the target's calibration as Siril's scripts allow. Mono
 * has one script, which needs all three calibration sets; colour falls back to darks only, then
 * to lights only, saying which frames are left out.
 */
export function recommendSirilScript(counts: FrameCounts, sensor: Sensor): ScriptChoice {
  if (counts.lights === 0) return { script: null, reason: 'There are no light frames to stack.' }
  const have = (['biases', 'flats', 'darks'] as const).filter(c => counts[c] > 0)
  if (sensor === 'mono') {
    const missing = (['biases', 'flats', 'darks'] as const).filter(c => counts[c] === 0)
    return missing.length === 0
      ? { script: 'Mono_Preprocessing', reason: 'Mono frames with biases, flats and darks.' }
      : { script: null, reason: `Siril's mono script needs biases, flats and darks; there are no ${LIST(missing)}.` }
  }
  if (have.length === 3) return { script: 'OSC_Preprocessing', reason: 'Colour frames with biases, flats and darks.' }
  const unused = have.filter(c => c !== 'darks')
  const leftOut = unused.length > 0 ? ` Siril's scripts use ${LIST(unused)} only with all three sets, so they are left out.` : ''
  if (counts.darks > 0) return { script: 'OSC_Preprocessing_WithoutFlat', reason: `Colour frames with darks.${leftOut}` }
  return { script: 'OSC_Preprocessing_WithoutDBF', reason: `Colour frames with no darks.${leftOut}`.trim() }
}

export interface SpaceVerdict {
  /** What the run still needs once what its folders already hold is counted. */
  netBytes: number
  fits: boolean
  /** Free space left after the run, or how much is missing; null when free space is unknown. */
  headroomBytes: number | null
  shortBytes: number | null
}

/** Whether a run fits in the free space, crediting what is already in its process and masters folders. */
export function spaceVerdict(neededBytes: number, alreadyUsedBytes: number, freeBytes: number | null): SpaceVerdict {
  const netBytes = Math.max(0, neededBytes - alreadyUsedBytes)
  if (freeBytes === null) return { netBytes, fits: true, headroomBytes: null, shortBytes: null }
  return netBytes <= freeBytes
    ? { netBytes, fits: true, headroomBytes: freeBytes - netBytes, shortBytes: null }
    : { netBytes, fits: false, headroomBytes: null, shortBytes: netBytes - freeBytes }
}
