import { describe, expect, it } from 'vitest'
import {
  ARCHIVE_INDEX_FILE,
  archiveFolderName,
  archiveSpace,
  freedBytes,
  isArchivedNow,
  manifestPaths,
  namedFrames,
  parseStackManifest,
  planArchive,
  removalChoice,
  stackManifest,
  summariseWorkFolder,
  type FoundManifest,
  type SirilPlacement,
  type StackManifest,
  type WorkAreaFile
} from '@astro/domain'

const GB = 1024 ** 3

const file = (path: string, sizeBytes: number, over: Partial<WorkAreaFile> = {}): WorkAreaFile => ({ path, sizeBytes, links: 1, fileId: path, symlink: false, ...over })

const placements: SirilPlacement[] = [
  { from: '/nas/M42/Light_001.fit', folder: 'lights', name: 'Light_001.fit' },
  { from: '/nas/M42/Light_002.fit', folder: 'lights', name: 'Light_002.fit' },
  { from: '/nas/darks/Dark_001.fit', folder: 'darks', name: 'Dark_001.fit' }
]

const manifest = (finishedAt = new Date('2026-10-01T03:00:00Z'), frames = placements): StackManifest =>
  stackManifest({
    result: { path: '/work/M42/result_60s.fit', sizeBytes: 2 * GB, modifiedAt: null },
    target: { id: 'm42', name: 'M 42' },
    job: { id: 'job-1', title: 'Stack M 42', startedAt: null },
    finishedAt,
    program: 'siril-cli',
    script: '/siril/OSC_Preprocessing.ssf',
    steps: [{ label: 'convert light', seconds: 10, resumed: false }],
    placements: frames,
    rejected: []
  })

const found = (m = manifest()): FoundManifest[] => [{ path: 'result_60s.fit.astrorepo.json', manifest: m }]

/** A stacked M 42: lights hard-linked from the NAS's same disk, darks copied, Siril's process and a failed run. */
const workFiles: WorkAreaFile[] = [
  file('lights/Light_001.fit', 50, { links: 2, fileId: 'L1' }),
  file('lights/Light_002.fit', 50, { links: 2, fileId: 'L2' }),
  file('darks/Dark_001.fit', 50),
  file('process/pp_light_00001.fit', 300),
  file('process/light_00001.fit', 0, { symlink: true, fileId: null }),
  file('failed/job-0/result_30s.fit', 70),
  file('.astrorepo/step-01.ssf', 1),
  file('masters/dark_stacked.fit', 20),
  file('processed/M42/final.tif', 40),
  file('result_60s.fit', 100),
  file('result_60s.fit.astrorepo.json', 5)
]

const sources = (gone: string[] = []) =>
  new Map(placements.map(p => [p.from, gone.includes(p.from) ? null : 50] as [string, number | null]))

describe('Archive: what the work folder holds', () => {
  it('[ARC-001] Given a stacked target, When its work folder is summarised, Then each intermediate shows its size and what it frees, before what is kept', () => {
    const folders = summariseWorkFolder({ files: workFiles, manifests: found(), sources: sources() })
    expect(folders.map(f => [f.folder, f.intermediate, f.sizeBytes, f.freesBytes, f.rebuildable, f.removable])).toEqual([
      ['lights', true, 100, 0, true, true],
      ['darks', true, 50, 50, true, true],
      ['process', true, 300, 300, true, true],
      ['failed', true, 70, 70, false, true],
      ['.astrorepo', true, 1, 1, true, true],
      ['', false, 105, 0, false, false],
      ['masters', false, 20, 0, false, false],
      ['processed', false, 40, 0, false, false]
    ])
    expect(folders.find(f => f.folder === 'lights')).toMatchObject({ linkedFiles: 2, reason: 'from-manifest', kind: 'lights' })
    expect(folders.find(f => f.folder === 'failed')?.reason).toBe('unfinished-runs')
    expect(folders.find(f => f.folder === '.astrorepo')?.reason).toBe('rewritten-each-run')
    expect(folders.find(f => f.folder === '')?.kind).toBe('results')
  })

  it('[ARC-002] Given hard links and symbolic links, When the space freed is worked out, Then a file with other names frees nothing unless every name goes', () => {
    const shared = [file('lights/a.fit', 80, { links: 2, fileId: 'A' }), file('process/a.fit', 80, { links: 2, fileId: 'A' }), file('process/s.fit', 9, { symlink: true })]
    expect(freedBytes(shared, ['lights'])).toBe(0)
    expect(freedBytes(shared, ['process'])).toBe(0)
    expect(freedBytes(shared, ['lights', 'process'])).toBe(80)
    // A file with other names whose id the system does not give is never counted.
    expect(freedBytes([file('lights/b.fit', 60, { links: 3, fileId: null })], ['lights'])).toBe(0)
  })

  it('[ARC-003] Given no manifest, When summarised, Then frames and process cannot be rebuilt, though failed runs and step scripts can still go', () => {
    const folders = summariseWorkFolder({ files: workFiles, manifests: [], sources: new Map() })
    expect(folders.filter(f => f.intermediate).map(f => [f.folder, f.reason, f.removable])).toEqual([
      ['lights', 'no-manifest', false],
      ['darks', 'no-manifest', false],
      ['process', 'no-manifest', false],
      ['failed', 'unfinished-runs', true],
      ['.astrorepo', 'rewritten-each-run', true]
    ])
  })

  it('[ARC-003] Given a source frame that is gone or a frame no manifest names, When summarised, Then that folder and process cannot be rebuilt, with how many', () => {
    const extra = [...workFiles, file('lights/Light_009.fit', 50)]
    const folders = summariseWorkFolder({ files: extra, manifests: found(), sources: sources(['/nas/darks/Dark_001.fit']) })
    const of = (name: string) => folders.find(f => f.folder === name)
    expect([of('lights')?.reason, of('lights')?.count]).toEqual(['not-in-manifest', 1])
    expect([of('darks')?.reason, of('darks')?.count, of('darks')?.removable]).toEqual(['missing-sources', 1, false])
    expect([of('process')?.reason, of('process')?.count]).toEqual(['missing-sources', 1])
  })

  it('[ARC-003] Given a manifest that cannot say where a frame came from, When summarised and archived, Then that frame counts as gone and is never bundled', () => {
    const m = manifest()
    const unknown: StackManifest = { ...m, frames: { ...m.frames, darks: m.frames.darks.map(f => ({ ...f, source: null })) } }
    const folders = summariseWorkFolder({ files: workFiles, manifests: found(unknown), sources: sources() })
    const darks = folders.find(f => f.folder === 'darks')
    expect([darks?.reason, darks?.count, darks?.removable]).toEqual(['missing-sources', 1, false])
    expect(parseStackManifest(JSON.stringify(unknown))?.frames.darks[0].source).toBeNull()
  })

  it('[ARC-009] Given the user ticks folders, When the choice is checked, Then only removable intermediates are taken and the rest are named', () => {
    const folders = summariseWorkFolder({ files: workFiles, manifests: [], sources: new Map() })
    expect(removalChoice(folders, ['failed', 'process', 'masters', 'failed', 'nowhere'])).toEqual({ remove: ['failed'], refused: ['process', 'masters', 'nowhere'] })
  })
})

describe('Archive: manifests', () => {
  it('[ARC-003] Given manifest text, When parsed, Then only a version 1 stack manifest with its frames is accepted', () => {
    expect(parseStackManifest(JSON.stringify(manifest()))?.target.name).toBe('M 42')
    expect(parseStackManifest('not json')).toBeNull()
    expect(parseStackManifest(JSON.stringify({ ...manifest(), version: 2 }))).toBeNull()
    expect(parseStackManifest(JSON.stringify({ ...manifest(), frames: null }))).toBeNull()
    expect(parseStackManifest(JSON.stringify({ ...manifest(), frames: { lights: [{ name: 1 }], darks: [], flats: [], biases: [] } }))).toBeNull()
  })

  it('[ARC-003] Given two runs naming the same frame, When the frames are listed, Then each is listed once with the newest source, and only manifests beside a result count', () => {
    const older = manifest(new Date('2026-09-01T03:00:00Z'), [{ from: '/old/Light_001.fit', folder: 'lights', name: 'Light_001.fit' }])
    const frames = namedFrames([{ path: 'a.astrorepo.json', manifest: older }, ...found()])
    expect(frames.map(f => `${f.folder}/${f.name}<${f.source}`)).toEqual([
      'darks/Dark_001.fit</nas/darks/Dark_001.fit',
      'lights/Light_001.fit</nas/M42/Light_001.fit',
      'lights/Light_002.fit</nas/M42/Light_002.fit'
    ])
    expect(manifestPaths([...workFiles, file('failed/job-0/result_30s.fit.astrorepo.json', 1)])).toEqual(['result_60s.fit.astrorepo.json'])
  })
})

describe('Archive: the plan', () => {
  const at = new Date(2026, 9, 9, 21, 0)
  const input = { files: workFiles, manifests: found(), sources: sources(), target: { id: 'm42', name: 'M 42' }, workFolder: '/work/M42', at }

  it('[ARC-004] Given a linked archive, When planned, Then the kept files are copied and the index lists them with the source of every raw frame', () => {
    const plan = planArchive({ ...input, mode: 'linked' })
    expect(plan.copies.map(c => c.to)).toEqual(['masters/dark_stacked.fit', 'processed/M42/final.tif', 'result_60s.fit', 'result_60s.fit.astrorepo.json'])
    expect(plan.copies.every(c => c.inWorkFolder)).toBe(true)
    expect([plan.copyBytes, plan.keptBytes, plan.bundledFrames]).toEqual([165, 165, 0])
    expect(plan.index).toMatchObject({ format: 'astrorepo-archive', version: 1, mode: 'linked', archivedAt: at.toISOString(), manifests: ['result_60s.fit.astrorepo.json'] })
    expect(plan.index.kept).toContainEqual({ file: 'result_60s.fit', sizeBytes: 100 })
    expect(plan.index.frames.lights).toEqual([
      { name: 'Light_001.fit', source: '/nas/M42/Light_001.fit', sizeBytes: 50, archived: null },
      { name: 'Light_002.fit', source: '/nas/M42/Light_002.fit', sizeBytes: 50, archived: null }
    ])
    expect(plan.index.intermediates).toContainEqual({ folder: 'process', sizeBytes: 300, rebuildable: true })
  })

  it('[ARC-005] Given a self-contained archive, When planned, Then every raw frame still there is bundled under frames/ and a gone one is counted', () => {
    const plan = planArchive({ ...input, sources: sources(['/nas/M42/Light_002.fit']), mode: 'self-contained' })
    expect(plan.copies.filter(c => !c.inWorkFolder)).toEqual([
      { from: '/nas/darks/Dark_001.fit', inWorkFolder: false, to: 'frames/darks/Dark_001.fit', sizeBytes: 50 },
      { from: '/nas/M42/Light_001.fit', inWorkFolder: false, to: 'frames/lights/Light_001.fit', sizeBytes: 50 }
    ])
    expect([plan.bundledFrames, plan.missingFrames, plan.copyBytes]).toEqual([2, 1, 265])
    expect(plan.index.frames.lights[1]).toEqual({ name: 'Light_002.fit', source: '/nas/M42/Light_002.fit', sizeBytes: null, archived: null })
    expect(ARCHIVE_INDEX_FILE).toBe('astrorepo-archive.json')
  })

  it('[ARC-007] [ARC-012] Given a target name and a day, When the folder is named, Then it is safe on any disk; the copy is checked against the free space', () => {
    expect(archiveFolderName('M 42 / Orion: core', at)).toBe('M 42 _ Orion_ core 2026-10-09')
    expect(archiveFolderName(null, at)).toBe('target 2026-10-09')
    expect(archiveFolderName('..', at)).toBe('target 2026-10-09')
    expect(archiveSpace(10, 20)).toEqual({ verdict: 'fits', shortBytes: 0 })
    expect(archiveSpace(30, 20)).toEqual({ verdict: 'short', shortBytes: 10 })
    expect(archiveSpace(30, null)).toEqual({ verdict: 'unknown', shortBytes: 0 })
  })

  it('[ARC-011] Given an archive record, When the frames are the same or have changed, Then the target counts as archived only while they are the same', () => {
    expect(isArchivedNow({ fingerprint: 'a' }, 'a')).toBe(true)
    expect(isArchivedNow({ fingerprint: 'a' }, 'b')).toBe(false)
    expect(isArchivedNow(undefined, 'a')).toBe(false)
  })
})
