/**
 * Advice for a stack before it runs: will it fit in memory, is it worth drizzling, which
 * rejection suits the number of frames, why calibration frames do or do not match, how the nights
 * compare, and which filter a target is short of. SyQon Studio's Fusion Stack manual explains
 * these choices; here they become plain suggestions beside Siril's stock scripts. Pure rules.
 */

import { calibrates, type CalibrationFrame, type CalibrationKind, type FrameSettings } from './hidden-data'
import { observingNightOf } from './observing-night'
import type { FrameGeometry, Sensor, SirilScriptId } from './siril-space'
import { usableSubs, type TargetFrames } from './stacking-readiness'
import type { GradeReport } from './frame-grading'

const GB = 1024 ** 3
const LIST = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/** What the index knows about a frame's capture, beyond its size. Null fields: the header did not say. */
export interface FrameIndexSettings extends FrameSettings {
  capturedAt: Date | null
  /** FOCALLEN, in millimetres. */
  focalMm: number | null
  /** XPIXSZ, in micrometres. */
  pixelUm: number | null
  /** TELESCOP, else INSTRUME. */
  scope: string | null
}

// ── Image scale ─────────────────────────────────────────────────────────

/** Arc seconds per pixel from the focal length and pixel size; null when either is unknown. */
export function imageScaleArcsec(focalMm: number | null, pixelUm: number | null): number | null {
  if (!focalMm || !pixelUm || focalMm <= 0 || pixelUm <= 0) return null
  return (206.265 * pixelUm) / focalMm
}

/** The scale most of the lights share, rounded to two places; null when none says. */
export function commonImageScale(lights: FrameIndexSettings[]): number | null {
  const counts = new Map<number, number>()
  for (const l of lights) {
    const s = imageScaleArcsec(l.focalMm, l.pixelUm)
    if (s !== null) counts.set(Math.round(s * 100) / 100, (counts.get(Math.round(s * 100) / 100) ?? 0) + 1)
  }
  let best: number | null = null
  for (const [scale, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = scale
  return best
}

// ── Memory ──────────────────────────────────────────────────────────────

export interface MemoryNeed {
  /** Every light's pixels held at once as 32-bit floats: Siril integrates in a single pass. */
  onePassBytes: number
  /** The least Siril can integrate with, in blocks of rows, plus registering one frame. */
  minimumBytes: number
}

/** Rows each block holds at the least, so blocks stay worth reading. */
const MIN_BLOCK_ROWS = 32
/** Siril and the system around it. */
const BASE_BYTES = 0.5 * GB

/** Channels a script integrates: colour scripts debayer to three, mono and extraction scripts one. */
export function stackChannels(script: SirilScriptId): number {
  return script === 'Mono_Preprocessing' || script === 'OSC_Extract_Ha' || script === 'OSC_Extract_HaOIII' ? 1 : 3
}

/**
 * Memory a stack needs, from the geometry and the lights it will use. Extraction scripts upscale
 * the one channel back to the full frame, so they count the full geometry too.
 */
export function estimateStackMemory(script: SirilScriptId, lights: number, geometry: FrameGeometry): MemoryNeed {
  const channels = stackChannels(script)
  const frame = geometry.width * geometry.height * 4 * channels
  return {
    onePassBytes: BASE_BYTES + lights * frame + 2 * frame,
    minimumBytes: BASE_BYTES + Math.max(4 * frame, lights * geometry.width * 4 * channels * MIN_BLOCK_ROWS + 2 * frame)
  }
}

export interface MachineMemory {
  totalBytes: number
  /** Memory free for a new program right now. */
  availableBytes: number
}

export type MemoryFit = 'one-pass' | 'blocks' | 'short' | 'unknown'

/** Siril uses this share of available memory by default (its "memory ratio"). */
export const SIRIL_MEMORY_RATIO = 0.9

/**
 * Whether the stack fits in memory. The night run window usually finds the PC idle, so the
 * verdict compares against the total as well: a stack that only fits once other programs close
 * says so instead of failing outright.
 */
export function memoryFit(need: MemoryNeed, memory: MachineMemory | null): { fit: MemoryFit; text: string } {
  const gb = (b: number) => `${(b / GB).toFixed(b < 10 * GB ? 1 : 0)} GB`
  if (!memory) return { fit: 'unknown', text: `Needs ${gb(need.onePassBytes)} to stack in one pass; the PC did not say how much memory it has.` }
  const usable = memory.availableBytes * SIRIL_MEMORY_RATIO
  if (need.onePassBytes <= usable) return { fit: 'one-pass', text: `Fits in memory: ${gb(need.onePassBytes)} of ${gb(memory.availableBytes)} free.` }
  if (need.minimumBytes <= usable) {
    return { fit: 'blocks', text: `Siril will stack in blocks, which is slower: ${gb(need.onePassBytes)} for one pass, ${gb(memory.availableBytes)} free.` }
  }
  const closing = need.minimumBytes <= memory.totalBytes * SIRIL_MEMORY_RATIO ? ' Close other programs, or let it run in the night window.' : ' Stack fewer lights at a time, by night.'
  return { fit: 'short', text: `Short of memory: needs at least ${gb(need.minimumBytes)}, ${gb(memory.availableBytes)} free of ${gb(memory.totalBytes)}.${closing}` }
}

// ── Drizzle ─────────────────────────────────────────────────────────────

/** Coarser than this, stars span too few pixels and drizzle recovers detail. */
export const DRIZZLE_SCALE_ARCSEC = 2
/** Drizzle needs many dithered frames to fill its finer grid. */
export const DRIZZLE_MIN_LIGHTS = 100

export interface DrizzleAdvice {
  suggest: boolean
  reason: string
}

/**
 * Whether Siril's Bayer drizzle script is worth it. Drizzle changes the sampling, not the noise:
 * it needs undersampled stars and many dithered frames, and costs disk and time.
 */
export function drizzleAdvice(sensor: Sensor, scaleArcsec: number | null, keptLights: number): DrizzleAdvice {
  if (sensor !== 'colour') return { suggest: false, reason: "Siril's stock drizzle script is for colour cameras." }
  if (scaleArcsec === null) return { suggest: false, reason: 'The lights do not record focal length and pixel size, so the image scale is unknown.' }
  const scale = `${scaleArcsec.toFixed(2)}"/px`
  if (scaleArcsec < DRIZZLE_SCALE_ARCSEC) return { suggest: false, reason: `At ${scale} the stars are already well sampled; drizzle would add disk and time for little.` }
  if (keptLights < DRIZZLE_MIN_LIGHTS) {
    return { suggest: false, reason: `At ${scale} drizzle could help, but ${keptLights} lights are too few to fill its finer grid; it pays from about ${DRIZZLE_MIN_LIGHTS}, dithered.` }
  }
  return { suggest: true, reason: `At ${scale} the stars are undersampled and ${keptLights} lights are enough: Bayer drizzle can recover finer detail, if the frames were dithered.` }
}

// ── Rejection ───────────────────────────────────────────────────────────

export interface RejectionAdvice {
  method: string
  /** The rejection part of Siril's stack command. */
  siril: string
  reason: string
}

/** The rejection that suits the number of kept lights, as Siril's documentation advises. */
export function rejectionAdvice(keptLights: number): RejectionAdvice {
  if (keptLights < 3) return { method: 'None', siril: 'rej n', reason: 'With fewer than three lights there is nothing to compare a pixel against.' }
  if (keptLights < 10) return { method: 'Percentile clipping', siril: 'rej p 0.2 0.1', reason: 'Under ten lights, sigma statistics are unreliable; percentile clipping works from the median.' }
  if (keptLights < 50) return { method: 'Winsorized sigma clipping', siril: 'rej w 3 3', reason: 'From ten lights, Winsorized sigma clipping removes satellites and planes without eating signal.' }
  return { method: 'Generalized extreme studentized deviate', siril: 'rej g 0.3 0.05', reason: 'From fifty lights, GESDT finds every outlier in a pixel stack, not just the worst.' }
}

// ── Calibration ─────────────────────────────────────────────────────────

/** Scopes that subtract darks themselves, so their lights need no calibration frames. */
export function calibratesOnBoard(scope: string | null): boolean {
  return /seestar/i.test(scope ?? '')
}

export type CalibrationStatus = 'matches' | 'mismatch' | 'none' | 'not-needed'

export interface CalibrationCheck {
  kind: CalibrationKind
  status: CalibrationStatus
  count: number
  /** For a mismatch: each light setting no frame of this kind calibrates, with the nearest frame's differences. */
  gaps: { light: FrameSettings; mismatches: string[] }[]
  text: string
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** How a calibration frame differs from a light's settings, in words. */
export function calibrationMismatches(frame: CalibrationFrame, light: FrameSettings): string[] {
  const out: string[] = []
  const differs = (a: number | null, b: number | null, tolerance: number) => a !== null && b !== null && Math.abs(a - b) > tolerance
  if (frame.kind === 'dark' && differs(frame.sensorTempC, light.sensorTempC, 2)) {
    out.push(`sensor at ${fmt(frame.sensorTempC as number)} °C against the lights' ${fmt(light.sensorTempC as number)} °C`)
  }
  if (frame.kind === 'dark' && differs(frame.exposureSec, light.exposureSec, 1)) {
    out.push(`${fmt(frame.exposureSec as number)} s exposures against the lights' ${fmt(light.exposureSec as number)} s`)
  }
  if ((frame.kind === 'dark' || frame.kind === 'bias') && differs(frame.gain, light.gain, 0)) {
    out.push(`gain ${fmt(frame.gain as number)} against the lights' ${fmt(light.gain as number)}`)
  }
  if (frame.kind === 'flat' && frame.filter?.trim() && light.filter?.trim() && frame.filter.trim().toLowerCase() !== light.filter.trim().toLowerCase()) {
    out.push(`filter ${frame.filter.trim()} against the lights' ${light.filter.trim()}`)
  }
  return out
}

const KIND_NAME: Record<CalibrationKind, string> = { dark: 'darks', flat: 'flats', bias: 'biases' }

/**
 * Whether each kind of calibration frame in a stack's folder matches its lights, and when not,
 * the nearest frame and what differs. Siril's stock scripts use every frame in the folder whether
 * it matches or not, so a mismatch is worth a warning even though the script will run.
 */
export function checkCalibration(lights: FrameIndexSettings[], frames: CalibrationFrame[]): CalibrationCheck[] {
  const onBoard = lights.length > 0 && lights.every(l => calibratesOnBoard(l.scope))
  const settings = new Map<string, FrameSettings>()
  for (const l of lights) {
    const key = [l.exposureSec, l.gain, l.sensorTempC === null ? null : Math.round(l.sensorTempC), l.filter?.trim().toLowerCase() ?? null].join('|')
    if (!settings.has(key)) settings.set(key, { exposureSec: l.exposureSec, gain: l.gain, sensorTempC: l.sensorTempC, filter: l.filter })
  }
  return (['dark', 'flat', 'bias'] as const).map(kind => {
    const own = frames.filter(f => f.kind === kind)
    if (own.length === 0) {
      return onBoard
        ? { kind, status: 'not-needed', count: 0, gaps: [], text: `No ${KIND_NAME[kind]} needed: the Seestar calibrates its frames on board.` }
        : { kind, status: 'none', count: 0, gaps: [], text: `No ${KIND_NAME[kind]} in this folder.` }
    }
    const gaps = [...settings.values()]
      .filter(light => !own.some(f => calibrates(f, light)))
      .map(light => {
        const nearest = own
          .map(f => ({ f, m: calibrationMismatches(f, light) }))
          .sort((a, b) => a.m.length - b.m.length)[0]
        return { light, mismatches: nearest.m }
      })
    if (gaps.length === 0) {
      // Siril's stock scripts use every frame in the folder, so one that suits no light still goes in.
      // Lights with no settings read give nothing to compare against.
      const strays = settings.size === 0 ? [] : own.filter(f => ![...settings.values()].some(light => calibrates(f, light)))
      if (strays.length === 0) return { kind, status: 'matches', count: own.length, gaps, text: `${own.length} ${KIND_NAME[kind]} match the lights.` }
      const nearest = [...settings.values()]
        .map(light => calibrationMismatches(strays[0], light))
        .sort((a, b) => a.length - b.length)[0]
      return {
        kind,
        status: 'mismatch',
        count: own.length,
        gaps,
        text:
          `${strays.length} of ${own.length} ${KIND_NAME[kind]} match no lights: the first has ${LIST(nearest)}.` +
          ' Siril will use them with the rest; move them out of the folder.'
      }
    }
    const first = gaps[0].mismatches
    return {
      kind,
      status: 'mismatch',
      count: own.length,
      gaps,
      text:
        `The ${KIND_NAME[kind]} do not match ${gaps.length === settings.size ? 'the' : 'some'} lights: the nearest has ${LIST(first)}.` +
        ' Siril will still use them, which can add noise or leave amp glow and dust.'
    }
  })
}

// ── Nights ──────────────────────────────────────────────────────────────

export interface NightRow {
  night: string
  lights: number
  kept: number
  rejected: number
  medianFwhm: number | null
  /** Flats captured on this observing night. */
  flats: number
  /** The user left this night out (ADV-008). */
  leftOut: boolean
}

export interface NightsPlan {
  nights: NightRow[]
  /** Set when some nights have flats of their own and others do not. */
  sharedFlatsNote: string | null
}

const medianOf = (values: number[]) => {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Each night's lights, what grading kept, its median FWHM and its flats. Siril's stock scripts
 * make one master flat from every flat in the folder, so a night without its own flats is
 * calibrated with another night's, which leaves dust from the wrong session.
 */
export function planNights(report: GradeReport, flats: { capturedAt: Date | null }[]): NightsPlan {
  const flatNights = new Map<string, number>()
  for (const f of flats) if (f.capturedAt) flatNights.set(observingNightOf(f.capturedAt), (flatNights.get(observingNightOf(f.capturedAt)) ?? 0) + 1)
  const byNight = new Map<string, typeof report.grades>()
  for (const g of report.grades) {
    const key = g.night ?? 'Unknown date'
    const list = byNight.get(key)
    if (list) list.push(g)
    else byNight.set(key, [g])
  }
  const nights: NightRow[] = [...byNight.entries()]
    .map(([night, grades]) => ({
      night,
      lights: grades.length,
      kept: grades.filter(g => g.verdict !== 'reject').length,
      rejected: grades.filter(g => g.verdict === 'reject').length,
      medianFwhm: medianOf(grades.filter(g => g.verdict !== 'reject' && g.measurement?.fwhm != null).map(g => g.measurement?.fwhm as number)),
      flats: flatNights.get(night) ?? 0,
      leftOut: grades.some(g => g.overrideBy === 'night')
    }))
    .sort((a, b) => a.night.localeCompare(b.night))
  const withFlats = nights.filter(n => n.flats > 0).length
  const sharedFlatsNote =
    nights.length > 1 && flats.length > 0 && withFlats < nights.length
      ? `${nights.length - withFlats} of ${nights.length} nights have no flats of their own. Siril's stock scripts make one master flat for every night, so dust that moved between sessions will not calibrate out.`
      : null
  return { nights, sharedFlatsNote }
}

// ── Channel balance ─────────────────────────────────────────────────────

export interface ChannelGap {
  filter: string
  haveSec: number
  leadFilter: string
  leadSec: number
}

/** Luminance and clear filters, which LRGB imaging captures far longer than colour on purpose. */
const LUMINANCE = /^(l|lum|luminance|clear|c)$/i

/** The least-captured filter falls short when it has under this share of the most-captured. */
export const CHANNEL_BALANCE_RATIO = 1 / 3

/**
 * A target's filter that lags far behind its best, among the filters it has been captured with
 * or has a goal for. Frames with no filter are a one-shot-colour target and luminance is meant to
 * lead, so neither is balanced.
 */
export function channelGap(target: TargetFrames): ChannelGap | null {
  const byFilter = new Map<string, { name: string; sec: number }>()
  const add = (filter: string | null | undefined, sec: number) => {
    const name = filter?.trim()
    // Luminance is meant to run far longer than colour, so it is never part of the balance.
    if (!name || LUMINANCE.test(name)) return
    const key = name.toLowerCase()
    const entry = byFilter.get(key) ?? { name, sec: 0 }
    entry.sec += sec
    byFilter.set(key, entry)
  }
  for (const s of usableSubs(target)) add(s.filter, s.exposureSec)
  // A filter the user set a goal for counts even before its first frame.
  for (const g of target.filterGoals ?? []) add(g.filter, 0)
  if (byFilter.size < 2) return null
  const sorted = [...byFilter.values()].sort((a, b) => a.sec - b.sec || a.name.localeCompare(b.name))
  const low = sorted[0]
  const lead = sorted[sorted.length - 1]
  if (low.sec >= lead.sec * CHANNEL_BALANCE_RATIO) return null
  return { filter: low.name, haveSec: low.sec, leadFilter: lead.name, leadSec: lead.sec }
}
