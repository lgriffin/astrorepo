import { describe, it, expect } from 'vitest'
import { discoverTarget, reportHiddenData, type HiddenDataReport } from '@astro/domain'
import { subs, stackAt, target } from '@astro/testkit'
import { toCockpitOverview, toHiddenDataItems, toTargetDiscoveryView } from '../../src/main/adapters/discovery-presenter'

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
      rejected: { subCount: 12, integrationSec: 120, targets: 1 }
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
