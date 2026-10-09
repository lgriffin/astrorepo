import type { ToolId, ToolStatus } from './tools'

/**
 * Tool health (specs/023-hub-syqon): each tool's version, and whether the catalogues it needs are
 * installed: ASTAP's star database, Siril's Gaia catalogue for colour calibration (SPCC) and RC
 * Astro's model files. Pure rules over a folder's file names; listing folders and running a tool's
 * version flag are adapters' jobs.
 */

// ── Versions ────────────────────────────────────────────────────────────

/**
 * The version a tool printed: the first dotted number on its output, with any suffix such as
 * "-beta2" ("siril 1.4.0-beta2" gives "1.4.0-beta2"). Null when it printed none.
 */
export function parseToolVersion(output: string): string | null {
  for (const line of output.split(/\r?\n/)) {
    const m = /\bv?(\d+(?:\.\d+)+(?:[-+][0-9A-Za-z.]+)?)\b/.exec(line)
    if (m) return m[1]
  }
  return null
}

// ── Catalogues ──────────────────────────────────────────────────────────

export type CatalogueId = 'astap-stars' | 'siril-spcc' | 'rc-astro-models'

export interface CatalogueSpec {
  id: CatalogueId
  /** The tool that needs it; it is only checked once that tool is found. */
  tool: ToolId
  label: string
  /** What it is for and how to get it, in the user's words. */
  why: string
  /** app_settings key for a folder the user names, looked in first. */
  settingKey: string
  /** Folders inside the tool's own folder to look in ('' is the tool's folder itself). */
  nearTool: string[]
  /** Other standard folders, per platform (forward slashes; `~` is the home folder, `%VAR%` an environment variable). */
  standard: { windows: string[]; other: string[] }
  /** Shown but blocks nothing: the tool can work without it (Siril fetches Gaia data online), or its files are not confirmed. */
  optional?: boolean
}

export const CATALOGUES: readonly CatalogueSpec[] = [
  {
    id: 'astap-stars',
    tool: 'astap',
    label: 'ASTAP star database',
    why: 'ASTAP solves against a star database you install beside it, such as D50 or H18 from its download page.',
    settingKey: 'catalogue_path_astap',
    nearTool: [''],
    standard: { windows: ['C:/Program Files/astap'], other: ['/opt/astap', '/usr/share/astap/data', '/usr/local/opt/astap'] }
  },
  {
    id: 'siril-spcc',
    tool: 'siril',
    label: "Siril's Gaia SPCC catalogue",
    why: "Siril's colour calibration (SPCC) reads Gaia spectra from this local catalogue when it is installed, and online otherwise. Install it from Siril's catalogue installer to calibrate offline.",
    settingKey: 'catalogue_path_siril_spcc',
    nearTool: ['../share/siril/catalogue'],
    optional: true,
    standard: { windows: ['%LOCALAPPDATA%/siril/catalogue', '%LOCALAPPDATA%/siril'], other: ['~/.local/share/siril/catalogue', '~/.local/share/siril'] }
  },
  {
    id: 'rc-astro-models',
    tool: 'rc-astro',
    label: 'RC Astro model files',
    why: 'BlurXTerminator, NoiseXTerminator and StarXTerminator each need their model file, which the RC Astro installer puts beside the CLI.',
    settingKey: 'catalogue_path_rc_astro',
    nearTool: ['', 'models'],
    // The installer's model file names are not confirmed yet, so a miss is shown but blocks nothing.
    optional: true,
    standard: { windows: [], other: [] }
  }
]

export function catalogueSpec(id: CatalogueId): CatalogueSpec {
  const spec = CATALOGUES.find(c => c.id === id)
  if (!spec) throw new Error(`Unknown catalogue ${id}`)
  return spec
}

export interface AstapDatabase {
  /** The database's name as ASTAP's download page gives it: D50, H18, G17. */
  name: string
  files: number
}

/**
 * ASTAP's star databases in a folder listing: files such as `d50_0101.1476` or `h17_1234.290`,
 * grouped by the database they belong to. Shared with plate solving (slice D).
 */
export function astapCatalogues(dirListing: string[]): AstapDatabase[] {
  const counts = new Map<string, number>()
  for (const name of dirListing) {
    const m = /^([a-z]\d{2})_[0-9a-z]+\.(?:290|1476)$/i.exec(name.split(/[\\/]/).pop() ?? name)
    if (m) counts.set(m[1].toUpperCase(), (counts.get(m[1].toUpperCase()) ?? 0) + 1)
  }
  return [...counts].map(([name, files]) => ({ name, files })).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The files that make a catalogue present, out of a folder listing. Siril's local SPCC catalogue
 * is the Gaia DR3 XP-sampled spectra (`siril_cat*_xpsamp*.dat`); RC Astro's models are the
 * BlurXTerminator, NoiseXTerminator and StarXTerminator model files. Both patterns are
 * assumptions to confirm on the PC (specs/023-hub-syqon).
 */
export function catalogueFiles(id: CatalogueId, dirListing: string[]): string[] {
  const base = (n: string) => n.split(/[\\/]/).pop() ?? n
  switch (id) {
    case 'astap-stars':
      return dirListing.filter(n => astapCatalogues([n]).length > 0)
    case 'siril-spcc':
      return dirListing.filter(n => /^siril_cat\w*xpsamp\w*\.dat$/i.test(base(n)))
    case 'rc-astro-models':
      return dirListing.filter(n => /(blur|noise|star)xterminator[\w.-]*\.(pb|onnx|mlpackage|mlmodel|bin)$/i.test(base(n)))
  }
}

/** One folder looked in, with its file names; null when it is not there or cannot be read. */
export interface CatalogueFolder {
  dir: string
  names: string[] | null
}

export type CatalogueState = 'present' | 'missing' | 'not-checked'

export interface CatalogueStatus {
  id: CatalogueId
  tool: ToolId
  label: string
  /** Not checked while the tool that needs it is not found. */
  state: CatalogueState
  /** The folder it was found in. */
  dir: string | null
  /** What was found: "D50 (1476 files)", "12 files". */
  found: string | null
  /** Every folder looked in, when missing. */
  looked: string[]
}

/** Whether a catalogue is installed: the first folder that holds its files, or every folder looked in. */
export function catalogueStatus(spec: CatalogueSpec, tool: Pick<ToolStatus, 'path'> | null, folders: CatalogueFolder[]): CatalogueStatus {
  const base = { id: spec.id, tool: spec.tool, label: spec.label }
  if (!tool?.path) return { ...base, state: 'not-checked', dir: null, found: null, looked: [] }
  for (const folder of folders) {
    const files = catalogueFiles(spec.id, folder.names ?? [])
    if (files.length === 0) continue
    const found =
      spec.id === 'astap-stars'
        ? astapCatalogues(files)
            .map(d => `${d.name} (${d.files} ${d.files === 1 ? 'file' : 'files'})`)
            .join(', ')
        : `${files.length} ${files.length === 1 ? 'file' : 'files'}`
    return { ...base, state: 'present', dir: folder.dir, found, looked: [] }
  }
  return { ...base, state: 'missing', dir: null, found: null, looked: folders.map(f => f.dir) }
}

/** Catalogues that are missing for a tool that is found, so the steps that need them cannot run. */
export function missingCatalogues(statuses: CatalogueStatus[]): CatalogueStatus[] {
  return statuses.filter(s => s.state === 'missing')
}

/**
 * The catalogues Siril_Scripts v2 cannot run without: RC Astro's models when it runs RC Astro (it
 * skips RC Astro when the CLI is not found). Siril's Gaia catalogue is optional, since Siril's
 * colour calibration fetches Gaia data online when it is not installed.
 */
export function postProcessCatalogues(rcAstroRuns: boolean): CatalogueId[] {
  return rcAstroRuns ? ['rc-astro-models'] : []
}

/** Missing catalogues that block a step: those that are not optional. */
export function blockingMissing(statuses: CatalogueStatus[]): CatalogueStatus[] {
  return statuses.filter(s => s.state === 'missing' && !catalogueSpec(s.id).optional)
}

/** "Needs Siril's Gaia SPCC catalogue, which is not installed." for the catalogues a step lacks; null when none. */
export function catalogueBlock(needed: CatalogueId[], statuses: CatalogueStatus[]): string | null {
  const lacking = blockingMissing(statuses).filter(s => needed.includes(s.id)).map(s => s.label)
  if (lacking.length === 0) return null
  const list = lacking.length === 1 ? lacking[0] : `${lacking.slice(0, -1).join(', ')} and ${lacking[lacking.length - 1]}`
  // "RC Astro model files" reads as plural on its own.
  const many = lacking.length > 1 || lacking[0].endsWith('files')
  return `Needs ${list}, which ${many ? 'are' : 'is'} not installed. Install ${many ? 'them' : 'it'}, or set ${lacking.length > 1 ? 'their folders' : 'its folder'} in Settings, under Tools.`
}
