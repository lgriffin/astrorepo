import { getSqlite } from '../../db/connection'
import { composeCore } from '../../composition'
import { toDuplicateView } from '../../adapters/discovery-presenter'
import { ingestIdentify, ingestName, ingestPause, ingestPreview, ingestProgress, ingestResume, ingestScan, ingestTransfer } from '../../vespera-ingest-host'
import { toVesperaSettingsView } from '../../adapters/vespera-presenter'
import { validated, type Handle } from './validated'
import { folders } from './shared'

/** The Vespera and its one-flow ingest. */
export function registerVesperaChannels(handle: Handle): void {
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
    return ingestTransfer(f.vesperaSettings(), f.library(), args.session_ids, args.allow_duplicate ?? false)
  }))

  handle('vespera-ingest:resume', validated('vespera-ingest:resume', args => {
    const f = folders()
    return ingestResume(f.vesperaSettings(), f.library(), args.job_id)
  }))

  handle('vespera-ingest:pause', validated('vespera-ingest:pause', () => ingestPause()))

  handle('vespera-ingest:progress', validated('vespera-ingest:progress', () => ingestProgress()))

  handle('ingest:find-duplicates', async () => {
    const report = await composeCore(getSqlite()).findDuplicates()
    return toDuplicateView(report)
  })
}
