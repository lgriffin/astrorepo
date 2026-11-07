import { createSession, updateSession, listSessions, getSessionById } from '../../services/session'
import { previewAutoSessions, generateSessions, getAutoSessionStatus } from '../../services/session-generator'
import { getCalendarData, getYearSummary } from '../../services/timeline'
import { exportTargetsCsv, exportSessionsCsv, exportFitsAggregatesCsv } from '../../services/export'
import { importNinaSequence } from '../../services/nina-import'
import type { Desktop } from '../../transport/desktop'
import { validated, type Handle } from './validated'
import { CSV } from './shared'

/** Logged nights, the timeline, and CSV and N.I.N.A. import and export. */
export function registerSessionsChannels(handle: Handle, desktop: Desktop): void {
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

  handle('sessions:preview-auto', validated('sessions:preview-auto', (args) => {
    return { previews: previewAutoSessions(args.scan_id) }
  }))

  handle('sessions:generate-auto', validated('sessions:generate-auto', (args) => {
    return generateSessions(args.scan_id, { overwrite: args.overwrite })
  }))

  handle('sessions:auto-status', validated('sessions:auto-status', (args) => {
    return getAutoSessionStatus(args.scan_id)
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
}
