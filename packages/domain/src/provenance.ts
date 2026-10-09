/**
 * Provenance for a stack: run Siril's stock script one step at a time so a long stack can carry
 * on where it stopped, publish a result only when every step succeeded, record what made it in a
 * manifest beside it, and explain the Siril failures that come up again and again. SyQon Studio's
 * Fusion Stack keeps a project file per master and never leaves a partial one; this is the same
 * habit around Siril's own scripts. Pure rules.
 */

import type { SirilFolder, SirilPlacement } from './ingest'

// ── Steps ───────────────────────────────────────────────────────────────

/**
 * Commands whose work is saved to files when they finish, so a fresh Siril can carry on after
 * them. Anything else (load, save, mirrorx, rgbcomp) works on the image Siril holds in memory and
 * stays in the same step as the command before it.
 */
const CHECKPOINTS = new Set([
  'convert', 'convertraw', 'calibrate', 'preprocess', 'register', 'seqapplyreg', 'stack', 'seqextract_ha', 'seqextract_haoiii',
  'seqextract_green', 'seqsplit_cfa', 'seqsubsky', 'seqcosme', 'seqcosme_cfa'
])

/** Commands that set up a Siril session; every step repeats those that came before it. */
const SESSION = /^(requires|set\w*)\b/i

export interface SirilStep {
  /** Zero-based position in the script. */
  index: number
  /** The step's first command, shortened: "convert light", "stack r_pp_light". */
  label: string
  /** The folder the step starts in, relative to the work folder ('' for the work folder itself). */
  cwd: string
  /** Session settings in force when the step starts. */
  session: string[]
  commands: string[]
}

/** Folder after a `cd`, relative to the work folder; null when it would leave the work folder. */
function changeDir(cwd: string, target: string): string | null {
  const parts = cwd === '' ? [] : cwd.split('/')
  for (const part of target.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.length === 0) return null
      parts.pop()
    } else parts.push(part)
  }
  return parts.join('/')
}

const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, '$1')

/**
 * A Siril script split into steps that each end on a checkpoint. Comments, blank lines and
 * `close` are dropped. Returns null when the script cannot be split safely, such as a `cd` out of
 * the work folder or an absolute path, so the caller runs it whole instead.
 */
export function splitSirilScript(text: string): SirilStep[] | null {
  const steps: SirilStep[] = []
  const session: string[] = []
  let cwd = ''
  let current: Omit<SirilStep, 'index' | 'label'> | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (line === '' || /^close$/i.test(line)) continue
    if (SESSION.test(line)) {
      session.push(line)
      continue
    }
    const [word, ...rest] = line.split(/\s+/)
    if (!current) current = { cwd, session: [...session], commands: [] }
    current.commands.push(line)
    if (/^cd$/i.test(word)) {
      const target = unquote(rest.join(' '))
      if (/^([a-z]:|\/|~)/i.test(target)) return null
      const next = changeDir(cwd, target)
      if (next === null) return null
      cwd = next
      continue
    }
    if (CHECKPOINTS.has(word.toLowerCase())) {
      steps.push({ index: steps.length, label: [word, rest[0]].filter(Boolean).join(' '), ...current })
      current = null
    }
  }
  // What follows the last checkpoint (load, save) is a step of its own, unless it only moves around.
  if (current && current.commands.some(c => !/^cd\s/i.test(c))) {
    const first = current.commands.find(c => !/^cd\s/i.test(c)) as string
    steps.push({ index: steps.length, label: first.split(/\s+/).slice(0, 2).join(' '), ...current })
  }
  return steps.length > 0 ? steps : null
}

/** One step as a script Siril runs from the work folder on its own. */
export function stepScript(step: SirilStep): string {
  const cd = step.cwd === '' ? [] : [`cd "${step.cwd}"`]
  return [...step.session, ...cd, ...step.commands, ''].join('\n')
}

/** FNV-1a, as hex: a short fingerprint, not a security hash. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * What a stack's steps depend on: the script and every frame laid out for it. A run may carry on
 * from an earlier one's steps only while this is unchanged.
 */
export function runKey(script: string, placements: Pick<SirilPlacement, 'folder' | 'name' | 'from'>[]): string {
  const frames = placements.map(p => `${p.folder}/${p.name}<${p.from}`).sort()
  return `${fingerprint(script)}-${fingerprint(frames.join('\n'))}-${placements.length}`
}

export interface StepProgress {
  /** Steps finished. */
  step: number
  of: number
  /** runKey of the run these steps belong to. */
  key: string
  /** The step running now, or next. */
  label: string | null
  /** Result files published when the run succeeded. */
  published?: string[]
  /** The step a resumed run carried on from, zero-based. */
  resumedFrom?: number
}

/** The step to start from: where an earlier run of the same script and frames stopped, else the first. */
export function resumeFrom(progress: StepProgress | null, key: string, steps: number): number {
  if (!progress || progress.key !== key || progress.of !== steps) return 0
  return Math.min(Math.max(0, progress.step), steps)
}

/** "step 4 of 9: register pp_light". */
export function progressText(p: StepProgress): string {
  return p.label && p.step < p.of ? `Step ${p.step + 1} of ${p.of}: ${p.label}` : `${p.step} of ${p.of} steps done`
}

// ── Publishing ──────────────────────────────────────────────────────────

export interface ResultFile {
  path: string
  sizeBytes: number
  modifiedAt: Date | null
}

/** Results a run wrote: files that are new since it started, or rewritten. */
export function newResults(before: ResultFile[], after: ResultFile[]): ResultFile[] {
  const was = new Map(before.map(r => [r.path, r]))
  return after.filter(r => {
    const old = was.get(r.path)
    return !old || old.sizeBytes !== r.sizeBytes || (old.modifiedAt?.getTime() ?? 0) !== (r.modifiedAt?.getTime() ?? 0)
  })
}

/** Where a run that did not finish puts what it wrote, so it is never taken for a finished stack. */
export const FAILED_FOLDER = 'failed'

/** Beside every published result: `result_3600s.fit` has `result_3600s.fit.astrorepo.json`. */
export const MANIFEST_SUFFIX = '.astrorepo.json'

export interface StackManifest {
  format: 'astrorepo-stack-manifest'
  version: 1
  result: { file: string; sizeBytes: number }
  target: { id: string; name: string | null }
  job: { id: string; title: string; startedAt: string | null; finishedAt: string }
  siril: { program: string; script: string }
  steps: { label: string; seconds: number | null; resumed: boolean }[]
  frames: Record<SirilFolder, { name: string; source: string }[]>
  /** Lights frame grading left out. */
  rejected: string[]
}

export interface ManifestInput {
  result: ResultFile
  target: { id: string; name: string | null }
  job: { id: string; title: string; startedAt: Date | null }
  finishedAt: Date
  program: string
  script: string
  steps: { label: string; seconds: number | null; resumed: boolean }[]
  placements: SirilPlacement[]
  rejected: string[]
}

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p

/** What made a master: the script, each step, every frame it used and the lights it left out. */
export function stackManifest(input: ManifestInput): StackManifest {
  const frames: StackManifest['frames'] = { lights: [], darks: [], flats: [], biases: [] }
  for (const p of [...input.placements].sort((a, b) => a.name.localeCompare(b.name))) frames[p.folder].push({ name: p.name, source: p.from })
  return {
    format: 'astrorepo-stack-manifest',
    version: 1,
    result: { file: baseName(input.result.path), sizeBytes: input.result.sizeBytes },
    target: input.target,
    job: { id: input.job.id, title: input.job.title, startedAt: input.job.startedAt?.toISOString() ?? null, finishedAt: input.finishedAt.toISOString() },
    siril: { program: input.program, script: baseName(input.script) },
    steps: input.steps,
    frames,
    rejected: [...input.rejected].sort()
  }
}

// ── Known failures ──────────────────────────────────────────────────────

export interface FailureExplanation {
  /** What went wrong, in plain words. */
  reason: string
  /** What to do about it. */
  fix: string
}

/** Siril messages that come up again and again, and what they mean. The first that matches wins. */
export const KNOWN_SIRIL_FAILURES: (FailureExplanation & { match: RegExp })[] = [
  {
    match: /no space left on device|not enough (free )?(disk )?space/i,
    reason: 'The work area’s disk filled up.',
    fix: 'Free space on that disk, or move the work area in Settings, then queue the stack again; it carries on from the last finished step.'
  },
  {
    match: /not enough memory|out of memory|cannot allocate memory|memory allocation failed/i,
    reason: 'Siril ran out of memory.',
    fix: 'Close other programs, lower the memory ratio in Siril’s preferences, or stack fewer lights at a time.'
  },
  {
    match: /(requires?|needs?) (a )?(more recent|newer)|version .* is required|script (needs|requires) siril/i,
    reason: 'This Siril is older than the script needs.',
    fix: 'Update Siril, then queue the stack again.'
  },
  {
    match: /unknown command|command not found/i,
    reason: 'Siril did not know a command in the script, usually because the script was written for another version.',
    fix: 'Check that siril-cli in Settings → Tools is the same version as the stock scripts beside it.'
  },
  {
    match: /not enough stars|could not match stars|star matching failed|registration (failed|aborted)|no stars? (were )?(found|detected)/i,
    reason: 'Registration could not find enough stars to line the frames up.',
    fix: 'Grade the lights and reject cloudy, trailed or out-of-focus frames, or check that the darks and flats suit the lights.'
  },
  {
    match: /(images?|frames?) (do not|don't) have the same (size|dimensions)|different (sizes|dimensions)|size mismatch/i,
    reason: 'The frames are not all the same size.',
    fix: 'Stack each size apart; the Files tab shows each frame’s dimensions.'
  },
  {
    match: /not a cfa|no bayer|bayer pattern (is )?(not|missing)/i,
    reason: 'The script expected colour (Bayer) frames, and these are not.',
    fix: 'Use the mono script for these frames.'
  },
  {
    match: /no (fits |image )?files? (were )?found|nothing to convert|no files to convert|sequence .* (not found|empty)/i,
    reason: 'A folder the script reads was empty.',
    fix: 'Check that Prep for Siril placed the frames, and that the script’s calibration folders have frames in them.'
  },
  {
    match: /permission denied|access is denied|cannot (open|create|write)|error opening/i,
    reason: 'Siril could not open or write a file.',
    fix: 'Close any program that has files in the work area open (an image viewer, a sync tool), then queue the stack again.'
  }
]

/** The known failure a log ends with, looking at its last lines first; null when none matches. */
export function explainSirilFailure(log: string): FailureExplanation | null {
  const lines = log.split(/\r?\n/).filter(l => l.trim() !== '').slice(-80).reverse()
  for (const line of lines) {
    const known = KNOWN_SIRIL_FAILURES.find(k => k.match.test(line))
    if (known) return { reason: known.reason, fix: known.fix }
  }
  return null
}
