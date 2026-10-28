import { describe, expect, it } from 'vitest'
import { CONCEPTS, EMISSION_LINES, LEARNING_SOURCES, filterLight, filtersLight } from '@astro/domain'

describe('What your filters catch', () => {
  it('[LRN-018] Given the emission lines, When checked, Then each has its wavelength, a known concept and known sources', () => {
    const sources = new Set(LEARNING_SOURCES.map(s => s.id))
    const concepts = new Set(CONCEPTS.map(c => c.id))
    expect(Object.values(EMISSION_LINES).map(l => [l.id, l.nm])).toEqual([['ha', 656.3], ['hb', 486.1], ['oiii', 500.7], ['sii', 671.6], ['nii', 658.4]])
    for (const l of Object.values(EMISSION_LINES)) {
      expect(concepts.has(l.concept), l.id).toBe(true)
      expect(l.sources.length, l.id).toBeGreaterThan(0)
      for (const s of l.sources) expect(sources.has(s), `${l.id} cites ${s}`).toBe(true)
    }
  })

  it('[LRN-018] Given narrowband names as capture software writes them, When read, Then each finds its one line', () => {
    const line = (name: string) => filterLight(name).lines.map(l => l.id)
    for (const name of ['Ha', 'H-alpha', 'HA 7nm', 'Halpha3nm', 'ha']) expect(line(name), name).toEqual(['ha'])
    for (const name of ['OIII', 'O3', 'O-III 6.5nm']) expect(line(name), name).toEqual(['oiii'])
    for (const name of ['SII', 'S2', 'S-II']) expect(line(name), name).toEqual(['sii'])
    expect(line('Hb')).toEqual(['hb'])
    expect(line('H-beta')).toEqual(['hb'])
    expect(line('NII')).toEqual(['nii'])
    const ha = filterLight('Ha 7nm')
    expect(ha.kind).toBe('narrowband')
    expect(ha.filter).toBe('Ha 7nm')
    expect(ha.concept).toBe('h-alpha')
    expect(ha.passes).toBe('Only Hydrogen alpha (Hα) at 656.3 nm, from hydrogen whose electron drops from the third level to the second.')
    // A longer word that only starts like a line is not that line.
    expect(filterLight('Hat').kind).toBe('unknown')
    expect(filterLight('Ox').kind).toBe('unknown')
  })

  it('[LRN-018] Given dual-band and broadband filters, When read, Then each says what it passes', () => {
    for (const name of ['Dual band', 'L-eXtreme', 'L-eNhance', 'ALP-T', 'Ha/OIII', 'DB']) {
      const f = filterLight(name)
      expect(f.kind, name).toBe('dual-band')
      expect(f.lines.map(l => l.id), name).toEqual(['ha', 'oiii'])
      expect(f.concept).toBe('emission-lines')
    }
    expect(filterLight('IRCUT').kind).toBe('uv-ir-cut')
    expect(filterLight('UV/IR cut').kind).toBe('uv-ir-cut')
    expect(filterLight('IRCUT').concept).toBeNull()
    expect(filterLight('LP').kind).toBe('light-pollution')
    expect(filterLight('CLS').kind).toBe('light-pollution')
    expect(filterLight('LP').concept).toBe('emission-lines')
    expect(filterLight('L').kind).toBe('luminance')
    expect(filterLight('Lum').passes).toMatch(/^All visible light, roughly 400 to 700 nm/)
    expect(filterLight('R').passes).toMatch(/^Red light/)
    expect(filterLight('Green').passes).toMatch(/^Green light/)
    expect(filterLight('B').passes).toMatch(/^Blue light/)
    expect(filterLight('R').kind).toBe('colour')
    expect(filterLight('R').lines).toEqual([])
    for (const f of ['L', 'R', 'G', 'B', 'IRCUT', 'LP']) expect(filterLight(f).passes.length, f).toBeGreaterThan(20)
    expect(filterLight('Dual band').passes).toBe('Two narrow windows, hydrogen alpha at 656.3 nm and O III at 500.7 nm, blocking most light pollution and moonlight between them.')
    // Names are matched whole or from the start, never from the middle or with extra letters.
    for (const name of ['X-IRCUT', 'XLP', 'Luna', 'XL', 'Rx', 'XR', 'Gx', 'XG', 'Bx', 'XB']) expect(filterLight(name).kind, name).toBe('unknown')
    const odd = filterLight('Mystery')
    expect(odd).toEqual({ filter: 'Mystery', kind: 'unknown', lines: [], passes: '', concept: null })
  })

  it('[LRN-018] Given a target’s filters, When explained, Then each is told once and unknown names are left out', () => {
    expect(filtersLight(['Ha', 'H-alpha', 'OIII', 'Mystery', 'oiii']).map(f => f.filter)).toEqual(['Ha', 'H-alpha', 'OIII'])
    expect(filtersLight(['Ha', 'HA']).map(f => f.filter)).toEqual(['Ha'])
    expect(filtersLight([])).toEqual([])
  })
})
