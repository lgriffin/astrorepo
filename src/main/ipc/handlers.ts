import { z } from 'zod'
import { schemas, type Channel, type SchemaMap } from './schemas'
import { searchTargets, getTargetById, createTarget, updateTarget, getAliasesForTarget, getCatalogueEntriesForTarget, mergeTargets, getTargetThumbnail } from '../services/target'
import { createSession, updateSession, listSessions, getSessionById } from '../services/session'
import { createCollection, listCollections, getCollectionWithTargets, addTargetToCollection, removeTargetFromCollection, autoGenerateCatalogueCollections } from '../services/collection'
import { advanceStage, getTransitionHistory, listStages } from '../services/workflow'
import { createEquipment, listEquipment, getUsageHistory, updateEquipment, deleteEquipment, calculateFOV, calculateImageScale } from '../services/equipment'
import { generateFolders, listTemplates, createTemplate } from '../services/folder'
import { getDashboardStats, getCatalogueProgressStats } from '../services/dashboard'
import { createRelationship, listRelationships } from '../services/relationship'
import { startFolderScan, listScans, getScanById, deleteScan, listScanFiles, getFileDetail, getFileHeaders, getScanAggregates, getTargetSummaries, computeFileStats, getTargetObservationData } from '../services/fits-analyzer'
import { linkFitsFilesToTargets, manualLinkFile, unlinkFile, getLinkingStatus, getUnlinkedFiles } from '../services/fits-linker'
import { getOrCreateThumbnail } from '../services/thumbnail'
import { previewAutoSessions, generateSessions, getAutoSessionStatus } from '../services/session-generator'
import { analyzeFileQuality, analyzeScanQuality, getQualityMetrics, getSessionQualityReport } from '../services/quality'
import { getCurrentStorageStats, getStorageHistory, captureStorageSnapshot, getGrowthProjection, getStorageByTarget, getStorageByFilter } from '../services/storage-analytics'
import { getCalibrationLibrary, matchCalibrationToLights, getLightCalibrationStatus, getCalibrationSummary } from '../services/calibration'
import { getSetting, setSetting, listSettings } from '../services/settings'
import { startHomeScan, cancelHomeScan, getHomeScanProgress, getTargetHomeData, getTargetImages } from '../services/home-scanner'
import { getStackingSummary, getSubFramesForStacked, getIntegrationProgress, getIntegrationGoals, setIntegrationGoal, deleteIntegrationGoal } from '../services/stacking'
import { getSqlite, resetDatabase } from '../db/connection'
import { clock, composeCore, composeFolders, composeGallery, composeGrading, composeMessier, composePictureGallery } from '../composition'
import { toNextActionRecommendation, withQueuedJobs } from '../adapters/stacking-suggestion-presenter'
import { toCockpitOverview, toDuplicateView, toTargetDiscoveryView } from '../adapters/discovery-presenter'
import { toForwardPlanView } from '../adapters/planning-presenter'
import { toClearSkiesView } from '../adapters/weather-presenter'
import { toPostProcessView, toSyqonView, toToolHealthView, toToolsView } from '../adapters/tool-hub-presenter'
import { toSirilPlanView } from '../adapters/siril-plan-presenter'
import { toCometPlanView } from '../adapters/comet-presenter'
import { toJobsView } from '../adapters/job-presenter'
import { toGradesView } from '../adapters/grades-presenter'
import { archiveResultMessage, toArchivePreviewView } from '../adapters/archive-presenter'
import { toMosaicPlanView, toSolveQueuedView, toTargetGeometryView } from '../adapters/sky-geometry-presenter'
import { toCapturesView, toChangeViews, toCoverageView, toCreatedView, toDrawingView, toGridDefinition, toGridInput, toRevisionSavedView, toWorkspaceSummaries, toWorkspaceView } from '../adapters/mosaic-workspace-presenter'
import { toGalleryImagesView, toOpenedView, toPalettePreviewView, toPalettesView, toPreviewView } from '../adapters/gallery-presenter'
import { toDetailsView, toGalleryView, toPictureData } from '../adapters/picture-gallery-presenter'
import { toMessierMosaicView, toMessierPictureView } from '../adapters/messier-presenter'
import { ArchiveRefusedError, ArchiveRemovalError, GalleryRefusedError, JobRefusedError, JobStateError, MessierRefusedError, PictureRefusedError } from '@astro/application'
import { jobs, kickJobs } from '../jobs-host'
import { ingestIdentify, ingestName, ingestPause, ingestPreview, ingestProgress, ingestResume, ingestScan, ingestTransfer } from '../vespera-ingest-host'
import { toVesperaSettingsView } from '../adapters/vespera-presenter'
import { loadCatalogueSeedData } from '../services/catalogue'
import { getInsightsSummary, getMonthlyActivity, getBestNights, getEquipmentEffectiveness, getQualityTrends, getFilterUsageBreakdown, getTargetProgress } from '../services/insights'
import { getTargetAltitudeCurve, getBestTargetsTonight, getMoonInfo, getTwilightTimes, getTargetVisibility } from '../services/sky-planner'
import { getCalendarData, getYearSummary } from '../services/timeline'
import { batchAdvanceStage, batchAddToCollection, batchDeleteTargets } from '../services/batch'
import { exportTargetsCsv, exportSessionsCsv, exportFitsAggregatesCsv } from '../services/export'
import { importNinaSequence } from '../services/nina-import'
import { getRecommendations } from '../services/recommendations'
import type { ChannelHandler, ChannelRouter } from '../transport/router'
import type { Desktop, FileKind } from '../transport/desktop'

/** The folders the app reads from and writes to, from the composition root. */
const folders = () => composeFolders(getSqlite())
const sirilWorkDir = (sourceDir: string) => folders().sirilWorkDir(sourceDir)
const readOnlyDirs = () => folders().readOnlyDirs()

/** A mosaic request from the renderer, in the core's shape. */
function mosaicOptions(args: { target_id: string; field_width_deg?: number; field_height_deg?: number; rotation_deg?: number; overlap?: number }) {
  return {
    targetId: args.target_id,
    field: args.field_width_deg && args.field_height_deg ? { widthDeg: args.field_width_deg, heightDeg: args.field_height_deg } : undefined,
    rotationDeg: args.rotation_deg,
    overlap: args.overlap
  }
}

const CSV: FileKind[] = [{ name: 'CSV', extensions: ['csv'] }]
const JSON_FILE: FileKind[] = [{ name: 'JSON', extensions: ['json'] }]

/** A handler that checks its arguments against the channel's schema before it runs (PI-001). */
export function validated<C extends Channel>(channel: C, handler: (args: z.infer<SchemaMap[C]>) => unknown): ChannelHandler {
  return async (rawArgs: unknown) => {
    const args = schemas[channel].parse(rawArgs) as z.infer<SchemaMap[C]>
    return handler(args)
  }
}

/** The gallery and the Messier mosaic over the app's database; each keeps what it has read between requests. */
const gallery = () => composeGallery(getSqlite())
const messier = () => composeMessier(getSqlite())

/** Puts every channel the renderer can call on the router; the machine's own pickers and shell come from `desktop`. */
export function registerHandlers(router: ChannelRouter, desktop: Desktop): void {
  const handle = (channel: string, handler: ChannelHandler) => router.handle(channel, handler)

  handle('targets:search', validated('targets:search', (args) => {
    return searchTargets(args.query, args.limit, args.offset, {
      objectType: args.object_type,
      workflowStage: args.workflow_stage,
      sortBy: args.sort_by,
      sortDir: args.sort_dir
    })
  }))

  handle('targets:get', validated('targets:get', (args) => {
    return getTargetById(args.id)
  }))

  handle('targets:create', validated('targets:create', (args) => {
    return createTarget({
      canonicalName: args.canonical_name,
      objectType: args.object_type,
      raHours: args.ra_hours,
      decDegrees: args.dec_degrees,
      description: args.description
    })
  }))

  handle('targets:update', validated('targets:update', (args) => {
    return updateTarget(args.id, args.fields)
  }))

  handle('targets:aliases', validated('targets:aliases', (args) => {
    return getAliasesForTarget(args.target_id)
  }))

  handle('targets:catalogue-entries', validated('targets:catalogue-entries', (args) => {
    return getCatalogueEntriesForTarget(args.target_id)
  }))

  handle('targets:merge', validated('targets:merge', (args) => {
    return mergeTargets(args.keep_id, args.merge_id)
  }))

  handle('sessions:list', validated('sessions:list', (args) => {
    return listSessions({
      targetId: args.target_id,
      fromDate: args.from_date,
      toDate: args.to_date,
      limit: args.limit,
      offset: args.offset
    })
  }))

  handle('sessions:get', validated('sessions:get', (args) => {
    return getSessionById(args.id)
  }))

  handle('sessions:create', validated('sessions:create', (args) => {
    return createSession({
      date: args.date,
      observatoryId: args.observatory_id,
      locationFreetext: args.location_freetext,
      skyQuality: args.sky_quality,
      weather: args.weather,
      seeing: args.seeing,
      transparency: args.transparency,
      moonPhase: args.moon_phase,
      moonDistance: args.moon_distance,
      guidingNotes: args.guiding_notes,
      exposureStrategy: args.exposure_strategy,
      totalFrames: args.total_frames,
      acceptedFrames: args.accepted_frames,
      rejectedFrames: args.rejected_frames,
      totalExposureSec: args.total_exposure_sec,
      notes: args.notes,
      targetIds: args.target_ids,
      equipmentIds: args.equipment_ids
    })
  }))

  handle('sessions:update', validated('sessions:update', (args) => {
    return updateSession(args.id, args.fields)
  }))

  handle('collections:list', async () => {
    return { collections: listCollections() }
  })

  handle('collections:get', validated('collections:get', (args) => {
    return getCollectionWithTargets(args.id, args.limit, args.offset)
  }))

  handle('collections:create', validated('collections:create', (args) => {
    return createCollection(args.name, args.description)
  }))

  handle('collections:add-target', validated('collections:add-target', (args) => {
    return { success: addTargetToCollection(args.collection_id, args.target_id) }
  }))

  handle('collections:remove-target', validated('collections:remove-target', (args) => {
    return { success: removeTargetFromCollection(args.collection_id, args.target_id) }
  }))

  handle('targets:advance-stage', validated('targets:advance-stage', (args) => {
    return advanceStage(args.id, args.to_stage, args.notes)
  }))

  handle('workflow:history', validated('workflow:history', (args) => {
    return getTransitionHistory(args.target_id)
  }))

  handle('workflow:stages', async () => {
    return listStages()
  })

  handle('equipment:list', async (rawArgs: unknown) => {
    const args = rawArgs ? schemas['equipment:list']!.parse(rawArgs) as { type?: string } : undefined
    return { equipment: listEquipment(args?.type) }
  })

  handle('equipment:create', validated('equipment:create', (args) => {
    return createEquipment({
      name: args.name,
      equipmentType: args.equipment_type,
      manufacturer: args.manufacturer,
      model: args.model,
      notes: args.notes
    })
  }))

  handle('equipment:usage-history', validated('equipment:usage-history', (args) => {
    return { sessions: getUsageHistory(args.id) }
  }))

  handle('folders:generate', validated('folders:generate', (args) => {
    return generateFolders(args.target_id, args.template_id)
  }))

  handle('folders:templates-list', async () => {
    return { templates: listTemplates() }
  })

  handle('folders:template-create', validated('folders:template-create', (args) => {
    return createTemplate(args.name, args.structure as Record<string, unknown>)
  }))

  // The gallery of finished pictures (spec 031). The window names a picture by the path the
  // gallery listed, never any other (GAL-011), and reference pages are built here from the
  // catalogue, so the window cannot open an address of its own (GAL-008).
  const pictures = () => composePictureGallery(getSqlite())
  const pictureRefusal = async <T>(work: () => Promise<T>): Promise<T | { refused: string }> => {
    try {
      return await work()
    } catch (error) {
      if (error instanceof PictureRefusedError) return { refused: error.message }
      throw error
    }
  }

  handle('gallery:browse', async () => toGalleryView(await pictures().browse()))

  handle('gallery:details', validated('gallery:details', args => pictureRefusal(async () => toDetailsView(await pictures().details(args.path)))))

  handle('gallery:picture', validated('gallery:picture', args => pictureRefusal(async () => toPictureData(await pictures().picture(args.path, args.max_width)))))

  handle('gallery:open-reference', validated('gallery:open-reference', async args => {
    const url = await pictures().reference(args.object_id, args.site)
    if (!url) return { opened: false }
    await desktop.openExternal(url)
    return { opened: true }
  }))

  handle('dashboard:stats', async () => {
    return getDashboardStats()
  })

  handle('dashboard:catalogue-progress', async () => {
    return { catalogues: getCatalogueProgressStats() }
  })

  handle('relationships:create', validated('relationships:create', (args) => {
    return createRelationship(args.source_target_id, args.related_target_id, args.relationship_type)
  }))

  handle('relationships:list', validated('relationships:list', (args) => {
    return { relationships: listRelationships(args.target_id) }
  }))

  handle('fits:pick-folder', async () => {
    return { path: await desktop.pickFolder('Select FITS Folder') }
  })

  handle('fits:start-scan', validated('fits:start-scan', (args) => {
    return startFolderScan(args.folder_path)
  }))

  handle('fits:list-scans', async (rawArgs: unknown) => {
    const args = rawArgs ? schemas['fits:list-scans']!.parse(rawArgs) as { limit?: number; offset?: number } : undefined
    return listScans(args?.limit, args?.offset)
  })

  handle('fits:get-scan', validated('fits:get-scan', (args) => {
    return getScanById(args.id)
  }))

  handle('fits:delete-scan', validated('fits:delete-scan', (args) => {
    return { success: deleteScan(args.id) }
  }))

  handle('fits:list-files', validated('fits:list-files', (args) => {
    return listScanFiles(args.scan_id, {
      limit: args.limit,
      offset: args.offset,
      sortBy: args.sort_by,
      sortDir: args.sort_dir,
      filterObject: args.filter_object,
      filterImageType: args.filter_image_type,
      filterFilter: args.filter_filter,
      filterStacked: args.filter_stacked,
      filterFolder: args.filter_folder
    })
  }))

  handle('fits:get-file', validated('fits:get-file', (args) => {
    return getFileDetail(args.id)
  }))

  handle('fits:get-headers', validated('fits:get-headers', (args) => {
    return { headers: getFileHeaders(args.file_id) }
  }))

  handle('fits:get-thumbnail', validated('fits:get-thumbnail', (args) => {
    return getOrCreateThumbnail(args.file_id)
  }))

  handle('fits:scan-aggregates', validated('fits:scan-aggregates', (args) => {
    return getScanAggregates(args.scan_id)
  }))

  handle('fits:target-summaries', validated('fits:target-summaries', (args) => {
    return { targets: getTargetSummaries(args.scan_id) }
  }))

  handle('settings:get', validated('settings:get', (args) => {
    return { value: getSetting(args.key) }
  }))

  handle('settings:set', validated('settings:set', (args) => {
    setSetting(args.key, args.value)
    return { success: true }
  }))

  handle('settings:list', async () => {
    return { settings: listSettings() }
  })

  handle('settings:pick-folder', async () => {
    return { path: await desktop.pickFolder('Select Folder') }
  })

  handle('fits:link-files', validated('fits:link-files', (args) => {
    return linkFitsFilesToTargets(args.scan_id)
  }))

  handle('fits:manual-link', validated('fits:manual-link', (args) => {
    return { success: manualLinkFile(args.file_id, args.target_id) }
  }))

  handle('fits:unlink-file', validated('fits:unlink-file', (args) => {
    return { success: unlinkFile(args.file_id) }
  }))

  handle('fits:linking-status', validated('fits:linking-status', (args) => {
    return getLinkingStatus(args.scan_id)
  }))

  handle('fits:unlinked-files', validated('fits:unlinked-files', (args) => {
    return { files: getUnlinkedFiles(args.scan_id, args.limit, args.offset) }
  }))

  handle('sessions:preview-auto', validated('sessions:preview-auto', (args) => {
    return { previews: previewAutoSessions(args.scan_id) }
  }))

  handle('sessions:generate-auto', validated('sessions:generate-auto', (args) => {
    return generateSessions(args.scan_id, { overwrite: args.overwrite })
  }))

  handle('sessions:auto-status', validated('sessions:auto-status', (args) => {
    return getAutoSessionStatus(args.scan_id)
  }))

  handle('quality:analyze-file', validated('quality:analyze-file', (args) => {
    return { metrics: analyzeFileQuality(args.file_id) }
  }))

  handle('quality:analyze-scan', validated('quality:analyze-scan', (args) => {
    return analyzeScanQuality(args.scan_id)
  }))

  handle('quality:get-metrics', validated('quality:get-metrics', (args) => {
    return { metrics: getQualityMetrics(args.file_id) }
  }))

  handle('quality:session-report', validated('quality:session-report', (args) => {
    return getSessionQualityReport(args.scan_id, args.folder_name)
  }))

  handle('storage:current', async () => {
    return getCurrentStorageStats()
  })

  handle('storage:history', async (rawArgs: unknown) => {
    const args = rawArgs ? schemas['storage:history']!.parse(rawArgs) as { limit?: number } : undefined
    return { snapshots: getStorageHistory(args?.limit) }
  })

  handle('storage:snapshot', async () => {
    return captureStorageSnapshot()
  })

  handle('storage:projection', async () => {
    return getGrowthProjection()
  })

  handle('storage:by-target', async () => {
    return { targets: getStorageByTarget() }
  })

  handle('storage:by-filter', async () => {
    return { filters: getStorageByFilter() }
  })

  handle('calibration:library', async (rawArgs: unknown) => {
    const args = rawArgs ? schemas['calibration:library']!.parse(rawArgs) as { type?: string; gain?: number; temp?: number; binning?: string } : undefined
    return { groups: getCalibrationLibrary(args ?? undefined) }
  })

  handle('calibration:match-lights', async (rawArgs: unknown) => {
    const args = rawArgs ? schemas['calibration:match-lights']!.parse(rawArgs) as { scan_id?: string } : undefined
    return matchCalibrationToLights(args?.scan_id)
  })

  handle('calibration:file-status', validated('calibration:file-status', (args) => {
    return getLightCalibrationStatus(args.file_id)
  }))

  handle('calibration:summary', async () => {
    return getCalibrationSummary()
  })

  handle('fits:compute-stats', validated('fits:compute-stats', (args) => {
    return { stats: computeFileStats(args.file_id) }
  }))

  handle('home:scan-start', async () => {
    const homePath = getSetting('home_folder_path')
    if (!homePath) return { started: false, reason: 'Home folder not configured' }
    return startHomeScan(homePath)
  })

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

  handle('grades:limits', async () => composeGrading(getSqlite()).limits())

  handle('grades:target', validated('grades:target', async args => toGradesView(await composeGrading(getSqlite()).grade(args.target_id))))

  // One batch a call (NFR-014): the page asks again while frames remain, and stops when told to.
  handle('grades:measure', validated('grades:measure', args => composeGrading(getSqlite()).measureBatch(args.target_id, { retry: args.retry, retryAfter: args.retry_after ?? null })))

  handle('grades:leave-out-night', validated('grades:leave-out-night', async args => ({
    changed: await composeCore(getSqlite()).leaveOutNight(args.raw_path, args.night, args.left_out)
  })))

  handle('grades:override', validated('grades:override', async args => {
    await composeGrading(getSqlite()).setOverride(args.file_id, args.override)
    return { ok: true }
  }))

  handle('grades:export', validated('grades:export', async args => {
    const csv = await composeGrading(getSqlite()).exportCsv(args.target_id)
    return desktop.saveText('frame-grades.csv', csv, CSV)
  }))

  handle('tools:list', async () => toToolsView(await composeCore(getSqlite()).listTools()))

  // Runs each tool only with its version flag, and SyQon with --list-models (NFR-017).
  handle('tools:health', async () => toToolHealthView(await composeCore(getSqlite()).checkToolHealth()))

  handle('recipe:syqon', validated('recipe:syqon', async (args) => {
    const core = composeCore(getSqlite())
    const plan = await core.planSyqon(args.target_id, {
      workDir: args.raw_path ? sirilWorkDir(args.raw_path) : undefined,
      readOnlyDirs: readOnlyDirs(),
      stackPath: args.stack_path,
      step: args.step,
      model: args.model,
      overwrite: args.overwrite
    })
    return toSyqonView(plan, core.windows)
  }))

  handle('recipe:post-process', validated('recipe:post-process', async (args) => {
    // Finds tools and reads the index only (NFR-011): nothing is run or written.
    const plan = await composeCore(getSqlite()).planPostProcessing(args.target_id, {
      workDir: args.raw_path ? sirilWorkDir(args.raw_path) : undefined,
      readOnlyDirs: readOnlyDirs(),
      stackPath: args.stack_path,
      profile: args.profile,
      quality: args.quality
    })
    return toPostProcessView(plan, await gallery().chosenPalette(args.target_id))
  }))

  // The inspector and gallery (spec 025). Pixels are read on a worker thread and only statistics
  // and small previews come back (NFR-019); the window names files by id or as one of a target's
  // own images, never by an arbitrary path (INS-008).
  const galleryRefusal = async <T>(work: () => Promise<T>): Promise<T | { refused: string }> => {
    try {
      return await work()
    } catch (error) {
      if (error instanceof GalleryRefusedError) return { refused: error.message }
      throw error
    }
  }

  // One read gives the figures and the preview, so opening a file decodes it once.
  handle('inspect:file', validated('inspect:file', async args => {
    const result = await gallery().openFile(args.file_id)
    return result ? toOpenedView(result) : null
  }))

  handle('gallery:images', validated('gallery:images', async args => toGalleryImagesView(await gallery().images(args.target_id))))

  handle('gallery:preview', validated('gallery:preview', args =>
    galleryRefusal(async () => toPreviewView(await gallery().previewImage(args.target_id, args.path)))
  ))

  // The Messier mosaic (specs/032-messier-mosaic): the window names an object by number, never a path.
  handle('messier:mosaic', async () => toMessierMosaicView(await messier().mosaic()))

  handle('messier:picture', validated('messier:picture', async args => {
    try {
      return toMessierPictureView(await messier().picture(args.number, args.max_width))
    } catch (error) {
      if (error instanceof MessierRefusedError) return { refused: error.message }
      throw error
    }
  }))

  handle('gallery:palettes', validated('gallery:palettes', async args => toPalettesView(await gallery().palettes(args.target_id))))

  handle('gallery:palette-preview', validated('gallery:palette-preview', args =>
    galleryRefusal(async () => toPalettePreviewView(await gallery().palettePreview(args.target_id, args.palette), args.palette))
  ))

  handle('gallery:choose-palette', validated('gallery:choose-palette', args =>
    galleryRefusal(async () => {
      await gallery().choosePalette(args.target_id, args.palette)
      return { ok: true }
    })
  ))

  handle('jobs:list', validated('jobs:list', async (args) => toJobsView(await jobs().snapshot(), clock.now(), args?.target_id)))

  /** A refusal the user can act on comes back as a message; anything else is a bug and throws. */
  const refusable = async (work: () => Promise<{ title: string }>) => {
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
  const targetRawPath = (targetId: string) => getTargetHomeData(targetId)?.rawPath ?? null

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

  // A comet's positions in each light (RIG-013) and the file for Siril's comet registration (RIG-014).
  const cometPlan = async (targetId: string, write: boolean) => {
    const rawPath = targetRawPath(targetId)
    return toCometPlanView(await composeCore(getSqlite()).planComet(targetId, rawPath, rawPath ? sirilWorkDir(rawPath) : null, { write }))
  }
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

  // The work folder comes from the target's own raw folder and the destination from Settings, never
  // from the page, so an archive only ever reads and removes inside that target's work folder.
  const archiveRequest = (targetId: string) => {
    const rawPath = targetRawPath(targetId)
    return { targetId, workDir: rawPath ? sirilWorkDir(rawPath) : null, archiveRoot: folders().archiveRoot(), readOnlyDirs: readOnlyDirs() }
  }

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

  // The Vespera page (specs 033 and 034): where the scope is, where copies land and the kinds to
  // copy come from Settings, never from the page, so a copy only ever writes inside the landing folder.
  handle('vespera:settings', validated('vespera:settings', () => toVesperaSettingsView(folders().vesperaSettings())))

  // Review each session's counts and findings, then copy the chosen ones, each into a folder named
  // for what it holds. The scope is only read.
  handle('vespera-ingest:scan', validated('vespera-ingest:scan', () => ingestScan(folders().vesperaSettings())))
  handle('vespera-ingest:identify', validated('vespera-ingest:identify', args => ingestIdentify(folders().vesperaSettings(), args.session_id)))
  handle('vespera-ingest:name', validated('vespera-ingest:name', args => ingestName(folders().vesperaSettings(), args.session_id, args.name)))
  handle('vespera-ingest:preview', validated('vespera-ingest:preview', args => ingestPreview(folders().vesperaSettings(), args.session_id)))
  handle('vespera-ingest:transfer', validated('vespera-ingest:transfer', args => {
    const f = folders()
    return ingestTransfer(f.vesperaSettings(), f.homeFolder(), args.session_ids, args.allow_duplicate ?? false)
  }))
  handle('vespera-ingest:resume', validated('vespera-ingest:resume', args => {
    const f = folders()
    return ingestResume(f.vesperaSettings(), f.homeFolder(), args.job_id)
  }))
  handle('vespera-ingest:pause', validated('vespera-ingest:pause', () => ingestPause()))
  handle('vespera-ingest:progress', validated('vespera-ingest:progress', () => ingestProgress()))

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

  handle('ingest:find-duplicates', async () => {
    const report = await composeCore(getSqlite()).findDuplicates()
    return toDuplicateView(report)
  })

  handle('home:open-folder', validated('home:open-folder', async (args) => {
    const result = await desktop.openFolder(args.folder_path)
    return { success: !result, error: result || undefined }
  }))

  handle('home:target-data', validated('home:target-data', (args) => {
    return getTargetHomeData(args.target_id)
  }))

  handle('targets:observation-data', validated('targets:observation-data', (args) => {
    return getTargetObservationData(args.target_id)
  }))

  handle('targets:get-thumbnail', validated('targets:get-thumbnail', (args) => {
    return getTargetThumbnail(args.id)
  }))

  handle('targets:images', validated('targets:images', (args) => {
    return { images: getTargetImages(args.id) }
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

  handle('insights:summary', async () => {
    return getInsightsSummary()
  })

  handle('insights:monthly-activity', validated('insights:monthly-activity', (args) => {
    return getMonthlyActivity(args.months)
  }))

  handle('insights:best-nights', validated('insights:best-nights', (args) => {
    return getBestNights(args.limit)
  }))

  handle('insights:equipment-effectiveness', async () => {
    return getEquipmentEffectiveness()
  })

  handle('insights:quality-trends', validated('insights:quality-trends', (args) => {
    return getQualityTrends(args.months)
  }))

  handle('insights:filter-usage', async () => {
    return getFilterUsageBreakdown()
  })

  handle('insights:target-progress', validated('insights:target-progress', (args) => {
    return getTargetProgress(args.limit)
  }))

  handle('equipment:update', validated('equipment:update', (args) => {
    return updateEquipment(args.id, args.fields)
  }))

  handle('equipment:delete', validated('equipment:delete', (args) => {
    return { success: deleteEquipment(args.id) }
  }))

  handle('equipment:calculate-fov', validated('equipment:calculate-fov', (args) => {
    return calculateFOV(args.telescope_id, args.camera_id, args.reducer_id)
  }))

  handle('equipment:calculate-image-scale', validated('equipment:calculate-image-scale', (args) => {
    return calculateImageScale(args.telescope_id, args.camera_id)
  }))

  handle('sky:altitude-curve', validated('sky:altitude-curve', (args) => {
    return { points: getTargetAltitudeCurve(args.target_id, args.date, args.lat, args.lon, args.elevation) }
  }))

  handle('sky:best-tonight', validated('sky:best-tonight', (args) => {
    return { targets: getBestTargetsTonight(args.lat, args.lon, args.elevation) }
  }))

  handle('sky:moon-info', validated('sky:moon-info', (args) => {
    return getMoonInfo(args.date)
  }))

  handle('sky:twilight', validated('sky:twilight', (args) => {
    return getTwilightTimes(args.date, args.lat, args.lon, args.elevation)
  }))

  handle('sky:target-visibility', validated('sky:target-visibility', (args) => {
    return { months: getTargetVisibility(args.target_id, args.lat, args.lon, args.elevation) }
  }))

  handle('targets:batch-advance-stage', validated('targets:batch-advance-stage', (args) => {
    return batchAdvanceStage(args.target_ids, args.to_stage, args.notes)
  }))

  handle('targets:batch-add-collection', validated('targets:batch-add-collection', (args) => {
    return batchAddToCollection(args.target_ids, args.collection_id)
  }))

  handle('targets:batch-delete', validated('targets:batch-delete', (args) => {
    return batchDeleteTargets(args.target_ids)
  }))

  handle('export:targets-csv', async () => {
    const csv = exportTargetsCsv()
    return desktop.saveText('targets.csv', csv, CSV)
  })

  handle('export:sessions-csv', async () => {
    const csv = exportSessionsCsv()
    return desktop.saveText('sessions.csv', csv, CSV)
  })

  handle('export:fits-csv', async () => {
    const csv = exportFitsAggregatesCsv()
    return desktop.saveText('fits-aggregates.csv', csv, CSV)
  })

  handle('import:pick-file', async () => {
    return {
      path: await desktop.pickFile('Select NINA Sequence File', [
        { name: 'NINA Sequence', extensions: ['xml', 'json'] },
        { name: 'All Files', extensions: ['*'] }
      ])
    }
  })

  handle('import:nina-sequence', validated('import:nina-sequence', (args) => {
    return importNinaSequence(args.file_path)
  }))

  handle('timeline:calendar', validated('timeline:calendar', (args) => {
    return { months: getCalendarData(args.year, args.month) }
  }))

  handle('timeline:year-summary', validated('timeline:year-summary', (args) => {
    return { months: getYearSummary(args.year) }
  }))

  handle('recommendations:list', async () => {
    // Strangler seam: ranked captures and stacking come from the hexagonal core, the rest from the legacy service.
    const [actions, queue] = await Promise.all([
      composeCore(getSqlite()).listNextActions(),
      // Without the job runner the list still loads; it just cannot say what is queued.
      // list() reads the store only, so Home never samples the machine the runner's idle check relies on.
      Promise.resolve()
        .then(() => jobs().list())
        .catch(() => [])
    ])
    return { recommendations: withQueuedJobs([...actions.map(toNextActionRecommendation), ...getRecommendations()], queue) }
  })

  handle('cockpit:overview', async () => {
    const core = composeCore(getSqlite())
    const [discovery, hidden] = await Promise.all([core.discoverTargets(), core.reportHiddenData()])
    return toCockpitOverview(discovery, hidden)
  })

  handle('cockpit:dismiss', validated('cockpit:dismiss', (args) => {
    return composeCore(getSqlite()).dismissSuggestion(args.suggestion_id)
  }))

  // The sky ahead: the forward plan and the next nights' weather, from one composition.
  const sky = () => composeCore(getSqlite())
  handle('planning:forward', async () => toForwardPlanView(await sky().planForward()))

  // fresh: Settings' check asks every source now instead of using the answers kept for Home.
  handle('weather:outlook', validated('weather:outlook', async (args) =>
    toClearSkiesView(await (args?.fresh ? sky().checkWeather() : sky().clearSkies()))))

  handle('sky:solve-target', validated('sky:solve-target', async (args) => {
    const result = await composeCore(getSqlite()).queueSolves(args.target_id, args.timing ?? 'now')
    if (result.job) kickJobs()
    return toSolveQueuedView(result)
  }))

  handle('sky:target-geometry', validated('sky:target-geometry', async (args) => {
    const g = await composeCore(getSqlite()).describeTargetGeometry(args.target_id)
    return g ? toTargetGeometryView(g) : null
  }))

  handle('mosaic:plan', validated('mosaic:plan', async (args) => toMosaicPlanView(await composeCore(getSqlite()).planMosaic(mosaicOptions(args)))))

  handle('mosaic:save', validated('mosaic:save', async (args) => {
    const core = composeCore(getSqlite())
    await core.saveMosaicPlan(args.target_id, {
      field: { widthDeg: args.field_width_deg, heightDeg: args.field_height_deg },
      rotationDeg: args.rotation_deg,
      overlap: args.overlap
    })
    return toMosaicPlanView(await core.planMosaic({ targetId: args.target_id }))
  }))

  handle('mosaic:export', validated('mosaic:export', async (args) => {
    const exported = await composeCore(getSqlite()).exportMosaicCsv(mosaicOptions(args))
    if (!exported) return { saved: false }
    return desktop.saveText(exported.fileName, exported.csv, CSV)
  }))

  // Mosaic workspaces: versioned grids on the sky (specs/037-mosaic-workspace).
  const workspaces = () => sky().workspaces
  handle('workspace:list', async () => toWorkspaceSummaries(await workspaces().list()))
  handle('workspace:preview', validated('workspace:preview', (args) =>
    toDrawingView(workspaces().preview({ grid: toGridDefinition(args.grid), shift: args.shift ? { rightDeg: args.shift.right_deg, upDeg: args.shift.up_deg } : undefined, drag: args.drag ? { xDeg: args.drag.x_deg, yDeg: args.drag.y_deg } : undefined }))))
  handle('workspace:parse-centre', validated('workspace:parse-centre', (args) => workspaces().parseCentre(args.ra, args.dec)))
  handle('workspace:create', validated('workspace:create', async (args) =>
    toCreatedView(await workspaces().create({ name: args.name, targetId: args.target_id ?? null, grid: toGridDefinition(args.grid), note: args.note ?? null }))))
  handle('workspace:save', validated('workspace:save', async (args) =>
    toRevisionSavedView(args.workspace_id, await workspaces().saveRevision(args.workspace_id, toGridDefinition(args.grid), args.note ?? null))))
  handle('workspace:get', validated('workspace:get', async (args) => {
    const view = await workspaces().describe(args.workspace_id, args.revision)
    return view ? toWorkspaceView(view) : null
  }))
  handle('workspace:export', validated('workspace:export', async (args) => {
    const exported = await workspaces().exportPlan(args.workspace_id, args.format, args.revision)
    if (!exported) return { saved: false }
    return desktop.saveText(exported.fileName, exported.text, args.format === 'csv' ? CSV : JSON_FILE)
  }))
  handle('workspace:from-target', validated('workspace:from-target', async (args) => toCreatedView(await workspaces().fromTarget(args.target_id))))
  handle('workspace:from-solve', validated('workspace:from-solve', async (args) => {
    const grid = await workspaces().fromSolve(args.path)
    return grid ? toGridInput(grid) : null
  }))
  handle('workspace:archive', validated('workspace:archive', (args) => workspaces().archive(args.workspace_id, args.archived)))
  handle('workspace:coverage', validated('workspace:coverage', async (args) => {
    const coverage = await workspaces().coverage(args.workspace_id, args.revision)
    return coverage ? toCoverageView(coverage) : null
  }))
  handle('workspace:export-next', validated('workspace:export-next', async (args) => {
    const exported = await workspaces().exportNext(args.workspace_id, args.format, args.revision)
    if (!exported) return { saved: false }
    return desktop.saveText(exported.fileName, exported.text, args.format === 'csv' ? CSV : JSON_FILE)
  }))
  handle('workspace:captures', validated('workspace:captures', async (args) => {
    const placed = await workspaces().captures(args.workspace_id, args.revision)
    return placed ? toCapturesView(placed) : null
  }))
  handle('workspace:assign', validated('workspace:assign', (args) =>
    workspaces().assign(args.workspace_id, args.capture_id, args.action === 'assign' ? { action: 'assign', panelId: args.panel_id, reason: args.reason ?? null } : args.action === 'exclude' ? { action: 'exclude', reason: args.reason ?? null } : { action: 'clear' })))
  handle('workspace:preview-changes', validated('workspace:preview-changes', async (args) => {
    const changes = await workspaces().previewChanges(args.workspace_id, toGridDefinition(args.grid))
    return changes ? toChangeViews(changes) : null
  }))

  handle('discovery:target', validated('discovery:target', async (args) => {
    const d = await composeCore(getSqlite()).discoverTarget(args.target_id)
    return d ? toTargetDiscoveryView(d) : null
  }))

  handle('db:reset', async () => {
    // Queued and running jobs refer to the targets and folders being cleared, so they go too.
    await jobs().clear()
    const result = resetDatabase()
    try {
      loadCatalogueSeedData()
      autoGenerateCatalogueCollections()
    } catch (err) {
      console.error('Re-seed after reset failed:', err)
    }
    return result
  })
}
