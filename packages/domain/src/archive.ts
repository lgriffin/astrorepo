/**
 * Archiving a finished target. SyQon Studio keeps a project two ways: a self-contained archive
 * (SYQ) and a compact project that links to its sources (SYQPRJ). Astrorepo does the same with a
 * target's Siril work folder: it keeps the stacks, their manifests, the masters and the finished
 * images, and either lists where the raw frames are or bundles them in. The intermediates Siril
 * leaves behind can then go, because a stack manifest says how to make them again. Pure rules.
 */

import type { SirilFolder } from './ingest'
import { FAILED_FOLDER, MANIFEST_SUFFIX, STEP_FOLDER, type StackManifest } from './provenance'

export type ArchiveMode = 'linked' | 'self-contained'

/** One file in a work folder, as measured on disk. */
export interface WorkAreaFile {
  /** Relative to the work folder, with forward slashes. */
  path: string
  sizeBytes: number
  /** How many names the file has on its disk (hard links); 1 for a file of its own. */
  links: number
  /** The same for every name of one file (its disk and inode); null when the system does not say. */
  fileId: string | null
  /** A symbolic link: removing it frees nothing and leaves what it points to alone. */
  symlink: boolean
}

const FRAME_FOLDERS: SirilFolder[] = ['lights', 'darks', 'flats', 'biases']

/** The work folder's top-level folders an archive may remove; nothing else is ever removed. */
export const INTERMEDIATE_FOLDERS: readonly string[] = [...FRAME_FOLDERS, 'process', FAILED_FOLDER, STEP_FOLDER]

/** The archive's own description of itself, at its top. */
export const ARCHIVE_INDEX_FILE = 'astrorepo-archive.json'

/** Where a self-contained archive bundles the raw frames, by Siril folder. */
export const ARCHIVE_FRAMES_FOLDER = 'frames'

export type WorkEntryKind = SirilFolder | 'process' | 'failed' | 'steps' | 'masters' | 'results' | 'processed' | 'other'

/**
 * Why an entry can or cannot be rebuilt:
 * - `kept`: it goes into the archive, so nothing needs rebuilding;
 * - `from-manifest`: a stack manifest names every input and every source is still there;
 * - `no-manifest`: no stack manifest says what made it;
 * - `not-in-manifest`: some of its files are named by no stack manifest;
 * - `missing-sources`: a source frame a manifest names is gone;
 * - `rewritten-each-run`: the app writes it again for every stack;
 * - `unfinished-runs`: what runs that did not finish left behind, which nothing needs.
 */
export type RebuildReason = 'kept' | 'from-manifest' | 'no-manifest' | 'not-in-manifest' | 'missing-sources' | 'rewritten-each-run' | 'unfinished-runs'

export interface WorkFolderSummary {
  /** The top-level folder, or '' for the files in the work folder itself. */
  folder: string
  kind: WorkEntryKind
  /** Siril or the app made it on the way to a stack; it is not kept in the archive. */
  intermediate: boolean
  files: number
  /** Bytes its files take, symbolic links counted as nothing. */
  sizeBytes: number
  /** Bytes the disk gets back when this folder alone is removed: a hard link to a file kept elsewhere frees nothing. */
  freesBytes: number
  /** Files that are hard links to a file kept elsewhere, such as the source frame. */
  linkedFiles: number
  rebuildable: boolean
  /** The user may tick it for removal: it can be rebuilt, or nothing needs it. */
  removable: boolean
  reason: RebuildReason
  /** How many files or frames the reason is about (files not in a manifest, missing sources). */
  count: number
}

/** A raw frame a stack manifest names. */
export interface NamedFrame {
  folder: SirilFolder
  name: string
  /** Null when the manifest could not say where the frame came from; it then counts as gone. */
  source: string | null
}

export interface FoundManifest {
  /** Relative to the work folder. */
  path: string
  manifest: StackManifest
}

/** A stack manifest's text, or null when it is not one this version understands. */
export function parseStackManifest(text: string): StackManifest | null {
  try {
    const m = JSON.parse(text) as Partial<StackManifest>
    if (m?.format !== 'astrorepo-stack-manifest' || m.version !== 1 || typeof m.frames !== 'object' || m.frames === null) return null
    for (const folder of FRAME_FOLDERS) {
      const list = (m.frames as Record<string, unknown>)[folder]
      if (!Array.isArray(list) || !list.every(f => typeof f?.name === 'string' && (typeof f?.source === 'string' || f?.source === null))) return null
    }
    return m as StackManifest
  } catch {
    return null
  }
}

/** The manifests among a work folder's files: those beside a result, in the work folder itself. */
export function manifestPaths(files: WorkAreaFile[]): string[] {
  return files.filter(f => !f.path.includes('/') && f.path.endsWith(MANIFEST_SUFFIX)).map(f => f.path).sort()
}

/**
 * Every raw frame the manifests name, once per folder and name; when two manifests name the same
 * one, the newest run's source wins.
 */
export function namedFrames(manifests: FoundManifest[]): NamedFrame[] {
  const newestFirst = [...manifests].sort((a, b) => b.manifest.job.finishedAt.localeCompare(a.manifest.job.finishedAt))
  const byKey = new Map<string, NamedFrame>()
  for (const { manifest } of newestFirst) {
    for (const folder of FRAME_FOLDERS) {
      for (const f of manifest.frames[folder]) {
        const key = `${folder}/${f.name}`
        if (!byKey.has(key)) byKey.set(key, { folder, name: f.name, source: f.source })
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name))
}

/** A named frame's size now; null when it is gone or its source is not known. */
const sizeOf = (sources: Map<string, number | null>, f: NamedFrame): number | null => (f.source === null ? null : (sources.get(f.source) ?? null))

const topFolder = (p: string): string => (p.includes('/') ? p.slice(0, p.indexOf('/')) : '')

function kindOf(folder: string): WorkEntryKind {
  if ((FRAME_FOLDERS as string[]).includes(folder)) return folder as SirilFolder
  if (folder === 'process') return 'process'
  if (folder === FAILED_FOLDER) return 'failed'
  if (folder === STEP_FOLDER) return 'steps'
  if (folder === 'masters') return 'masters'
  if (folder === 'processed') return 'processed'
  if (folder === '') return 'results'
  return 'other'
}

/**
 * Bytes the disk gets back when every file in these top-level folders is removed. A symbolic link
 * frees nothing; a file with other names (a hard link) frees its bytes only when every one of its
 * names is removed too, and nothing when the system cannot say where its other names are.
 */
export function freedBytes(files: WorkAreaFile[], folders: string[]): number {
  const removing = new Set(folders)
  const chosen = files.filter(f => !f.symlink && removing.has(topFolder(f.path)))
  const namesRemoved = new Map<string, number>()
  for (const f of chosen) if (f.fileId) namesRemoved.set(f.fileId, (namesRemoved.get(f.fileId) ?? 0) + 1)
  const counted = new Set<string>()
  let bytes = 0
  for (const f of chosen) {
    if (f.links <= 1) {
      bytes += f.sizeBytes
    } else if (f.fileId && !counted.has(f.fileId) && (namesRemoved.get(f.fileId) ?? 0) >= f.links) {
      counted.add(f.fileId)
      bytes += f.sizeBytes
    }
  }
  return bytes
}

export interface WorkFolderInput {
  files: WorkAreaFile[]
  manifests: FoundManifest[]
  /** Every source the manifests name, with its size now; null when it is gone. */
  sources: Map<string, number | null>
}

/**
 * Each top-level part of a work folder: what it is, the space it takes and frees, and whether it
 * can be rebuilt. Intermediates first (frames, process, failed runs, step scripts), then what is kept.
 */
export function summariseWorkFolder(input: WorkFolderInput): WorkFolderSummary[] {
  const frames = namedFrames(input.manifests)
  const missing = frames.filter(f => sizeOf(input.sources, f) === null)
  const byFolder = new Map<string, WorkAreaFile[]>()
  for (const f of input.files) byFolder.set(topFolder(f.path), [...(byFolder.get(topFolder(f.path)) ?? []), f])

  const summaries: WorkFolderSummary[] = []
  for (const [folder, files] of byFolder) {
    const kind = kindOf(folder)
    const intermediate = INTERMEDIATE_FOLDERS.includes(folder)
    let reason: RebuildReason = 'kept'
    let count = 0
    if (kind === 'steps') reason = 'rewritten-each-run'
    else if (kind === 'failed') reason = 'unfinished-runs'
    else if (kind === 'process' || (FRAME_FOLDERS as string[]).includes(kind)) {
      const inFolder = kind === 'process' ? frames : frames.filter(f => f.folder === kind)
      const named = new Set(inFolder.map(f => `${kind}/${f.name}`))
      const unnamed = kind === 'process' ? [] : files.filter(f => !named.has(f.path))
      const gone = kind === 'process' ? missing : missing.filter(f => f.folder === kind)
      if (input.manifests.length === 0) reason = 'no-manifest'
      else if (unnamed.length > 0) [reason, count] = ['not-in-manifest', unnamed.length]
      else if (gone.length > 0) [reason, count] = ['missing-sources', gone.length]
      else reason = 'from-manifest'
    }
    const rebuildable = reason === 'from-manifest' || reason === 'rewritten-each-run'
    summaries.push({
      folder,
      kind,
      intermediate,
      files: files.length,
      sizeBytes: files.reduce((sum, f) => sum + (f.symlink ? 0 : f.sizeBytes), 0),
      freesBytes: intermediate ? freedBytes(input.files, [folder]) : 0,
      linkedFiles: files.filter(f => !f.symlink && f.links > 1).length,
      rebuildable,
      removable: intermediate && (rebuildable || reason === 'unfinished-runs'),
      reason,
      count
    })
  }
  const order = (s: WorkFolderSummary) => (s.intermediate ? INTERMEDIATE_FOLDERS.indexOf(s.folder) : 100)
  return summaries.sort((a, b) => order(a) - order(b) || a.folder.localeCompare(b.folder))
}

/** The folders a confirmed removal may take: only those the user chose that are intermediate and removable. */
export function removalChoice(summaries: WorkFolderSummary[], chosen: string[]): { remove: string[]; refused: string[] } {
  const removable = new Set(summaries.filter(s => s.removable).map(s => s.folder))
  const unique = [...new Set(chosen)]
  return { remove: unique.filter(f => removable.has(f)), refused: unique.filter(f => !removable.has(f)) }
}

// ── The archive ─────────────────────────────────────────────────────────

/** One file going into the archive. */
export interface ArchiveCopy {
  /** Relative to the work folder when `inWorkFolder`, else the source frame's own path. */
  from: string
  inWorkFolder: boolean
  /** Relative to the archive folder, with forward slashes. */
  to: string
  sizeBytes: number
}

export interface ArchiveIndex {
  format: 'astrorepo-archive'
  version: 1
  target: { id: string; name: string | null }
  mode: ArchiveMode
  archivedAt: string
  /** The work folder the archive was made from. */
  workFolder: string
  /** Files from the work folder, at the same relative path in the archive. */
  kept: { file: string; sizeBytes: number }[]
  /** The stack manifests among them. */
  manifests: string[]
  /**
   * Every raw frame the manifests name: where it is, its size (null when it was gone), and where
   * the archive holds a copy (null in a linked archive).
   */
  frames: Record<SirilFolder, { name: string; source: string | null; sizeBytes: number | null; archived: string | null }[]>
  /** The intermediates the work folder held when it was archived, and whether each can be rebuilt. */
  intermediates: { folder: string; sizeBytes: number; rebuildable: boolean }[]
}

export interface ArchivePlan {
  mode: ArchiveMode
  copies: ArchiveCopy[]
  copyBytes: number
  /** The raw frames bundled in (self-contained only). */
  bundledFrames: number
  /** Raw frames the manifests name that are gone, so a self-contained archive cannot hold them. */
  missingFrames: number
  /** Bytes of the stacks, manifests, masters and finished images. */
  keptBytes: number
  index: ArchiveIndex
}

export interface ArchivePlanInput extends WorkFolderInput {
  mode: ArchiveMode
  target: { id: string; name: string | null }
  workFolder: string
  at: Date
}

/**
 * What an archive holds: every file of the work folder that is not an intermediate (symbolic links
 * aside), and in a self-contained archive every raw frame the manifests name, under frames/<folder>.
 */
export function planArchive(input: ArchivePlanInput): ArchivePlan {
  const summaries = summariseWorkFolder(input)
  const keptFiles = input.files.filter(f => !f.symlink && !INTERMEDIATE_FOLDERS.includes(topFolder(f.path))).sort((a, b) => a.path.localeCompare(b.path))
  const copies: ArchiveCopy[] = keptFiles.map(f => ({ from: f.path, inWorkFolder: true, to: f.path, sizeBytes: f.sizeBytes }))
  const keptBytes = copies.reduce((sum, c) => sum + c.sizeBytes, 0)

  const frames: ArchiveIndex['frames'] = { lights: [], darks: [], flats: [], biases: [] }
  let bundledFrames = 0
  let missingFrames = 0
  for (const f of namedFrames(input.manifests)) {
    const size = sizeOf(input.sources, f)
    if (size === null) missingFrames++
    const bundle = input.mode === 'self-contained' && size !== null
    const archived = bundle ? `${ARCHIVE_FRAMES_FOLDER}/${f.folder}/${f.name}` : null
    if (bundle && archived) {
      copies.push({ from: f.source as string, inWorkFolder: false, to: archived, sizeBytes: size })
      bundledFrames++
    }
    frames[f.folder].push({ name: f.name, source: f.source, sizeBytes: size, archived })
  }

  const index: ArchiveIndex = {
    format: 'astrorepo-archive',
    version: 1,
    target: input.target,
    mode: input.mode,
    archivedAt: input.at.toISOString(),
    workFolder: input.workFolder,
    kept: keptFiles.map(f => ({ file: f.path, sizeBytes: f.sizeBytes })),
    manifests: input.manifests.map(m => m.path).sort(),
    frames,
    intermediates: summaries.filter(s => s.intermediate).map(s => ({ folder: s.folder, sizeBytes: s.sizeBytes, rebuildable: s.rebuildable }))
  }
  return { mode: input.mode, copies, copyBytes: copies.reduce((sum, c) => sum + c.sizeBytes, 0), bundledFrames, missingFrames, keptBytes, index }
}

/** The archive folder's name: the target's name made safe for any disk, and the day it was archived. */
export function archiveFolderName(targetName: string | null, at: Date): string {
  const safe = (targetName ?? '').replace(/[^\w .-]+/g, '_').replace(/^[ .]+|[ .]+$/g, '') || 'target'
  const day = [at.getFullYear(), String(at.getMonth() + 1).padStart(2, '0'), String(at.getDate()).padStart(2, '0')].join('-')
  return `${safe} ${day}`
}

/** Whether the destination's disk has room for the copy; unknown when the system will not say. */
export function archiveSpace(copyBytes: number, freeBytes: number | null): { verdict: 'fits' | 'short' | 'unknown'; shortBytes: number } {
  if (freeBytes === null) return { verdict: 'unknown', shortBytes: 0 }
  return copyBytes <= freeBytes ? { verdict: 'fits', shortBytes: 0 } : { verdict: 'short', shortBytes: copyBytes - freeBytes }
}

/** A target stays archived, and off the stacking suggestions, until its frames change. */
export function isArchivedNow(record: { fingerprint: string } | undefined, currentFingerprint: string): boolean {
  return record !== undefined && record.fingerprint === currentFingerprint
}
