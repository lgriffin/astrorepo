import { describe, it, expect } from 'vitest'
import { detectStacking } from '../../src/main/fits/stacking'
import type { FitsHeaderRecord } from '../../src/main/fits/parser'

function makeHeaderMap(entries: Record<string, string | number | boolean>): Map<string, FitsHeaderRecord> {
  const map = new Map<string, FitsHeaderRecord>()
  for (const [keyword, value] of Object.entries(entries)) {
    map.set(keyword, { keyword, value, comment: null, raw: '' })
  }
  return map
}

describe('Stacking Detection', () => {
  it('detects stacking via NCOMBINE', () => {
    const result = detectStacking(makeHeaderMap({ NCOMBINE: 50 }))
    expect(result.isStacked).toBe(true)
    expect(result.ncombine).toBe(50)
    expect(result.evidence).toContain('NCOMBINE=50')
  })

  it('detects stacking via STACKCNT', () => {
    const result = detectStacking(makeHeaderMap({ STACKCNT: 25 }))
    expect(result.isStacked).toBe(true)
    expect(result.ncombine).toBe(25)
  })

  it('detects stacking via IMAGETYP containing master', () => {
    const result = detectStacking(makeHeaderMap({ IMAGETYP: 'Master Dark' }))
    expect(result.isStacked).toBe(true)
    expect(result.evidence.some(e => e.includes('Master Dark'))).toBe(true)
  })

  it('detects stacking via IMAGETYP containing stacked', () => {
    const result = detectStacking(makeHeaderMap({ IMAGETYP: 'Stacked Light' }))
    expect(result.isStacked).toBe(true)
  })

  it('detects stacking via CALSTAT', () => {
    const result = detectStacking(makeHeaderMap({ CALSTAT: 'BDF' }))
    expect(result.isStacked).toBe(true)
    expect(result.calstat).toBe('BDF')
  })

  it('detects stacking via TOTALEXP differing from EXPTIME', () => {
    const result = detectStacking(makeHeaderMap({ EXPTIME: 300, TOTALEXP: 9000 }))
    expect(result.isStacked).toBe(true)
    expect(result.totalExposure).toBe(9000)
  })

  it('does not flag a normal light frame as stacked', () => {
    const result = detectStacking(makeHeaderMap({
      IMAGETYP: 'Light',
      EXPTIME: 300,
      BITPIX: 16
    }))
    expect(result.isStacked).toBe(false)
    expect(result.evidence).toHaveLength(0)
  })

  it('does not flag NCOMBINE=1 as stacked', () => {
    const result = detectStacking(makeHeaderMap({ NCOMBINE: 1 }))
    expect(result.isStacked).toBe(false)
  })

  it('accumulates multiple evidence signals', () => {
    const result = detectStacking(makeHeaderMap({
      NCOMBINE: 30,
      CALSTAT: 'BDF',
      IMAGETYP: 'Master Light'
    }))
    expect(result.isStacked).toBe(true)
    expect(result.evidence.length).toBeGreaterThanOrEqual(3)
  })
})
