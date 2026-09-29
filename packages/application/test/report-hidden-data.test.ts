import { describe, it, expect } from 'vitest'
import { makeReportHiddenData } from '@astro/application'
import { InMemoryFrameCatalogue, subs, target } from '@astro/testkit'

describe('ReportHiddenData', () => {
  it('[DSC-006] Given unstacked nights, unassigned subs, orphan darks and rejected subs, When the cockpit is opened, Then all four are reported', async () => {
    const frames = new InMemoryFrameCatalogue()
      .add(target('M 81', { subs: [...subs(360, 10, '2026-03-01T21:00:00Z'), ...subs(6, 10, '2026-03-01T23:00:00Z', { rejected: true })] }))
      .addUnassigned({ exposureSec: 20, capturedAt: new Date('2026-04-01T22:00:00Z'), folder: 'old-backup/m81', objectName: null })
      .addCalibration({ kind: 'dark', exposureSec: 60, gain: 300, sensorTempC: 0, filter: null })
      .addLightSettings({ exposureSec: 10, gain: 80, sensorTempC: 20, filter: 'IRCUT', count: 366 })

    const report = await makeReportHiddenData({ frames })()

    expect(report.unstackedNights).toBe(1)
    expect(report.unassigned.subCount).toBe(1)
    expect(report.orphanCalibration).toHaveLength(1)
    expect(report.rejected.subCount).toBe(6)
  })
})
