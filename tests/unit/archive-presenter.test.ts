import { describe, expect, it } from 'vitest'
import type { ArchivePreview, ArchiveRecord } from '@astro/application'
import { planArchive, summariseWorkFolder, type WorkAreaFile } from '@astro/domain'
import { archivedLine, archiveResultMessage, longDate, toArchiveFolderView, toArchivePreviewView } from '../../src/main/adapters/archive-presenter'
import { schemas } from '../../src/main/ipc/schemas'

const GB = 1024 ** 3
const file = (path: string, sizeBytes: number, over: Partial<WorkAreaFile> = {}): WorkAreaFile => ({ path, sizeBytes, links: 1, fileId: path, symlink: false, ...over })

const files = [
  file('lights/Light_001.fit', 2 * GB, { links: 2, fileId: 'a' }),
  file('darks/Dark_001.fit', GB, { links: 2, fileId: 'b' }),
  file('darks/Dark_002.fit', GB),
  file('process/pp_light_00001.fit', 12 * GB),
  file('failed/job-1/result.fit', GB),
  file('.astrorepo/step-01.ssf', 300),
  file('masters/dark_stacked.fit', GB / 2),
  file('notes/plan.txt', 10),
  file('result_60s.fit', GB)
]

const record = (over: Partial<ArchiveRecord> = {}): ArchiveRecord => ({
  targetId: 'm42',
  archivedAt: new Date(2026, 9, 9, 21, 0),
  mode: 'linked',
  path: 'D:\\Archive\\M 42 2026-10-09',
  fingerprint: 'f',
  copiedBytes: 2 * GB,
  removed: [],
  freedBytes: 0,
  ...over
})

describe('Archive presenter', () => {
  it('[ARC-001] [ARC-002] Given a work folder, When shown, Then each folder says what it is, its size, what it frees and whether it rebuilds', () => {
    const views = summariseWorkFolder({ files, manifests: [], sources: new Map() }).map(toArchiveFolderView)
    const row = (folder: string) => views.find(v => v.folder === folder)
    expect(row('lights')).toMatchObject({ label: 'Lights laid out for Siril', size: '2.0 GB', frees: '0 B: hard links to your frames', rebuild: 'No: no stack manifest says what made them', suggested: false })
    expect(row('darks')?.frees).toBe('1.0 GB; hard links free nothing')
    expect(row('process')).toMatchObject({ label: 'Siril’s working files', frees: '12.0 GB' })
    expect(row('failed')).toMatchObject({ removable: true, suggested: false, rebuild: 'No, and nothing needs them; kept only to look into a failed run' })
    expect(row('.astrorepo')).toMatchObject({ label: 'Step scripts', rebuild: 'Yes, each stack writes them again', suggested: true })
    expect(row('masters')).toMatchObject({ frees: 'Kept', rebuild: 'Kept in the archive' })
    expect(row('notes')?.label).toBe('Other files in notes')
    expect(row('')?.label).toBe('Stacks and their manifests')
  })

  it('[ARC-003] Given folders that cannot be rebuilt, When shown, Then the reason gives the count', () => {
    const base = { folder: 'lights', kind: 'lights' as const, intermediate: true, files: 3, sizeBytes: 3, freesBytes: 3, linkedFiles: 0, rebuildable: false, removable: false }
    expect(toArchiveFolderView({ ...base, reason: 'not-in-manifest', count: 1 }).rebuild).toBe('No: 1 file is not named in a stack manifest')
    expect(toArchiveFolderView({ ...base, reason: 'missing-sources', count: 2 }).rebuild).toBe('No: 2 source frames the manifest names are gone')
    expect(toArchiveFolderView({ ...base, reason: 'missing-sources', count: 1 }).rebuild).toBe('No: 1 source frame the manifest names is gone')
    expect(toArchiveFolderView({ ...base, rebuildable: true, removable: true, reason: 'from-manifest', count: 0 })).toMatchObject({ rebuild: 'Yes, from the stack manifest', suggested: true })
  })

  it('[ARC-004] [ARC-005] [ARC-010] Given a preview of an archived target, When shown, Then both kinds say what they copy and whether it fits, and the archive date and mode lead', () => {
    const at = new Date(2026, 9, 9)
    const option = (mode: 'linked' | 'self-contained', free: number | null) => {
      const plan = planArchive({ files, manifests: [], sources: new Map(), mode, target: { id: 'm42', name: 'M 42' }, workFolder: '/w', at })
      return { mode, plan: { ...plan, missingFrames: mode === 'self-contained' ? 2 : 0 }, space: free === null ? { verdict: 'unknown' as const, shortBytes: 0 } : { verdict: 'short' as const, shortBytes: free } }
    }
    const preview: ArchivePreview = {
      target: { id: 'm42', name: 'M 42' },
      workDir: '/w',
      destination: '/archive/M 42 2026-10-09',
      folders: [],
      shared: [{ folders: ['lights', 'process'], bytes: 80 }],
      manifests: 2,
      freeBytes: null,
      options: [option('linked', null), option('self-contained', GB)],
      record: record({ removed: ['process'], freedBytes: 12 * GB }),
      blocked: null
    }
    const view = toArchivePreviewView(preview)
    expect(view.archived).toBe('Archived on 9 Oct 2026, linked. Removing process freed 12.0 GB.')
    expect(view.archivedPath).toBe('D:\\Archive\\M 42 2026-10-09')
    expect(view.shared).toEqual([{ folders: ['lights', 'process'], bytes: 80 }])
    expect(view.manifests).toBe('The work folder holds 2 stack manifests, which say how to rebuild what can be removed.')
    expect(view.options[0]).toMatchObject({ label: 'Linked', verdictText: 'That disk does not report its free space', missing: null })
    expect(view.options[0].text).toMatch(/^Copies the stacks, manifests, masters and finished images \(1\.5 GB\) to \/archive\/M 42 2026-10-09\. The raw frames stay where they are/)
    expect(view.options[1]).toMatchObject({ label: 'Self-contained', verdictText: 'Short by 1.0 GB on that disk', missing: '2 raw frames the manifests name are gone from their folder, so the archive cannot hold them.' })
    expect(toArchivePreviewView({ ...preview, manifests: 0, record: null }).manifests).toMatch(/holds no stack manifest/)
    expect(toArchivePreviewView({ ...preview, manifests: 1, record: null }).archived).toBeNull()
  })

  it('[ARC-010] Given an archive and what was removed, When the result is shown, Then one line says where it went, what it copied and what it freed', () => {
    expect(longDate(new Date(2026, 0, 3))).toBe('3 Jan 2026')
    expect(archivedLine(record({ mode: 'self-contained' }))).toBe('Archived on 9 Oct 2026, self-contained.')
    const plan = planArchive({ files: [], manifests: [], sources: new Map(), mode: 'linked', target: { id: 'm42', name: null }, workFolder: '/w', at: new Date() })
    expect(archiveResultMessage({ record: record({ removed: ['lights', 'process'], freedBytes: 12 * GB }), indexPath: '/x', plan })).toBe(
      'Archived to D:\\Archive\\M 42 2026-10-09, linked: copied 2.0 GB. Removed lights, process from the work folder and freed 12.0 GB.'
    )
    expect(archiveResultMessage({ record: record(), indexPath: '/x', plan })).toMatch(/Nothing was removed from the work folder\.$/)
  })

  it('[ARC-009] [NFR-016] Given what the page sends, When validated, Then only intermediate folder names and the two kinds of archive pass', () => {
    expect(schemas['archive:run'].parse({ target_id: 't', mode: 'linked', remove: ['process', 'failed'] }).remove).toEqual(['process', 'failed'])
    expect(() => schemas['archive:run'].parse({ target_id: 't', mode: 'linked', remove: ['masters'] })).toThrow()
    expect(() => schemas['archive:run'].parse({ target_id: 't', mode: 'zip', remove: [] })).toThrow()
    expect(() => schemas['archive:run'].parse({ target_id: 't', mode: 'linked', remove: ['../x'] })).toThrow()
    expect(schemas['archive:preview'].parse({ target_id: 't' })).toEqual({ target_id: 't' })
  })
})
