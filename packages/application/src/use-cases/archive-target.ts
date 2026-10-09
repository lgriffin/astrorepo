import {
  archiveFolderName,
  archiveSpace,
  dataFingerprint,
  freedBytes,
  manifestPaths,
  namedFrames,
  parseStackManifest,
  planArchive,
  removalChoice,
  sharedAcrossFolders,
  summariseWorkFolder,
  type ArchiveMode,
  type ArchivePlan,
  type FoundManifest,
  type WorkAreaFile,
  type WorkFolderSummary
} from '@astro/domain'
import { FolderRemovalError, type ArchiveArea, type ArchiveRecord, type ArchiveStore } from '../ports/archive'
import type { Clock } from '../ports/clock'
import type { FrameCatalogue } from '../ports/frame-catalogue'
import type { JobStore } from '../ports/jobs'
import type { SirilWorkspace } from '../ports/siril-workspace'
import type { StackCatalogue } from '../ports/stack-catalogue'
import type { TargetHolds } from './target-holds'

/** An archive the app will not make, with what to change. */
export class ArchiveRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArchiveRefusedError'
  }
}

/**
 * The archive was made, but removing the intermediates stopped part way. The record lists what
 * was removed; the message says where the archive is, what went and what did not.
 */
export class ArchiveRemovalError extends Error {
  constructor(
    message: string,
    readonly record: ArchiveRecord
  ) {
    super(message)
    this.name = 'ArchiveRemovalError'
  }
}

export interface ArchiveTargetDeps {
  area: ArchiveArea
  store: ArchiveStore
  frames: Pick<FrameCatalogue, 'listTargetFrames'>
  stacks: Pick<StackCatalogue, 'describeTarget'>
  jobs: Pick<JobStore, 'list'>
  workspace: Pick<SirilWorkspace, 'contains'>
  clock: Clock
  /** Shared with the job runner, so no job for the target starts while it is archived (ARC-008). */
  holds?: Pick<TargetHolds, 'hold'>
}

export interface ArchiveRequest {
  targetId: string
  /** The target's Siril work folder; null when it has no raw folder to stack from. */
  workDir: string | null
  /** Where archives go: the setting, else the work area's archive folder. */
  archiveRoot: string
  /** Folders the app only reads; an archive is never made inside one. */
  readOnlyDirs: string[]
}

export interface ArchiveOption {
  mode: ArchiveMode
  plan: ArchivePlan
  space: ReturnType<typeof archiveSpace>
}

export interface ArchivePreview {
  target: { id: string; name: string | null }
  workDir: string | null
  /** The archive folder this archive would make. */
  destination: string
  folders: WorkFolderSummary[]
  /** Files hard-linked across intermediate folders, freed only when all of `folders` go (ARC-002). */
  shared: { folders: string[]; bytes: number }[]
  manifests: number
  freeBytes: number | null
  options: ArchiveOption[]
  /** The target's last archive, if any. */
  record: ArchiveRecord | null
  /** Why it cannot be archived now; null when it can. */
  blocked: string | null
}

export interface ArchiveOutcome {
  record: ArchiveRecord
  indexPath: string
  plan: ArchivePlan
}

export interface ArchiveTarget {
  /** What archiving would keep, copy and free, before anything is copied or removed (ARC-001). Writes nothing. */
  preview(request: ArchiveRequest): Promise<ArchivePreview>
  /** Makes the archive, then removes the intermediates the user confirmed (ARC-004 to ARC-009). */
  archive(request: ArchiveRequest & { mode: ArchiveMode; remove: string[] }): Promise<ArchiveOutcome>
}

interface Look {
  target: { id: string; name: string | null }
  files: WorkAreaFile[]
  manifests: FoundManifest[]
  sources: Map<string, number | null>
  folders: WorkFolderSummary[]
  destination: string
  blocked: string | null
}

/**
 * Archive a finished target (specs/022-archive): keep its stacks, manifests, masters and finished
 * images, linked to the raw frames where they are or with them bundled in, and offer to remove the
 * intermediates its stack manifests can rebuild. Copies run here rather than in the job runner: the
 * runner starts programs in a night window, and an archive is a file copy the user waits for and
 * confirms removals on.
 */
export function makeArchiveTarget(deps: ArchiveTargetDeps): ArchiveTarget {
  async function look(request: ArchiveRequest): Promise<Look> {
    const described = await deps.stacks.describeTarget(request.targetId)
    const target = { id: request.targetId, name: described?.name ?? null }
    const destination = deps.area.join(request.archiveRoot, archiveFolderName(target.name, deps.clock.now()))
    const empty = { target, files: [], manifests: [], sources: new Map<string, number | null>(), folders: [], destination }
    if (!request.workDir) return { ...empty, blocked: 'This target has no raw folder, so it has no work folder to archive.' }
    const workDir = request.workDir

    const files = await deps.area.survey(workDir)
    const manifests: FoundManifest[] = []
    for (const path of manifestPaths(files)) {
      const manifest = parseStackManifest(await deps.area.readText(workDir, path).catch(() => ''))
      if (manifest) manifests.push({ path, manifest })
    }
    const named = [...new Set(namedFrames(manifests).flatMap(f => (f.source === null ? [] : [f.source])))]
    const sizes = await deps.area.sizes(named)
    const sources = new Map(named.map((p, i) => [p, sizes[i]]))
    const folders = summariseWorkFolder({ files, manifests, sources })
    return { target, files, manifests, sources, folders, destination, blocked: await blockedBy(request, workDir, files, destination) }
  }

  async function blockedBy(request: ArchiveRequest, workDir: string, files: WorkAreaFile[], destination: string): Promise<string | null> {
    if (files.length === 0) return `The work folder ${workDir} is empty or missing, so there is nothing to archive. Stack the target first.`
    const active = (await deps.jobs.list()).some(j => j.targetId === request.targetId && (j.state === 'queued' || j.state === 'running'))
    if (active) return 'A job for this target is queued or running. Let it finish, or cancel it in Jobs, then archive.'
    for (const dir of request.readOnlyDirs) {
      if (await deps.workspace.contains(dir, request.archiveRoot)) {
        return `The archive folder ${request.archiveRoot} is inside ${dir}, which the app only reads. Choose another archive folder in Settings → Folders.`
      }
    }
    if ((await deps.workspace.contains(workDir, request.archiveRoot)) || (await deps.workspace.contains(request.archiveRoot, workDir))) {
      return `The archive folder ${request.archiveRoot} and the work folder ${workDir} overlap. Choose another archive folder in Settings → Folders.`
    }
    if (await deps.area.exists(destination)) return `${destination} already exists. Move or rename it, then archive again.`
    return null
  }

  const optionFor = (l: Look, workDir: string, mode: ArchiveMode, free: number | null): ArchiveOption => {
    const plan = planArchive({ files: l.files, manifests: l.manifests, sources: l.sources, mode, target: l.target, workFolder: workDir, at: deps.clock.now() })
    return { mode, plan, space: archiveSpace(plan.copyBytes, free) }
  }

  return {
    async preview(request) {
      const [l, record, free] = await Promise.all([look(request), deps.store.get(request.targetId), deps.area.freeBytes(request.archiveRoot)])
      const options = request.workDir ? (['linked', 'self-contained'] as const).map(mode => optionFor(l, request.workDir as string, mode, free)) : []
      return { target: l.target, workDir: request.workDir, destination: l.destination, folders: l.folders, shared: sharedAcrossFolders(l.files), manifests: l.manifests.length, freeBytes: free, options, record, blocked: l.blocked }
    },

    async archive(request) {
      // Held first, then the jobs are checked: a job queued from here on waits until this ends.
      const release = deps.holds ? deps.holds.hold(request.targetId) : () => {}
      if (!release) throw new ArchiveRefusedError('This target is already being archived. Wait for that to finish.')
      try {
        return await archiveHeld(request)
      } finally {
        release()
      }
    }
  }

  async function archiveHeld(request: ArchiveRequest & { mode: ArchiveMode; remove: string[] }): Promise<ArchiveOutcome> {
    const l = await look(request)
    if (l.blocked || !request.workDir) throw new ArchiveRefusedError(l.blocked ?? 'This target has no work folder to archive.')
    const workDir = request.workDir
    const choice = removalChoice(l.folders, request.remove)
    if (choice.refused.length > 0) {
      throw new ArchiveRefusedError(`${choice.refused.join(', ')} cannot be removed, because the stack manifests cannot rebuild it. Nothing was archived or removed.`)
    }
    const option = optionFor(l, workDir, request.mode, await deps.area.freeBytes(request.archiveRoot))
    if (option.space.verdict === 'short') {
      throw new ArchiveRefusedError(`The archive folder's disk is short of the space this archive needs. Free space there, or choose another archive folder in Settings → Folders.`)
    }

    // Built whole in a staging folder and renamed into place, or not at all (ARC-006).
    const indexPath = await deps.area.build(workDir, l.destination, option.plan.copies, option.plan.index)
    const frames = (await deps.frames.listTargetFrames()).find(t => t.targetId === request.targetId)
    const record: ArchiveRecord = {
      targetId: request.targetId,
      archivedAt: deps.clock.now(),
      mode: request.mode,
      path: l.destination,
      fingerprint: frames ? dataFingerprint(frames) : '',
      copiedBytes: option.plan.copyBytes,
      removed: [],
      freedBytes: 0
    }
    await deps.store.save(record)

    // Only after the archive is in place, and only what the user confirmed (ARC-009).
    if (choice.remove.length > 0) {
      try {
        record.removed = await deps.area.removeFolders(workDir, choice.remove)
      } catch (error) {
        record.removed = error instanceof FolderRemovalError ? error.removed : []
        record.freedBytes = freedBytes(l.files, record.removed)
        await deps.store.save(record)
        const reason = (error instanceof Error ? error.message : String(error)).replace(/\.?$/, '.')
        const gone = record.removed.length > 0 ? `Removed from the work folder: ${record.removed.join(', ')}. ` : ''
        throw new ArchiveRemovalError(`The archive was made in ${l.destination}. ${gone}${reason} Remove the rest by hand, or archive again another day.`, record)
      }
      record.freedBytes = freedBytes(l.files, record.removed)
      await deps.store.save(record)
    }
    return { record, indexPath, plan: option.plan }
  }
}
