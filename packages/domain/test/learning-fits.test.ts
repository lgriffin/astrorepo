import { describe, expect, it } from 'vitest'
import {
  ARCSEC_PER_MICRON_PER_MM,
  CONCEPTS,
  FITS_KEYWORDS,
  LEARNING_SOURCES,
  TYPICAL_SEEING_ARCSEC,
  explainHeaders,
  headerNumber,
  keywordFamily,
  keywordMeaning,
  libraryProblems,
  setupNumbers
} from '@astro/domain'

describe('The FITS keyword dictionary', () => {
  it('[LRN-011] Given the dictionary, When checked, Then every keyword is filed once, cites known sources and links to known concepts', () => {
    const keys = FITS_KEYWORDS.map(k => k.key)
    expect(new Set(keys).size).toBe(keys.length)
    const sources = new Set(LEARNING_SOURCES.map(s => s.id))
    const concepts = new Set(CONCEPTS.map(c => c.id))
    for (const k of FITS_KEYWORDS) {
      expect(k.sources.length, k.key).toBeGreaterThan(0)
      for (const s of k.sources) expect(sources.has(s), `${k.key} cites ${s}`).toBe(true)
      if (k.concept) expect(concepts.has(k.concept), `${k.key} links to ${k.concept}`).toBe(true)
      expect(k.meaning.length, k.key).toBeGreaterThan(0)
      expect(k.why.length, k.key).toBeGreaterThan(0)
      // Standard keywords cite the standard; conventions cite the article that describes them.
      expect(k.sources, k.key).toEqual(k.standard ? ['fits-standard'] : ['wiki-fits'])
    }
    expect(libraryProblems()).toEqual([])
  })

  it('[LRN-011] Given numbered keywords, When filed, Then each is found under its family', () => {
    expect(keywordFamily('NAXIS1')).toBe('NAXISn')
    expect(keywordFamily('naxis3 ')).toBe('NAXISn')
    expect(keywordFamily('NAXIS')).toBe('NAXIS')
    expect(keywordFamily('CRVAL2')).toBe('CRVALn')
    expect(keywordFamily('CTYPE1')).toBe('CTYPEn')
    expect(keywordFamily('CRPIX1')).toBe('CRPIXn')
    expect(keywordFamily('CDELT2')).toBe('CDELTn')
    expect(keywordFamily('CROTA2')).toBe('CROTAn')
    expect(keywordFamily('CD1_2')).toBe('CDi_j')
    expect(keywordFamily('CD1')).toBe('CD1')
    expect(keywordFamily('XCD1_2')).toBe('XCD1_2')
    expect(keywordFamily('NAXIS1X')).toBe('NAXIS1X')
    expect(keywordFamily('EXPTIME')).toBe('EXPTIME')
    expect(keywordMeaning('CD2_1')?.key).toBe('CDi_j')
    expect(keywordMeaning('exptime')?.concept).toBe('noise')
    expect(keywordMeaning('HISTORY')).toBeNull()
    expect(keywordMeaning('EXPTIME', [])).toBeNull()
  })
})

describe('Header values', () => {
  it('[LRN-012] Given header values as text, When read as numbers, Then quotes and spaces are trimmed and words refused', () => {
    expect(headerNumber('400')).toBe(400)
    expect(headerNumber(" '3.76' ")).toBe(3.76)
    expect(headerNumber('-1.5E-4')).toBe(-0.00015)
    expect(headerNumber("'RGGB'")).toBeNull()
    expect(headerNumber("''")).toBeNull()
    expect(headerNumber('  ')).toBeNull()
    expect(headerNumber(null)).toBeNull()
    expect(headerNumber(undefined)).toBeNull()
    expect(headerNumber('Infinity')).toBeNull()
  })
})

describe('Your setup', () => {
  it('[LRN-012] Given a 400 mm scope and 3.76 µm pixels, When worked out, Then the scale, field and sampling follow', () => {
    const s = setupNumbers({ focalMm: 400, pixelUm: 3.76, widthPx: 3008, heightPx: 3008 })!
    expect(s.scaleArcsec).toBeCloseTo((ARCSEC_PER_MICRON_PER_MM * 3.76) / 400, 10)
    expect(s.scaleArcsec).toBeCloseTo(1.939, 3)
    expect(s.fieldArcmin!.width).toBeCloseTo((3008 * s.scaleArcsec) / 60, 10)
    expect(s.fieldArcmin!.height).toBeCloseTo(97.2, 1)
    expect(s.sampling).toBe('under')
    expect(s.seeingArcsec).toBe(TYPICAL_SEEING_ARCSEC)
    expect(s.focalMm).toBe(400)
    expect(s.pixelUm).toBe(3.76)
  })

  it('[LRN-012] Given scales either side of the seeing, When judged, Then under above seeing ÷ 2, over below seeing ÷ 3, matched between', () => {
    const at = (scale: number, seeing = 2): string => setupNumbers({ focalMm: 206.265, pixelUm: scale, seeingArcsec: seeing })!.sampling
    expect(at(1.01)).toBe('under')
    expect(at(1)).toBe('matched')
    expect(at(0.8)).toBe('matched')
    expect(at(2 / 3)).toBe('matched')
    expect(at(0.66)).toBe('over')
    expect(at(1.4, 3)).toBe('matched')
    expect(at(1.6, 3)).toBe('under')
  })

  it('[LRN-012] Given missing or unusable optics, When worked out, Then there is no setup; and no field without a size', () => {
    expect(setupNumbers({ focalMm: null, pixelUm: 3.76 })).toBeNull()
    expect(setupNumbers({ focalMm: 400, pixelUm: null })).toBeNull()
    expect(setupNumbers({ focalMm: 0, pixelUm: 3.76 })).toBeNull()
    expect(setupNumbers({ focalMm: 400, pixelUm: -1 })).toBeNull()
    expect(setupNumbers({ focalMm: Number.NaN, pixelUm: 3.76 })).toBeNull()
    expect(setupNumbers({ focalMm: 400, pixelUm: 3.76 })!.fieldArcmin).toBeNull()
    expect(setupNumbers({ focalMm: 400, pixelUm: 3.76, widthPx: 100, heightPx: null })!.fieldArcmin).toBeNull()
    expect(setupNumbers({ focalMm: 400, pixelUm: 3.76, widthPx: 0, heightPx: 100 })!.fieldArcmin).toBeNull()
    expect(setupNumbers({ focalMm: 400, pixelUm: 3.76, widthPx: 100, heightPx: 0 })!.fieldArcmin).toBeNull()
  })
})

describe('Explaining a header', () => {
  const header = [
    { keyword: 'SIMPLE', value: 'T' },
    { keyword: 'NAXIS1', value: '3008' },
    { keyword: 'NAXIS2', value: '3008' },
    { keyword: 'FOCALLEN', value: '400' },
    { keyword: 'XPIXSZ', value: '3.76' },
    { keyword: 'HISTORY', value: 'stacked' },
    { keyword: 'naxis1', value: '1' }
  ]

  it('[LRN-011] [LRN-012] Given a header, When explained, Then known keywords are explained once each and the optics worked out', () => {
    const e = explainHeaders(header)
    expect(e.keywords.map(k => k.keyword)).toEqual(['SIMPLE', 'NAXIS1', 'NAXIS2', 'FOCALLEN', 'XPIXSZ'])
    expect(e.keywords[1].entry.key).toBe('NAXISn')
    // The first value of a repeated keyword is the one used.
    expect(e.setup!.fieldArcmin!.width).toBeCloseTo(97.2, 1)
    expect(e.setup!.scaleArcsec).toBeCloseTo(1.939, 3)
    expect(e.solvedScaleArcsec).toBeNull()
    expect(explainHeaders(header, []).keywords).toEqual([])
  })

  it('[LRN-013] Given a solved file, When explained, Then the scale the solve measured is given from CDELT1 or the CD matrix', () => {
    expect(explainHeaders([{ keyword: 'CDELT1', value: '-0.000539' }]).solvedScaleArcsec).toBeCloseTo(1.9404, 4)
    expect(explainHeaders([{ keyword: 'CD1_1', value: '0.0003' }, { keyword: 'CD2_1', value: '0.0004' }]).solvedScaleArcsec).toBeCloseTo(1.8, 10)
    expect(explainHeaders([{ keyword: 'CD2_1', value: '-0.0005' }]).solvedScaleArcsec).toBeCloseTo(1.8, 10)
    expect(explainHeaders([{ keyword: 'CD1_1', value: '0.0005' }]).solvedScaleArcsec).toBeCloseTo(1.8, 10)
    expect(explainHeaders([{ keyword: 'CDELT1', value: '0' }, { keyword: 'CD1_1', value: '0.0005' }]).solvedScaleArcsec).toBeCloseTo(1.8, 10)
    expect(explainHeaders([{ keyword: 'CD1_1', value: '0' }, { keyword: 'CD2_1', value: '0' }]).solvedScaleArcsec).toBeNull()
    expect(explainHeaders([]).setup).toBeNull()
  })
})
