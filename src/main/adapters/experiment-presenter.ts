import type { ExperimentComparison, ExperimentDescription, ExperimentResult, RunResult } from '@astro/application'
import { runnable, type VariantMetrics, type VariantParameters, type VariantState } from '@astro/domain'
import type { ComparedVariantView, ExperimentChangeView, ExperimentComparisonView, ExperimentRunView, ExperimentView } from '@shared/types'
import { formatBytes } from './discovery-presenter'
import { toPreviewView } from './gallery-presenter'

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const settings = (p: VariantParameters) => `${capital(p.profile)} profile, ${p.quality} quality`
const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const percent = (share: number) => `${(share * 100).toFixed(share < 0.01 ? 2 : 1)}%`

function stateText(state: VariantState, exitCode: number | null): string {
  switch (state) {
    case 'not run':
      return 'Not run'
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'succeeded':
      return 'Finished'
    case 'failed':
      return exitCode === null ? 'Failed' : `Failed (exit code ${exitCode})`
    case 'cancelled':
      return 'Cancelled'
    case 'job missing':
      return 'Its job is no longer listed'
  }
}

export function toExperimentView(d: ExperimentDescription): ExperimentView {
  const e = d.experiment
  return {
    id: e.id,
    name: e.name,
    objective: e.objective,
    summary: `Experiment ${e.number} on ${fileName(e.input.path)} (${formatBytes(e.input.sizeBytes)}), made ${day(e.createdAt)}`,
    inputPath: e.input.path,
    inputHash: e.input.sha256.replace(/^[a-z0-9-]+:/i, '').slice(0, 12),
    variants: d.variants.map(v => ({
      id: v.record.id,
      letter: v.record.letter,
      profile: v.record.parameters.profile,
      quality: v.record.parameters.quality,
      settings: settings(v.record.parameters),
      state: v.state,
      stateText: stateText(v.state, v.job?.exitCode ?? null),
      outputDir: v.record.run?.outputDir ?? v.record.outputDir,
      outputs: v.record.outputs ? `${v.record.outputs.length} ${v.record.outputs.length === 1 ? 'file' : 'files'}, ${formatBytes(v.outputBytes ?? 0)}` : null,
      outputsMissing: v.outputsMissing,
      inputChanged: v.inputChanged,
      preferred: e.preferredVariantId === v.record.id,
      canPrefer: v.state === 'succeeded' && !v.inputChanged
    })),
    canRun: d.variants.some(v => runnable(v.state)),
    canCompare: d.variants.filter(v => v.state === 'succeeded').length >= 2
  }
}

/** The figures in words, the same for every variant so they line up. */
export function figures(m: VariantMetrics): { label: string; value: string }[] {
  return [
    { label: 'Background', value: m.median.toPrecision(3) },
    { label: 'Noise', value: m.noise.toPrecision(3) },
    { label: 'Noise over background', value: m.relativeNoise === null ? 'not known' : m.relativeNoise.toPrecision(3) },
    { label: 'Clipped highlights', value: m.clippedHigh === null ? 'not known' : percent(m.clippedHigh) },
    { label: 'Crushed shadows', value: percent(m.clippedLow) },
    { label: 'Brightest star FWHM', value: m.fwhm === null ? 'no star stood out' : `${m.fwhm.toFixed(2)} px` }
  ]
}

export function toComparisonView(c: ExperimentComparison): ExperimentComparisonView {
  return {
    variants: c.variants.map((v): ComparedVariantView => {
      const base = { letter: v.letter, settings: settings(v.parameters), preferred: v.preferred }
      if (!v.image) return { ...base, file: null, preview: null, error: v.state === 'succeeded' ? null : `Not finished: ${stateText(v.state, null).toLowerCase()}.`, figures: null }
      if ('error' in v.image) return { ...base, file: v.image.path ? fileName(v.image.path) : null, preview: null, error: v.image.error, figures: null }
      return {
        ...base,
        file: v.image.name,
        preview: toPreviewView({ ok: true, preview: v.image.preview, field: null, fieldSource: null, overlay: null }),
        error: null,
        figures: figures(v.image.metrics)
      }
    }),
    notes: c.notes
  }
}

export function toExperimentChange(r: ExperimentResult): ExperimentChangeView {
  return r.ok ? { ok: true, id: r.experiment.id } : { ok: false, problems: r.problems }
}

export function toRunView(r: RunResult): ExperimentRunView {
  if (!r.ok) return r
  return { ok: true, queued: r.queued.length === 1 ? `Variant ${r.queued[0]} is queued.` : `Variants ${r.queued.join(', ')} are queued, one after another.` }
}
