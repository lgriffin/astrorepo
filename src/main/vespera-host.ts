import path from 'path'
import type { CopyChoice, VesperaSettings } from '@astro/domain'
import type { StartResult, VesperaControl } from '@astro/application'
import { composeVespera } from './composition'
import { getHomeScanProgress, startHomeScan } from './services/home-scanner'
import { startFolderScan } from './services/fits-analyzer'

/** What the last copy's indexing is doing, for the control page. */
export type IndexingState =
  | { kind: 'none' }
  | { kind: 'home-scan'; status: string; error: string | null }
  | { kind: 'folder-scan'; folder: string; done: boolean; error: string | null }

let control: VesperaControl | null = null
/** The home folder when the copy under way started, so its copies are indexed the way the library is. */
let homeAtStart: string | null = null
/** A home scan to follow live; `waiting` while an earlier scan runs and this one has yet to start. */
let indexing: IndexingState | { kind: 'home-scan'; waiting?: boolean } = { kind: 'none' }

const samePath = (a: string, b: string) => path.relative(path.resolve(a), path.resolve(b)) === ''

/** Settles once no home scan is running. */
async function homeScanIdle(): Promise<void> {
  while (['scanning', 'cancelling'].includes(getHomeScanProgress().status)) await new Promise(resolve => setTimeout(resolve, 2000))
}

/**
 * Indexes copies once they have landed (VSP-008). Copies in the home folder's raw folder are
 * picked up by a home scan, which finds the new target folders and indexes their FITS files; a
 * home scan already under way may have passed them, so a fresh one follows it. Copies anywhere
 * else, even elsewhere in the home folder where a home scan does not look, are scanned as a FITS
 * folder of their own.
 */
async function indexCopies(landingRoot: string): Promise<void> {
  if (homeAtStart && samePath(landingRoot, path.join(homeAtStart, 'raw'))) {
    const home = homeAtStart
    indexing = { kind: 'home-scan', waiting: true }
    while (!startHomeScan(home).started) await homeScanIdle()
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

/** The app's one Vespera control; it lives as long as the app, since it holds the copy under way. */
export function vespera(): VesperaControl {
  control ??= composeVespera(root => indexCopies(root))
  return control
}

/** Starts a copy with the settings as they are now, remembering the home folder for indexing. */
export function startVesperaCopy(settings: VesperaSettings, homeFolder: string | null, choices: CopyChoice[]): StartResult {
  const result = vespera().start(settings, choices)
  if (result.started) {
    homeAtStart = homeFolder
    indexing = { kind: 'none' }
  }
  return result
}

/** What indexing the last copy is doing; a home scan's state is read live. */
export function vesperaIndexing(): IndexingState {
  if (indexing.kind !== 'home-scan') return indexing
  if ('waiting' in indexing && indexing.waiting) return { kind: 'home-scan', status: 'scanning', error: null }
  const scan = getHomeScanProgress()
  return { kind: 'home-scan', status: scan.status, error: scan.error }
}
