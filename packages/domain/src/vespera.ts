/**
 * Copying observations off a Vaonis Vespera over its Wi-Fi (spec 033). The scope serves its
 * storage over anonymous FTP at 10.0.0.1: a `user` folder with one folder per observation (named
 * with its date and time and, when one was chosen, its target), each holding `01-images-initial`
 * and, after a reframe or refocus, `02-images-adjust-framing` or `02-images-adjust-focus`, with
 * FITS, TIFF and JPEG files and JSON metadata; and an `expert mode` folder with dark frames.
 * That layout comes from Vaonis's support pages and owners' write-ups; it has not been checked
 * against a real scope, so these rules read it tolerantly. Pure rules: no I/O.
 *
 * Copies only add files. Nothing on the scope is ever removed or changed (the FTP adapter sends
 * no command that could), and nothing already on the PC is overwritten.
 */

import { isSafeRemoteName, remotePath, type RemoteEntry } from './ftp'
import { spaceVerdict, type SpaceVerdict } from './siril-space'

export const VESPERA_DEFAULT_HOST = '10.0.0.1'
export const VESPERA_DEFAULT_PORT = 21
/** The scope's folder of observations. */
export const VESPERA_USER_FOLDER = 'user'
/** The scope's folder of dark frames saved in expert mode. */
export const VESPERA_DARKS_FOLDER = 'expert mode'
/** Where an observation's darks land, beside the target folders. */
export const VESPERA_DARKS_TARGET = 'Vespera darks'
/** How deep inside an observation folder the survey looks for files. */
export const VESPERA_MAX_DEPTH = 3

export type VesperaFormat = 'fits' | 'tiff' | 'jpeg' | 'json'
export const VESPERA_FORMATS: readonly VesperaFormat[] = ['fits', 'tiff', 'jpeg', 'json']
/** Raw frames and the metadata beside them; TIFF and JPEG are the scope's own stacks and previews. */
export const DEFAULT_VESPERA_FORMATS: readonly VesperaFormat[] = ['fits', 'json']

const EXTENSIONS: Record<string, VesperaFormat> = {
  fit: 'fits', fits: 'fits', fts: 'fits', tif: 'tiff', tiff: 'tiff', jpg: 'jpeg', jpeg: 'jpeg', json: 'json'
}

/** What kind of file a name is, by its extension, or null for anything the copy leaves alone. */
export function vesperaFormat(name: string): VesperaFormat | null {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return null
  return EXTENSIONS[name.slice(dot + 1).toLowerCase()] ?? null
}

export interface VesperaSettings {
  host: string
  port: number
  /** Where copies land; null when neither the setting nor the home folder says. */
  landingRoot: string | null
  /** The landing folder is the home folder's raw folder, as no folder of its own is set. */
  landingIsHomeRaw: boolean
  formats: VesperaFormat[]
  /** Saved settings that could not be read and so were replaced by their default. */
  ignored: ('vespera_host' | 'vespera_formats')[]
}

const HOSTNAME = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** Whether text is an address the app may connect to: an IPv4 address or a host name. */
export function isScopeHost(text: string): boolean {
  const ip = IPV4.exec(text)
  if (ip) return ip.slice(1).every(n => Number(n) <= 255)
  return !/^[\d.]+$/.test(text) && HOSTNAME.test(text)
}

/**
 * The Vespera settings from what is saved: `vespera_host` (an address, port after a colon),
 * `vespera_landing` and `vespera_formats` (comma separated). Anything unreadable falls back to its
 * default: 10.0.0.1 on port 21, FITS and JSON, and the home folder's `raw` folder to land in.
 */
export function parseVesperaSettings(saved: Record<string, string | null | undefined>, homeRaw: string | null): VesperaSettings {
  let host = VESPERA_DEFAULT_HOST
  let port = VESPERA_DEFAULT_PORT
  const address = (saved.vespera_host ?? '').trim()
  const m = /^([^:\s]+)(?::(\d{1,5}))?$/.exec(address)
  if (m && isScopeHost(m[1])) {
    const p = m[2] === undefined ? VESPERA_DEFAULT_PORT : Number(m[2])
    if (p >= 1 && p <= 65535) {
      host = m[1]
      port = p
    }
  }
  const ignored: VesperaSettings['ignored'] = []
  if (address !== '' && host === VESPERA_DEFAULT_HOST && port === VESPERA_DEFAULT_PORT && address !== VESPERA_DEFAULT_HOST && address !== `${VESPERA_DEFAULT_HOST}:${VESPERA_DEFAULT_PORT}`) {
    ignored.push('vespera_host')
  }
  const savedFormats = (saved.vespera_formats ?? '').trim()
  const wanted = new Set(savedFormats.split(',').map(f => f.trim().toLowerCase()))
  const picked = VESPERA_FORMATS.filter(f => wanted.has(f))
  // Metadata alone is not a copy worth making, so at least one kind of image is always copied.
  const formats = picked.some(f => f !== 'json') ? picked : [...DEFAULT_VESPERA_FORMATS]
  if (savedFormats !== '' && formats !== picked) ignored.push('vespera_formats')
  const landing = (saved.vespera_landing ?? '').trim()
  return { host, port, landingRoot: landing || homeRaw || null, landingIsHomeRaw: !landing && !!homeRaw, formats, ignored }
}

/** When an observation was taken and of what, as far as its folder name says. */
export interface ObservationName {
  /** Local time on the scope, `YYYY-MM-DDTHH:MM[:SS]`, or a date alone; null when the name has none. */
  takenAt: string | null
  target: string | null
}

const STAMP = /(?<!\d)(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})(?:[T _-]+(\d{2})[-_:h.]?(\d{2})(?:[-_:m.]?(\d{2}))?)?(?!\d)/

/** The date at the start of a stamp. */
const DATE_PART = /^\d{4}[-_.]?\d{2}[-_.]?\d{2}/

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Reads an observation folder's name, such as `2024-03-10_21-33-02_M 42` or `M42 20240310 2133`:
 * the first date in it (with its time when one follows) and what is left, trimmed of separators,
 * as the target. A date that is not a real day is not a date.
 */
export function parseObservationName(name: string): ObservationName {
  const m = STAMP.exec(name)
  let takenAt: string | null = null
  let rest = name
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const dayOk = y >= 2000 && y <= 2099 && mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate()
    if (dayOk) {
      const date = `${y}-${pad(mo)}-${pad(d)}`
      const [h, mi, s] = [m[4], m[5], m[6]].map(x => (x === undefined ? null : Number(x)))
      const timeOk = h !== null && mi !== null && h <= 23 && mi <= 59 && (s === null || s <= 59)
      takenAt = timeOk ? `${date}T${pad(h)}:${pad(mi)}${s === null ? '' : `:${pad(s)}`}` : date
      // A time that is not a time stays in the name rather than being read as one.
      const used = timeOk ? m[0].length : DATE_PART.exec(m[0])![0].length
      rest = name.slice(0, m.index) + ' ' + name.slice(m.index + used)
    }
  }
  const target = rest.replace(/[_]+/g, ' ').replace(/^[\s\-.,]+|[\s\-.,]+$/g, '').replace(/\s{2,}/g, ' ')
  return { takenAt, target: target.length > 0 ? target : null }
}

/** One file of an observation on the scope. */
export interface RemoteFile {
  /** Inside the observation folder, with forward slashes, such as `01-images-initial/img-0001.fits`. */
  relative: string
  sizeBytes: number | null
  format: VesperaFormat
}

export type ObservationKind = 'observation' | 'darks'

/** One observation folder on the scope, or the darks folder. */
export interface Observation {
  kind: ObservationKind
  /** The folder's own name on the scope. */
  folder: string
  /** Its full path on the scope. */
  remote: string
  takenAt: string | null
  /** The target the name gives, or null. */
  target: string | null
  files: RemoteFile[]
}

/** Every file of a folder tree, by its path relative to the tree's top. */
export type ListedTree = { relative: string; entry: RemoteEntry }[]

/** An observation from its folder and the files listed under it; files of no known kind are left out. */
export function observationOf(kind: ObservationKind, parent: string, folder: string, tree: ListedTree): Observation {
  const named = kind === 'darks' ? { takenAt: null, target: VESPERA_DARKS_TARGET } : parseObservationName(folder)
  const files = tree
    .filter(t => t.entry.kind === 'file')
    .flatMap(t => {
      const format = vesperaFormat(t.entry.name)
      return format ? [{ relative: t.relative, sizeBytes: t.entry.sizeBytes, format }] : []
    })
    .sort((a, b) => (a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0))
  return { kind, folder, remote: remotePath(parent, folder), takenAt: named.takenAt, target: named.target, files }
}

/** Observations newest first (by the time in their name, then by name), darks last. */
export function sortObservations(list: Observation[]): Observation[] {
  const key = (o: Observation) => `${o.takenAt ?? ''}\u0000${o.folder}`
  return [...list].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'darks' ? 1 : -1
    const [x, y] = [key(a), key(b)]
    return x < y ? 1 : x > y ? -1 : 0
  })
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/**
 * A name made safe for a Windows folder or file: characters Windows refuses become `_`, trailing
 * dots and spaces go, and a reserved device name (`CON`, `COM1`) gets a `_` in front. Never empty,
 * never `.` or `..`.
 */
export function localName(name: string): string {
  // eslint-disable-next-line no-control-regex
  let out = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '')
  if (WINDOWS_RESERVED.test(out)) out = `_${out}`
  return out.length === 0 || out === '.' || out === '..' ? '_' : out
}

/** The target folder an observation lands in: the name the user gave, else its own, else "Vespera". */
export function landingTarget(observation: Observation, chosen: string | null | undefined): string {
  const name = (chosen ?? '').trim() || observation.target || 'Vespera'
  return localName(name)
}

/** Where one file lands, as folder parts under the landing root: target, observation, then its own path. */
export function landingParts(observation: Observation, target: string, file: RemoteFile): string[] {
  return [localName(target), localName(observation.folder), ...file.relative.split('/').map(localName)]
}

/** An observation the user picked, and the target folder to put it in. */
export interface CopyChoice {
  folder: string
  kind: ObservationKind
  /** The target name as the user confirmed it; blank uses the observation's own. */
  target?: string | null
}

/** One file to copy. */
export interface PlannedCopy {
  observation: string
  kind: ObservationKind
  /** Its full path on the scope. */
  remote: string
  /** Where it lands, as parts under the landing root. */
  parts: string[]
  sizeBytes: number | null
}

/** What the PC already holds where each file would land: its size, or null when nothing is there. */
export type LandingSizes = Map<string, number | null>

export const partsKey = (parts: string[]): string => parts.join('/')

export type SkipReason = 'already-copied' | 'different-file' | 'same-name'

export interface SkippedCopy extends PlannedCopy {
  reason: SkipReason
}

export interface CopyPlan {
  copies: PlannedCopy[]
  skipped: SkippedCopy[]
  /** Bytes still to copy; files of unknown size count as nothing. */
  bytes: number
}

/** Every file a choice of observations would land, in order, with its landing parts; formats not wanted are left out. */
export function plannedFiles(observations: Observation[], choices: CopyChoice[], formats: readonly VesperaFormat[]): PlannedCopy[] {
  const wanted = new Set(formats)
  const out: PlannedCopy[] = []
  for (const choice of choices) {
    const obs = observations.find(o => o.folder === choice.folder && o.kind === choice.kind)
    if (!obs) continue
    const target = landingTarget(obs, choice.target)
    for (const file of obs.files) {
      if (!wanted.has(file.format)) continue
      out.push({ observation: obs.folder, kind: obs.kind, remote: remotePath(obs.remote, file.relative), parts: landingParts(obs, target, file), sizeBytes: file.sizeBytes })
    }
  }
  return out
}

/**
 * Which planned files still need copying. A file already on the PC at its landing place with the
 * scope's size is copied already; one there with another size is a different file, which is never
 * overwritten; and a second file that lands on the same place as an earlier one (two names that
 * become one once made safe for Windows) is skipped.
 */
export function planCopies(planned: PlannedCopy[], have: LandingSizes): CopyPlan {
  const copies: PlannedCopy[] = []
  const skipped: SkippedCopy[] = []
  const taken = new Set<string>()
  for (const p of planned) {
    const key = partsKey(p.parts).toLowerCase()
    if (taken.has(key)) {
      skipped.push({ ...p, reason: 'same-name' })
      continue
    }
    taken.add(key)
    const there = have.get(partsKey(p.parts)) ?? null
    if (there === null) copies.push(p)
    else if (p.sizeBytes !== null && there === p.sizeBytes) skipped.push({ ...p, reason: 'already-copied' })
    else skipped.push({ ...p, reason: 'different-file' })
  }
  return { copies, skipped, bytes: copies.reduce((n, c) => n + (c.sizeBytes ?? 0), 0) }
}

/** One observation as the control page shows it: what it holds and how much of it is on the PC. */
export interface ObservationStatus {
  kind: ObservationKind
  folder: string
  takenAt: string | null
  target: string | null
  /** Files of the wanted formats, and their bytes. */
  files: number
  bytes: number
  /** Of those, already on the PC. */
  copiedFiles: number
  /** Still to copy, and their bytes. */
  newFiles: number
  newBytes: number
  /**
   * Files left alone because a different file is where they would land: one on the PC with
   * another size, or an earlier file of the copy whose name is the same once made safe for Windows.
   */
  differentFiles: number
  /** How many frames of each format it holds, wanted or not. */
  counts: Record<VesperaFormat, number>
  /** The target folder it lands in unless the user names another. */
  landsIn: string
  /** Nothing of the wanted kinds, all on the PC, none yet, or some. */
  state: CopyStateOf
}

export type CopyStateOf = 'empty' | 'copied' | 'new' | 'partly'

/** Where an observation stands: nothing to copy, all on the PC, none of it yet (bar files left alone), or some. */
export function copyStateOf(files: number, newFiles: number, differentFiles: number): CopyStateOf {
  if (files === 0) return 'empty'
  if (newFiles === 0) return 'copied'
  return newFiles === files - differentFiles ? 'new' : 'partly'
}

/**
 * Each observation's status against what the PC holds, from one plan of them all, so a file that
 * would land where another observation's file lands counts the same way the copy will treat it.
 * Each observation lands in the target its choice names (else its own); observations no choice
 * names are left out.
 */
export function observationStatuses(observations: Observation[], choices: CopyChoice[], formats: readonly VesperaFormat[], have: LandingSizes): ObservationStatus[] {
  const plan = planCopies(plannedFiles(observations, choices, formats), have)
  const out: ObservationStatus[] = []
  for (const choice of choices) {
    const obs = observations.find(o => o.folder === choice.folder && o.kind === choice.kind)
    if (!obs) continue
    const mine = (p: PlannedCopy) => p.kind === obs.kind && p.observation === obs.folder
    const copies = plan.copies.filter(mine)
    const skipped = plan.skipped.filter(mine)
    const counts: Record<VesperaFormat, number> = { fits: 0, tiff: 0, jpeg: 0, json: 0 }
    for (const f of obs.files) counts[f.format]++
    const all = copies.length + skipped.length
    const differentFiles = skipped.filter(s => s.reason !== 'already-copied').length
    out.push({
      kind: obs.kind,
      folder: obs.folder,
      takenAt: obs.takenAt,
      target: obs.target,
      files: all,
      bytes: [...copies, ...skipped].reduce((n, c) => n + (c.sizeBytes ?? 0), 0),
      copiedFiles: skipped.length - differentFiles,
      newFiles: copies.length,
      newBytes: copies.reduce((n, c) => n + (c.sizeBytes ?? 0), 0),
      differentFiles,
      counts,
      landsIn: landingTarget(obs, choice.target),
      state: copyStateOf(all, copies.length, differentFiles)
    })
  }
  return out
}

/** A target folder under the landing root and the observation folders already in it. */
export interface LandedTarget {
  target: string
  folders: string[]
}

/**
 * The choice to survey each observation with: the target folder it was copied into before, when
 * one under the landing root already holds a folder of its name (its own target first, then by
 * name, letters compared as Windows does), else its own target. So an observation copied under a
 * renamed target is not taken for a new one.
 */
export function surveyChoices(observations: Observation[], landed: LandedTarget[]): CopyChoice[] {
  const byName = [...landed].sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : 0))
  return observations.map(obs => {
    const own = landingTarget(obs, null)
    const name = localName(obs.folder).toLowerCase()
    const holds = (t: LandedTarget) => t.folders.some(f => f.toLowerCase() === name)
    const found = byName.find(t => t.target.toLowerCase() === own.toLowerCase() && holds(t)) ?? byName.find(holds)
    return { folder: obs.folder, kind: obs.kind, target: found ? found.target : null }
  })
}

/** Whether the landing disk has room for a plan, with a margin of 1% so the disk is never filled to the last byte. */
export function copySpace(plan: CopyPlan, freeBytes: number | null): SpaceVerdict {
  return spaceVerdict(Math.ceil(plan.bytes * 1.01), freeBytes)
}

/** How far a copy has got and how long the rest should take at the speed so far. */
export interface CopyPace {
  /** 0 to 1. */
  fraction: number
  bytesPerSecond: number | null
  remainingSeconds: number | null
}

/** The pace of a copy from the bytes done, the bytes in all and the milliseconds it has run. */
export function copyPace(doneBytes: number, totalBytes: number, elapsedMs: number): CopyPace {
  const done = Math.max(0, doneBytes)
  const total = Math.max(0, totalBytes)
  const fraction = total === 0 ? 1 : Math.min(1, done / total)
  if (!(elapsedMs >= 1000) || done === 0) return { fraction, bytesPerSecond: null, remainingSeconds: null }
  const bytesPerSecond = (done * 1000) / elapsedMs
  return { fraction, bytesPerSecond, remainingSeconds: Math.max(0, Math.ceil((total - done) / bytesPerSecond)) }
}

/** Folder names of a listing that can be surveyed: folders whose names are safe to ask for. */
export function surveyFolders(entries: RemoteEntry[]): string[] {
  return entries.filter(e => e.kind === 'dir' && isSafeRemoteName(e.name)).map(e => e.name)
}

/** The scope's observation and darks folders in its top-level listing, matched whatever their case. */
export function vesperaRoots(entries: RemoteEntry[]): { user: string | null; darks: string | null } {
  const dirs = surveyFolders(entries)
  const find = (name: string) => dirs.find(d => d.toLowerCase() === name) ?? null
  return { user: find(VESPERA_USER_FOLDER), darks: find(VESPERA_DARKS_FOLDER) }
}
