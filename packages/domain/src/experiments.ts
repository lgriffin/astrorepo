import type { ImageInspection } from './inspector'
import type { JobState } from './jobs'
import { PROFILES, QUALITIES, parentDir, targetLabel, type Profile, type Quality } from './post-processing'
import { spaceVerdict, type SpaceVerdict } from './siril-space'
import type { ToolId } from './tools'

/**
 * The experiment lab (specs/040-experiment-lab): one stack, kept exactly as it is, processed two to
 * four ways by Siril_Scripts v2, each way into its own folder, so the results can be compared and
 * one preferred without anything being overwritten. Pure rules: no I/O, no clock.
 */

export const MIN_VARIANTS = 2
export const MAX_VARIANTS = 4
export const VARIANT_LETTERS = ['A', 'B', 'C', 'D'] as const
export type VariantLetter = (typeof VARIANT_LETTERS)[number]

/** The one input every variant reads, identified by every byte (PE-001). */
export interface ExperimentInput {
  path: string
  sizeBytes: number
  modifiedAt: Date | null
  /** SHA-256 of the whole file. */
  sha256: string
}

/** What a variant asks Siril_Scripts v2 for; nothing else can be passed, so no command can be smuggled in. */
export interface VariantParameters {
  profile: Profile
  quality: Quality
}

// ── Validation ─────────────────────────────────────────────────────────

/** What is wrong with a set of variants, in words; empty when they can be run (PE-004). */
export function variantProblems(variants: VariantParameters[]): string[] {
  const problems: string[] = []
  if (variants.length < MIN_VARIANTS) problems.push(`An experiment compares at least ${MIN_VARIANTS} variants.`)
  if (variants.length > MAX_VARIANTS) problems.push(`An experiment compares at most ${MAX_VARIANTS} variants.`)
  const seen = new Map<string, string>()
  variants.slice(0, MAX_VARIANTS).forEach((v, i) => {
    const letter = VARIANT_LETTERS[i]
    if (!(PROFILES as readonly string[]).includes(v.profile)) problems.push(`Variant ${letter} asks for a profile Siril_Scripts does not have.`)
    if (!(QUALITIES as readonly string[]).includes(v.quality)) problems.push(`Variant ${letter} asks for a quality Siril_Scripts does not have.`)
    const key = `${v.profile}|${v.quality}`
    const same = seen.get(key)
    if (same) problems.push(`Variants ${same} and ${letter} have the same settings, so they would make the same image.`)
    else seen.set(key, letter)
  })
  return problems
}

// ── Where each variant writes ──────────────────────────────────────────

/**
 * The name Siril_Scripts gets as its TARGET, which names its output folder: the target's own label,
 * the experiment's number and the variant's letter, so no two variants ever share a folder.
 */
export function variantLabel(targetName: string, experimentNumber: number, letter: VariantLetter): string {
  return `${targetLabel(targetName)}-exp${experimentNumber}-${letter}`
}

/** The recipe's arguments with the variant's TARGET in place of the target's own. */
export function variantArgs(args: string[], label: string): string[] {
  const at = args.findIndex(a => a.startsWith('--target='))
  const target = `--target=${label}`
  return at < 0 ? [args[0], target, ...args.slice(1)] : args.map((a, i) => (i === at ? target : a))
}

/** Where Siril_Scripts v2 writes for that TARGET: processed/<label> beside the stack. */
export function variantOutputDir(stackPath: string, label: string): string {
  const { dir, sep } = parentDir(stackPath)
  return `${dir.endsWith(sep) ? dir : dir + sep}processed${sep}${label}`
}

/**
 * The disk the variants still to run need: each keeps what it leaves behind, and the last one also
 * needs its busiest moment, since the job runner runs them one after another.
 */
export function experimentSpace(perVariant: { peakBytes: number; keptBytes: number }, toRun: number, freeBytes: number | null): SpaceVerdict {
  const needed = toRun === 0 ? 0 : perVariant.keptBytes * (toRun - 1) + perVariant.peakBytes
  return spaceVerdict(needed, freeBytes)
}

// ── State ──────────────────────────────────────────────────────────────

/** A variant's state: never queued, the state of its job, or its job gone from the list. */
export type VariantState = 'not run' | JobState | 'job missing'

export function variantState(run: { jobId: string } | null, job: { state: JobState } | null): VariantState {
  if (!run) return 'not run'
  return job ? job.state : 'job missing'
}

/** A variant is run (again) only when it has never run or its run did not finish; a success is never overwritten (PE-003). */
export function runnable(state: VariantState): boolean {
  return state === 'not run' || state === 'failed' || state === 'cancelled' || state === 'job missing'
}

// ── Outputs ────────────────────────────────────────────────────────────

/** A file a variant wrote, identified by every byte (PE-002). */
export interface OutputFile {
  path: string
  name: string
  sizeBytes: number
  sha256: string
}

const FITS = /\.(fits?|fts)$/i

/**
 * The image to compare a variant by: Siril_Scripts' final FITS, else its final PNG, else the
 * newest-named FITS or PNG it left. Null when it left neither.
 */
export function finalOutput<F extends { name: string }>(files: F[]): F | null {
  const final = files.filter(f => /final/i.test(f.name))
  const pick = (list: F[], ext: RegExp) => [...list].filter(f => ext.test(f.name)).sort((a, b) => b.name.localeCompare(a.name))[0]
  return pick(final, FITS) ?? pick(final, /\.png$/i) ?? pick(files, FITS) ?? pick(files, /\.png$/i) ?? null
}

export const sumBytes = (files: { sizeBytes: number }[]) => files.reduce((n, f) => n + f.sizeBytes, 0)

// ── Comparison ─────────────────────────────────────────────────────────

/** What one variant's final image measures, over its channels. */
export interface VariantMetrics {
  /** Median of the channels' medians, in the file's units. */
  median: number
  /** Mean of the channels' noise. */
  noise: number
  /** Noise over the median: how grainy the background is for its brightness; null with a median of 0. */
  relativeNoise: number | null
  /** The largest share of any channel at its brightest value; null when the file does not say what that is. */
  clippedHigh: number | null
  /** The largest share of any channel at or below its darkest value. */
  clippedLow: number
  /** FWHM of the brightest unsaturated star, in pixels; null when none stood out. */
  fwhm: number | null
}

export function variantMetrics(inspection: ImageInspection): VariantMetrics {
  const channels = inspection.channels
  const medians = channels.map(c => c.median).sort((a, b) => a - b)
  const median = medians.length === 0 ? 0 : medians[Math.floor((medians.length - 1) / 2)]
  const noise = channels.length === 0 ? 0 : channels.reduce((n, c) => n + c.noise, 0) / channels.length
  const high = channels.map(c => c.saturatedShare)
  return {
    median,
    noise,
    relativeNoise: median > 0 ? noise / median : null,
    clippedHigh: high.length === 0 || high.some(h => h === null) ? null : Math.max(...(high as number[])),
    clippedLow: Math.max(0, ...channels.map(c => c.blackShare)),
    fwhm: inspection.star?.fwhm ?? null
  }
}

/**
 * What the figures say side by side, figure by figure, without naming a winner: smoothing lowers
 * noise and loses detail, a hard stretch clips, so no one figure decides (PE-005).
 */
export function metricNotes(measured: { letter: VariantLetter; metrics: VariantMetrics }[]): string[] {
  if (measured.length < 2) return []
  const notes: string[] = []
  const lowest = (label: string, of: (m: VariantMetrics) => number | null) => {
    const known = measured.filter(v => of(v.metrics) !== null)
    if (known.length < 2) return
    const least = Math.min(...known.map(v => of(v.metrics) as number))
    const most = Math.max(...known.map(v => of(v.metrics) as number))
    if (least === most) return notes.push(`${label}: the same in every variant.`)
    notes.push(`${label}: ${known.filter(v => of(v.metrics) === least).map(v => v.letter).join(' and ')}.`)
  }
  lowest('Darkest background (median)', m => m.median)
  lowest('Least noise', m => m.noise)
  lowest('Least grainy background (noise over median)', m => m.relativeNoise)
  lowest('Fewest clipped highlights', m => m.clippedHigh)
  lowest('Fewest crushed shadows', m => m.clippedLow)
  lowest('Tightest brightest star (FWHM)', m => m.fwhm)
  notes.push('No one figure picks the best image: smoothing lowers noise and loses detail, and a strong stretch clips. Look at them.')
  return notes
}

// ── Report ─────────────────────────────────────────────────────────────

export interface ReportVariant {
  letter: VariantLetter
  parameters: VariantParameters
  state: VariantState
  preferred: boolean
  /** The program and arguments the job ran, and the tools' versions when it was queued; null when never run. */
  run: { program: string; args: string[]; cwd: string; tools: { id: ToolId; version: string | null }[]; jobId: string } | null
  exitCode: number | null
  startedAt: Date | null
  finishedAt: Date | null
  outputDir: string
  outputs: OutputFile[] | null
}

export interface ExperimentReportInput {
  name: string
  objective: string
  target: string
  input: ExperimentInput
  /** Whether the input still has its recorded SHA-256; null when it could not be read. */
  inputUnchanged: boolean | null
  variants: ReportVariant[]
  createdAt: Date
  at: Date
}

/** What stands in the way of running the experiment again and getting the same files. */
export function reproducibility(variants: ReportVariant[]): string[] {
  const notes = ['The same input (by SHA-256), the same arguments and the same tool versions are needed to make the same files again.']
  if (variants.some(v => v.run && !v.run.args.includes('--no-bxt'))) {
    notes.push('RC Astro’s BlurXTerminator, NoiseXTerminator and StarXTerminator are proprietary and their AI models change between versions, so a run with other versions will not match exactly.')
  }
  if (variants.some(v => v.run && v.run.tools.some(t => t.version === null))) notes.push('A tool did not report its version, so that part cannot be pinned.')
  return notes
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

export function experimentReportJson(r: ExperimentReportInput): string {
  return JSON.stringify(
    {
      experiment: r.name,
      objective: r.objective,
      target: r.target,
      created: iso(r.createdAt),
      reported: iso(r.at),
      input: { path: r.input.path, sizeBytes: r.input.sizeBytes, modified: iso(r.input.modifiedAt), sha256: r.input.sha256, unchanged: r.inputUnchanged },
      variants: r.variants.map(v => ({
        variant: v.letter,
        profile: v.parameters.profile,
        quality: v.parameters.quality,
        state: v.state,
        preferred: v.preferred,
        program: v.run?.program ?? null,
        args: v.run?.args ?? null,
        cwd: v.run?.cwd ?? null,
        tools: v.run?.tools ?? null,
        job: v.run?.jobId ?? null,
        exitCode: v.exitCode,
        started: iso(v.startedAt),
        finished: iso(v.finishedAt),
        outputDir: v.outputDir,
        outputs: v.outputs
      })),
      reproducibility: reproducibility(r.variants)
    },
    null,
    2
  )
}

const inputLine = (unchanged: boolean | null) =>
  unchanged === null ? 'could not be read to check it is unchanged' : unchanged ? 'unchanged since the experiment was made' : 'CHANGED since the experiment was made: these results no longer describe it'

/** The report a person reads: the input, each variant's settings, run and files, and what reproducing it takes. */
export function experimentReportMarkdown(r: ExperimentReportInput): string {
  const lines = [
    `# ${r.name}`,
    '',
    `Experiment on ${r.target}, made ${iso(r.createdAt)}, reported ${iso(r.at)}.`,
    ...(r.objective ? ['', `Objective: ${r.objective}`] : []),
    '',
    '## Input',
    '',
    `- ${r.input.path}`,
    `- ${r.input.sizeBytes} bytes, SHA-256 ${r.input.sha256}`,
    `- ${inputLine(r.inputUnchanged)}`,
    ''
  ]
  for (const v of r.variants) {
    lines.push(`## Variant ${v.letter}${v.preferred ? ' (preferred)' : ''}`, '', `- Profile ${v.parameters.profile}, quality ${v.parameters.quality}`, `- State: ${v.state}${v.exitCode !== null ? `, exit code ${v.exitCode}` : ''}`)
    if (v.run) {
      lines.push(`- Ran: \`${[v.run.program, ...v.run.args].join(' ')}\` in ${v.run.cwd}`)
      lines.push(`- Tools: ${v.run.tools.map(t => `${t.id} ${t.version ?? '(version unknown)'}`).join(', ') || 'none recorded'}`)
    }
    lines.push(`- Output folder: ${v.outputDir}`)
    if (v.outputs) for (const f of v.outputs) lines.push(`  - ${f.name}: ${f.sizeBytes} bytes, SHA-256 ${f.sha256}`)
    lines.push('')
  }
  lines.push('## Reproducing it', '', ...reproducibility(r.variants).map(n => `- ${n}`), '')
  return lines.join('\n')
}

/** "M31_stretch_test-experiment.md" */
export function experimentReportName(name: string, format: 'json' | 'md'): string {
  const base = name.trim().replace(/[^A-Za-z0-9+._-]+/g, '_').replace(/^_+|_+$/g, '') || 'experiment'
  return `${base}-experiment.${format}`
}
