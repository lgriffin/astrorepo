import { describe, it, expect } from 'vitest'
import { calibrates, findOrphanCalibration, reportHiddenData, type CalibrationFrame, type LightSetting } from '@astro/domain'
import { subs, stackAt, target } from '@astro/testkit'

const dark = (o: Partial<CalibrationFrame> = {}): CalibrationFrame => ({ kind: 'dark', exposureSec: 300, gain: 100, sensorTempC: -10, filter: null, ...o })
const light = (o: Partial<LightSetting> = {}): LightSetting => ({ exposureSec: 300, gain: 100, sensorTempC: -10, filter: 'Ha', count: 10, ...o })

describe('reportHiddenData', () => {
  it('[DSC-006] Given targets never stacked and one stacked before its latest night, When reported, Then every unstacked night is counted, biggest target first', () => {
    const report = reportHiddenData({
      targets: [
        target('M 51', { subs: subs(360, 10, '2026-03-01T21:00:00Z') }),
        target('M 81', { subs: [...subs(360, 10, '2026-03-01T21:00:00Z'), ...subs(360, 10, '2026-03-02T21:00:00Z')] }),
        target('M 101', {
          subs: [...subs(360, 10, '2026-02-01T21:00:00Z'), ...subs(180, 10, '2026-03-01T21:00:00Z')],
          stacks: [stackAt('2026-02-02T09:00:00Z')]
        }),
        target('M 42', { subs: subs(360, 10, '2026-01-01T21:00:00Z'), stacks: [stackAt('2026-01-02T09:00:00Z')] })
      ],
      unassigned: [],
      calibration: [],
      lightSettings: []
    })

    expect(report.neverStacked.map(t => [t.targetName, t.nights, t.integrationSec])).toEqual([
      ['M 81', 2, 7200],
      ['M 51', 1, 3600],
      ['M 101', 1, 1800]
    ])
    expect(report.unstackedNights).toBe(4)
    expect(report.unstackedSec).toBe(12600)
  })

  it('[DSC-006] Given subs no target claims, When reported, Then they are counted with their nights and grouped by folder', () => {
    const report = reportHiddenData({
      targets: [],
      unassigned: [
        { exposureSec: 20, capturedAt: new Date('2026-04-01T22:00:00Z'), folder: 'NGC 7000_sub', objectName: null },
        { exposureSec: 20, capturedAt: new Date('2026-04-02T22:00:00Z'), folder: 'NGC 7000_sub', objectName: null },
        { exposureSec: 10, capturedAt: null, folder: null, objectName: 'Mystery' },
        { exposureSec: 10, capturedAt: null, folder: '  ', objectName: null }
      ],
      calibration: [],
      lightSettings: []
    })

    expect(report.unassigned).toEqual({
      subCount: 4,
      integrationSec: 60,
      nights: 2,
      byFolder: [
        { folder: 'NGC 7000_sub', subCount: 2, integrationSec: 40 },
        { folder: 'Mystery', subCount: 1, integrationSec: 10 },
        { folder: 'Unknown folder', subCount: 1, integrationSec: 10 }
      ]
    })
  })

  it('[DSC-006] Given subs rejected by quality checks on two targets, When reported, Then their count, integration and targets are stated', () => {
    const report = reportHiddenData({
      targets: [
        target('M 1', { subs: [...subs(3, 10, '2026-01-01T21:00:00Z', { rejected: true }), ...subs(5, 10, '2026-01-01T22:00:00Z')] }),
        target('M 2', { subs: subs(2, 30, '2026-01-01T21:00:00Z', { rejected: true }) }),
        target('M 3', { subs: subs(2, 30, '2026-01-01T21:00:00Z') })
      ],
      unassigned: [],
      calibration: [],
      lightSettings: []
    })
    expect(report.rejected).toEqual({ subCount: 5, integrationSec: 90, targets: 2 })
  })

  it('[DSC-006] Given darks, flats and biases that match no lights, When reported, Then they are grouped by kind and settings', () => {
    const report = reportHiddenData({
      targets: [],
      unassigned: [],
      calibration: [dark({ gain: 200 }), dark({ gain: 200, sensorTempC: -10.4 }), dark(), { kind: 'flat', exposureSec: 1, gain: 100, sensorTempC: null, filter: 'OIII' }, { kind: 'bias', exposureSec: 0, gain: 0, sensorTempC: null, filter: null }],
      lightSettings: [light()]
    })

    expect(report.orphanCalibration).toEqual([
      { kind: 'dark', exposureSec: 300, gain: 200, sensorTempC: -10, filter: null, count: 2 },
      { kind: 'bias', exposureSec: 0, gain: 0, sensorTempC: null, filter: null, count: 1 },
      { kind: 'flat', exposureSec: 1, gain: 100, sensorTempC: null, filter: 'OIII', count: 1 }
    ])
  })

  it('[DSC-006] Given nothing hidden, When reported, Then every section is empty', () => {
    const report = reportHiddenData({ targets: [], unassigned: [], calibration: [], lightSettings: [] })
    expect(report).toEqual({
      neverStacked: [],
      unstackedNights: 0,
      unstackedSec: 0,
      unassigned: { subCount: 0, integrationSec: 0, nights: 0, byFolder: [] },
      orphanCalibration: [],
      rejected: { subCount: 0, integrationSec: 0, targets: 0 }
    })
  })
})

describe('calibrates', () => {
  it('[DSC-006] Given a dark within 2 °C and 1 s of the lights at the same gain, When matched, Then it calibrates them', () => {
    expect(calibrates(dark({ sensorTempC: -8, exposureSec: 301 }), light())).toBe(true)
  })

  it('[DSC-006] Given a dark too warm, too long or at another gain, When matched, Then it does not calibrate the lights', () => {
    expect(calibrates(dark({ sensorTempC: -7.5 }), light())).toBe(false)
    expect(calibrates(dark({ exposureSec: 180 }), light())).toBe(false)
    expect(calibrates(dark({ gain: 120 }), light())).toBe(false)
  })

  it('[DSC-006] Given flats, When matched, Then only the filter matters, ignoring case and spaces', () => {
    const flat: CalibrationFrame = { kind: 'flat', exposureSec: 2, gain: 0, sensorTempC: 30, filter: ' ha ' }
    expect(calibrates(flat, light())).toBe(true)
    expect(calibrates({ ...flat, filter: 'OIII' }, light())).toBe(false)
  })

  it('[DSC-006] Given biases, When matched, Then only the gain matters', () => {
    const bias: CalibrationFrame = { kind: 'bias', exposureSec: 0, gain: 100, sensorTempC: 25, filter: null }
    expect(calibrates(bias, light())).toBe(true)
    expect(calibrates({ ...bias, gain: 0 }, light())).toBe(false)
  })

  it('[DSC-014] Given a frame or light whose header omits gain, temperature, exposure or filter, When matched, Then the missing value is not a mismatch', () => {
    expect(calibrates(dark({ gain: null, sensorTempC: null, exposureSec: null }), light())).toBe(true)
    expect(calibrates(dark(), light({ gain: null, sensorTempC: null, exposureSec: null }))).toBe(true)
    expect(calibrates({ kind: 'flat', exposureSec: 1, gain: 0, sensorTempC: null, filter: null }, light())).toBe(true)
    expect(calibrates({ kind: 'flat', exposureSec: 1, gain: 0, sensorTempC: null, filter: 'Ha' }, light({ filter: '' }))).toBe(true)
  })

  it('[DSC-014] Given orphan darks with no temperature, When grouped, Then the group keeps the temperature unknown', () => {
    expect(findOrphanCalibration([dark({ gain: 5, sensorTempC: null })], [light()])).toEqual([
      { kind: 'dark', exposureSec: 300, gain: 5, sensorTempC: null, filter: null, count: 1 }
    ])
  })
})
