import path from 'path'
import { getHomeScanProgress, startHomeScan } from './services/home-scanner'
import { startFolderScan } from './services/fits-analyzer'

/** What the last copy's indexing is doing, for the control page. */
export type IndexingState =
  | { kind: 'none' }
  | { kind: 'home-scan'; status: string; error: string | null }
  | { kind: 'folder-scan'; folder: string; done: boolean; error: string | null }

/** A home scan to follow live; `waiting` while an earlier scan runs and this one has yet to start. */
let indexing: IndexingState | { kind: 'home-scan'; waiting?: boolean } = { kind: 'none' }

const samePath = (a: string, b: string) => path.relative(path.resolve(a), path.resolve(b)) === ''

/** Settles once no home scan is running. */
async function homeScanIdle(): Promise<void> {
  while (['scanning', 'cancelling'].includes(getHomeScanProgress().status)) await new Promise(resolve => setTimeout(resolve, 2000))
}

/**
 * Indexes copies once they have landed (VIN-028). Copies in the home folder's raw folder are
 * picked up by a home scan, which finds the new target folders and indexes their FITS files; a
 * home scan already under way may have passed them, so a fresh one follows it. Copies anywhere
 * else, even elsewhere in the home folder where a home scan does not look, are scanned as a FITS
 * folder of their own.
 */
export async function indexCopies(landingRoot: string, homeFolder: string | null): Promise<void> {
  if (homeFolder && samePath(landingRoot, path.join(homeFolder, 'raw'))) {
    indexing = { kind: 'home-scan', waiting: true }
    while (!startHomeScan(homeFolder).started) await homeScanIdle()
    indexing = { kind: 'home-scan' }
    return
  }
  indexing = { kind: 'folder-scan', folder: landingRoot, done: false, error: null }
  try {
    await startFolderScan(landingRoot)
    indexing = { kind: 'folder-scan', folder: landingRoot, done: true, error: null }
  } catch (error) {
    indexing = { kind: 'folder-scan', folder: landingRoot, done: true, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Forgets the last copy's indexing, as a new copy starts. */
export function resetIndexing(): void {
  indexing = { kind: 'none' }
}

/** What indexing the last copy is doing; a home scan's state is read live. */
export function vesperaIndexing(): IndexingState {
  if (indexing.kind !== 'home-scan') return indexing
  if ('waiting' in indexing && indexing.waiting) return { kind: 'home-scan', status: 'scanning', error: null }
  const scan = getHomeScanProgress()
  return { kind: 'home-scan', status: scan.status, error: scan.error }
}
