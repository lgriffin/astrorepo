import { describe, expect, it } from 'vitest'
import { channelSources, filterChannels, isPalettePossible, paletteChannels, PALETTES, possiblePalettes } from '@astro/domain'

describe('What a filter gives', () => {
  it('[INS-004] Given narrowband filter names as capture programs write them, When read, Then each gives its line as the whole image', () => {
    for (const name of ['Ha', 'H-alpha', 'Halpha', 'Ha 7nm', 'H']) expect(filterChannels(name, false)).toEqual([{ channel: 'Ha', from: 'luminance' }])
    for (const name of ['OIII', 'O3', 'O-III 6.5nm']) expect(filterChannels(name, false)).toEqual([{ channel: 'OIII', from: 'luminance' }])
    for (const name of ['SII', 'S2', 'S-II']) expect(filterChannels(name, false)).toEqual([{ channel: 'SII', from: 'luminance' }])
    expect(filterChannels('Red', false)).toEqual([{ channel: 'R', from: 'luminance' }])
    expect(filterChannels('G', false)).toEqual([{ channel: 'G', from: 'luminance' }])
    expect(filterChannels('blue', false)).toEqual([{ channel: 'B', from: 'luminance' }])
    expect(filterChannels('Lum', false)).toEqual([{ channel: 'L', from: 'luminance' }])
  })

  it('[INS-004] Given a colour camera behind a dual-band filter, When read, Then Ha comes from red and OIII from green and blue', () => {
    for (const name of ['L-eXtreme', 'L-eNhance', 'ALP-T', 'Duo-band', 'LP', 'Ha/OIII']) {
      expect(filterChannels(name, true)).toEqual([{ channel: 'Ha', from: 'red' }, { channel: 'OIII', from: 'green-blue' }])
    }
    expect(filterChannels('L-eXtreme', false)).toEqual([])
  })

  it('[INS-004] Given a colour camera with no filter or a broadband one, When read, Then it gives red, green and blue; a mono camera with none gives luminance', () => {
    expect(filterChannels(null, true).map(c => [c.channel, c.from])).toEqual([['R', 'red'], ['G', 'green'], ['B', 'blue']])
    expect(filterChannels('UV/IR cut', true).map(c => c.channel)).toEqual(['R', 'G', 'B'])
    expect(filterChannels(null, false)).toEqual([{ channel: 'L', from: 'luminance' }])
    expect(filterChannels('Mystery', null)).toEqual([])
  })
})

describe('Possible palettes', () => {
  const masters = [
    { path: '/m/Ha_new.fit', filter: 'Ha', colour: false },
    { path: '/m/Ha_old.fit', filter: 'Ha', colour: false },
    { path: '/m/OIII.fit', filter: 'OIII', colour: false }
  ]

  it('[INS-004] Given Ha and OIII masters and SII lights only, When palettes are listed, Then HOO can be previewed, SHO and HSO are possible but need SII stacked, and RGB needs its filters', () => {
    const sources = channelSources(masters, [
      { filter: 'Ha', colour: false, seconds: 3600 },
      { filter: 'SII', colour: false, seconds: 1800 }
    ])
    expect(sources.find(s => s.channel === 'Ha')).toEqual({ channel: 'Ha', master: { path: '/m/Ha_new.fit', from: 'luminance' }, seconds: 3600 })
    const options = possiblePalettes(sources)
    const by = Object.fromEntries(options.map(o => [o.id, o]))
    expect(by.HOO).toMatchObject({ possible: true, missing: [], unstacked: [], sources: { Ha: { path: '/m/Ha_new.fit' }, OIII: { path: '/m/OIII.fit' } } })
    expect(by.SHO).toMatchObject({ possible: true, unstacked: ['SII'], sources: {} })
    expect(by.HSO.possible).toBe(true)
    expect(by.RGB).toMatchObject({ possible: false, missing: ['R', 'G', 'B'] })
    expect(by.LRGB.missing).toEqual(['R', 'G', 'B', 'L'])
    expect(isPalettePossible('SHO', options)).toBe(true)
    expect(isPalettePossible('RGB', options)).toBe(false)
    expect(isPalettePossible('XYZ', options)).toBe(false)
  })

  it('[INS-004] Given a colour camera stack with no filter, When palettes are listed, Then RGB comes from its three channels, and LRGB needs luminance', () => {
    const options = possiblePalettes(channelSources([{ path: '/m/osc.fit', filter: null, colour: true }], []))
    const rgb = options.find(o => o.id === 'RGB')!
    expect(rgb.possible).toBe(true)
    expect(rgb.sources).toEqual({ R: { path: '/m/osc.fit', from: 'red' }, G: { path: '/m/osc.fit', from: 'green' }, B: { path: '/m/osc.fit', from: 'blue' } })
    expect(options.find(o => o.id === 'LRGB')).toMatchObject({ possible: false, missing: ['L'] })
  })

  it('[INS-004] Given each palette, When its channels are listed, Then they follow red, green, blue and luminance, each once', () => {
    expect(paletteChannels('HOO')).toEqual(['Ha', 'OIII'])
    expect(paletteChannels('SHO')).toEqual(['SII', 'Ha', 'OIII'])
    expect(paletteChannels('LRGB')).toEqual(['R', 'G', 'B', 'L'])
    expect(PALETTES.HSO).toMatchObject({ red: 'Ha', green: 'SII', blue: 'OIII' })
  })
})
