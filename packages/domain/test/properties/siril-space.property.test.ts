import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  SIRIL_SCRIPTS,
  estimateSirilSpace,
  geometryFromFileSize,
  missingCalibration,
  recommendSirilScript,
  spaceVerdict,
  type FrameCounts,
  type SirilScriptId
} from '@astro/domain'
import { propertyParams } from './arbitraries'

const scriptId = fc.constantFrom(...SIRIL_SCRIPTS.map(s => s.id)) as fc.Arbitrary<SirilScriptId>
const counts: fc.Arbitrary<FrameCounts> = fc.record({
  lights: fc.integer({ min: 0, max: 500 }),
  darks: fc.integer({ min: 0, max: 60 }),
  flats: fc.integer({ min: 0, max: 60 }),
  biases: fc.integer({ min: 0, max: 60 })
})
const geometry = fc.record({ width: fc.integer({ min: 1, max: 10000 }), height: fc.integer({ min: 1, max: 10000 }) })
const folder = fc.constantFrom('lights', 'darks', 'flats', 'biases') as fc.Arbitrary<keyof FrameCounts>

describe('Siril space estimates', () => {
  it('[RCP-002, FUZ-006] Given any script, frames and frame size, When the space is estimated, Then the stages add up to the total and the running total never falls', () => {
    fc.assert(
      fc.property(scriptId, counts, geometry, (script, c, g) => {
        const est = estimateSirilSpace(script, c, g)
        expect(est.totalBytes).toBe(est.stages.reduce((n, s) => n + s.bytes, 0))
        let last = 0
        for (const s of est.stages) {
          expect(s.bytes).toBeGreaterThanOrEqual(0)
          expect(s.cumulativeBytes).toBe(last + s.bytes)
          last = s.cumulativeBytes
        }
      }),
      propertyParams()
    )
  })

  it('[RCP-002, FUZ-006] Given one more frame of any kind, When the space is estimated again, Then it never needs less', () => {
    fc.assert(
      fc.property(scriptId, counts, geometry, folder, fc.integer({ min: 1, max: 50 }), (script, c, g, kind, more) => {
        const before = estimateSirilSpace(script, c, g).totalBytes
        expect(estimateSirilSpace(script, { ...c, [kind]: c[kind] + more }, g).totalBytes).toBeGreaterThanOrEqual(before)
      }),
      propertyParams()
    )
  })

  it('[RCP-002, RCP-004, FUZ-006] Given larger frames, When the space is estimated, Then it never needs less; and a larger file never reads as a smaller frame', () => {
    fc.assert(
      fc.property(scriptId, counts, geometry, fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 1000 }), (script, c, g, dw, dh) => {
        expect(estimateSirilSpace(script, c, { width: g.width + dw, height: g.height + dh }).totalBytes).toBeGreaterThanOrEqual(estimateSirilSpace(script, c, g).totalBytes)
      }),
      propertyParams()
    )
    fc.assert(
      fc.property(fc.nat({ max: 2 ** 40 }), fc.nat({ max: 2 ** 30 }), (size, more) => {
        expect(geometryFromFileSize(size + more).width).toBeGreaterThanOrEqual(geometryFromFileSize(size).width)
        expect(geometryFromFileSize(size).width).toBeGreaterThanOrEqual(1)
      }),
      propertyParams()
    )
  })

  it('[RCP-003, FUZ-006] Given any need and free space, When the verdict is given, Then it fits exactly when the need is no more than the space, with headroom or shortfall adding up', () => {
    fc.assert(
      fc.property(fc.nat({ max: 2 ** 50 }), fc.option(fc.nat({ max: 2 ** 50 }), { nil: null }), (needed, free) => {
        const v = spaceVerdict(needed, free)
        if (free === null) {
          expect(v).toEqual({ neededBytes: needed, fits: true, headroomBytes: null, shortBytes: null })
          return
        }
        expect(v.fits).toBe(needed <= free)
        if (v.fits) expect((v.headroomBytes as number) + needed).toBe(free)
        else expect(free + (v.shortBytes as number)).toBe(needed)
      }),
      propertyParams()
    )
  })

  it('[RCP-003, FUZ-006] Given a run that fits, When it needs less or the disk has more, Then it still fits', () => {
    fc.assert(
      fc.property(fc.nat({ max: 2 ** 40 }), fc.nat({ max: 2 ** 40 }), fc.nat({ max: 2 ** 40 }), (needed, free, slack) => {
        if (!spaceVerdict(needed, free).fits) return
        expect(spaceVerdict(Math.max(0, needed - slack), free).fits).toBe(true)
        expect(spaceVerdict(needed, free + slack).fits).toBe(true)
      }),
      propertyParams()
    )
  })

  it('[RCP-001, RCP-005, FUZ-006] Given any frames, When a script is recommended, Then it is for the sensor, has every calibration folder it needs, and none is chosen only without lights or mono calibration', () => {
    fc.assert(
      fc.property(counts, fc.constantFrom('colour', 'mono') as fc.Arbitrary<'colour' | 'mono'>, (c, sensor) => {
        const choice = recommendSirilScript(c, sensor)
        expect(choice.reason.length).toBeGreaterThan(0)
        if (choice.script === null) {
          expect(c.lights === 0 || (sensor === 'mono' && (c.biases === 0 || c.flats === 0 || c.darks === 0))).toBe(true)
          return
        }
        const script = SIRIL_SCRIPTS.find(s => s.id === choice.script)!
        expect(script.sensor).toBe(sensor)
        expect(missingCalibration(script, c)).toEqual([])
      }),
      propertyParams()
    )
  })
})
