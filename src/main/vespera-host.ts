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
let indexing: IndexingState | { kind: 'home-scan' } = { kind: 'none' }

const inside = (dir: string, root: string) => {
  const rel = path.relative(path.resolve(root), path.resolve(dir))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * Indexes copies once they have landed (VSP-008): a landing folder inside the home folder is
 * picked up by a home scan, which finds the new target folders and indexes their FITS files;
 * anywhere else, the landing folder is scanned as a FITS folder of its own.
 */
async function indexCopies(landingRoot: string): Promise<void> {
  if (homeAtStart && inside(landingRoot, homeAtStart)) {
    indexing = { kind: 'home-scan' }
    // A home scan already under way picks up the new folders only if it has not passed them, so
    // the page says so and the user can scan again from Library.
    const started = startHomeScan(homeAtStart)
    if (!started.started) indexing = { kind: 'folder-scan', folder: landingRoot, done: true, error: started.reason ?? 'A scan was already running.' }
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
  const scan = getHomeScanProgress()
  return { kind: 'home-scan', status: scan.status, error: scan.error }
}
