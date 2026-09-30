import { describe, it, expect } from 'vitest'
import type { SirilRunEstimate } from '@astro/application'
import { toSirilPlanView } from '../../src/main/adapters/siril-plan-presenter'

const GB = 1024 ** 3

const estimate = (over: Partial<SirilRunEstimate> = {}): SirilRunEstimate => ({
  counts: { lights: 120, darks: 20, flats: 0, biases: 1 },
  sensor: 'colour',
  sensorKnown: true,
  geometry: { width: 1920, height: 1080 },
  geometryApproximate: false,
  prepBytes: 0,
  freeBytes: 100 * GB,
  usedBytes: 0,
  recommended: { script: 'OSC_Preprocessing_WithoutFlat', reason: 'Colour frames with darks.' },
  scripts: [
    {
      script: 'OSC_Preprocessing_WithoutFlat',
      label: 'Colour, darks only',
      missing: [],
      scriptBytes: 20 * GB,
      stages: [{ name: 'Convert lights', bytes: 2 * GB, cumulativeBytes: 2 * GB, files: 120 }],
      netBytes: 20 * GB,
      fits: true,
      headroomBytes: 80 * GB,
      shortBytes: null
    },
    {
      script: 'OSC_Preprocessing',
      label: 'Colour, with biases, flats and darks',
      missing: ['flats'],
      scriptBytes: 150 * GB,
      stages: [],
      netBytes: 150 * GB,
      fits: false,
      headroomBytes: null,
      shortBytes: 50 * GB
    }
  ],
  ...over
})

describe('Siril plan presenter', () => {
  it('[RCP-001] Given a recommended script, When presented, Then it is named by its file with the reason and the frames it will use', () => {
    const view = toSirilPlanView(estimate())
    expect(view.recommended).toBe('OSC_Preprocessing_WithoutFlat.ssf')
    expect(view.reason).toBe('Colour frames with darks.')
    expect(view.frames).toBe('120 lights, 20 darks, 0 flats, 1 bias, 1920 × 1080 colour')
    expect(view.scripts[0]).toMatchObject({ recommended: true, needed: '20.0 GB', verdict: 'fits', verdictText: 'Fits, 80.0 GB to spare', missing: null })
  })

  it('[RCP-003] Given a script bigger than the free space, When presented, Then it reads short by the difference', () => {
    const view = toSirilPlanView(estimate())
    expect(view.scripts[1]).toMatchObject({ verdict: 'short', verdictText: 'Short by 50.0 GB' })
    expect(view.freeSpace).toBe("100.0 GB free on the work area's disk")
  })

  it('[RCP-005] Given a script missing calibration, When presented, Then it names the missing folders', () => {
    expect(toSirilPlanView(estimate()).scripts[1].missing).toBe('Needs flats, which this target does not have.')
  })

  it('[RCP-002] Given the work area on another disk, When presented, Then the copy Prep makes is stated; on the same disk, it costs nothing', () => {
    expect(toSirilPlanView(estimate({ prepBytes: 12 * GB })).prepNote).toBe('Prep for Siril copies 12.0 GB of frames, because the work area is on another disk.')
    expect(toSirilPlanView(estimate()).prepNote).toMatch(/hard-links the frames, so it takes no extra space/)
    expect(toSirilPlanView(estimate()).scripts[0].stages).toEqual([{ name: 'Convert lights', size: '2.0 GB', cumulative: '2.0 GB', files: 120 }])
  })

  it('[RCP-004] Given a guessed frame size and an unknown sensor, When presented, Then the plan says its figures are approximate and why', () => {
    const view = toSirilPlanView(estimate({ geometryApproximate: true, sensorKnown: false }))
    expect(view.approximateNote).toBe(
      'Scan this folder in the FITS Analyzer for exact figures: frame size is guessed from file size and the lights are taken as colour, so sizes are approximate.'
    )
    expect(toSirilPlanView(estimate()).approximateNote).toBeNull()
  })

  it('[RCP-003] Given free space the system will not report, When presented, Then no script is called short', () => {
    const view = toSirilPlanView(estimate({ freeBytes: null }))
    expect(view.freeSpace).toBeNull()
    expect(view.scripts.every(s => s.verdict === 'unknown' && s.verdictText === 'Free space unknown')).toBe(true)
  })

  it('[RCP-001] Given no script that fits, When presented, Then there is no recommendation, only the reason', () => {
    const view = toSirilPlanView(estimate({ recommended: { script: null, reason: 'There are no light frames to stack.' } }))
    expect(view.recommended).toBeNull()
    expect(view.scripts.some(s => s.recommended)).toBe(false)
  })
})
