import { describe, expect, it } from 'vitest'
import {
  ARCMIN_PER_RADIAN,
  DISTANCE_SOURCE,
  LEARNING_SOURCES,
  MESSIER_DISTANCES,
  MILESTONES,
  designationKey,
  distanceFor,
  lightYearsText,
  lookback,
  objectNumbers,
  trueSize
} from '@astro/domain'

describe('Published distances', () => {
  it('[LRN-008] Given the Messier catalogue, When its distances are read, Then all 110 are held as ranges with a source', () => {
    const keys = Object.keys(MESSIER_DISTANCES)
    expect(keys).toHaveLength(110)
    for (let n = 1; n <= 110; n++) expect(keys).toContain(`M${n}`)
    for (const r of Object.values(MESSIER_DISTANCES)) {
      expect(r.lowKly).toBeGreaterThan(0)
      expect(r.highKly).toBeGreaterThanOrEqual(r.lowKly)
    }
    const ids = LEARNING_SOURCES.map(s => s.id)
    expect(ids).toContain(DISTANCE_SOURCE)
    for (const m of MILESTONES) expect(ids).toContain(m.source)
  })

  it('[LRN-008] Given a target\'s names, When a distance is looked up, Then the first name with one is used, whatever its spacing or case', () => {
    expect(designationKey(' m 31 ')).toBe('M31')
    expect(distanceFor(['Andromeda Galaxy', 'NGC 224', 'm 31'])).toEqual({ designation: 'M31', range: { lowKly: 2430, highKly: 2650 } })
    expect(distanceFor(['M42', 'M43'])?.designation).toBe('M42')
    expect(distanceFor(['NGC 7000'])).toBeNull()
    expect(distanceFor([])).toBeNull()
    expect(distanceFor(['toString'])).toBeNull()
  })

  it('[LRN-009] Given an angular size and a distance, When the true size is worked out, Then it is distance times the angle in radians', () => {
    expect(ARCMIN_PER_RADIAN).toBeCloseTo(3437.747, 3)
    expect(trueSize(3437.747, 1)).toBeCloseTo(1, 5)
    expect(trueSize(2_540_000, 178)).toBeCloseTo(131_516, 0)
  })

  it('[LRN-010] Given a travel time, When it is set against the past, Then a calendar year is used within writing, else the latest milestone it is older than', () => {
    expect(lookback(1344, 2026)).toEqual({ text: 'It set out around the year 682.', source: null })
    expect(lookback(2026, 2026)).toEqual({ text: 'It set out around 1 BC.', source: null })
    expect(lookback(2500, 2026)).toEqual({ text: 'It set out around 475 BC.', source: null })
    expect(lookback(5199, 2026).source).toBeNull()
    expect(lookback(5200, 2026)).toEqual({ text: 'It set out before writing was invented, about 5,200 years ago.', source: 'wiki-history-of-writing' })
    expect(lookback(12_000, 2026).source).toBe('wiki-neolithic-revolution')
    expect(lookback(299_999, 2026).source).toBe('wiki-neolithic-revolution')
    expect(lookback(2_599_999, 2026).source).toBe('wiki-homo-sapiens')
    expect(lookback(300_000, 2026).source).toBe('wiki-homo-sapiens')
    expect(lookback(2_600_000, 2026).source).toBe('wiki-oldowan')
    expect(lookback(66_000_000, 2026).text).toBe('It set out before the dinosaurs died out, about 66,000,000 years ago.')
  })

  it('[LRN-008] Given an object with a published distance, When its numbers are worked out, Then the middle of the range leads and both ends are kept', () => {
    const n = objectNumbers({ names: ['M1'], angularSizeArcmin: 6, thisYear: 2026 })!
    expect(n.designation).toBe('M1')
    expect(n.lowLy).toBe(4900)
    expect(n.highLy).toBe(8100)
    expect(n.distanceLy).toBe(6500)
    expect(n.travelYears).toBe(6500)
    expect(n.sizeLy).toBeCloseTo(trueSize(6500, 6), 6)
    expect(n.approx).toBe(false)
    expect(n.sources).toEqual([DISTANCE_SOURCE, 'wiki-history-of-writing'])
    expect(n.lookback.text).toBe('It set out before writing was invented, about 5,200 years ago.')
    expect(objectNumbers({ names: ['M42'], angularSizeArcmin: 0, thisYear: 2026 })!.sizeLy).toBeNull()
    expect(objectNumbers({ names: ['M42'], angularSizeArcmin: null, thisYear: 2026 })!.sources).toEqual([DISTANCE_SOURCE])
    expect(objectNumbers({ names: ['M73'], angularSizeArcmin: null, thisYear: 2026 })!.approx).toBe(true)
    expect(objectNumbers({ names: ['IC 1396'], angularSizeArcmin: 170, thisYear: 2026 })).toBeNull()
  })

  it('[LRN-008] Given a count of light years, When put in words, Then it has two significant figures and a scale word', () => {
    expect(lightYearsText(1344)).toBe('1,300')
    expect(lightYearsText(25_800)).toBe('26,000')
    expect(lightYearsText(999_999)).toBe('1,000,000')
    expect(lightYearsText(1_000_000)).toBe('1 million')
    expect(lightYearsText(2_540_000)).toBe('2.5 million')
    expect(lightYearsText(999_999_999)).toBe('1000 million')
    expect(lightYearsText(1e9)).toBe('1 billion')
    expect(lightYearsText(13_800_000_000)).toBe('14 billion')
  })
})
