import {
  PREVIEW_MAX_WIDTH,
  VARIANT_LETTERS,
  experimentReportJson,
  experimentReportMarkdown,
  experimentReportName,
  experimentSpace,
  finalOutput,
  metricNotes,
  parentDir,
  parseToolVersion,
  postProcessCommand,
  runnable,
  toolSpec,
  variantArgs,
  variantLabel,
  variantMetrics,
  variantOutputDir,
  variantProblems,
  variantState,
  type ImagePreview,
  type Job,
  type JobTiming,
  type OutputFile,
  type ToolId,
  type VariantLetter,
  type VariantMetrics,
  type VariantParameters,
  type VariantState
} from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { ExperimentRecord, ExperimentStore, OutputFolder, VariantRecord } from '../ports/experiments'
import type { ContentHasher } from '../ports/file-hashing'
import type { ImagePixels } from '../ports/gallery'
import type { JobStore } from '../ports/jobs'
import type { SirilWorkspace } from '../ports/siril-workspace'
import type { ToolHub } from '../ports/tool-hub'
import type { ToolProbe } from '../ports/tool-probe'
import type { PlanPostProcessing } from './plan-post-processing'
import { postProcessRefusal } from './queue-jobs'

/**
 * The experiment lab (specs/040-experiment-lab): one stack kept as it is, two to four Siril_Scripts
 * v2 variants run by the job runner into their own folders, compared by their final images and
 * figures, one preferred, and a report of exactly what ran.
 */

export interface ExperimentDeps {
  store: ExperimentStore
  plan: PlanPostProcessing
  tools: ToolHub
  probe: ToolProbe
  jobs: Pick<JobStore, 'add' | 'list'>
  folder: OutputFolder
  hasher: Pick<ContentHasher, 'fullHash'>
  space: Pick<SirilWorkspace, 'workAreaSpace'>
  pixels: ImagePixels
  clock: Clock
}

export interface ExperimentDefinition {
  name: string
  objective?: string
  stackPath: string
  variants: VariantParameters[]
}

export type ExperimentResult = { ok: true; experiment: ExperimentRecord } | { ok: false; problems: string[] }

const missing: ExperimentResult = { ok: false, problems: ['There is no such experiment.'] }

const NO_COORDINATES =
  'This target has no coordinates. Each variant is given its own name so it writes to its own folder, and Siril_Scripts would look that name up on SIMBAD; add the target’s coordinates first.'

/** Makes an experiment over one of the target's stacks, its every byte hashed so it is known to be the same later (PE-001). */
export function makeCreateExperiment(deps: Pick<ExperimentDeps, 'store' | 'plan' | 'folder' | 'hasher' | 'clock'>) {
  return async (targetId: string, definition: ExperimentDefinition): Promise<ExperimentResult> => {
    const name = definition.name.trim()
    const problems: string[] = name === '' ? ['The experiment needs a name.'] : []
    problems.push(...variantProblems(definition.variants))
    const plan = await deps.plan(targetId, { stackPath: definition.stackPath })
    if (!plan.target) return { ok: false, problems: ['There is no such target.'] }
    if (plan.stack?.path !== definition.stackPath) problems.push('That file is not one of this target’s stacks.')
    if (plan.target.raHours === null || plan.target.decDeg === null) problems.push(NO_COORDINATES)
    if (problems.length > 0) return { ok: false, problems }
    const stat = await deps.folder.stat(definition.stackPath)
    if (!stat) return { ok: false, problems: ['The stack is no longer on disk.'] }
    const sha256 = await deps.hasher.fullHash(definition.stackPath)
    const number = (await deps.store.list(targetId)).reduce((n, e) => Math.max(n, e.number), 0) + 1
    const targetName = plan.target.name
    const experiment = await deps.store.create({
      targetId,
      number,
      name,
      objective: definition.objective?.trim() ?? '',
      input: { path: definition.stackPath, sizeBytes: stat.sizeBytes, modifiedAt: stat.modifiedAt, sha256 },
      variants: definition.variants.map((parameters, i) => {
        const letter = VARIANT_LETTERS[i]
        const outputLabel = variantLabel(targetName, number, letter)
        return { letter, parameters, outputLabel, outputDir: variantOutputDir(definition.stackPath, outputLabel) }
      }),
      createdAt: deps.clock.now()
    })
    return { ok: true, experiment }
  }
}

export interface VariantDescription {
  record: VariantRecord
  state: VariantState
  job: Pick<Job, 'exitCode' | 'startedAt' | 'finishedAt' | 'note'> | null
  /** Bytes its outputs take; null until they are recorded. */
  outputBytes: number | null
  /** Succeeded, but its folder is not there to record. */
  outputsMissing: boolean
}

export interface ExperimentDescription {
  experiment: ExperimentRecord
  variants: VariantDescription[]
  at: Date
}

/**
 * An experiment with each variant's state from its job, and the files a successful run left,
 * identified by SHA-256 the first time they are seen (PE-002).
 */
export function makeDescribeExperiment(deps: Pick<ExperimentDeps, 'store' | 'jobs' | 'folder' | 'hasher' | 'clock'>) {
  return async (experimentId: string, jobList?: Job[]): Promise<ExperimentDescription | null> => {
    const found = await deps.store.get(experimentId)
    if (!found) return null
    const jobs = new Map((jobList ?? (await deps.jobs.list())).map(j => [j.id, j]))
    let experiment = found
    for (const v of found.variants) {
      const job = v.run ? (jobs.get(v.run.jobId) ?? null) : null
      if (variantState(v.run, job) !== 'succeeded' || v.outputs) continue
      const files = await deps.folder.list(v.outputDir)
      if (!files) continue
      const outputs: OutputFile[] = []
      for (const f of files) outputs.push({ ...f, sha256: await deps.hasher.fullHash(f.path) })
      await deps.store.recordOutputs(v.id, outputs, deps.clock.now())
      experiment = (await deps.store.get(experimentId)) as ExperimentRecord
    }
    const variants = experiment.variants.map(record => {
      const job = record.run ? (jobs.get(record.run.jobId) ?? null) : null
      const state = variantState(record.run, job)
      return {
        record,
        state,
        job: job ? { exitCode: job.exitCode, startedAt: job.startedAt, finishedAt: job.finishedAt, note: job.note } : null,
        outputBytes: record.outputs ? record.outputs.reduce((n, f) => n + f.sizeBytes, 0) : null,
        outputsMissing: state === 'succeeded' && !record.outputs
      }
    })
    return { experiment, variants, at: deps.clock.now() }
  }
}

/** A target's experiments, newest first, each described. */
export function makeListExperiments(deps: Pick<ExperimentDeps, 'store' | 'jobs' | 'folder' | 'hasher' | 'clock'>) {
  const describe = makeDescribeExperiment(deps)
  return async (targetId: string): Promise<ExperimentDescription[]> => {
    const [experiments, jobs] = await Promise.all([deps.store.list(targetId), deps.jobs.list()])
    const out: ExperimentDescription[] = []
    for (const e of experiments) out.push((await describe(e.id, jobs)) as ExperimentDescription)
    return out
  }
}

/** Whether the input still has its recorded size and SHA-256; null when it is gone. */
async function inputUnchanged(deps: Pick<ExperimentDeps, 'folder' | 'hasher'>, experiment: ExperimentRecord): Promise<boolean | null> {
  const stat = await deps.folder.stat(experiment.input.path)
  if (!stat) return null
  if (stat.sizeBytes !== experiment.input.sizeBytes) return false
  return (await deps.hasher.fullHash(experiment.input.path)) === experiment.input.sha256
}

/** The tools a variant's run rests on, with the versions they report now. */
async function toolVersions(deps: Pick<ExperimentDeps, 'tools' | 'probe'>): Promise<{ id: ToolId; version: string | null }[]> {
  const found = await deps.tools.locate()
  const out: { id: ToolId; version: string | null }[] = []
  for (const id of ['siril-scripts', 'siril', 'rc-astro'] as const) {
    const path = found.find(t => t.id === id)?.path
    if (!path) continue
    const args = toolSpec(id).versionArgs
    const result = args ? await deps.probe.run(path, args) : null
    out.push({ id, version: result && !result.error ? parseToolVersion(`${result.stdout}\n${result.stderr}`) : null })
  }
  return out
}

export type RunResult = { ok: true; queued: VariantLetter[] } | { ok: false; problems: string[] }

/**
 * Queues every variant that has not run, or whose run failed or was cancelled, one post-process job
 * each, after checking the input is unchanged and every variant can run and fits on the disk. Nothing
 * is queued if anything is refused (PE-004). A variant that succeeded is never run again (PE-003).
 */
export function makeRunExperiment(deps: ExperimentDeps) {
  const describe = makeDescribeExperiment(deps)
  return async (experimentId: string, timing: JobTiming): Promise<RunResult> => {
    const d = await describe(experimentId)
    if (!d) return missing as RunResult
    const { experiment } = d
    const toRun = d.variants.filter(v => runnable(v.state)).map(v => v.record)
    if (toRun.length === 0) return { ok: false, problems: ['Every variant has run or is running.'] }
    const unchanged = await inputUnchanged(deps, experiment)
    if (unchanged === null) return { ok: false, problems: ['The stack is no longer on disk.'] }
    if (!unchanged) return { ok: false, problems: ['The stack has changed since the experiment was made, so new results would not compare with the others. Start a new experiment.'] }

    const problems: string[] = []
    const plans = []
    for (const v of toRun) {
      const plan = await deps.plan(experiment.targetId, { stackPath: experiment.input.path, ...v.parameters })
      const refusal = postProcessRefusal(plan, { stackPath: experiment.input.path })
      if (refusal && !problems.includes(refusal)) problems.push(refusal)
      if (plan.target && (plan.target.raHours === null || plan.target.decDeg === null) && !problems.includes(NO_COORDINATES)) problems.push(NO_COORDINATES)
      plans.push({ v, plan })
    }
    if (problems.length > 0) return { ok: false, problems }

    const stackDir = parentDir(experiment.input.path).dir
    const recipes = plans.map(p => ({ v: p.v, recipe: p.plan.recipe as NonNullable<typeof p.plan.recipe> }))
    const biggest = { peakBytes: Math.max(...recipes.map(r => r.recipe.peakBytes)), keptBytes: Math.max(...recipes.map(r => r.recipe.keptBytes)) }
    const space = experimentSpace(biggest, toRun.length, (await deps.space.workAreaSpace(stackDir)).freeBytes)
    if (space.headroomBytes === null && space.shortBytes === null) return { ok: false, problems: ["The stack's disk does not report its free space, so the runs could fill it."] }
    if (!space.fits) return { ok: false, problems: [`The stack's disk is short of the space ${plural(toRun.length)} need.`] }

    const [located, tools] = await Promise.all([deps.tools.locate(), toolVersions(deps)])
    const bash = located.find(t => t.id === 'bash')?.path ?? null
    for (const { v, recipe } of recipes) {
      const command = postProcessCommand(recipe.program as string, variantArgs(recipe.args, v.outputLabel), bash, stackDir)
      const now = deps.clock.now()
      const job = await deps.jobs.add(
        {
          kind: 'post-process',
          targetId: experiment.targetId,
          title: `Experiment ${experiment.name}, variant ${v.letter} (${v.parameters.profile}, ${v.parameters.quality})`,
          timing,
          command,
          prepare: null,
          spaceDir: stackDir,
          neededBytes: recipe.peakBytes
        },
        now
      )
      await deps.store.recordRun(v.id, { jobId: job.id, ...command, tools, queuedAt: now })
    }
    return { ok: true, queued: toRun.map(v => v.letter) }
  }
}

const plural = (n: number) => (n === 1 ? 'this variant' : `these ${n} variants`)

export interface ComparedVariant {
  letter: VariantLetter
  parameters: VariantParameters
  preferred: boolean
  state: VariantState
  /** The final image, its preview and figures; an error when it could not be read; null when there is none yet. */
  image: { path: string; name: string; preview: ImagePreview; metrics: VariantMetrics } | { path: string | null; error: string } | null
}

export interface ExperimentComparison {
  experimentId: string
  variants: ComparedVariant[]
  /** Figure by figure which variant measures lowest, and that no one figure decides (PE-005). */
  notes: string[]
}

/** Every successful variant's final image with the same auto-stretch and the same figures, side by side (PE-005). */
export function makeCompareExperiment(deps: Pick<ExperimentDeps, 'store' | 'jobs' | 'folder' | 'hasher' | 'pixels' | 'clock'>) {
  const describe = makeDescribeExperiment(deps)
  return async (experimentId: string): Promise<ExperimentComparison | null> => {
    const d = await describe(experimentId)
    if (!d) return null
    const variants: ComparedVariant[] = []
    for (const v of d.variants) {
      const base = { letter: v.record.letter, parameters: v.record.parameters, preferred: d.experiment.preferredVariantId === v.record.id, state: v.state }
      if (v.state !== 'succeeded') {
        variants.push({ ...base, image: null })
        continue
      }
      const final = v.record.outputs ? finalOutput(v.record.outputs) : null
      if (!final) {
        variants.push({ ...base, image: { path: null, error: v.record.outputs ? 'It left no FITS or PNG to compare.' : 'Its output folder is not there.' } })
        continue
      }
      try {
        const { inspection, preview } = await deps.pixels.open(final.path, { maxWidth: PREVIEW_MAX_WIDTH })
        variants.push({ ...base, image: { path: final.path, name: final.name, preview, metrics: variantMetrics(inspection) } })
      } catch (error) {
        variants.push({ ...base, image: { path: final.path, error: error instanceof Error ? error.message : String(error) } })
      }
    }
    const measured = variants.flatMap(v => (v.image && 'metrics' in v.image ? [{ letter: v.letter, metrics: v.image.metrics }] : []))
    return { experimentId, variants, notes: metricNotes(measured) }
  }
}

/** Marks a successful variant preferred, or clears the choice with null; nothing else changes and no file is touched (PE-006). */
export function makePreferVariant(deps: Pick<ExperimentDeps, 'store' | 'jobs' | 'folder' | 'hasher' | 'clock'>) {
  const describe = makeDescribeExperiment(deps)
  return async (experimentId: string, variantId: string | null): Promise<ExperimentResult> => {
    const d = await describe(experimentId)
    if (!d) return missing
    if (variantId !== null) {
      const v = d.variants.find(x => x.record.id === variantId)
      if (!v) return { ok: false, problems: ['That variant is not part of this experiment.'] }
      if (v.state !== 'succeeded') return { ok: false, problems: ['Only a variant that ran successfully can be preferred.'] }
    }
    await deps.store.prefer(experimentId, variantId)
    return { ok: true, experiment: (await deps.store.get(experimentId)) as ExperimentRecord }
  }
}

/** The report as JSON or Markdown: the input and whether it is unchanged, each variant's settings, run and files, and what reproducing it takes (PE-007). */
export function makeExportExperimentReport(deps: Pick<ExperimentDeps, 'store' | 'jobs' | 'folder' | 'hasher' | 'clock'> & { targetName: (targetId: string) => Promise<string | null> }) {
  const describe = makeDescribeExperiment(deps)
  return async (experimentId: string, format: 'json' | 'md'): Promise<{ fileName: string; text: string } | null> => {
    const d = await describe(experimentId)
    if (!d) return null
    const { experiment } = d
    const input = {
      name: experiment.name,
      objective: experiment.objective,
      target: (await deps.targetName(experiment.targetId)) ?? experiment.targetId,
      input: experiment.input,
      inputUnchanged: await inputUnchanged(deps, experiment),
      variants: d.variants.map(v => ({
        letter: v.record.letter,
        parameters: v.record.parameters,
        state: v.state,
        preferred: experiment.preferredVariantId === v.record.id,
        run: v.record.run ? { program: v.record.run.program, args: v.record.run.args, cwd: v.record.run.cwd, tools: v.record.run.tools, jobId: v.record.run.jobId } : null,
        exitCode: v.job?.exitCode ?? null,
        startedAt: v.job?.startedAt ?? null,
        finishedAt: v.job?.finishedAt ?? null,
        outputDir: v.record.outputDir,
        outputs: v.record.outputs
      })),
      createdAt: experiment.createdAt,
      at: d.at
    }
    return { fileName: experimentReportName(experiment.name, format), text: format === 'json' ? experimentReportJson(input) : experimentReportMarkdown(input) }
  }
}
