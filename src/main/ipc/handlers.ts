import { ipcMain, IpcMainInvokeEvent, dialog, shell, app } from 'electron'
import path from 'path'
import { z } from 'zod'
import { schemas, type Channel, type SchemaMap } from './schemas'
import { searchTargets, getTargetById, createTarget, updateTarget, getAliasesForTarget, getCatalogueEntriesForTarget, mergeTargets, getTargetThumbnail } from '../services/target'
import { createSession, updateSession, listSessions, getSessionById } from '../services/session'
import { createCollection, listCollections, getCollectionWithTargets, addTargetToCollection, removeTargetFromCollection, autoGenerateCatalogueCollections } from '../services/collection'
import { advanceStage, getTransitionHistory, listStages } from '../services/workflow'
import { createEquipment, listEquipment, getUsageHistory, updateEquipment, deleteEquipment, calculateFOV, calculateImageScale } from '../services/equipment'
import { generateFolders, listTemplates, createTemplate } from '../services/folder'
import { scanImages, readImageThumbnail } from '../services/image-scanner'
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
import { startHomeScan, getHomeScanProgress, getTargetHomeData, getTargetImages } from '../services/home-scanner'
import { getStackingSummary, getSubFramesForStacked, getIntegrationProgress, getIntegrationGoals, setIntegrationGoal, deleteIntegrationGoal } from '../services/stacking'
import { getSqlite, resetDatabase } from '../db/connection'
import { composeCore } from '../composition'
import { toNextActionRecommendation } from '../adapters/stacking-suggestion-presenter'
import { toCockpitOverview, toDuplicateView, toTargetDiscoveryView } from '../adapters/discovery-presenter'
import { toForwardPlanView } from '../adapters/planning-presenter'
import { loadCatalogueSeedData } from '../services/catalogue'
import { getInsightsSummary, getMonthlyActivity, getBestNights, getEquipmentEffectiveness, getQualityTrends, getFilterUsageBreakdown, getTargetProgress } from '../services/insights'
import { getTargetAltitudeCurve, getBestTargetsTonight, getMoonInfo, getTwilightTimes, getTargetVisibility } from '../services/sky-planner'
import { getCalendarData, getYearSummary } from '../services/timeline'
import { batchAdvanceStage, batchAddToCollection, batchDeleteTargets } from '../services/batch'
import { exportTargetsCsv, exportSessionsCsv, exportFitsAggregatesCsv } from '../services/export'
import { importNinaSequence } from '../services/nina-import'
import { getRecommendations } from '../services/recommendations'
import fs from 'fs'

/** One work folder per source folder, named after it and made unique by a short path digest. */
function sirilFolderName(sourceDir: string): string {
  const base = path.basename(path.resolve(sourceDir)).replace(/[^\w .-]+/g, '_') || 'target'
  let h = 0
  for (const c of path.resolve(sourceDir)) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0
  return `${base}-${h.toString(16)}`
}

type HandlerFn = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>

const registeredChannels: string[] = []

export function handle(channel: string, handler: HandlerFn): void {
  ipcMain.handle(channel, handler)
  registeredChannels.push(channel)
}

function validated<C extends Channel>(channel: C, handler: (args: z.infer<SchemaMap[C]>) => unknown): HandlerFn {
  return async (_e: IpcMainInvokeEvent, rawArgs: unknown) => {
    const args = schemas[channel].parse(rawArgs) as z.infer<SchemaMap[C]>
    return handler(args)
  }
}

export function registerIpcHandlers(): void {
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

  handle('equipment:list', async (_e, rawArgs) => {
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

  handle('images:scan', async () => {
    return scanImages()
  })

  handle('images:read', validated('images:read', (args) => {
    return readImageThumbnail(args.file_path)
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
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select FITS Folder'
    })
    if (result.canceled || result.filePaths.length === 0) return { path: null }
    return { path: result.filePaths[0] }
  })

  handle('fits:start-scan', validated('fits:start-scan', (args) => {
    return startFolderScan(args.folder_path)
  }))

  handle('fits:list-scans', async (_e, rawArgs) => {
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
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Folder'
    })
    if (result.canceled || result.filePaths.length === 0) return { path: null }
    return { path: result.filePaths[0] }
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

  handle('storage:history', async (_e, rawArgs) => {
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

  handle('calibration:library', async (_e, rawArgs) => {
    const args = rawArgs ? schemas['calibration:library']!.parse(rawArgs) as { type?: string; gain?: number; temp?: number; binning?: string } : undefined
    return { groups: getCalibrationLibrary(args ?? undefined) }
  })

  handle('calibration:match-lights', async (_e, rawArgs) => {
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

  handle('home:prep-siril', validated('home:prep-siril', (args) => {
    // Never rearranges the source folder (ING-001): Siril gets its own layout in the work area.
    const workArea = getSetting('work_area_path') || path.join(app.getPath('userData'), 'work')
    const workDir = path.join(workArea, 'siril', sirilFolderName(args.raw_path))
    // A work area inside any folder the app reads would write into it, so those are refused.
    const scanned = (getSqlite().prepare('SELECT DISTINCT folder_path FROM fits_scans').all() as { folder_path: string }[]).map(r => r.folder_path)
    const protectedDirs = [getSetting('home_folder_path'), getSetting('fits_master_folder'), ...scanned].filter((d): d is string => !!d)
    return composeCore(getSqlite()).prepareSirilWorkspace(args.raw_path, workDir, protectedDirs)
  }))

  handle('ingest:find-duplicates', async () => {
    const report = await composeCore(getSqlite()).findDuplicates()
    return toDuplicateView(report)
  })

  handle('home:open-folder', validated('home:open-folder', async (args) => {
    const result = await shell.openPath(args.folder_path)
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
    const result = await dialog.showSaveDialog({ defaultPath: 'targets.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] })
    if (result.canceled || !result.filePath) return { saved: false }
    fs.writeFileSync(result.filePath, csv, 'utf-8')
    return { saved: true, path: result.filePath }
  })

  handle('export:sessions-csv', async () => {
    const csv = exportSessionsCsv()
    const result = await dialog.showSaveDialog({ defaultPath: 'sessions.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] })
    if (result.canceled || !result.filePath) return { saved: false }
    fs.writeFileSync(result.filePath, csv, 'utf-8')
    return { saved: true, path: result.filePath }
  })

  handle('export:fits-csv', async () => {
    const csv = exportFitsAggregatesCsv()
    const result = await dialog.showSaveDialog({ defaultPath: 'fits-aggregates.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] })
    if (result.canceled || !result.filePath) return { saved: false }
    fs.writeFileSync(result.filePath, csv, 'utf-8')
    return { saved: true, path: result.filePath }
  })

  handle('import:pick-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Select NINA Sequence File',
      filters: [
        { name: 'NINA Sequence', extensions: ['xml', 'json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return { path: null }
    return { path: result.filePaths[0] }
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
    const actions = await composeCore(getSqlite()).listNextActions()
    return { recommendations: [...actions.map(toNextActionRecommendation), ...getRecommendations()] }
  })

  handle('cockpit:overview', async () => {
    const core = composeCore(getSqlite())
    const [discovery, hidden] = await Promise.all([core.discoverTargets(), core.reportHiddenData()])
    return toCockpitOverview(discovery, hidden)
  })

  handle('cockpit:dismiss', validated('cockpit:dismiss', (args) => {
    return composeCore(getSqlite()).dismissSuggestion(args.suggestion_id)
  }))

  handle('planning:forward', async () => toForwardPlanView(await composeCore(getSqlite()).planForward()))

  handle('discovery:target', validated('discovery:target', async (args) => {
    const d = await composeCore(getSqlite()).discoverTarget(args.target_id)
    return d ? toTargetDiscoveryView(d) : null
  }))

  handle('db:reset', async () => {
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

export function getRegisteredChannels(): string[] {
  return [...registeredChannels]
}
