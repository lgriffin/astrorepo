/** What the channel modules share: the composition they reach, and the helpers several of them use. */
import { getTargetHomeData } from '../../services/home-scanner'
import { getSqlite } from '../../db/connection'
import { composeCore, composeFolders, composeGallery, composeMessier, composePictureGallery } from '../../composition'
import { toCometPlanView } from '../../adapters/comet-presenter'
import { GalleryRefusedError, JobRefusedError, JobStateError, PictureRefusedError } from '@astro/application'
import { kickJobs } from '../../jobs-host'
import type { FileKind } from '../../transport/desktop'

/** The folders the app reads from and writes to, from the composition root. */
export const folders = () => composeFolders(getSqlite())
export const core = () => composeCore(getSqlite())
export const sirilWorkDir = (sourceDir: string) => folders().sirilWorkDir(sourceDir)
export const readOnlyDirs = () => folders().readOnlyDirs()

/** A mosaic request from the renderer, in the core's shape. */
export function mosaicOptions(args: { target_id: string; field_width_deg?: number; field_height_deg?: number; rotation_deg?: number; overlap?: number }) {
  return {
    targetId: args.target_id,
    field: args.field_width_deg && args.field_height_deg ? { widthDeg: args.field_width_deg, heightDeg: args.field_height_deg } : undefined,
    rotationDeg: args.rotation_deg,
    overlap: args.overlap
  }
}

export const CSV: FileKind[] = [{ name: 'CSV', extensions: ['csv'] }]
export const JSON_FILE: FileKind[] = [{ name: 'JSON', extensions: ['json'] }]
export const MARKDOWN: FileKind[] = [{ name: 'Markdown', extensions: ['md'] }]

/** The gallery and the Messier mosaic over the app's database; each keeps what it has read between requests. */
export const gallery = () => composeGallery(getSqlite())
export const messier = () => composeMessier(getSqlite())

// The gallery of finished pictures (spec 031). The window names a picture by the path the
// gallery listed, never any other (GAL-011), and reference pages are built here from the
// catalogue, so the window cannot open an address of its own (GAL-008).
export const pictures = () => composePictureGallery(getSqlite())

export const pictureRefusal = async <T>(work: () => Promise<T>): Promise<T | { refused: string }> => {
  try {
    return await work()
  } catch (error) {
    if (error instanceof PictureRefusedError) return { refused: error.message }
    throw error
  }
}

// The inspector and gallery (spec 025). Pixels are read on a worker thread and only statistics
// and small previews come back (NFR-019); the window names files by id or as one of a target's
// own images, never by an arbitrary path (INS-008).
export const galleryRefusal = async <T>(work: () => Promise<T>): Promise<T | { refused: string }> => {
  try {
    return await work()
  } catch (error) {
    if (error instanceof GalleryRefusedError) return { refused: error.message }
    throw error
  }
}

/** A refusal the user can act on comes back as a message; anything else is a bug and throws. */
export const refusable = async (work: () => Promise<{ title: string }>) => {
  try {
    const job = await work()
    kickJobs()
    return { ok: true, title: job.title }
  } catch (error) {
    if (error instanceof JobRefusedError || error instanceof JobStateError) return { ok: false, error: error.message }
    throw error
  }
}

// The folders come from the target's own home data, never from the page, so a job always works on
// that target's frames and stacks (JOB-001).
export const targetRawPath = (targetId: string) => getTargetHomeData(targetId)?.rawPath ?? null

// A comet's positions in each light (RIG-013) and the file for Siril's comet registration (RIG-014).
export const cometPlan = async (targetId: string, write: boolean) => {
  const rawPath = targetRawPath(targetId)
  return toCometPlanView(await composeCore(getSqlite()).planComet(targetId, rawPath, rawPath ? sirilWorkDir(rawPath) : null, { write }))
}

// The work folder comes from the target's own raw folder and the destination from Settings, never
// from the page, so an archive only ever reads and removes inside that target's work folder.
export const archiveRequest = (targetId: string) => {
  const rawPath = targetRawPath(targetId)
  return { targetId, workDir: rawPath ? sirilWorkDir(rawPath) : null, archiveRoot: folders().archiveRoot(), readOnlyDirs: readOnlyDirs() }
}

// The sky ahead: the forward plan and the next nights' weather, from one composition.
export const sky = core

// Mosaic workspaces: versioned grids on the sky (specs/037-mosaic-workspace).
export const workspaces = () => sky().workspaces

// Astronomy projects, judged from the index each time they are asked (specs/038-astronomy-projects).
export const projects = () => sky().projects

// The experiment lab (specs/040-experiment-lab): the work folder and read-only folders come from
// the target and Settings, as for the post-processing card, never from the page.
export const experiments = () =>
  sky().experiments(targetId => {
    const rawPath = targetRawPath(targetId)
    return { workDir: rawPath ? sirilWorkDir(rawPath) : undefined, readOnlyDirs: readOnlyDirs() }
  })
