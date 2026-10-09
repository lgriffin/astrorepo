import { describe, it, expect } from 'vitest'
import type { SirilRunEstimate } from '@astro/application'
import { stackAdvice } from '@astro/testkit'
import { toSirilPlanView } from '../../src/main/adapters/siril-plan-presenter'

const GB = 1024 ** 3

const estimate = (over: Partial<SirilRunEstimate> = {}): SirilRunEstimate => ({
  counts: { lights: 120, darks: 20, flats: 0, biases: 1 },
  rejectedLights: 0,
  sensor: 'colour',
  sensorKnown: true,
  geometry: { width: 1920, height: 1080 },
  geometryApproximate: false,
  geometryMixed: false,
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
      neededBytes: 20 * GB,
      fits: true,
      headroomBytes: 80 * GB,
      shortBytes: null,
      memory: null
    },
    {
      script: 'OSC_Preprocessing',
      label: 'Colour, with biases, flats and darks',
      missing: ['flats'],
      scriptBytes: 150 * GB,
      stages: [],
      neededBytes: 150 * GB,
      fits: false,
      headroomBytes: null,
      shortBytes: 50 * GB,
      memory: null
    }
  ],
  advice: stackAdvice(),
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
    expect(toSirilPlanView(estimate({ prepBytes: 12 * GB })).prepNote).toBe('Prep for Siril copies 12.0 GB of frames, because they are on another disk from the work area.')
    expect(toSirilPlanView(estimate()).prepNote).toBe('Prep for Siril copies nothing: the frames are hard-linked or already in the work area.')
    expect(toSirilPlanView(estimate()).scripts[0].stages).toEqual([{ name: 'Convert lights', size: '2.0 GB', cumulative: '2.0 GB', files: 120 }])
  })

  it('[RCP-004] Given a guessed frame size and an unknown sensor, When presented, Then the plan says its figures are approximate and why', () => {
    const view = toSirilPlanView(estimate({ geometryApproximate: true, sensorKnown: false }))
    expect(view.approximateNote).toBe(
      'Scan this folder on the FITS files page for exact figures: frame size is guessed from file size and the lights are taken as colour, so sizes are approximate.'
    )
    expect(toSirilPlanView(estimate()).approximateNote).toBeNull()
    expect(toSirilPlanView(estimate({ geometryMixed: true })).approximateNote).toBe('The lights are not all one size, so every light is counted at the largest.')
  })

  it('[RCP-003] Given files an earlier run left, When presented, Then the plan says they are not counted as free', () => {
    expect(toSirilPlanView(estimate({ usedBytes: 3 * GB })).leftoverNote).toBe(
      "An earlier run left 3.0 GB in the work folder's process and masters. It is not counted as free; delete it before running to get the space back."
    )
    expect(toSirilPlanView(estimate()).leftoverNote).toBeNull()
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

  it('[ADV-002] Given a script\'s memory check, When presented, Then the plan carries its verdict and sentence', () => {
    const e = estimate()
    e.scripts[0].memory = { onePassBytes: 30 * GB, minimumBytes: 2 * GB, fit: 'blocks', text: 'Siril will stack in blocks, which is slower.' }
    expect(toSirilPlanView(e).scripts[0].memory).toEqual({ fit: 'blocks', text: 'Siril will stack in blocks, which is slower.' })
    expect(toSirilPlanView(estimate()).scripts[0].memory).toBeNull()
  })

  it('[ADV-004] [ADV-007] Given advice, When presented, Then scale, drizzle with its extra disk, rejection, calibration and labelled nights read as sentences', () => {
    const view = toSirilPlanView(
      estimate({
        advice: stackAdvice({
          scaleArcsec: 2.393,
          drizzle: { suggest: true, reason: 'Bayer drizzle can recover finer detail.', extraBytes: 40 * GB },
          calibration: [{ kind: 'dark', status: 'matches', count: 20, gaps: [], text: '20 darks match the lights.' }],
          nights: { nights: [{ night: '2026-01-10', lights: 60, kept: 55, rejected: 5, medianFwhm: 2.84, flats: 0, leftOut: true }], sharedFlatsNote: 'Shared flats.' }
        })
      })
    ).advice
    expect(view.scale).toBe('2.39"/px')
    expect(view.drizzle).toEqual({ suggest: true, text: 'Bayer drizzle can recover finer detail. It needs 40.0 GB more disk than the recommended script.' })
    expect(view.rejection).toMatchObject({ siril: 'rej w 3 3' })
    expect(view.calibration).toEqual([{ kind: 'dark', status: 'matches', text: '20 darks match the lights.' }])
    expect(view.nights).toEqual([{ night: '2026-01-10', label: '10 Jan 2026', lights: 60, kept: 55, rejected: 5, medianFwhm: '2.8 px', flats: 0, leftOut: true }])
    expect(view.sharedFlatsNote).toBe('Shared flats.')
    const plain = toSirilPlanView(estimate()).advice
    expect(plain).toMatchObject({ scale: null, nights: null, sharedFlatsNote: null })
    expect(plain.drizzle.text).not.toMatch(/more disk/)
  })
})
