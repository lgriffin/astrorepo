import { schemas } from '../schemas'
import { startFolderScan, listScans, getScanById, deleteScan, listScanFiles, getFileDetail, getFileHeaders, getScanAggregates, getTargetSummaries, computeFileStats } from '../../services/fits-analyzer'
import { linkFitsFilesToTargets, manualLinkFile, unlinkFile, getLinkingStatus, getUnlinkedFiles } from '../../services/fits-linker'
import { getOrCreateThumbnail } from '../../services/thumbnail'
import { analyzeFileQuality, analyzeScanQuality, getQualityMetrics, getSessionQualityReport } from '../../services/quality'
import { getCurrentStorageStats, getStorageHistory, captureStorageSnapshot, getGrowthProjection, getStorageByTarget, getStorageByFilter } from '../../services/storage-analytics'
import { getCalibrationLibrary, matchCalibrationToLights, getLightCalibrationStatus, getCalibrationSummary } from '../../services/calibration'
import { getSqlite } from '../../db/connection'
import { composeCore, composeGrading } from '../../composition'
import { toGradesView } from '../../adapters/grades-presenter'
import { toOpenedView } from '../../adapters/gallery-presenter'
import type { Desktop } from '../../transport/desktop'
import { validated, type Handle } from './validated'
import { CSV, gallery } from './shared'

/** FITS scans and headers, quality, storage, calibration, inspection and grades. */
export function registerFitsChannels(handle: Handle, desktop: Desktop): void {
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

  // One read gives the figures and the preview, so opening a file decodes it once.
  handle('inspect:file', validated('inspect:file', async args => {
    const result = await gallery().openFile(args.file_id)
    return result ? toOpenedView(result) : null
  }))
}
