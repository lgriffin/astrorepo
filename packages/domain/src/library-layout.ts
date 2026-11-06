/**
 * The library layout (specs/044-library-layout): which folder under the home folder holds raw
 * frames, stacked masters, TIFF exports and finished pictures. The scan used to look for folders
 * named exactly raw, stacked, tif and images; now it looks inside the home folder, suggests which
 * folder plays each part and why, and lets the user choose. Pure: listing folders is an adapter's.
 */

import { frameFileKind } from './camera-raw'

/** The four parts a folder of the library can play, in the order the scan reads them. */
export const LIBRARY_ROLES = ['raw', 'stacked', 'tif', 'images'] as const
export type LibraryRole = (typeof LIBRARY_ROLES)[number]

/** What each part is called on screen. */
export const LIBRARY_ROLE_LABELS: Record<LibraryRole, string> = {
  raw: 'Raw frames',
  stacked: 'Stacked masters',
  tif: 'TIFF exports',
  images: 'Finished pictures'
}

/** The same names inside a sentence. */
export const LIBRARY_ROLE_NAMES: Record<LibraryRole, string> = {
  raw: 'raw frames',
  stacked: 'stacked masters',
  tif: 'TIFF exports',
  images: 'finished pictures'
}

/** The folder names the scan has always looked for, used when nothing has been chosen (LAY-001). */
export const CONVENTIONAL_FOLDERS: Record<LibraryRole, string> = { raw: 'raw', stacked: 'stacked', tif: 'tif', images: 'images' }

/** The settings that hold a folder the user chose for each part; empty means the conventional one. */
export const LIBRARY_FOLDER_KEYS: Record<LibraryRole, string> = {
  raw: 'library_raw_folder',
  stacked: 'library_stacked_folder',
  tif: 'library_tif_folder',
  images: 'library_images_folder'
}

/** Folder names that say what a folder holds, compared without case, spaces, dashes or underscores. */
const NAME_CLUES: Record<LibraryRole, readonly string[]> = {
  raw: ['raw', 'raws', 'rawdata', 'lights', 'light', 'lightframes', 'subs', 'subframes', 'frames', 'capture', 'captures', 'acquisition', 'fits', 'rawfits'],
  stacked: ['stacked', 'stacks', 'stack', 'masters', 'master', 'integrated', 'integration', 'integrations', 'stackedfits'],
  tif: ['tif', 'tiff', 'tifs', 'tiffs', 'export', 'exports', 'exported', 'tifexports', 'tiffexports'],
  images: ['images', 'image', 'pictures', 'photos', 'final', 'finals', 'finished', 'processed', 'jpg', 'jpeg', 'png', 'gallery', 'output', 'outputs']
}

/** A FITS file named as a stack or master: Seestar's Stacked_..., Siril's ..._stacked, master_..., integration... */
const MASTER_NAME = /(^|[^a-z])(stack|stacked|master|integrat|drizzle|result)/i
/** A light frame by name: Light_..., ..._light_..., lights. */
const LIGHT_NAME = /(^|[^a-z])lights?([^a-z]|$)/i
const TIFF = /\.tiff?$/i
const PICTURE = /\.(png|jpe?g)$/i

/** What one file looks like it is, from its name alone. */
export type SampleKind = 'light' | 'master' | 'fits' | 'camera-raw' | 'tiff' | 'picture' | 'other'

export function sampleKind(fileName: string): SampleKind {
  const frame = frameFileKind(fileName)
  if (frame === 'fits') {
    if (MASTER_NAME.test(fileName)) return 'master'
    return LIGHT_NAME.test(fileName) ? 'light' : 'fits'
  }
  if (frame === 'raw' || frame === 'raw-unread') return 'camera-raw'
  if (TIFF.test(fileName)) return 'tiff'
  if (PICTURE.test(fileName)) return 'picture'
  return 'other'
}

/** A folder directly under the home folder, with a sample of what is inside it. */
export interface FolderSample {
  name: string
  path: string
  /** Names of some files found inside it, at any depth, up to the adapter's limit. */
  files: string[]
  /** How many of its direct subfolders are named for a sky object (M 31, NGC 7000, ...). */
  objectFolders: number
  /** Whether its own name is a sky object's, which says the library is organised by target. */
  isObject: boolean
}

export interface RoleSuggestion {
  role: LibraryRole
  path: string
  name: string
  /** By its name, or by what is inside it. */
  basis: 'name' | 'contents'
  /** Plain sentences on why, for the user to judge. */
  reasons: string[]
}

export interface LayoutSuggestion {
  /** One suggestion per part found, in LIBRARY_ROLES order. */
  roles: RoleSuggestion[]
  /** Parts no folder looks like. */
  missing: LibraryRole[]
  /** Folders under the home folder given no part. */
  unused: string[]
  /** Most folders under the home folder are named for objects: the library is filed by target first. */
  byTarget: boolean
}

const squash = (name: string) => name.toLowerCase().replace(/[\s_.-]+/g, '')

/** The part a folder's name says it plays, if any. */
export function roleByName(name: string): LibraryRole | null {
  const n = squash(name)
  return LIBRARY_ROLES.find(role => NAME_CLUES[role].includes(n)) ?? null
}

const NAME_SCORE = 10
const CONTENT_SCORE = 6
/** Under this a folder is not suggested for a part. */
const MIN_SCORE = 3

interface Scored {
  role: LibraryRole
  folder: FolderSample
  score: number
  basis: 'name' | 'contents'
  reasons: string[]
}

function counted(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** How strongly a folder looks like each part, with the reasons. */
export function scoreFolder(folder: FolderSample): Scored[] {
  const kinds: Record<SampleKind, number> = { light: 0, master: 0, fits: 0, 'camera-raw': 0, tiff: 0, picture: 0, other: 0 }
  for (const f of folder.files) kinds[sampleKind(f)]++
  const looked = folder.files.length
  const byName = roleByName(folder.name)
  const of = counted(looked, 'file')
  const objects = folder.objectFolders > 0 ? ` It holds ${counted(folder.objectFolders, 'folder')} named for objects.` : ''

  const content: Record<LibraryRole, { share: number; says: string }> = {
    raw: {
      // A plainly named FITS file is as likely a raw frame as a master: half weight.
      share: looked ? (kinds.light + kinds['camera-raw'] + kinds.fits / 2) / looked : 0,
      says: kinds.light + kinds['camera-raw'] > 0
        ? `Light frames${kinds['camera-raw'] ? ' or camera RAW' : ''}: ${kinds.light + kinds['camera-raw']} of ${of} looked at.`
        : `FITS files: ${kinds.fits} of ${of} looked at.`
    },
    stacked: {
      share: looked ? (kinds.master + kinds.fits / 4) / looked : 0,
      says: `Named as stacks or masters: ${kinds.master} of ${of} looked at.`
    },
    tif: { share: looked ? kinds.tiff / looked : 0, says: `TIFF: ${kinds.tiff} of ${of} looked at.` },
    images: { share: looked ? kinds.picture / looked : 0, says: `PNG or JPEG pictures: ${kinds.picture} of ${of} looked at.` }
  }

  return LIBRARY_ROLES.map(role => {
    const named = byName === role
    const fromContent = CONTENT_SCORE * content[role].share
    const reasons: string[] = []
    if (named) reasons.push(`It is called ${folder.name}.`)
    if (content[role].share > 0) reasons.push(content[role].says + objects)
    return { role, folder, score: (named ? NAME_SCORE : 0) + fromContent, basis: named ? 'name' : 'contents', reasons } satisfies Scored
  })
}

/**
 * Suggests a folder for each part (LAY-002, LAY-003): every folder is scored for every part by its
 * name and by the files sampled inside it, and the best pairs are taken first, so no folder plays
 * two parts and no part has two folders. A part nothing looks like is left missing.
 */
export function suggestLayout(folders: FolderSample[]): LayoutSuggestion {
  const scored = folders.flatMap(scoreFolder).filter(s => s.score >= MIN_SCORE)
  // Best first; ties go to the part read first, then to the folder with the conventional name
  // (read already, so nothing changes), then to the folder's name, so the answer is stable.
  const conventional = (s: Scored) => (s.folder.name.toLowerCase() === CONVENTIONAL_FOLDERS[s.role] ? 0 : 1)
  scored.sort((a, b) =>
    b.score - a.score ||
    LIBRARY_ROLES.indexOf(a.role) - LIBRARY_ROLES.indexOf(b.role) ||
    conventional(a) - conventional(b) ||
    a.folder.name.localeCompare(b.folder.name))
  const taken = new Map<LibraryRole, Scored>()
  const used = new Set<string>()
  for (const s of scored) {
    if (taken.has(s.role) || used.has(s.folder.path)) continue
    taken.set(s.role, s)
    used.add(s.folder.path)
  }
  const objects = folders.filter(f => f.isObject).length
  return {
    roles: LIBRARY_ROLES.flatMap(role => {
      const s = taken.get(role)
      return s ? [{ role, path: s.folder.path, name: s.folder.name, basis: s.basis, reasons: s.reasons }] : []
    }),
    missing: LIBRARY_ROLES.filter(role => !taken.has(role)),
    unused: folders.filter(f => !used.has(f.path)).map(f => f.name).sort((a, b) => a.localeCompare(b)),
    byTarget: folders.length > 0 && objects * 2 > folders.length
  }
}

/** The folder under the home folder with a part's conventional name, matched without case (LAY-001). */
export function conventionalFolder(role: LibraryRole, names: string[]): string | null {
  const wanted = CONVENTIONAL_FOLDERS[role]
  return names.find(n => n === wanted) ?? names.find(n => n.toLowerCase() === wanted) ?? null
}

/** Where a part's folder came from: chosen in Settings, found by its conventional name, or not there. */
export type FolderSource = 'chosen' | 'named' | 'missing'

/**
 * Which folder each part reads (LAY-001, LAY-004): the one chosen in Settings, else the folder
 * under the home folder with the conventional name in any case, else the conventional name, which
 * does not exist yet. `join` builds a path under the home folder.
 */
export function resolveLayout(
  chosen: Partial<Record<LibraryRole, string | null>>,
  homeNames: string[],
  join: (name: string) => string
): Record<LibraryRole, { path: string; source: FolderSource }> {
  const out = {} as Record<LibraryRole, { path: string; source: FolderSource }>
  for (const role of LIBRARY_ROLES) {
    const picked = chosen[role]?.trim()
    const named = conventionalFolder(role, homeNames)
    out[role] = picked
      ? { path: picked, source: 'chosen' }
      : named ? { path: join(named), source: 'named' } : { path: join(CONVENTIONAL_FOLDERS[role]), source: 'missing' }
  }
  return out
}

/** One spelling of a path for comparing: forward slashes, no trailing slash, any case (Windows). */
export function samePathKey(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * What is wrong with a layout before it is saved (LAY-006): two parts in one folder, or one part's
 * folder inside another's, would read the same files twice under two parts.
 */
export function layoutProblems(layout: Partial<Record<LibraryRole, string | null>>): string[] {
  const set = LIBRARY_ROLES.flatMap(role => {
    const p = layout[role]?.trim()
    return p ? [{ role, key: samePathKey(p) }] : []
  })
  const problems: string[] = []
  for (let i = 0; i < set.length; i++) {
    for (let j = i + 1; j < set.length; j++) {
      const a = set[i]
      const b = set[j]
      const [la, lb] = [LIBRARY_ROLE_LABELS[a.role], LIBRARY_ROLE_LABELS[b.role]]
      const [na, nb] = [LIBRARY_ROLE_NAMES[a.role], LIBRARY_ROLE_NAMES[b.role]]
      if (a.key === b.key) problems.push(`${la} and ${nb} are the same folder.`)
      else if (b.key.startsWith(a.key + '/')) problems.push(`${lb} are inside the folder for ${na}.`)
      else if (a.key.startsWith(b.key + '/')) problems.push(`${la} are inside the folder for ${nb}.`)
    }
  }
  return problems
}

/** The parts where taking the suggestion would change the folder read now; a part chosen by hand is never changed. */
export function suggestedChanges(
  current: Record<LibraryRole, { path: string; source: FolderSource }>,
  suggestion: LayoutSuggestion
): RoleSuggestion[] {
  // Both paths are built from the same listing of the home folder, so they are compared as they
  // are: on a system where case matters, images and Images are two folders.
  const bare = (p: string) => p.trim().replace(/[\\/]+$/, '')
  return suggestion.roles.filter(s => current[s.role].source !== 'chosen' && bare(current[s.role].path) !== bare(s.path))
}
