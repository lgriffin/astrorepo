/** A file as the walker sees it: where it is, how big, and when it was last written. */
export interface FileStamp {
  path: string
  sizeBytes: number
  /** ISO timestamp of the file's last modification. */
  modifiedAt: string
}

export interface RescanPlan {
  /** Same size and modified time as when indexed: keep what is stored, read nothing. */
  unchanged: string[]
  /** Still there but different: read again. */
  changed: string[]
  added: string[]
  removed: string[]
}

const sameStamp = (a: FileStamp, b: FileStamp) => a.sizeBytes === b.sizeBytes && a.modifiedAt === b.modifiedAt

/** What a rescan needs to read, given what was indexed before and what the walk found now. */
export function planRescan(indexed: FileStamp[], found: FileStamp[]): RescanPlan {
  const before = new Map(indexed.map(f => [f.path, f]))
  const plan: RescanPlan = { unchanged: [], changed: [], added: [], removed: [] }
  const seen = new Set<string>()
  for (const f of found) {
    seen.add(f.path)
    const old = before.get(f.path)
    if (!old) plan.added.push(f.path)
    else if (sameStamp(old, f)) plan.unchanged.push(f.path)
    else plan.changed.push(f.path)
  }
  for (const f of indexed) if (!seen.has(f.path)) plan.removed.push(f.path)
  return plan
}

/** A file's content identity. The quick key samples the file; the full hash reads all of it. */
export interface FileHash extends FileStamp {
  quickKey: string
  fullHash: string | null
}

/** A stored hash still describes the file when its size and modified time have not moved. */
export function isHashCurrent(stored: FileHash | undefined, file: FileStamp): stored is FileHash {
  return stored !== undefined && sameStamp(stored, file)
}

/**
 * Files that might be duplicates: same size and same sampled bytes. Only these are worth reading
 * in full. Two subs from one camera share a size but differ in DATE-OBS in their first block, so
 * the sample separates them without reading the pixels.
 */
export function duplicateCandidates(files: FileHash[]): FileHash[][] {
  const groups = new Map<string, FileHash[]>()
  for (const f of files) {
    const key = `${f.sizeBytes}|${f.quickKey}`
    groups.set(key, [...(groups.get(key) ?? []), f])
  }
  return [...groups.values()].filter(g => g.length > 1)
}

export interface DuplicateGroup {
  contentHash: string
  sizeBytes: number
  paths: string[]
}

export interface DuplicateReport {
  groups: DuplicateGroup[]
  /** Copies beyond the first in each group. */
  duplicateFiles: number
  /** Bytes freed if every group kept one copy. Nothing is deleted. */
  reclaimableBytes: number
}

/** Groups files with the same full hash; biggest savings first. Pure: reports, never deletes. */
export function groupDuplicates(files: FileHash[]): DuplicateReport {
  const byHash = new Map<string, FileHash[]>()
  for (const f of files) {
    if (!f.fullHash) continue
    byHash.set(f.fullHash, [...(byHash.get(f.fullHash) ?? []), f])
  }
  const groups: DuplicateGroup[] = [...byHash.entries()]
    .filter(([, g]) => g.length > 1)
    .map(([contentHash, g]) => ({ contentHash, sizeBytes: g[0].sizeBytes, paths: g.map(f => f.path).sort() }))
    .sort((a, b) => b.sizeBytes * (b.paths.length - 1) - a.sizeBytes * (a.paths.length - 1) || a.paths[0].localeCompare(b.paths[0]))
  return {
    groups,
    duplicateFiles: groups.reduce((n, g) => n + g.paths.length - 1, 0),
    reclaimableBytes: groups.reduce((n, g) => n + g.sizeBytes * (g.paths.length - 1), 0)
  }
}

/** A file the scanner could not read, kept aside with the reason instead of silently skipped. */
export interface QuarantinedFile {
  path: string
  error: string
}

export type SirilFolder = 'lights' | 'darks' | 'flats' | 'biases'

/**
 * Which of Siril's standard folders a frame belongs in, from IMAGETYP when known, else from the
 * file name (Seestar and ASIAIR put the frame type first, for example "Light_M 81_10.0s...").
 */
export function sirilFolderFor(fileName: string, imageType: string | null): SirilFolder {
  const probe = (imageType ?? fileName).toLowerCase()
  if (probe.includes('dark')) return 'darks'
  if (probe.includes('flat')) return 'flats'
  if (probe.includes('bias') || probe.includes('offset')) return 'biases'
  return 'lights'
}

export interface SirilPlacement {
  from: string
  folder: SirilFolder
  name: string
}

/** Where each source frame goes in the Siril work area. Two files with one name keep both. */
export function planSirilWorkspace(files: { path: string; name: string; imageType: string | null }[]): SirilPlacement[] {
  const used = new Set<string>()
  return files.map(f => {
    const folder = sirilFolderFor(f.name, f.imageType)
    let name = f.name
    for (let i = 2; used.has(`${folder}/${name.toLowerCase()}`); i++) {
      const dot = f.name.lastIndexOf('.')
      name = dot > 0 ? `${f.name.slice(0, dot)}_${i}${f.name.slice(dot)}` : `${f.name}_${i}`
    }
    used.add(`${folder}/${name.toLowerCase()}`)
    return { from: f.path, folder, name }
  })
}
