import { describe, it, expect } from 'vitest'
import type { FrameCatalogue } from '@astro/application'
import type { CalibrationFrame, LightSetting, QuarantinedFile, TargetFrames, UnassignedLight } from '@astro/domain'

export interface FrameCatalogueSeed {
  targets?: TargetFrames[]
  unassigned?: UnassignedLight[]
  calibration?: CalibrationFrame[]
  /** Seeded as that many unassigned lights with those settings. */
  lightSettings?: LightSetting[]
  quarantined?: QuarantinedFile[]
}

/**
 * Every FrameCatalogue adapter must pass this suite. `make` seeds the adapter
 * however its technology needs to.
 */
export function frameCatalogueContract(
  adapterName: string,
  make: (seed: FrameCatalogueSeed) => Promise<FrameCatalogue> | FrameCatalogue
): void {
  const empty = { goalSec: null, processedCount: 0, finalCount: 0 }
  const m81: TargetFrames = {
    targetId: 'target-m81',
    targetName: 'M 81',
    subs: [
      { exposureSec: 10, capturedAt: new Date('2026-03-01T21:00:00Z'), filter: 'IRCUT', scope: 'Seestar S50', rejected: false },
      { exposureSec: 10, capturedAt: new Date('2026-03-01T21:00:10Z'), filter: 'LP', scope: null, rejected: true }
    ],
    stacks: [{ producedAt: new Date('2026-03-02T09:00:00Z') }],
    ...empty
  }

  describe(`FrameCatalogue contract: ${adapterName}`, () => {
    it('[NFR-006] Given a target with subs and a stack, When frames are listed, Then both come back with exposure and times intact', async () => {
      const catalogue = await make({ targets: [m81] })
      const [t] = await catalogue.listTargetFrames()
      expect(t.targetId).toBe('target-m81')
      expect(t.targetName).toBe('M 81')
      expect(t.subs.map(s => s.exposureSec)).toEqual([10, 10])
      expect(t.subs.map(s => s.capturedAt?.toISOString()).sort()).toEqual([
        '2026-03-01T21:00:00.000Z',
        '2026-03-01T21:00:10.000Z'
      ])
      expect(t.stacks.map(s => s.producedAt.toISOString())).toEqual(['2026-03-02T09:00:00.000Z'])
    })

    it('[NFR-006] Given subs with filter, scope and a quality rejection, When frames are listed, Then each sub keeps them', async () => {
      const catalogue = await make({ targets: [m81] })
      const [t] = await catalogue.listTargetFrames()
      const byTime = [...t.subs].sort((a, b) => (a.capturedAt?.getTime() ?? 0) - (b.capturedAt?.getTime() ?? 0))
      expect(byTime.map(s => [s.filter, s.scope, s.rejected])).toEqual([
        ['IRCUT', 'Seestar S50', false],
        ['LP', null, true]
      ])
    })

    it('[NFR-006] Given a target with only a goal, processed and final files, When frames are listed, Then it comes back with them', async () => {
      const m31: TargetFrames = { targetId: 'target-m31', targetName: 'M 31', subs: [], stacks: [], goalSec: 21600, processedCount: 2, finalCount: 1 }
      const catalogue = await make({ targets: [m31] })
      const [t] = await catalogue.listTargetFrames()
      expect(t).toMatchObject({ targetId: 'target-m31', goalSec: 21600, processedCount: 2, finalCount: 1 })
    })

    it('[DSC-016] Given goals for two filters, When frames are listed, Then the target carries each filter goal and their sum', async () => {
      const m27: TargetFrames = {
        targetId: 'target-m27', targetName: 'M 27', subs: [], stacks: [], goalSec: 10800, processedCount: 0, finalCount: 0,
        filterGoals: [{ filter: 'Ha', goalSec: 3600 }, { filter: 'OIII', goalSec: 7200 }]
      }
      const [t] = await (await make({ targets: [m27] })).listTargetFrames()
      expect(t).toMatchObject({ goalSec: 10800, filterGoals: [{ filter: 'Ha', goalSec: 3600 }, { filter: 'OIII', goalSec: 7200 }] })
    })

    it('[NFR-006] Given a target with no frames, outputs or goal, When frames are listed, Then it is left out', async () => {
      const bare: TargetFrames = { targetId: 'target-m1', targetName: 'M 1', subs: [], stacks: [], ...empty }
      const catalogue = await make({ targets: [m81, bare] })
      const ids = (await catalogue.listTargetFrames()).map(t => t.targetId)
      expect(ids).toEqual(['target-m81'])
    })

    it('[NFR-006] Given light subs no target claims, When unassigned lights are listed, Then each comes back with its folder, time and quality verdict', async () => {
      const catalogue = await make({
        unassigned: [
          { exposureSec: 20, capturedAt: new Date('2026-04-01T22:00:00Z'), folder: 'NGC 7000_sub', objectName: 'NGC 7000', rejected: false },
          { exposureSec: 20, capturedAt: new Date('2026-04-01T22:01:00Z'), folder: 'NGC 7000_sub', objectName: 'NGC 7000', rejected: true }
        ]
      })
      const got = await catalogue.listUnassignedLights()
      expect([...got].sort((a, b) => (a.capturedAt?.getTime() ?? 0) - (b.capturedAt?.getTime() ?? 0))).toEqual([
        { exposureSec: 20, capturedAt: new Date('2026-04-01T22:00:00Z'), folder: 'NGC 7000_sub', objectName: 'NGC 7000', rejected: false },
        { exposureSec: 20, capturedAt: new Date('2026-04-01T22:01:00Z'), folder: 'NGC 7000_sub', objectName: 'NGC 7000', rejected: true }
      ])
    })

    it('[NFR-006] Given darks, flats and bias frames, When calibration frames are listed, Then each keeps its kind and settings', async () => {
      const calibration: CalibrationFrame[] = [
        { kind: 'dark', exposureSec: 300, gain: 100, sensorTempC: -10, filter: null },
        { kind: 'flat', exposureSec: 1, gain: 100, sensorTempC: null, filter: 'Ha' },
        { kind: 'bias', exposureSec: 0, gain: 100, sensorTempC: null, filter: null }
      ]
      const catalogue = await make({ calibration })
      const got = await catalogue.listCalibrationFrames()
      expect([...got].sort((a, b) => a.kind.localeCompare(b.kind))).toEqual(
        [...calibration].sort((a, b) => a.kind.localeCompare(b.kind))
      )
    })

    it('[NFR-006] Given lights at two settings, When light settings are listed, Then each distinct setting comes back with its count', async () => {
      const lightSettings: LightSetting[] = [
        { exposureSec: 300, gain: 100, sensorTempC: -10, filter: 'Ha', count: 3 },
        { exposureSec: 10, gain: 80, sensorTempC: 20, filter: 'IRCUT', count: 2 }
      ]
      const catalogue = await make({ lightSettings })
      const got = await catalogue.listLightSettings()
      expect([...got].sort((a, b) => b.count - a.count)).toEqual(lightSettings)
    })

    it('[NFR-006] Given files the scanner could not read, When quarantined files are listed, Then each comes back with its reason', async () => {
      const quarantined = [{ path: '/d/b.fit', error: 'truncated' }, { path: '/d/a.fit', error: 'SIMPLE != T' }]
      const catalogue = await make({ quarantined })
      const got = await catalogue.listQuarantinedFiles()
      expect([...got].sort((a, b) => a.path.localeCompare(b.path))).toEqual([quarantined[1], quarantined[0]])
    })
  })
}
