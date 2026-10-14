import { describe, expect, it } from 'vitest'
import { buildSession, inventorySession, type IngestTarget, type ScopeEntry, type TransferJob } from '@astro/domain'
import { bytesText, folderPreview, orderedFindings, scanSummary, sessionWhen, toIngestJobView, toIngestSessionView } from '../../src/main/adapters/vespera-ingest-presenter'

const file = (name: string, sizeBytes = 1024): ScopeEntry => ({ name, type: 'file', sizeBytes, modifiedAt: null })
const session = buildSession(
  '2024-06-15_21-00-54_observation_NGC3372',
  [],
  [{ folder: '01-images-initial', entries: [file('img-0001.fits'), file('img-0002.fits'), file('img-0001-output.jpg'), file('img-0001-output.json'), file('img-0001-stacking.json'), file('capture.json')] }],
  new Date(0)
)
const target: IngestTarget = { name: 'NGC 3372', catalogue: 'NGC', confidence: 'folder', evidence: ['folder: NGC3372'], review: false }

const job = (patch: Partial<TransferJob> = {}): TransferJob => ({
  id: '/repo/NGC3372_2024-06-15_FIT=2',
  sessionId: session.id,
  sessionPath: `user/${session.id}`,
  target,
  destinationRoot: '/repo',
  destinationFolder: 'NGC3372_2024-06-15_FIT=2',
  include: ['fits'],
  items: [
    { path: '01-images-initial/img-0001.fits', kind: 'fits', sizeBytes: 1024, frameNo: 1, runOrder: 1 },
    { path: '01-images-initial/img-0002.fits', kind: 'fits', sizeBytes: 1024, frameNo: 2, runOrder: 1 }
  ],
  state: 'running',
  committed: ['01-images-initial/img-0001.fits'],
  copiedBytes: 1024,
  totalBytes: 2048,
  findings: [{ level: 'info', code: 'FITS_GT_JPEG', message: 'one left out' }, { level: 'warn', code: 'NO_TIFF', message: 'no TIFF' }],
  reason: null,
  startedAt: session.startedAt,
  listedAt: '1970-01-01T00:00:00.000Z',
  createdAt: '2026-10-14T19:00:00.000Z',
  updatedAt: '2026-10-14T19:00:00.000Z',
  ...patch
})

describe('Vespera ingest presenter', () => {
  it('[VIN-007] Given sizes and starts, When shown, Then they read as people say them', () => {
    expect(bytesText(512)).toBe('512 B')
    expect(bytesText(1536)).toBe('1.5 KB')
    expect(bytesText(4.2 * 1024 * 1024)).toBe('4.2 MB')
    expect(bytesText(3 * 1024 ** 4)).toBe('3.0 TB')
    expect(sessionWhen('2024-06-15T21:00:54')).toBe('15 Jun 2024, 21:00')
    expect(sessionWhen(null)).toBeNull()
  })

  it('[VIN-008] Given findings, When ordered, Then errors come first, then warnings, then notes', () => {
    expect(orderedFindings(job().findings).map(f => f.code)).toEqual(['NO_TIFF', 'FITS_GT_JPEG'])
  })

  it('[VIN-016] Given a session and kinds, When the folder is previewed, Then it is the name a transfer would make; none without kinds', () => {
    expect(folderPreview(session, target, ['fits'])).toBe('NGC3372_2024-06-15_FIT=2')
    expect(folderPreview(session, target, ['fits', 'json'])).toBe('NGC3372_2024-06-15_FIT=2_JSON=3')
    expect(folderPreview(session, target, [])).toBeNull()
  })

  it('[VIN-019] Given a running and a finished job, When shown, Then progress and the manifest path read right', () => {
    expect(toIngestJobView(job(), '01-images-initial/img-0002.fits')).toMatchObject({ headline: '1 of 2 files, 1.0 KB of 2.0 KB', fraction: 0.5, current: '01-images-initial/img-0002.fits', manifestPath: null })
    expect(toIngestJobView(job({ state: 'done', committed: [], copiedBytes: 2048 }))).toMatchObject({ headline: 'Copied 2 files (2.0 KB) to NGC3372_2024-06-15_FIT=2', fraction: 1, manifestPath: '/repo/NGC3372_2024-06-15_FIT=2/astrorepo.manifest.json' })
    expect(toIngestJobView(job({ totalBytes: 0, items: [] })).fraction).toBe(0)
  })

  it('[VIN-015] Given a session, When shown, Then counts, worst finding and whether Transfer is on come with it', () => {
    const view = toIngestSessionView({ session, inventory: inventorySession(session) }, target, [], null)
    expect(view).toMatchObject({ when: '15 Jun 2024, 21:00', date: '2024-06-15', label: 'NGC3372', counts: { fits: 2, jpeg: 1, json: 3 }, size: '6.0 KB', worst: 'warn', transferable: true, deepSky: true })
    expect(view.runs).toEqual([{ folder: '01-images-initial', fits: 2, tiff: 0, jpeg: 1, json: 3, other: 0 }])
    const unknown = toIngestSessionView({ session, inventory: inventorySession(session) }, { ...target, confidence: 'unknown' }, [{ level: 'error', code: 'TARGET_MISMATCH', message: 'x' }], null)
    expect(unknown).toMatchObject({ transferable: false, worst: 'error' })
    expect(scanSummary([view])).toBe('1 session on the scope, 1 observation.')
    expect(scanSummary([view, { ...view, deepSky: false, job: toIngestJobView(job({ state: 'done' })) }])).toBe('2 sessions on the scope, 1 observation; 1 already in the repository.')
  })
})
