import { describe, it, expect } from 'vitest'
import {
  duplicateCandidates,
  groupDuplicates,
  isHashCurrent,
  planRescan,
  planSirilWorkspace,
  sirilFolderFor,
  type FileHash
} from '@astro/domain'

const stamp = (path: string, sizeBytes = 100, modifiedAt = '2026-03-01T09:00:00.000Z') => ({ path, sizeBytes, modifiedAt })
const hash = (path: string, o: Partial<FileHash> = {}): FileHash => ({ ...stamp(path), quickKey: 'q', fullHash: null, ...o })

describe('planRescan', () => {
  it('[ING-008] Given files indexed before, When the folder is walked again, Then unchanged, changed, added and removed files are told apart by size and modified time', () => {
    const plan = planRescan(
      [stamp('/a'), stamp('/b'), stamp('/c'), stamp('/d')],
      [stamp('/a'), stamp('/b', 101), stamp('/c', 100, '2026-03-02T09:00:00.000Z'), stamp('/e')]
    )
    expect(plan).toEqual({ unchanged: ['/a'], changed: ['/b', '/c'], added: ['/e'], removed: ['/d'] })
  })

  it('[ING-008] Given nothing indexed yet, When walked, Then every file is added', () => {
    expect(planRescan([], [stamp('/a')])).toEqual({ unchanged: [], changed: [], added: ['/a'], removed: [] })
  })
})

describe('isHashCurrent', () => {
  it('[ING-008] Given a stored hash with the same size and modified time, When checked, Then it is reused; otherwise it is not', () => {
    expect(isHashCurrent(hash('/a'), stamp('/a'))).toBe(true)
    expect(isHashCurrent(hash('/a'), stamp('/a', 101))).toBe(false)
    expect(isHashCurrent(hash('/a'), stamp('/a', 100, '2026-03-02T09:00:00.000Z'))).toBe(false)
    expect(isHashCurrent(undefined, stamp('/a'))).toBe(false)
  })
})

describe('duplicateCandidates', () => {
  it('[ING-012] Given files of one size, When only some share sampled bytes, Then only those are candidates for a full read', () => {
    const groups = duplicateCandidates([
      hash('/a', { quickKey: 'x' }),
      hash('/b', { quickKey: 'x' }),
      hash('/c', { quickKey: 'y' }),
      hash('/d', { quickKey: 'x', sizeBytes: 200 })
    ])
    expect(groups.map(g => g.map(f => f.path))).toEqual([['/a', '/b']])
  })
})

describe('groupDuplicates', () => {
  it('[ING-003] Given files with equal full hashes, When grouped, Then each group lists every path and the report states reclaimable bytes, biggest first', () => {
    const report = groupDuplicates([
      hash('/small/1', { sizeBytes: 10, fullHash: 's' }),
      hash('/small/2', { sizeBytes: 10, fullHash: 's' }),
      hash('/big/2', { sizeBytes: 1000, fullHash: 'b' }),
      hash('/big/1', { sizeBytes: 1000, fullHash: 'b' }),
      hash('/big/3', { sizeBytes: 1000, fullHash: 'b' }),
      hash('/unique', { sizeBytes: 5, fullHash: 'u' }),
      hash('/unhashed', { sizeBytes: 5, fullHash: null })
    ])
    expect(report).toEqual({
      groups: [
        { contentHash: 'b', sizeBytes: 1000, paths: ['/big/1', '/big/2', '/big/3'] },
        { contentHash: 's', sizeBytes: 10, paths: ['/small/1', '/small/2'] }
      ],
      duplicateFiles: 3,
      reclaimableBytes: 2010
    })
  })

  it('[ING-003] Given groups that would free the same bytes, When sorted, Then they are ordered by first path', () => {
    const report = groupDuplicates([
      hash('/z/1', { fullHash: 'z' }), hash('/z/2', { fullHash: 'z' }),
      hash('/a/1', { fullHash: 'a' }), hash('/a/2', { fullHash: 'a' })
    ])
    expect(report.groups.map(g => g.paths[0])).toEqual(['/a/1', '/z/1'])
  })
})

describe('Siril workspace plan', () => {
  it('[ING-013] Given IMAGETYP or the file name, When a folder is chosen, Then lights, darks, flats and biases each go to their own folder', () => {
    expect(sirilFolderFor('Light_M 81_10.0s.fit', null)).toBe('lights')
    expect(sirilFolderFor('x.fit', 'Dark Frame')).toBe('darks')
    expect(sirilFolderFor('Flat_001.fits', null)).toBe('flats')
    expect(sirilFolderFor('Bias_001.fits', null)).toBe('biases')
    expect(sirilFolderFor('offset_001.fits', null)).toBe('biases')
    expect(sirilFolderFor('dark_named_light.fit', 'Light Frame')).toBe('lights')
  })

  it('[ING-013] Given two frames with one name in one folder, When planned, Then both are kept under distinct names', () => {
    const plan = planSirilWorkspace([
      { path: '/src/Light_1.fit', name: 'Light_1.fit', imageType: null },
      { path: '/src/sub/LIGHT_1.fit', name: 'LIGHT_1.fit', imageType: null },
      { path: '/src/noext', name: 'noext', imageType: null },
      { path: '/src/b/noext', name: 'noext', imageType: null }
    ])
    expect(plan.map(p => `${p.folder}/${p.name}`)).toEqual(['lights/Light_1.fit', 'lights/LIGHT_1_2.fit', 'lights/noext', 'lights/noext_2'])
  })
})
