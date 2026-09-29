import { duplicateCandidates, groupDuplicates, isHashCurrent, type DuplicateReport, type FileHash } from '@astro/domain'
import type { ContentHasher, FileHashStore, FileIndex } from '../ports/file-hashing'

export interface FindDuplicatesDeps {
  files: FileIndex
  hasher: ContentHasher
  hashes: FileHashStore
}

export interface HashingStats {
  indexed: number
  /** Files whose stored hash was still current, so they were not read. */
  reused: number
  sampled: number
  fullyHashed: number
}

export type FindDuplicates = () => Promise<DuplicateReport & { stats: HashingStats }>

/**
 * Finds identical files across every indexed folder without changing any of them. Unchanged files
 * reuse their stored hashes; the rest are sampled, and only files whose samples collide are read in
 * full.
 */
export function makeFindDuplicates(deps: FindDuplicatesDeps): FindDuplicates {
  return async () => {
    const [indexed, stored] = await Promise.all([deps.files.listIndexedFiles(), deps.hashes.listHashes()])
    const storedByPath = new Map(stored.map(h => [h.path, h]))
    const stats: HashingStats = { indexed: indexed.length, reused: 0, sampled: 0, fullyHashed: 0 }

    const current: FileHash[] = []
    const updated = new Map<string, FileHash>()
    for (const file of indexed) {
      const old = storedByPath.get(file.path)
      if (isHashCurrent(old, file)) {
        stats.reused++
        current.push(old)
        continue
      }
      const hash: FileHash = { ...file, quickKey: await deps.hasher.quickKey(file), fullHash: null }
      stats.sampled++
      current.push(hash)
      updated.set(hash.path, hash)
    }

    for (const group of duplicateCandidates(current)) {
      for (const f of group) {
        if (f.fullHash) continue
        f.fullHash = await deps.hasher.fullHash(f.path)
        stats.fullyHashed++
        updated.set(f.path, f)
      }
    }

    const indexedPaths = new Set(indexed.map(f => f.path))
    await deps.hashes.removeHashes(stored.filter(h => !indexedPaths.has(h.path)).map(h => h.path))
    if (updated.size > 0) await deps.hashes.saveHashes([...updated.values()])
    return { ...groupDuplicates(current), stats }
  }
}
