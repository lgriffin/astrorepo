import { describe, it, expect } from 'vitest'
import { discoverTarget, reportHiddenData, type HiddenDataReport } from '@astro/domain'
import { subs, stackAt, target } from '@astro/testkit'
import { formatBytes, toCockpitOverview, toDuplicateView, toHiddenDataItems, toTargetDiscoveryView } from '../../src/main/adapters/discovery-presenter'

const empty: HiddenDataReport = reportHiddenData({ targets: [], unassigned: [], calibration: [], lightSettings: [] })

describe('Discovery presenter', () => {
  it('[DSC-006] Given unstacked nights on several targets, When presented, Then one line states nights, hours and the biggest targets', () => {
    const report = reportHiddenData({
      targets: [
        target('M 81', { subs: [...subs(1440, 10, '2026-03-01T21:00:00Z'), ...subs(1440, 10, '2026-03-02T21:00:00Z')] }),
        target('M 51', { subs: subs(360, 10, '2026-03-01T21:00:00Z') })
      ],
      unassigned: [], calibration: [], lightSettings: []
    })
    const [item] = toHiddenDataItems(report)
    expect(item).toEqual({
      id: 'never-stacked', kind: 'never-stacked',
      title: '3 nights of subs never stacked',
      detail: '9 h across 2 targets, most in M 81 (2 nights), M 51 (1 night).',
      link: '/stacking'
    })
  })

  it('[DSC-006] Given one target with unstacked nights, When presented, Then the line links to that target', () => {
    const report = reportHiddenData({ targets: [target('M 81', { subs: subs(10, 10, '2026-03-01T21:00:00Z') })], unassigned: [], calibration: [], lightSettings: [] })
    expect(toHiddenDataItems(report)[0].link).toBe('/targets/target-m-81')
  })

  it('[DSC-006] Given unassigned subs, orphan calibration and rejected subs, When presented, Then each gets a line that says where to act', () => {
    const items = toHiddenDataItems({
      ...empty,
      unassigned: { subCount: 90, integrationSec: 1800, nights: 1, byFolder: [{ folder: 'NGC 7000_sub', subCount: 90, integrationSec: 1800 }] },
      orphanCalibration: [
        { kind: 'dark', exposureSec: 300, gain: 100, sensorTempC: -10, filter: null, count: 20 },
        { kind: 'flat', exposureSec: 1, gain: null, sensorTempC: null, filter: null, count: 1 },
        { kind: 'bias', exposureSec: null, gain: null, sensorTempC: null, filter: null, count: 5 }
      ],
      rejected: { subCount: 12, integrationSec: 120, targets: 1, unassigned: 2 }
    })
    expect(items.map(i => [i.title, i.link])).toEqual([
      ['90 subs with no target', '/fits-analyzer'],
      ['20 darks that match no lights', '/calibration'],
      ['1 flat that match no lights', '/calibration'],
      ['5 bias frames that match no lights', '/calibration'],
      ['12 subs rejected by quality checks', '/fits-analyzer']
    ])
    expect(items[0].detail).toBe('30 m over 1 night, in NGC 7000_sub. Link them to a target to count them.')
    expect(items[1].detail).toBe('Taken at gain 100, 300 s, -10 °C. No light frames share those settings.')
    expect(items[2].detail).toBe('Taken at no filter. No light frames share those settings.')
    expect(items[3].detail).toBe('Taken at unrecorded settings. No light frames share those settings.')
    expect(items[4].detail).toBe('2 m across 1 target and 2 with no target. Leave them out of the next stack.')
    const onlyUnassigned = toHiddenDataItems({ ...empty, rejected: { subCount: 1, integrationSec: 60, targets: 0, unassigned: 1 } })
    expect(onlyUnassigned[0].detail).toBe('1 m 1 with no target. Leave them out of the next stack.')
  })

  it('[DSC-006] Given nothing hidden, When presented, Then there are no lines', () => {
    expect(toHiddenDataItems(empty)).toEqual([])
  })

  it('[DSC-009] Given discovery counts, When presented for the cockpit, Then each state carries a readable label', () => {
    const overview = toCockpitOverview({ targets: [], progress: [{ state: 'enough-data', count: 2 }] }, empty)
    expect(overview).toEqual({ progress: [{ state: 'enough-data', count: 2, label: 'Enough data' }], hidden: [] })
  })

  it('[DSC-001] Given a discovery with dates, When presented for the target page, Then dates become ISO strings', () => {
    const d = discoverTarget(target('M 101', { subs: subs(1, 10, '2026-03-01T21:00:00Z'), stacks: [stackAt('2026-02-02T09:00:00Z')] }))
    const view = toTargetDiscoveryView(d)
    expect(view.lastCapturedAt).toBe('2026-03-01T21:00:00.000Z')
    expect(view.lastStackedAt).toBe('2026-02-02T09:00:00.000Z')
    expect(toTargetDiscoveryView(discoverTarget(target('M 1', { goalSec: 60 }))).lastCapturedAt).toBeNull()
  })
})

describe('Discovery presenter: unreadable and duplicate files', () => {
  it('[DSC-015] Given quarantined files, When presented, Then one line names the first files and their reasons', () => {
    const [item] = toHiddenDataItems({
      ...empty,
      quarantined: { count: 4, examples: [{ path: 'C:\\astro\\M 1\\bad.fit', error: 'SIMPLE != T' }, { path: '/nas/x.fit', error: 'truncated' }] }
    })
    expect(item.title).toBe('4 files could not be read')
    expect(item.detail).toBe('Set aside instead of indexed: bad.fit (SIMPLE != T); x.fit (truncated), and more.')
    const [one] = toHiddenDataItems({ ...empty, quarantined: { count: 1, examples: [{ path: '/a.fit', error: 'e' }] } })
    expect(one.detail).toBe('Set aside instead of indexed: a.fit (e).')
  })

  it('[DSC-015] Given duplicates from the last check, When presented, Then the line states copies and reclaimable space and that nothing was deleted', () => {
    const items = toHiddenDataItems({ ...empty, duplicates: { files: 3, reclaimableBytes: 3 * 1024 ** 3, groups: 2 } })
    expect(items).toEqual([{
      id: 'duplicates', kind: 'duplicates', link: null,
      title: '3 duplicate files, 3.0 GB reclaimable',
      detail: '2 files exist at more than one path. Nothing has been deleted.'
    }])
    expect(toHiddenDataItems({ ...empty, duplicates: { files: 1, reclaimableBytes: 10, groups: 1 } })[0].detail).toBe('1 file exists at more than one path. Nothing has been deleted.')
  })

  it('[ING-003] Given a duplicate check result, When presented, Then it summarises copies and space, or says there are none', () => {
    const stats = { indexed: 10, reused: 8, sampled: 2, fullyHashed: 2, unreadable: 0 }
    expect(toDuplicateView({ groups: [{ contentHash: 'h', sizeBytes: 2048, paths: ['/a', '/b'] }], duplicateFiles: 1, reclaimableBytes: 2048, stats }).summary)
      .toBe('1 duplicate file, 2.0 KB reclaimable. Nothing was deleted.')
    expect(toDuplicateView({ groups: [], duplicateFiles: 0, reclaimableBytes: 0, stats }).summary).toBe('No duplicates among 10 indexed files.')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(5 * 1024 ** 5)).toBe('5120.0 TB')
  })

  it('[ING-003] Given more groups than the card shows and files that could not be read, When presented, Then it counts every group and says what was skipped', () => {
    const groups = Array.from({ length: 60 }, (_, i) => ({ contentHash: `h${i}`, sizeBytes: 100, paths: [`/a${i}`, `/b${i}`] }))
    const view = toDuplicateView({ groups, duplicateFiles: 60, reclaimableBytes: 6000, stats: { indexed: 130, reused: 0, sampled: 128, fullyHashed: 120, unreadable: 2 } })
    expect(view.groups).toHaveLength(50)
    expect(view.totalGroups).toBe(60)
    expect(view.summary).toBe('60 duplicate files, 5.9 KB reclaimable. Nothing was deleted. 2 files could not be read and were skipped.')
  })
})
