import { spaceVerdict, type SpaceVerdict } from './siril-space'
import { SIRIL_SCRIPTS_EXPECTS, toolSpec, type ToolId, type ToolStatus } from './tools'

/**
 * Post-processing recipes: the Siril_Scripts v2 command for a stack, with the profile picked from
 * the target's object type. The options mirror v2's README and postprocess.sh; the script itself
 * stays where Leigh installed it (charter VI).
 */

export const PROFILES = ['galaxy', 'nebula', 'cluster', 'stellar', 'broadband', 'minimal'] as const
export type Profile = (typeof PROFILES)[number]
export const QUALITIES = ['light', 'normal', 'strong'] as const
export type Quality = (typeof QUALITIES)[number]

const PROFILE_OF: Record<string, Profile> = {
  galaxy: 'galaxy',
  galaxy_cluster: 'galaxy',
  emission_nebula: 'nebula',
  reflection_nebula: 'nebula',
  planetary_nebula: 'nebula',
  dark_nebula: 'nebula',
  supernova_remnant: 'nebula',
  molecular_cloud: 'nebula',
  open_cluster: 'cluster',
  globular_cluster: 'cluster',
  star_cluster: 'cluster',
  star: 'stellar',
  variable_star: 'stellar'
}

/** The v2 profile for an object type, as its SIMBAD mapping would pick; broadband when unsure. */
export function profileForObjectType(objectType: string | null): { profile: Profile; reason: string } {
  const profile = objectType ? PROFILE_OF[objectType] : undefined
  if (!profile) return { profile: 'broadband', reason: "The object type does not say, so the broadband profile, Siril_Scripts' conservative default." }
  return { profile, reason: `It is ${article(objectType ?? '')} ${(objectType ?? '').replace(/_/g, ' ')}, so the ${profile} profile.` }
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

/** J2000 coordinates as Siril's platesolve takes them: "HH:MM:SS.ss,+DD:MM:SS.s". */
export function formatCoords(raHours: number, decDeg: number): string {
  const raCs = Math.round((((raHours % 24) + 24) % 24) * 360_000) % (24 * 360_000)
  const h = Math.floor(raCs / 360_000)
  const m = Math.floor((raCs % 360_000) / 6000)
  const s = (raCs % 6000) / 100
  const decDs = Math.round(Math.abs(decDeg) * 36_000)
  const dd = Math.floor(decDs / 36_000)
  const dm = Math.floor((decDs % 36_000) / 600)
  const ds = (decDs % 600) / 10
  const pad = (n: number, w: number) => String(n).padStart(w, '0')
  return `${pad(h, 2)}:${pad(m, 2)}:${s.toFixed(2).padStart(5, '0')},${decDeg < 0 ? '-' : '+'}${pad(dd, 2)}:${pad(dm, 2)}:${ds.toFixed(1).padStart(4, '0')}`
}

/** The TARGET v2 names its output folder after: the target's name without spaces or path characters. */
export function targetLabel(name: string): string {
  return name.replace(/\s+/g, '').replace(/[^A-Za-z0-9+._-]/g, '-') || 'target'
}

export interface StackToProcess {
  path: string
  sizeBytes: number
  width: number | null
  height: number | null
  /** Three channels (an OSC stack) unless the index says otherwise. */
  colour: boolean
  focalMm: number | null
  pixelUm: number | null
}

export interface RecipeTarget {
  name: string
  objectType: string | null
  raHours: number | null
  decDeg: number | null
}

export interface RecipeInput {
  stack: StackToProcess
  target: RecipeTarget
  tools: ToolStatus[]
  windows: boolean
  profile?: Profile
  quality?: Quality
  /** Free bytes on the stack's disk, where v2 writes; null when unknown. */
  freeBytes: number | null
  /** The stack sits in a folder the app only reads. */
  inReadOnlyFolder: boolean
}

export interface PostProcessRecipe {
  profile: Profile
  profileReason: string
  quality: Quality
  /** Tools that must be found before the command can run; empty when it can. */
  missing: ToolId[]
  /** Stages left out, and why. */
  skipped: string[]
  warnings: string[]
  /** The entry script, then its arguments; null when a required tool is missing. */
  program: string | null
  args: string[]
  /** The command to paste into a terminal; null when a tool is missing or a path is unsafe to paste. */
  command: string | null
  outputDir: string
  /** Disk v2 uses at its busiest (every intermediate file at once), and what it leaves behind. */
  peakBytes: number
  keptBytes: number
  sizeApproximate: boolean
  space: SpaceVerdict
}

/**
 * 32-bit float files v2 writes at its busiest: plate_solved, linear_calibrated (FITS and TIFF),
 * linear_processed, stretched, pre_sxt, stars, starless, sl, sp, the starless and stars layers
 * and the final FITS; plus four TIFFs when RC Astro runs (sharpened, denoised, starless,
 * starless-stars). It keeps linear_calibrated, linear_processed, stretched, both layers and the
 * final FITS, with a 16-bit TIFF and an 8-bit PNG.
 */
const FLOAT_FILES_PEAK = 13
const RC_ASTRO_TIFFS = 4
const FLOAT_FILES_KEPT = 6

export function postProcessingSpace(width: number, height: number, colour: boolean, rcAstro: boolean): { peakBytes: number; keptBytes: number } {
  const pixels = width * height * (colour ? 3 : 1)
  const exports = pixels * 2 + pixels
  return {
    peakBytes: (FLOAT_FILES_PEAK + (rcAstro ? RC_ASTRO_TIFFS : 0)) * pixels * 4 + exports,
    keptBytes: FLOAT_FILES_KEPT * pixels * 4 + exports
  }
}

/**
 * Characters a terminal would act on rather than pass through: cmd.exe expands %VAR% and !VAR!
 * even inside quotes, and Siril_Scripts' .bat re-parses its arguments, so on Windows these are
 * refused rather than escaped. POSIX shells get every argument single-quoted instead.
 */
const WINDOWS_HAZARDS = /["%!^&|<>`\r\n]/g
const POSIX_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/

/** Characters in the arguments that no quoting makes safe to paste into cmd.exe; none on POSIX. */
export function shellHazards(args: string[], windows: boolean): string[] {
  if (!windows) return []
  return [...new Set(args.flatMap(a => a.match(WINDOWS_HAZARDS) ?? []))]
}

/** The command as the user would type it: cmd.exe on Windows, a POSIX shell elsewhere. */
export function commandLine(program: string, args: string[], windows: boolean): string {
  const quote = windows
    ? (a: string) => (/\s/.test(a) ? `"${a}"` : a)
    : (a: string) => (POSIX_SAFE.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)
  return [program, ...args].map(quote).join(' ')
}

/** The folder holding a file, keeping the root ("/" or "C:\\") and the path's own separator. */
export function parentDir(p: string): { dir: string; sep: string } {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  if (i < 0) return { dir: '.', sep: '/' }
  const sep = p[i]
  if (i === 0) return { dir: sep, sep }
  if (i === 2 && p[1] === ':') return { dir: p.slice(0, 3), sep }
  return { dir: p.slice(0, i), sep }
}

export function buildPostProcessRecipe(input: RecipeInput): PostProcessRecipe {
  const { stack, target, windows } = input
  const found = (id: ToolId) => input.tools.find(t => t.id === id)?.path ?? null
  const auto = profileForObjectType(target.objectType)
  const profile = input.profile ?? auto.profile
  const quality = input.quality ?? 'normal'
  const profileReason = profile === auto.profile ? auto.reason : `Your choice; the object type suggests ${auto.profile}.`

  const required: ToolId[] = ['siril-scripts', 'siril', ...(windows ? (['bash'] as ToolId[]) : [])]
  const missing = required.filter(id => !found(id))
  const rcAstro = !!found('rc-astro')
  const warnings: string[] = []
  const skipped: string[] = []

  const label = targetLabel(target.name)
  const args = [stack.path, `--target=${label}`, `--profile=${profile}`, `--quality=${quality}`]
  if (target.raHours !== null && target.decDeg !== null) args.push(`--coords=${formatCoords(target.raHours, target.decDeg)}`)
  else warnings.push('This target has no coordinates, so Siril_Scripts looks it up on SIMBAD, which needs the internet.')
  if (stack.focalMm && stack.pixelUm) args.push(`--focal=${round(stack.focalMm)}`, `--pixelsize=${round(stack.pixelUm)}`)
  else warnings.push("The stack's headers do not give focal length and pixel size, so Siril_Scripts plate-solves with its own 250 mm and 2 µm (the Vespera's); a Seestar's 2.9 µm pixels may not solve.")
  if (!rcAstro) {
    args.push('--no-bxt', '--no-nxt', '--no-sxt')
    skipped.push('BlurXTerminator, NoiseXTerminator and StarXTerminator, because the RC Astro CLI was not found.')
  }
  if (windows) {
    for (const id of ['siril', 'rc-astro'] as const) {
      const at = found(id)
      const expected = SIRIL_SCRIPTS_EXPECTS[id]
      if (at && expected && at.replace(/\\/g, '/').toLowerCase() !== expected.toLowerCase()) {
        warnings.push(`Siril_Scripts v2 runs ${toolSpec(id).label} from ${expected}, not ${at}; install it there or edit the path at the top of postprocess.sh.`)
      }
    }
  }

  const { dir, sep } = parentDir(stack.path)
  const outputDir = `${dir.endsWith(sep) ? dir : dir + sep}processed${sep}${label}`
  if (input.inReadOnlyFolder) {
    warnings.push(`The stack is in a folder the app only reads, and Siril_Scripts writes ${outputDir} beside it. Copy the stack to the work area first if that folder must stay untouched.`)
  }

  const hazards = shellHazards([found('siril-scripts') ?? '', ...args], windows)
  if (hazards.length > 0) {
    warnings.push(`The path holds ${hazards.map(h => (h === '\r' || h === '\n' ? 'a line break' : h)).join(' ')}, which Command Prompt would act on, so no command is offered to copy. Queue it instead (the app runs it without Command Prompt), or rename the file or folder without ${hazards.length === 1 ? 'it' : 'them'}.`)
  }

  const channels = stack.colour ? 3 : 1
  const measured = stack.width !== null && stack.height !== null
  const side = Math.max(1, Math.round(Math.sqrt(stack.sizeBytes / (4 * channels))))
  const { peakBytes, keptBytes } = postProcessingSpace(stack.width ?? side, stack.height ?? side, stack.colour, rcAstro)

  return {
    profile,
    profileReason,
    quality,
    missing,
    skipped,
    warnings,
    program: missing.length === 0 ? found('siril-scripts') : null,
    args,
    command: missing.length === 0 && hazards.length === 0 ? commandLine(found('siril-scripts') ?? '', args, windows) : null,
    outputDir,
    peakBytes,
    keptBytes,
    sizeApproximate: !measured,
    space: spaceVerdict(peakBytes, input.freeBytes)
  }
}

const round = (n: number) => Math.round(n * 100) / 100
