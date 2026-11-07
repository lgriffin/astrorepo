import { startHomeScan, cancelHomeScan, getHomeScanProgress, getTargetHomeData } from '../../services/home-scanner'
import { getStackingSummary, getSubFramesForStacked, getIntegrationProgress, getIntegrationGoals, setIntegrationGoal, deleteIntegrationGoal } from '../../services/stacking'
import { getSqlite } from '../../db/connection'
import { clock, composeCore } from '../../composition'
import { toLibraryLayoutView } from '../../adapters/library-layout-presenter'
import { toSirilPlanView } from '../../adapters/siril-plan-presenter'
import { toJobsView } from '../../adapters/job-presenter'
import { archiveResultMessage, toArchivePreviewView } from '../../adapters/archive-presenter'
import { ArchiveRefusedError, ArchiveRemovalError } from '@astro/application'
import { jobs, kickJobs } from '../../jobs-host'
import type { Desktop } from '../../transport/desktop'
import { validated, type Handle } from './validated'
import { refusable, targetRawPath, cometPlan, archiveRequest, folders, core, sirilWorkDir, readOnlyDirs } from './shared'

/** The home library scan, stacking, Siril runs, jobs, comets and archiving. */
export function registerLibraryChannels(handle: Handle, desktop: Desktop): void {
  handle('home:scan-start', async () => {
    // Each part of the library is read from the folder chosen for it, or found by its name (LAY-004).
    const library = folders().library()
    if (!library) return { started: false, reason: 'Home folder not configured' }
    return startHomeScan(library.home, undefined, library.folders)
  })

  // Which folder holds raw frames, stacked masters, TIFF exports and finished pictures, with a
  // suggestion from the folder names and the files inside them; and saving the user's choice.
  handle('library:layout', validated('library:layout', async () => toLibraryLayoutView(await core().describeLibraryLayout())))

  handle('library:choose-layout', validated('library:choose-layout', args => core().chooseLibraryLayout(args.layout)))

  handle('home:scan-progress', async () => {
    return getHomeScanProgress()
  })

  handle('home:scan-cancel', async () => {
    return cancelHomeScan()
  })

  handle('home:prep-siril', validated('home:prep-siril', (args) => {
    // Never rearranges the source folder (ING-001): Siril gets its own layout in the work area.
    const workDir = sirilWorkDir(args.raw_path)
    // A work area inside any folder the app reads would write into it, so those are refused.
    return composeCore(getSqlite()).prepareSirilWorkspace(args.raw_path, workDir, readOnlyDirs())
  }))

  handle('siril:estimate', validated('siril:estimate', async (args) => {
    // Reads the index and the disk only (NFR-010): the work folder may not exist yet.
    return toSirilPlanView(await composeCore(getSqlite()).estimateSirilRun(args.raw_path, sirilWorkDir(args.raw_path)))
  }))

  handle('jobs:list', validated('jobs:list', async (args) => toJobsView(await jobs().snapshot(), clock.now(), args?.target_id)))

  handle('jobs:queue-stack', validated('jobs:queue-stack', args => {
    const rawPath = targetRawPath(args.target_id)
    if (!rawPath) return { ok: false, error: 'This target has no raw folder to stack from.' }
    // The plan is worked out again here, from the index and the disk.
    return refusable(() => composeCore(getSqlite()).queueStack({
      targetId: args.target_id,
      sourceDir: rawPath,
      workDir: sirilWorkDir(rawPath),
      script: args.script,
      timing: args.timing,
      filter: args.filter
    }))
  }))

  handle('comet:plan', validated('comet:plan', args => cometPlan(args.target_id, false)))

  handle('comet:write-positions', validated('comet:write-positions', async args => {
    try {
      return await cometPlan(args.target_id, true)
    } catch (error) {
      // Nothing was written; the page says why beside the plan.
      return { ...(await cometPlan(args.target_id, false)), writeError: error instanceof Error ? error.message : String(error) }
    }
  }))

  handle('comet:set-orbit', validated('comet:set-orbit', async args => {
    const result = await composeCore(getSqlite()).setCometOrbit(args.target_id, args.line)
    return result.ok ? { ok: true } : { ok: false, error: result.error }
  }))

  handle('jobs:queue-post-process', validated('jobs:queue-post-process', args => {
    const rawPath = targetRawPath(args.target_id)
    return refusable(() => composeCore(getSqlite()).queuePostProcess(args.target_id, {
      workDir: rawPath ? sirilWorkDir(rawPath) : undefined,
      readOnlyDirs: readOnlyDirs(),
      stackPath: args.stack_path,
      profile: args.profile,
      quality: args.quality
    }, args.timing))
  }))

  handle('archive:preview', validated('archive:preview', async args => toArchivePreviewView(await composeCore(getSqlite()).archive.preview(archiveRequest(args.target_id)))))

  handle('archive:run', validated('archive:run', async args => {
    try {
      const out = await composeCore(getSqlite()).archive.archive({ ...archiveRequest(args.target_id), mode: args.mode, remove: args.remove })
      return { ok: true, message: archiveResultMessage(out) }
    } catch (error) {
      if (error instanceof ArchiveRefusedError || error instanceof ArchiveRemovalError) return { ok: false, error: error.message }
      // A failed copy leaves no archive and removes nothing; the user can fix the cause and try again.
      return { ok: false, error: `The archive was not made, and nothing was removed: ${error instanceof Error ? error.message : String(error)}` }
    } finally {
      // Jobs queued for the target while it was held can start now.
      kickJobs()
    }
  }))

  handle('jobs:queue-syqon', validated('jobs:queue-syqon', args => {
    const rawPath = targetRawPath(args.target_id)
    return refusable(() => composeCore(getSqlite()).queueSyqon(args.target_id, {
      workDir: rawPath ? sirilWorkDir(rawPath) : undefined,
      readOnlyDirs: readOnlyDirs(),
      stackPath: args.stack_path,
      step: args.step,
      model: args.model,
      overwrite: args.overwrite
    }, args.timing))
  }))

  handle('jobs:cancel', validated('jobs:cancel', args => refusable(() => jobs().cancel(args.job_id))))

  handle('jobs:run-now', validated('jobs:run-now', args => refusable(() => jobs().runNow(args.job_id))))

  handle('jobs:log', validated('jobs:log', async args => ({ text: await jobs().log(args.job_id) })))

  handle('home:open-folder', validated('home:open-folder', async (args) => {
    const result = await desktop.openFolder(args.folder_path)
    return { success: !result, error: result || undefined }
  }))

  handle('home:target-data', validated('home:target-data', (args) => {
    return getTargetHomeData(args.target_id)
  }))

  handle('stacking:summary', async () => {
    return getStackingSummary()
  })

  handle('stacking:sub-frames', validated('stacking:sub-frames', (args) => {
    return getSubFramesForStacked(args.stacked_file_id)
  }))

  handle('stacking:integration-progress', async () => {
    return { targets: getIntegrationProgress() }
  })

  handle('stacking:goals', validated('stacking:goals', (args) => {
    return { goals: getIntegrationGoals(args.target_id) }
  }))

  handle('stacking:set-goal', validated('stacking:set-goal', (args) => {
    return setIntegrationGoal(args.target_id, args.filter, args.goal_hours * 3600)
  }))

  handle('stacking:delete-goal', validated('stacking:delete-goal', (args) => {
    return { success: deleteIntegrationGoal(args.id) }
  }))
}
