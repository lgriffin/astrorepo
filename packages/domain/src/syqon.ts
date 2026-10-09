import type { JobCommand } from './jobs'
import { parentDir } from './post-processing'

/**
 * SyQon Studio's command-line tool (specs/023-hub-syqon). syqon.eu/develop, read 9 October 2026:
 * `syqon-cli` runs one model over one image; `--list-models` lists the models with whether the
 * account may use them; progress goes to stderr and the output path is the only thing on stdout;
 * an existing output is only replaced when asked. The app runs the CLI the user installed and
 * never ships it (SyQon's integration kit is licensed for noncommercial use). Pure rules.
 */

export const SYQON_STEPS = ['star-separation', 'sharpen', 'denoise', 'gradient'] as const
export type SyqonStep = (typeof SYQON_STEPS)[number]

export const SYQON_STEP_INFO: Record<SyqonStep, { label: string; suffix: string; words: RegExp }> = {
  'star-separation': { label: 'Star separation', suffix: 'starless', words: /\bstar|starless/i },
  sharpen: { label: 'Sharpen', suffix: 'sharpened', words: /sharp|deconv|deblur/i },
  denoise: { label: 'Denoise', suffix: 'denoised', words: /noise/i },
  gradient: { label: 'Gradient removal', suffix: 'gradient-removed', words: /gradient|background/i }
}

/** The stable model ids SyQon documents, and the step each does. */
export const SYQON_KNOWN_MODELS: Readonly<Record<string, SyqonStep>> = {
  'axiom-mini': 'star-separation',
  'parallax-nano': 'sharpen',
  'prism-essential': 'denoise',
  'deep-gradient': 'gradient'
}

export interface SyqonModel {
  id: string
  /** The account may use it now. */
  available: boolean
  /** The availability word as the CLI printed it ("available", "locked"). */
  status: string
  /** The step it does; null when neither its id nor its description says. */
  step: SyqonStep | null
  /** The rest of its line. */
  description: string
}

const AVAILABLE = new Set(['available', 'yes', 'ok', 'ready', 'installed', 'included', 'free', 'entitled', 'licensed', 'enabled', 'true', 'y'])
const HEADER = new Set(['id', 'model', 'models', 'name'])
const MODEL_ID = /^[a-z0-9][a-z0-9._-]*$/i

/**
 * The models `syqon-cli --list-models` printed. Tolerant: one model per line, the id first and an
 * availability word next, separated by spaces, tabs, `|`, `,` or `:`; blank lines, comments,
 * headers and anything else are skipped. A word the app does not know as "available" counts as
 * not available, so only models the CLI reports as available are offered.
 */
export function parseSyqonModels(stdout: string): SyqonModel[] {
  const models: SyqonModel[] = []
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•]\s*/, '')
    if (line === '' || /^[#=-]/.test(line)) continue
    const [id, word = '', ...rest] = line.split(/\s*[|,:\t]\s*|\s+/).filter(Boolean)
    if (!id || !MODEL_ID.test(id) || HEADER.has(id.toLowerCase())) continue
    const status = word.replace(/[^\w-]/g, '').toLowerCase()
    const description = rest.join(' ')
    const known = SYQON_KNOWN_MODELS[id.toLowerCase()]
    const step = known ?? SYQON_STEPS.find(s => SYQON_STEP_INFO[s].words.test(description)) ?? null
    if (models.some(m => m.id === id)) continue
    models.push({ id, available: AVAILABLE.has(status), status: status || 'unknown', step, description })
  }
  return models
}

/** Models the account may use for a step, known ids first. */
export function syqonModelsFor(step: SyqonStep, models: SyqonModel[]): SyqonModel[] {
  return models
    .filter(m => m.available && m.step === step)
    .sort((a, b) => Number(!(a.id in SYQON_KNOWN_MODELS)) - Number(!(b.id in SYQON_KNOWN_MODELS)) || a.id.localeCompare(b.id))
}

/** Where a step writes: beside the stack, named after it and the step ("result_3600s_starless.fit"). */
export function syqonOutputPath(stackPath: string, step: SyqonStep): string {
  const { dir, sep } = parentDir(stackPath)
  const name = stackPath.split(/[\\/]/).pop() ?? stackPath
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : '.fit'
  return `${dir.endsWith(sep) ? dir : dir + sep}${stem}_${SYQON_STEP_INFO[step].suffix}${ext}`
}

export interface SyqonCommandInput {
  program: string
  model: string
  input: string
  output: string
  /** Replace an output that is already there. Never implied: the user ticks it. */
  overwrite: boolean
}

/**
 * The CLI run for one step, as an argument array (never a shell string), from the stack's folder.
 * The flag names are an assumption to confirm against syqon.eu/develop (specs/023-hub-syqon).
 */
export function syqonCommand(input: SyqonCommandInput): JobCommand {
  return {
    program: input.program,
    args: ['--model', input.model, '--input', input.input, '--output', input.output, ...(input.overwrite ? ['--overwrite'] : [])],
    cwd: parentDir(input.input).dir
  }
}

/** The arguments that list the models. */
export const SYQON_LIST_MODELS_ARGS: readonly string[] = ['--list-models']

/** The disk a step needs: one output the size of its input (an estimate; SyQon writes 32-bit float as Siril does). */
export function syqonNeededBytes(stackBytes: number): number {
  return stackBytes
}

export interface LiveProgress {
  /** Percent done, when the tool prints simple percentages; null otherwise. */
  percent: number | null
  /** Its last line of progress, shown when there is no percentage. */
  line: string
}

/**
 * Progress from what a tool wrote to stderr: the last line, and its percentage when it gives one
 * as "42%" or "42.5 %". Progress bars that redraw with carriage returns count as lines. Null when
 * the text holds no line.
 */
export function parseLiveProgress(text: string): LiveProgress | null {
  const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean)
  const line = lines[lines.length - 1]
  if (!line) return null
  const m = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(line)
  const percent = m ? Math.min(100, Math.max(0, Number(m[1]))) : null
  return { percent, line: line.slice(0, 200) }
}
