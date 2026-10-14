import { describe, expect, it } from 'vitest'
import {
  buildSession,
  bytesText,
  canTransfer,
  DEFAULT_INCLUDE,
  classifyFile,
  destinationFolderName,
  findUserFolder,
  folderTarget,
  frameGaps,
  inventorySession,
  isLocalName,
  MAX_FOLDER_NAME,
  nameCountFinding,
  normaliseTargetName,
  overrideTarget,
  parseDestinationFolder,
  parseRunFolder,
  parseSessionFolder,
  planCounts,
  planTransfer,
  recordSessionId,
  resolveTarget,
  sessionFilePaths,
  sessionFolders,
  sessionGrowth,
  sortSessions,
  targetFromObservationJson,
  targetInText,
  transferRoom,
  unsafeRunFinding,
  worstLevel,
  type Finding,
  type IngestTarget,
  type ScopeEntry,
  type VesperaSession
} from '../src/vespera-ingest'

const file = (name: string, sizeBytes = 10, modifiedAt: Date | null = null): ScopeEntry => ({ name, type: 'file', sizeBytes, modifiedAt })
const dir = (name: string): ScopeEntry => ({ name, type: 'dir', sizeBytes: 0, modifiedAt: null })
const listedAt = new Date('2026-10-14T19:00:00Z')

/** img-0001.fits … for each frame, and output JPEG/JSON and stacking JSON for each stacked frame. */
const imageRun = (frames: number[], stacked: number[] = frames, extra: string[] = ['capture.json']) => [
  ...frames.map(n => file(`img-${String(n).padStart(4, '0')}.fits`, 4)),
  ...stacked.flatMap(n => [`img-${String(n).padStart(4, '0')}-output.jpg`, `img-${String(n).padStart(4, '0')}-output.json`, `img-${String(n).padStart(4, '0')}-stacking.json`].map(f => file(f, 1))),
  ...extra.map(f => file(f, 1))
]

const session = (id: string, runs: Record<string, ScopeEntry[]>, top: ScopeEntry[] = []) =>
  buildSession(id, [...top, ...Object.keys(runs).map(dir)], Object.entries(runs).map(([folder, entries]) => ({ folder, entries })), listedAt)

const codes = (findings: Finding[]) => findings.map(f => `${f.level}:${f.code}${f.run ? `@${f.run}` : ''}`)

describe('Vespera session folders', () => {
  it('[VIN-001] Given an observation folder, When its name is read, Then kind, start and label come from it', () => {
    expect(parseSessionFolder('2024-06-15_21-00-54_observation_NGC3372')).toEqual({ kind: 'observation', startedAt: '2024-06-15T21:00:54', rawLabel: 'NGC3372' })
    expect(parseSessionFolder('2024-06-15_21-52-17_auto-init')).toEqual({ kind: 'auto-init', startedAt: '2024-06-15T21:52:17', rawLabel: null })
    expect(parseSessionFolder('2024-07-12_13-31-31_sun-mode')).toEqual({ kind: 'sun-mode', startedAt: '2024-07-12T13:31:31', rawLabel: null })
  })

  it('[VIN-002] Given labels with underscores and spaces, and a kind no firmware wrote yet, When read, Then the label is kept whole and the timestamp kept', () => {
    expect(parseSessionFolder('2024-06-16_01-12-12_observation_M8_M20_10_18')?.rawLabel).toBe('M8_M20_10_18')
    expect(parseSessionFolder('2024-06-03_21-15-18_observation_NGC5139 omega centauri')?.rawLabel).toBe('NGC5139 omega centauri')
    expect(parseSessionFolder('2025-01-02_03-04-05_planet-mode')).toEqual({ kind: 'planet-mode', startedAt: '2025-01-02T03:04:05', rawLabel: null })
  })

  it('[VIN-003] Given names with no valid timestamp, When read, Then they do not parse (not a date, not a time, no kind)', () => {
    for (const name of ['01-observation-eagle-15-15', '2024-13-01_21-00-00_observation', '2024-02-30_21-00-00_observation', '2024-06-15_24-00-00_observation', '2024-06-15_21-60-00_observation', '2024-06-15_21-00-60_observation', '2024-06-15_21-00-00', '2024-06-15_21-00-00_Observation', 'x2024-06-15_21-00-00_observation']) {
      expect(parseSessionFolder(name), name).toBeNull()
    }
    expect(parseSessionFolder('2024-02-29_23-59-59_observation')?.startedAt).toBe('2024-02-29T23:59:59')
  })

  it('[VIN-003] Given a timestamp in a year before 100, When read, Then it is not taken as a valid date', () => {
    expect(parseSessionFolder('0099-06-15_21-00-00_observation')).toBeNull()
  })

  it('[VIN-003] Given a folder with no timestamp, When built, Then it is a session of kind unknown starting at its earliest file, with NO_TIMESTAMP at info', () => {
    const early = new Date('2024-06-05T22:10:00Z')
    const s = buildSession('01-observation-eagle-15-15', [dir('01-images-initial')], [{ folder: '01-images-initial', entries: [file('img-0002.fits', 4, new Date('2024-06-05T22:20:00Z')), file('img-0001.fits', 4, early), file('x.fits', 4, new Date('invalid'))] }], listedAt)
    expect(s).toMatchObject({ id: '01-observation-eagle-15-15', kind: 'unknown', timestamped: false, startedAt: '2024-06-05T22:10:00', rawLabel: null })
    expect(codes(inventorySession(s).findings)).toContain('info:NO_TIMESTAMP')
    expect(inventorySession(s).findings.find(f => f.code === 'NO_TIMESTAMP')?.message).toBe('"01-observation-eagle-15-15" has no date in its name, so its start is taken from its earliest file.')
    expect(buildSession('odd', [], [], listedAt).startedAt).toBeNull()
  })

  it('[VIN-001] Given the scope root and user/, When read, Then user is found whatever its case and expert-mode is not a session', () => {
    expect(findUserFolder([dir('system'), dir('USER'), file('user')])).toBe('USER')
    expect(findUserFolder([dir('system'), file('user')])).toBeNull()
    expect(sessionFolders([dir('2024-06-15_21-00-54_observation_NGC3372'), dir('Expert-Mode'), file('notes.txt'), dir('01-observation-eagle-15-15')])).toEqual(['2024-06-15_21-00-54_observation_NGC3372', '01-observation-eagle-15-15'])
  })

  it('[VIN-001] Given sessions, When sorted, Then newest first, undated last, ties by id', () => {
    const a = session('2024-06-15_21-00-54_observation_A', {})
    const b = session('2024-06-16_01-12-12_observation_B', {})
    const c = buildSession('zz', [], [], listedAt)
    const d = buildSession('aa', [], [], listedAt)
    expect(sortSessions([c, a, d, b]).map(s => s.id)).toEqual([b.id, a.id, 'aa', 'zz'])
    expect(sortSessions([a, c]).map(s => s.id)).toEqual([a.id, 'zz'])
    expect(sortSessions([b, a]).map(s => s.id)).toEqual([b.id, a.id])
    expect(sortSessions([d, c]).map(s => s.id)).toEqual(['aa', 'zz'])
  })
})

describe('Vespera run folders and files', () => {
  it('[VIN-004] Given run folders, When read, Then the suffix classifies and the number only orders', () => {
    expect(parseRunFolder('01-pointing-initial')).toEqual({ order: 1, stage: 'pointing', step: 'initial' })
    expect(parseRunFolder('04-images-adjust-framing')).toEqual({ order: 4, stage: 'images', step: 'adjust-framing' })
    expect(parseRunFolder('images-adjust-focus')).toEqual({ order: null, stage: 'images', step: 'adjust-focus' })
    expect(parseRunFolder('07-misc')).toEqual({ order: 7, stage: 'unknown', step: '' })
    expect(parseRunFolder('misc')).toEqual({ order: null, stage: 'unknown', step: '' })
    expect(parseRunFolder('calibration-07-darks')).toEqual({ order: null, stage: 'unknown', step: '' })
  })

  it('[VIN-004] Given runs listed out of order, When a session is built, Then they are ordered by their number, then by name', () => {
    const s = session('2024-06-05_22-00-00_observation_M16', { '04-images-adjust-framing': [], '02-images-initial': [], '01-pointing-initial': [], zz: [], aa: [], '03-pointing-adjust-framing': [] })
    expect(s.runs.map(r => r.folder)).toEqual(['01-pointing-initial', '02-images-initial', '03-pointing-adjust-framing', '04-images-adjust-framing', 'aa', 'zz'])
    expect(session('2024-06-05_22-00-00_observation_M16', { aa: [], zz: [] }).runs.map(r => r.folder)).toEqual(['aa', 'zz'])
  })

  it('[VIN-007] Given the files an image run holds, When classified, Then kind, role and frame come from the name, case aside', () => {
    expect(classifyFile(file('img-0042.fits'))).toMatchObject({ kind: 'fits', role: 'frame', frameNo: 42 })
    expect(classifyFile(file('IMG-0042.FITS'))).toMatchObject({ kind: 'fits', role: 'frame', frameNo: 42 })
    expect(classifyFile(file('img-0042-output.jpg'))).toMatchObject({ kind: 'jpeg', role: 'output', frameNo: 42 })
    expect(classifyFile(file('img-0042-output.jpeg'))).toMatchObject({ kind: 'jpeg', role: 'output' })
    expect(classifyFile(file('img-0042-output.json'))).toMatchObject({ kind: 'json', role: 'output', frameNo: 42 })
    expect(classifyFile(file('img-0042-stacking.json'))).toMatchObject({ kind: 'json', role: 'stacking', frameNo: 42 })
    const tiff = classifyFile(file('img-0099.tif'))
    expect(tiff).toMatchObject({ kind: 'tiff', frameNo: 99 })
    expect(tiff.role).toBeUndefined()
    expect(classifyFile(file('img-0099.tiff')).kind).toBe('tiff')
    expect(classifyFile(file('capture.json'))).toMatchObject({ kind: 'json', role: 'capture' })
    expect(classifyFile(file('observation.json'))).toMatchObject({ kind: 'json', role: 'observation' })
    expect(classifyFile(file('Observation.JSON')).role).toBe('observation')
  })

  it('[VIN-005] Given files that match no known pattern, When classified, Then each still has a kind, other when unknown', () => {
    expect(classifyFile(file('export.TIF'))).toMatchObject({ kind: 'tiff' })
    expect(classifyFile(file('export.TIF')).role).toBeUndefined()
    expect(classifyFile(file('notes.txt')).kind).toBe('other')
    expect(classifyFile(file('README')).kind).toBe('other')
    expect(classifyFile(file('img-42.fits')).frameNo).toBeUndefined()
    expect(classifyFile(file('img-0001.fit')).kind).toBe('fits')
    expect(classifyFile(file('img-0001.fits.txt')).kind).toBe('other')
    expect(classifyFile(file('export.jpg.part')).kind).toBe('other')
  })

  it('[VIN-007] Given a listed file, When classified, Then its size and modified time are kept', () => {
    const at = new Date('2024-06-15T21:01:00Z')
    expect(classifyFile(file('img-0001.fits', 4_200_000, at))).toMatchObject({ sizeBytes: 4_200_000, modifiedAt: at })
  })

  it('[VIN-007] Given a session, When built, Then observation.json at its top is found and it carries when it was listed', () => {
    const s = session('2024-06-15_21-00-54_observation_NGC3372', { '01-images-initial': imageRun([1]) }, [file('observation.json', 300), file('notes.md', 5)])
    expect(s.observationJson).toBe('observation.json')
    expect(s.rootFiles.map(f => f.name)).toEqual(['observation.json', 'notes.md'])
    expect(s.listedAt).toBe(listedAt)
    expect(session('2024-06-15_21-00-54_observation_X', {}).observationJson).toBeNull()
    expect(session('2024-06-15_21-00-54_observation_X', {}, [file('notes.md'), file('observation.json')]).observationJson).toBe('observation.json')
    expect(session('2024-06-15_21-00-54_observation_X', {}, [file('notes.md')]).observationJson).toBeNull()
  })

  it('[VIN-006] Given folders below a run, When a session is built, Then only the run\'s files are counted', () => {
    const s = session('2024-06-15_21-00-54_observation_X', { '01-images-initial': [dir('deeper'), ...imageRun([1])] })
    expect(s.runs[0].files.map(f => f.name)).not.toContain('deeper')
  })
})

describe('Vespera counts and findings', () => {
  it('[VIN-007] Given a session, When inventoried, Then files are counted per run and in total, with total bytes', () => {
    const s = session('2024-06-05_22-00-00_observation_M16', { '01-pointing-initial': [file('solve.jpg', 2)], '02-images-initial': imageRun([1, 2, 3], [1, 3]), '04-images-adjust-framing': [...imageRun([1, 2], [1, 2]), file('img-0002.tif', 50)] }, [file('observation.json', 7)])
    const inv = inventorySession(s)
    expect(inv.sessionId).toBe(s.id)
    expect(inv.perRun['02-images-initial']).toEqual({ fits: 3, tiff: 0, jpeg: 2, json: 5, other: 0 })
    expect(inv.perRun['04-images-adjust-framing']).toEqual({ fits: 2, tiff: 1, jpeg: 2, json: 5, other: 0 })
    expect(inv.perRun['01-pointing-initial']).toEqual({ fits: 0, tiff: 0, jpeg: 1, json: 0, other: 0 })
    expect(inv.totals).toEqual({ fits: 5, tiff: 1, jpeg: 5, json: 11, other: 0 })
    expect(inv.bytes).toBe(7 + 2 + (3 * 4 + 6 + 1) + (2 * 4 + 6 + 1 + 50))
  })

  it('[VIN-008] Given a complete run with a TIFF, When inventoried, Then nothing is wrong but rejected frames are noted', () => {
    const s = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [...imageRun([1, 2, 3], [1, 3]), file('img-0003.tif')] })
    expect(codes(inventorySession(s).findings)).toEqual(['info:FITS_GT_JPEG@01-images-initial'])
    expect(inventorySession(s).findings[0].message).toBe('1 frame was left out of the stack in 01-images-initial.')
    const two = session('2024-06-05_22-00-00_observation_M16', { r: [] , '01-images-initial': [...imageRun([1, 2, 3], [1]), file('img-0003.tif')] })
    expect(inventorySession(two).findings.find(f => f.code === 'FITS_GT_JPEG')?.message).toBe('2 frames were left out of the stack in 01-images-initial.')
  })

  it('[VIN-008] Given a pointing-only session, When inventoried, Then NO_IMAGES_RUN is an error', () => {
    const s = session('2024-06-15_21-52-17_auto-init', { '01-pointing-initial': [file('a.jpg')] })
    expect(codes(inventorySession(s).findings)).toEqual(['error:NO_IMAGES_RUN'])
    expect(inventorySession(s).findings[0].message).toBe('The session has no image run, so there is nothing to keep.')
    expect(worstLevel(inventorySession(s).findings)).toBe('error')
  })

  it('[VIN-008] Given an image run with nothing in it, When inventoried, Then EMPTY_RUN and NO_TIFF warn and NO_FITS is noted, with no JSON finding', () => {
    const s = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('capture.json')] })
    expect(codes(inventorySession(s).findings)).toEqual(['warn:EMPTY_RUN@01-images-initial', 'warn:NO_TIFF@01-images-initial', 'info:NO_FITS@01-images-initial'])
  })

  it('[VIN-008] Given an empty image run with no capture.json, When inventoried, Then EMPTY_RUN, NO_TIFF and NO_FITS say why and no JSON finding is raised', () => {
    const s = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [] })
    expect(inventorySession(s).findings.map(f => f.message)).toEqual([
      '01-images-initial has no images: the run stopped early or every image format was off.',
      '01-images-initial has no TIFF: the 16-bit stack is not on the scope.',
      '01-images-initial has no FITS: raw saving was off, so it cannot be stacked again.'
    ])
  })

  it('[VIN-008] Given an image run holding only a JPEG or only a TIFF and no capture.json, When inventoried, Then it is not empty and JSON_MISMATCH is raised', () => {
    const jpegOnly = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('img-0001-output.jpg')] })
    expect(codes(inventorySession(jpegOnly).findings)).toEqual(['warn:NO_TIFF@01-images-initial', 'info:NO_FITS@01-images-initial', 'info:JSON_MISMATCH@01-images-initial'])
    expect(inventorySession(jpegOnly).findings[2].message).toBe('01-images-initial: no capture.json, 0 output JSON for 1 JPEGs, 0 stacking JSON for 1 JPEGs.')
    const tiffOnly = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('img-0001.tif')] })
    expect(codes(inventorySession(tiffOnly).findings)).toEqual(['info:NO_FITS@01-images-initial', 'info:JSON_MISMATCH@01-images-initial'])
    expect(inventorySession(tiffOnly).findings[1].message).toBe('01-images-initial: no capture.json.')
  })

  it('[VIN-008] Given a run with as many FITS as JPEGs but no TIFF, When inventoried, Then only NO_TIFF warns and the run is not empty', () => {
    const s = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': imageRun([1], [1]) })
    expect(codes(inventorySession(s).findings)).toEqual(['warn:NO_TIFF@01-images-initial'])
  })

  it('[VIN-008] Given more JPEGs than FITS, When inventoried, Then FITS_LT_JPEG is an error; with no FITS at all it is only NO_FITS', () => {
    const partial = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [...imageRun([1], [1, 2]), file('img-0002.tif')] })
    const f = inventorySession(partial).findings
    expect(codes(f)).toContain('error:FITS_LT_JPEG@01-images-initial')
    expect(codes(f)).not.toContain('info:FITS_GT_JPEG@01-images-initial')
    expect(f.find(x => x.code === 'FITS_LT_JPEG')?.message).toBe('01-images-initial has fewer FITS (1) than JPEGs (2): the listing is partial or files are missing.')
    const noRaw = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [...imageRun([], [1, 2]), file('img-0002.tif')] })
    expect(codes(inventorySession(noRaw).findings)).toEqual(['info:NO_FITS@01-images-initial'])
  })

  it('[VIN-008] Given FITS and no JPEGs (JPEG output off), When inventoried, Then FITS_GT_JPEG is not raised', () => {
    const s = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('img-0001.fits'), file('img-0002.fits'), file('capture.json'), file('img-0002.tif')] })
    expect(codes(inventorySession(s).findings)).toEqual([])
  })

  it('[VIN-008] Given missing FITS frames, When inventoried, Then GAP_IN_FRAMES warns and lists the first five', () => {
    const s = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [...imageRun([1, 3, 10], [1]), file('img-0010.tif')] })
    const gap = inventorySession(s).findings.find(f => f.code === 'GAP_IN_FRAMES')
    expect(gap).toMatchObject({ level: 'warn', run: '01-images-initial' })
    expect(gap?.message).toBe('01-images-initial is missing 7 FITS frames (2, 4, 5, 6, 7, …).')
    const one = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [...imageRun([1, 3], [1]), file('img-0003.tif')] })
    expect(inventorySession(one).findings.find(f => f.code === 'GAP_IN_FRAMES')?.message).toBe('01-images-initial is missing 1 FITS frame (2).')
    const five = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [...imageRun([1, 7], [1]), file('img-0007.tif')] })
    expect(inventorySession(five).findings.find(f => f.code === 'GAP_IN_FRAMES')?.message).toBe('01-images-initial is missing 5 FITS frames (2, 3, 4, 5, 6).')
  })

  it('[VIN-008] Given a TIFF numbered past the last FITS frame, When inventoried, Then the TIFF\'s number is not a missing frame', () => {
    const s = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [...imageRun([1, 2], [1, 2]), file('img-0004.tif')] })
    expect(codes(inventorySession(s).findings)).toEqual([])
  })

  it('[VIN-008] Given stacked JPEGs that skip rejected frames, When inventoried, Then that is not a gap', () => {
    const s = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [...imageRun([1, 2, 3, 4], [1, 4]), file('img-0004.tif')] })
    expect(codes(inventorySession(s).findings)).toEqual(['info:FITS_GT_JPEG@01-images-initial'])
  })

  it('[VIN-008] Given frame numbers, When gaps are found, Then only numbers strictly between the lowest and highest count', () => {
    expect(frameGaps([])).toEqual([])
    expect(frameGaps([5])).toEqual([])
    expect(frameGaps([3, 1, 2])).toEqual([])
    expect(frameGaps([2, 5])).toEqual([3, 4])
  })

  it('[VIN-008] Given several TIFFs, When inventoried, Then MANY_TIFF is noted', () => {
    const s = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [...imageRun([1], [1]), file('img-0001.tif'), file('img-0001-2.tif')] })
    expect(codes(inventorySession(s).findings)).toEqual(['info:MANY_TIFF@01-images-initial'])
    expect(inventorySession(s).findings[0].message).toContain('has 2 TIFFs')
  })

  it('[VIN-008] Given sidecars that do not match the JPEGs, When inventoried, Then JSON_MISMATCH says which', () => {
    const noCapture = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [...imageRun([1], [1], []), file('img-0001.tif')] })
    expect(inventorySession(noCapture).findings.find(f => f.code === 'JSON_MISMATCH')?.message).toBe('01-images-initial: no capture.json.')
    const short = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('img-0001.fits'), file('img-0001-output.jpg'), file('img-0001.tif'), file('capture.json')] })
    expect(inventorySession(short).findings.find(f => f.code === 'JSON_MISMATCH')?.message).toBe('01-images-initial: 0 output JSON for 1 JPEGs, 0 stacking JSON for 1 JPEGs.')
    const outOnly = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('img-0001.fits'), file('img-0001-output.jpg'), file('img-0001-output.json'), file('img-0001.tif'), file('capture.json')] })
    expect(inventorySession(outOnly).findings.find(f => f.code === 'JSON_MISMATCH')?.message).toBe('01-images-initial: 0 stacking JSON for 1 JPEGs.')
    expect(inventorySession(outOnly).findings.find(f => f.code === 'JSON_MISMATCH')?.level).toBe('info')
    const stackingOnly = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('img-0001.fits'), file('img-0001-output.jpg'), file('img-0001-stacking.json'), file('img-0001.tif'), file('capture.json')] })
    expect(inventorySession(stackingOnly).findings.find(f => f.code === 'JSON_MISMATCH')?.message).toBe('01-images-initial: 0 output JSON for 1 JPEGs.')
  })

  it('[VIN-008] Given a stacking file that is not JSON, When inventoried, Then it is not counted as a stacking decision and raises no JSON_MISMATCH', () => {
    const s = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [...imageRun([1], [1]), file('img-0001-stacking.fits'), file('img-0001.tif')] })
    expect(codes(inventorySession(s).findings)).not.toContain('info:JSON_MISMATCH@01-images-initial')
  })

  it('[VIN-005] Given an unknown run and unknown files, When inventoried, Then they are counted and noted at info', () => {
    const s = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [...imageRun([1], [1]), file('img-0001.tif'), file('log.txt')], '02-images-planet': [], '03-calibration': [file('a.bin')] }, [file('thumb.png')])
    const f = inventorySession(s).findings
    expect(codes(f)).toEqual(expect.arrayContaining(['info:UNKNOWN_FILES@01-images-initial', 'info:UNKNOWN_RUN@02-images-planet', 'info:UNKNOWN_RUN@03-calibration', 'info:UNKNOWN_FILES@03-calibration', 'info:UNKNOWN_FILES']))
    expect(inventorySession(s).totals.other).toBe(3)
    expect(f.find(x => x.code === 'UNKNOWN_FILES' && !x.run)?.message).toBe("The session's top folder holds 1 file of a kind astrorepo does not know.")
    expect(f.find(x => x.code === 'UNKNOWN_FILES' && x.run === '01-images-initial')?.message).toBe('01-images-initial holds 1 file of a kind astrorepo does not know.')
    expect(f.find(x => x.code === 'UNKNOWN_RUN' && x.run === '03-calibration')?.message).toBe('03-calibration is not a run this firmware is known to write; its files are counted anyway.')
  })

  it('[VIN-009] Given a run whose stacked count is one short of its JPEGs, When inventoried, Then no finding compares them', () => {
    const s = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [...imageRun([1, 2], [1, 2]), file('img-0002.tif')] })
    expect(inventorySession(s).findings).toEqual([])
  })

  it('[VIN-008] Given findings, When the worst is asked for, Then error beats warn beats info, and none is null', () => {
    const f = (level: Finding['level']): Finding => ({ level, code: 'NO_TIFF', message: '' })
    expect(worstLevel([])).toBeNull()
    expect(worstLevel([f('info')])).toBe('info')
    expect(worstLevel([f('info'), f('warn')])).toBe('warn')
    expect(worstLevel([f('warn'), f('error'), f('info')])).toBe('error')
  })

  it('[VIN-023] Given a session listed again, When compared, Then added, resized and gone files raise SESSION_GREW; no change is null', () => {
    const before = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('img-0001.fits', 4), file('img-0002.fits', 4), file('img-0003.fits', 4)] }, [file('observation.json', 3)])
    expect(sessionGrowth(before, before)).toBeNull()
    const after = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('img-0001.fits', 4), file('img-0002.fits', 2), file('img-0004.fits', 4), file('img-0005.fits', 4)] }, [file('observation.json', 3)])
    expect(sessionGrowth(before, after)).toEqual({ level: 'warn', code: 'SESSION_GREW', message: 'The session changed since it was listed: 2 files added, 1 file changed size, 1 file gone. It may still be running.' })
    const one = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('img-0001.fits', 4), file('img-0002.fits', 4), file('img-0003.fits', 4), file('img-0004.fits', 4)] }, [file('observation.json', 3)])
    expect(sessionGrowth(before, one)?.message).toBe('The session changed since it was listed: 1 file added. It may still be running.')
    const replaced = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('img-0001.fits', 4), file('img-0002.fits', 4), file('img-0009.fits', 4)] }, [file('observation.json', 3)])
    expect(sessionGrowth(before, replaced)?.message).toBe('The session changed since it was listed: 1 file added, 1 file gone. It may still be running.')
    const resized = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('img-0001.fits', 4), file('img-0002.fits', 4), file('img-0003.fits', 8)] }, [file('observation.json', 3)])
    expect(sessionGrowth(before, resized)?.message).toBe('The session changed since it was listed: 1 file changed size. It may still be running.')
    const grewAndResized = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('img-0001.fits', 4), file('img-0002.fits', 4), file('img-0003.fits', 8), file('img-0004.fits', 4)] }, [file('observation.json', 3)])
    expect(sessionGrowth(before, grewAndResized)?.message).toBe('The session changed since it was listed: 1 file added, 1 file changed size. It may still be running.')
    const shrunk = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('img-0001.fits', 4), file('img-0002.fits', 4)] }, [file('observation.json', 3)])
    expect(sessionGrowth(before, shrunk)?.message).toBe('The session changed since it was listed: 1 file gone. It may still be running.')
    expect(sessionFilePaths(before)).toEqual(['01-images-initial/img-0001.fits', '01-images-initial/img-0002.fits', '01-images-initial/img-0003.fits', 'observation.json'])
  })
})

describe('Vespera targets', () => {
  it('[VIN-012] Given designations however they are written, When normalised, Then prefix, one space, number', () => {
    for (const raw of ['ic443', 'IC-443', 'IC 443', 'ic_443', ' IC  443 ']) expect(normaliseTargetName(raw)).toEqual({ name: 'IC 443', catalogue: 'IC', remainder: null, review: false })
    expect(normaliseTargetName('NGC3372')?.name).toBe('NGC 3372')
    expect(normaliseTargetName('m31')).toMatchObject({ name: 'M 31', catalogue: 'M' })
    expect(normaliseTargetName('M008')?.name).toBe('M 8')
    expect(normaliseTargetName('Sh2-155')).toMatchObject({ name: 'Sh2 155', catalogue: 'Sh2' })
    expect(normaliseTargetName('sh 2 155')).toMatchObject({ name: 'Sh2 155', catalogue: 'Sh2' })
  })

  it('[VIN-012] Given labels with words after a designation, When normalised, Then the designation is taken and the words kept', () => {
    expect(normaliseTargetName('M16_15_18')).toEqual({ name: 'M 16', catalogue: 'M', remainder: '15_18', review: false })
    expect(normaliseTargetName('NGC5139 omega centauri')).toEqual({ name: 'NGC 5139', catalogue: 'NGC', remainder: 'omega centauri', review: false })
    expect(normaliseTargetName('M8_M20_10_18')?.name).toBe('M 8')
    expect(normaliseTargetName('M16 - Eagle')).toEqual({ name: 'M 16', catalogue: 'M', remainder: 'Eagle', review: false })
  })

  it('[VIN-012] Given common names, When normalised, Then they map to their designation', () => {
    expect(normaliseTargetName('Jellyfish Nebula')).toEqual({ name: 'IC 443', catalogue: 'IC', remainder: 'Jellyfish Nebula', review: false })
    expect(normaliseTargetName('andromeda_galaxy')).toMatchObject({ name: 'M 31', catalogue: 'M' })
    expect(normaliseTargetName('omega  centauri')).toMatchObject({ name: 'NGC 5139', catalogue: 'NGC' })
    expect(normaliseTargetName('Orion_Nebula_')).toMatchObject({ name: 'M 42', catalogue: 'M' })
  })

  it('[VIN-012] Given names that are not designations, When normalised, Then they are kept whole and marked for review; blank is null', () => {
    for (const raw of ['moon', 'Tarentule_Nebula_15_18', 'M8m20_15_18', 'MOON', 'ICE', 'Mars']) expect(normaliseTargetName(raw)).toEqual({ name: raw, catalogue: 'other', remainder: null, review: true })
    expect(normaliseTargetName('  moon ')?.name).toBe('moon')
    expect(normaliseTargetName('   ')).toBeNull()
    expect(normaliseTargetName('')).toBeNull()
  })

  it('[VIN-010] Given EXIF descriptions, When searched, Then a designation or common name anywhere is found; else null', () => {
    expect(targetInText('Vespera Pro - M 42 - 120 frames')).toMatchObject({ name: 'M 42' })
    expect(targetInText('NGC7000 stacked 40')).toMatchObject({ name: 'NGC 7000' })
    expect(targetInText('The Orion Nebula, 60 frames')).toMatchObject({ name: 'M 42', catalogue: 'M' })
    expect(targetInText('Andromeda Galaxy')).toMatchObject({ name: 'M 31' })
    expect(targetInText('stacked 120 frames')).toBeNull()
    expect(targetInText('FORMAT 2')).toBeNull()
  })

  it('[VIN-010] Given EXIF descriptions, When a target is found, Then it is written with its catalogue, needs no review, and the longer of two common names wins', () => {
    expect(targetInText('Vespera Pro - M 42 - 120 frames')).toEqual({ name: 'M 42', catalogue: 'M', remainder: null, review: false })
    expect(targetInText('Carina Nebula, 40 frames')).toEqual({ name: 'NGC 3372', catalogue: 'NGC', remainder: null, review: false })
    expect(targetInText('Pleiades and the Horsehead Nebula')).toMatchObject({ name: 'IC 434', catalogue: 'IC' })
  })

  it('[VIN-010] Given observation.json, When read, Then the target is found under a known key, nested one level or not', () => {
    expect(targetFromObservationJson('{"target":"M 31"}')).toBe('M 31')
    expect(targetFromObservationJson('{"objectName":" IC 443 "}')).toBe('IC 443')
    expect(targetFromObservationJson('{"target":{"name":"NGC 7000","ra":1}}')).toBe('NGC 7000')
    expect(targetFromObservationJson('{"mission":{"object":"M 8"}}')).toBe('M 8')
    expect(targetFromObservationJson('{"target":"","dso":"M 1"}')).toBe('M 1')
    expect(targetFromObservationJson('{"target":"   ","dso":"M 1"}')).toBe('M 1')
    expect(targetFromObservationJson('{"target":{"name":"NGC 7000"},"name":"Evening session"}')).toBe('NGC 7000')
    expect(targetFromObservationJson('{"mission":{},"plan":{"object":"M 8"}}')).toBe('M 8')
  })

  it('[VIN-011] Given observation.json that is not JSON or names nothing, When read, Then it gives null and nothing is thrown', () => {
    for (const t of ['', 'not json', '[]', '"M31"', '{"target":42}', '{"other":"M 31"}', '{"constructor":"M 31"}', 'null', '[{"target":"M 31"}]']) expect(targetFromObservationJson(t), t).toBeNull()
  })

  it('[VIN-010] Given clues, When resolved, Then the cheapest that names a target wins and is the confidence', () => {
    const r = resolveTarget([{ source: 'exif', raw: 'M 42 - 10 frames' }, { source: 'folder', raw: null }, { source: 'observation-json', raw: 'Orion Nebula' }])
    expect(r.target).toEqual({ name: 'M 42', catalogue: 'M', confidence: 'observation-json', evidence: ['observation-json: Orion Nebula', 'exif: M 42 - 10 frames'], review: false })
    expect(r.findings).toEqual([])
    expect(resolveTarget([{ source: 'folder', raw: 'NGC3372' }]).target).toEqual({ name: 'NGC 3372', catalogue: 'NGC', confidence: 'folder', evidence: ['folder: NGC3372'], review: false })
    expect(resolveTarget([{ source: 'folder', raw: 'M16_15_18' }]).target.evidence).toEqual(['folder: M16_15_18 (beside the name: 15_18)'])
    expect(resolveTarget([{ source: 'fits-header', raw: 'IC443' }]).target.confidence).toBe('fits-header')
    expect(resolveTarget([{ source: 'folder', raw: 'moon' }]).target).toMatchObject({ name: 'moon', confidence: 'folder', review: true })
  })

  it('[VIN-011] Given no clue names a target, When resolved, Then the target is unknown and needs review', () => {
    const r = resolveTarget([{ source: 'folder', raw: null }, { source: 'exif', raw: '  ' }])
    expect(r.target).toEqual({ name: 'Unknown', confidence: 'unknown', evidence: ['folder: nothing', 'exif: nothing'], review: true })
    expect(resolveTarget([]).target.confidence).toBe('unknown')
  })

  it('[VIN-013] Given two clues that disagree, When resolved, Then the cheaper one is kept and TARGET_MISMATCH warns', () => {
    const r = resolveTarget([{ source: 'exif', raw: 'M 32' }, { source: 'folder', raw: 'M31' }])
    expect(r.target.name).toBe('M 31')
    expect(r.findings).toEqual([{ level: 'warn', code: 'TARGET_MISMATCH', message: 'The folder says M 31 but the exif says M 32; keeping M 31.' }])
    expect(resolveTarget([{ source: 'folder', raw: 'm31' }, { source: 'observation-json', raw: 'M 31' }]).findings).toEqual([])
  })

  it('[VIN-014] Given a target, When the user names another, Then it is manual and the old one is in the evidence; blank is refused', () => {
    const before: IngestTarget = { name: 'moon', catalogue: 'other', confidence: 'folder', evidence: ['folder: moon'], review: true }
    expect(overrideTarget(before, ' jellyfish nebula ')).toEqual({ name: 'IC 443', catalogue: 'IC', confidence: 'manual', evidence: ['folder: moon', 'manual: jellyfish nebula (was moon, from the folder)'], review: false })
    expect(overrideTarget({ ...before, name: 'Unknown', confidence: 'unknown' }, 'Luna')?.evidence.at(-1)).toBe('manual: Luna (was Unknown, from the nothing found)')
    expect(overrideTarget({ ...before, name: 'Unknown', confidence: 'unknown' }, 'Luna')?.review).toBe(false)
    expect(overrideTarget(before, '  ')).toBeNull()
  })

  it('[VIN-015] Given findings and a target, When Transfer is checked, Then an error, an unknown target or one marked for review turns it off; a warning does not', () => {
    const t: IngestTarget = { name: 'M 31', confidence: 'folder', evidence: [], review: false }
    const f = (level: Finding['level']): Finding => ({ level, code: 'NO_TIFF', message: '' })
    expect(canTransfer([f('warn'), f('info')], t)).toBe(true)
    expect(canTransfer([f('error')], t)).toBe(false)
    expect(canTransfer([], { ...t, confidence: 'unknown' })).toBe(false)
    expect(canTransfer([], { ...t, name: 'moon', review: true })).toBe(false)
    expect(canTransfer([], overrideTarget({ ...t, name: 'moon', review: true }, 'M 42')!)).toBe(true)
  })
})

describe('Vespera destination folder names', () => {
  const m31 = { name: 'M 31', catalogue: 'M' as const }

  it('[VIN-016] Given a target, date and counts, When named, Then {target}_{date} and one token per kind in FIT, TIF, JPG, JSON order', () => {
    expect(destinationFolderName({ target: m31, date: '2026-10-14', counts: { fits: 400 } })).toBe('M31_2026-10-14_FIT=400')
    expect(destinationFolderName({ target: m31, date: '2026-10-14', counts: { json: 9, tiff: 1, fits: 400, jpeg: 0 } })).toBe('M31_2026-10-14_FIT=400_TIF=1_JPG=0_JSON=9')
    expect(destinationFolderName({ target: { name: 'IC 443' }, date: '2026-10-14', counts: { fits: 1 }, duplicate: 2 })).toBe('IC443_2026-10-14_FIT=1_2')
    expect(destinationFolderName({ target: { name: 'IC 443' }, date: '2026-10-14', counts: { fits: 1 }, duplicate: 1 })).toBe('IC443_2026-10-14_FIT=1')
    expect(destinationFolderName({ target: m31, date: '2026-10-14', counts: { fits: 2.7 } })).toBe('M31_2026-10-14_FIT=2')
    expect(destinationFolderName({ target: m31, date: '2026-10-14', counts: { fits: -1 } })).toBe('M31_2026-10-14_FIT=0')
  })

  it('[VIN-016] Given no kind or a bad date, When named, Then naming is refused', () => {
    expect(() => destinationFolderName({ target: m31, date: '2026-10-14', counts: {} })).toThrow('A copy includes at least one kind of file.')
    expect(() => destinationFolderName({ target: m31, date: '14/10/2026', counts: { fits: 1 } })).toThrow('Not a date: 14/10/2026')
    expect(() => destinationFolderName({ target: m31, date: 'x2026-10-14', counts: { fits: 1 } })).toThrow('Not a date: x2026-10-14')
    expect(() => destinationFolderName({ target: m31, date: '2026-10-14x', counts: { fits: 1 } })).toThrow('Not a date: 2026-10-14x')
  })

  it('[VIN-017] Given target names, When made a folder part, Then designations lose spaces and others are sanitised', () => {
    expect(folderTarget({ name: 'NGC 7000' })).toBe('NGC7000')
    expect(folderTarget({ name: 'Sh2 155' })).toBe('Sh2-155')
    expect(folderTarget({ name: 'Tarentule_Nebula_15_18' })).toBe('Tarentule-Nebula-15-18')
    expect(folderTarget({ name: '  moon / sun!! ' })).toBe('moon-sun')
    expect(folderTarget({ name: '--a--b--' })).toBe('a--b')
    expect(folderTarget({ name: 'Мун' })).toBe('target')
    expect(folderTarget({ name: 'M 31 x' })).toBe('M-31-x')
    expect(folderTarget({ name: 'Galaxy M 31' })).toBe('Galaxy-M-31')
  })

  it('[VIN-017] Given a long target, When named, Then only the target part is shortened to keep 80 characters', () => {
    const name = destinationFolderName({ target: { name: 'A'.repeat(200) }, date: '2026-10-14', counts: { fits: 400, tiff: 1, jpeg: 400, json: 801 }, duplicate: 12 })
    expect(name.length).toBe(MAX_FOLDER_NAME)
    expect(name.endsWith('_2026-10-14_FIT=400_TIF=1_JPG=400_JSON=801_12')).toBe(true)
    const dashed = destinationFolderName({ target: { name: `${'a'.repeat(44)}-${'b'.repeat(20)}` }, date: '2026-10-14', counts: { fits: 1, tiff: 1, jpeg: 1, json: 1 } })
    expect(dashed.length).toBeLessThanOrEqual(MAX_FOLDER_NAME)
    expect(dashed).toMatch(/^a+_2026/)
    expect(parseDestinationFolder(dashed)).not.toBeNull()
    expect(destinationFolderName({ target: { name: 'Tarentule_Nebula' }, date: '2026-10-14', counts: { fits: 1 } })).toBe('Tarentule-Nebula_2026-10-14_FIT=1')
    const cutAtDashes = destinationFolderName({ target: { name: `${'a'.repeat(61)}--${'b'.repeat(10)}` }, date: '2026-10-14', counts: { fits: 1 } })
    expect(cutAtDashes).toBe(`${'a'.repeat(61)}_2026-10-14_FIT=1`)
  })

  it('[VIN-017] Given generated names, When read back, Then target, date, counts and duplicate come out', () => {
    expect(parseDestinationFolder('M31_2026-10-14_FIT=400_TIF=1')).toEqual({ target: 'M31', date: '2026-10-14', counts: { fits: 400, tiff: 1 }, duplicate: null })
    expect(parseDestinationFolder('Sh2-155_2026-10-14_JPG=3_JSON=9_10')).toEqual({ target: 'Sh2-155', date: '2026-10-14', counts: { jpeg: 3, json: 9 }, duplicate: 10 })
    expect(parseDestinationFolder('M31_2026-10-14_FIT=400_2')?.duplicate).toBe(2)
  })

  it('[VIN-017] Given names astrorepo did not make, When read back, Then they are not destination folders', () => {
    for (const n of ['M31_2026-10-14', 'M 31_2026-10-14_FIT=1', '-M31_2026-10-14_FIT=1', 'M31_2026-10-14_RAW=1', 'M31_2026-10-14_FIT=1_1', 'M31_2026-10-14_FIT=1_01', 'M31_26-10-14_FIT=1', 'M31_2026-10-14_FIT=']) expect(parseDestinationFolder(n), n).toBeNull()
  })
})

describe('Vespera transfer plans', () => {
  const s: VesperaSession = session(
    '2024-06-05_22-00-00_observation_M16',
    {
      '02-images-initial': [file('img-0002.fits', 4), file('img-0001.fits', 4), file('img-0001-output.jpg', 2), file('img-0001-output.json', 1), file('capture.json', 1), file('img-0002.tif', 9), file('log.txt', 1)],
      '01-pointing-initial': [file('solve.jpg', 2)],
      '04-images-adjust-framing': [file('img-0001.fits', 4), file('img-0001-output.jpg', 2)]
    },
    [file('observation.json', 3)]
  )

  it('[VIN-019] Given a session, When planned with FITS only, Then FITS come by run, then frame number', () => {
    expect(planTransfer(s, ['fits']).map(i => i.path)).toEqual(['02-images-initial/img-0001.fits', '02-images-initial/img-0002.fits', '04-images-adjust-framing/img-0001.fits'])
    expect(planTransfer(s, ['fits'])[0]).toEqual({ path: '02-images-initial/img-0001.fits', kind: 'fits', sizeBytes: 4, frameNo: 1, runOrder: 2 })
  })

  it('[VIN-019] Given every kind, When planned, Then FITS, JPEG, TIFF, JSON; top-level files first in a kind, numbered frames before other files; unknown files never', () => {
    expect(planTransfer(s, ['json', 'tiff', 'jpeg', 'fits']).map(i => i.path)).toEqual([
      '02-images-initial/img-0001.fits', '02-images-initial/img-0002.fits', '04-images-adjust-framing/img-0001.fits',
      '01-pointing-initial/solve.jpg', '02-images-initial/img-0001-output.jpg', '04-images-adjust-framing/img-0001-output.jpg',
      '02-images-initial/img-0002.tif',
      'observation.json', '02-images-initial/img-0001-output.json', '02-images-initial/capture.json'
    ])
    expect(planCounts(planTransfer(s, ['fits', 'json']), ['fits', 'json'])).toEqual({ fits: 3, json: 3 })
    expect(planCounts([], ['tiff'])).toEqual({})
    expect(planCounts([], ['fits', 'tiff'])).toEqual({ fits: 0 })
  })

  it('[VIN-019] Given top-level files and a run numbered 01, When planned, Then top-level files come first in their kind and files with no frame number follow by name whatever the listing order', () => {
    const top = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': [file('capture.json', 1)] }, [file('observation.json', 3)])
    expect(planTransfer(top, ['json']).map(i => i.path)).toEqual(['observation.json', '01-images-initial/capture.json'])
    for (const listed of [[file('notes.json'), file('capture.json')], [file('capture.json'), file('notes.json')]]) {
      const s2 = session('2024-06-05_22-00-00_observation_M16', { '01-images-initial': listed })
      expect(planTransfer(s2, ['json']).map(i => i.path)).toEqual(['01-images-initial/capture.json', '01-images-initial/notes.json'])
    }
  })

  it('[VIN-023] Given a folder name and what the session holds now, When compared, Then NAME_COUNT_STALE says what moved; agreement is null', () => {
    expect(nameCountFinding('M31_2026-10-14_FIT=400', { fits: 400 })).toBeNull()
    expect(nameCountFinding('M31_2026-10-14_FIT=400_TIF=1', { fits: 412, tiff: 1 })).toEqual({ level: 'info', code: 'NAME_COUNT_STALE', message: "The folder's name was set when the copy was planned (FIT=400 in the name, 412 on the scope now). The folder keeps its name; the manifest lists what was copied." })
    expect(nameCountFinding('M31_2026-10-14_FIT=1_JSON=2', {})?.message).toContain('FIT=1 in the name, 0 on the scope now; JSON=2 in the name, 0 on the scope now')
    expect(nameCountFinding('not a folder', { fits: 1 })).toBeNull()
  })

  it('[VIN-018] Given a record\'s text, When its session is read, Then the id comes back, or null for anything else', () => {
    expect(recordSessionId('{"sessionId":"2024-06-05_22-00-00_observation_M16"}')).toBe('2024-06-05_22-00-00_observation_M16')
    for (const t of ['', 'nope', '{"sessionId":3}', 'null', '[]']) expect(recordSessionId(t), t).toBeNull()
  })
})

describe('Vespera copies on the PC', () => {
  it('[VIN-016] Given no kinds chosen in Settings, When a copy is planned, Then FITS and TIFF are copied and a kind with no files is left out of the name', () => {
    expect(DEFAULT_INCLUDE).toEqual(['fits', 'tiff'])
    const s = session('2024-06-15_21-00-54_observation_NGC3372', { '01-images-initial': imageRun([1, 2]) })
    expect(planCounts(planTransfer(s, [...DEFAULT_INCLUDE]), [...DEFAULT_INCLUDE])).toEqual({ fits: 2 })
    const withTiff = session('2024-06-15_21-00-54_observation_NGC3372', { '01-images-initial': [...imageRun([1, 2]), file('img-0002.tif')] })
    expect(planCounts(planTransfer(withTiff, [...DEFAULT_INCLUDE]), [...DEFAULT_INCLUDE])).toEqual({ fits: 2, tiff: 1 })
  })

  it('[VIN-030] Given names Windows would not keep, When checked, Then they are refused and names the scope writes are kept', () => {
    for (const ok of ['01-images-initial', '02-images-adjust-framing', 'img-0001.fits', 'a b', 'M31_x=1']) expect(isLocalName(ok)).toBe(true)
    for (const bad of ['', '.', '..', 'a:b', 'a/b', 'a\\b', 'a?', 'a*', 'a"b', 'a<b', 'a>b', 'a|b', 'trail.', 'trail ', 'CON', 'nul.txt', 'com1', 'LPT9', 'tab\there', 'x'.repeat(256)]) {
      expect(isLocalName(bad), bad).toBe(false)
    }
    expect(isLocalName('x'.repeat(255))).toBe(true)
    expect(isLocalName('console')).toBe(true)
  })

  it('[VIN-030] Given a run whose folder name Windows would not keep, When planned, Then its files are not copied and UNSAFE_NAME warns', () => {
    const s = session('2024-06-15_21-00-54_observation_NGC3372', { '01-images-initial': imageRun([1]), '02-images-adjust:framing': imageRun([1]) })
    expect(planTransfer(s, ['fits']).map(i => i.path)).toEqual(['01-images-initial/img-0001.fits'])
    expect(unsafeRunFinding(s)).toEqual({ level: 'warn', code: 'UNSAFE_NAME', message: '02-images-adjust:framing has a name Windows would not keep, so it is not copied.' })
    expect(inventorySession(s).findings.map(f => f.code)).toContain('UNSAFE_NAME')
    const two = session('2024-06-15_21-00-54_observation_NGC3372', { 'a?': imageRun([1]), 'b.': imageRun([1]) })
    expect(unsafeRunFinding(two)?.message).toBe('a?, b. have names Windows would not keep, so they are not copied.')
    expect(unsafeRunFinding(session('2024-06-15_21-00-54_observation_NGC3372', { '01-images-initial': imageRun([1]) }))).toBeNull()
    const safeTop = session('2024-06-15_21-00-54_observation_NGC3372', { '01-images-initial': imageRun([1]), 'a?': imageRun([1]) }, [file('observation.json')])
    expect(unsafeRunFinding(safeTop)?.message).toBe('a? has a name Windows would not keep, so it is not copied.')
  })

  it('[VIN-030] Given a file whose name Windows would not keep in a safe run, When planned, Then that file is not copied and UNSAFE_NAME names it', () => {
    const s = session('2024-06-15_21-00-54_observation_NGC3372', { '01-images-initial': [...imageRun([1]), file('a|b.fits', 4)] }, [file('notes?.txt')])
    expect(planTransfer(s, ['fits']).map(i => i.path)).toEqual(['01-images-initial/img-0001.fits'])
    expect(unsafeRunFinding(s)?.message).toBe('notes?.txt, 01-images-initial/a|b.fits have names Windows would not keep, so they are not copied.')
  })

  it('[VIN-027] Given the bytes to copy and the free space, When room is checked, Then 1% more is needed and a shortfall is the bytes missing', () => {
    expect(transferRoom(1000, 1010)).toEqual({ neededBytes: 1010, shortBytes: null })
    expect(transferRoom(1000, 1009)).toEqual({ neededBytes: 1010, shortBytes: 1 })
    expect(transferRoom(999, 1009)).toEqual({ neededBytes: 1009, shortBytes: null })
    expect(transferRoom(1000, null)).toEqual({ neededBytes: 1010, shortBytes: null })
    expect(transferRoom(0, 0)).toEqual({ neededBytes: 0, shortBytes: null })
    expect(transferRoom(-5, 0)).toEqual({ neededBytes: 0, shortBytes: null })
  })

  it('[VIN-027] Given byte counts, When written for a person, Then each unit is 1024 of the last with one decimal', () => {
    expect(bytesText(0)).toBe('0 B')
    expect(bytesText(1023)).toBe('1023 B')
    expect(bytesText(1024)).toBe('1.0 KB')
    expect(bytesText(1536)).toBe('1.5 KB')
    expect(bytesText(1024 * 1024)).toBe('1.0 MB')
    expect(bytesText(1024 ** 3 * 2.25)).toBe('2.3 GB')
    expect(bytesText(1024 ** 4)).toBe('1.0 TB')
    expect(bytesText(1024 ** 5)).toBe('1024.0 TB')
  })
})
