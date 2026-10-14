import { describe, expect, it } from 'vitest'
import { DEFAULT_VESPERA_FORMATS, copyPace, isScopeHost, parseVesperaSettings } from '@astro/domain'

describe('Vespera settings', () => {
  it('[VSP-014] Given nothing saved, When read, Then the defaults are used: 10.0.0.1 on port 21, FITS and TIFF, landing in the home raw folder', () => {
    expect(parseVesperaSettings({}, '/nas/home/raw')).toEqual({
      host: '10.0.0.1', port: 21, landingRoot: '/nas/home/raw', landingIsHomeRaw: true, formats: ['fits', 'tiff'], ignored: []
    })
    expect(parseVesperaSettings({}, null).landingRoot).toBeNull()
  })

  it('[VSP-012] Given a landing folder of its own and an address with a port, When read, Then both are used', () => {
    const s = parseVesperaSettings({ vespera_host: ' vespera.local:2121 ', vespera_landing: 'D:\\Vespera', vespera_formats: 'tiff, FITS' }, '/home/raw')
    expect(s).toMatchObject({ host: 'vespera.local', port: 2121, landingRoot: 'D:\\Vespera', landingIsHomeRaw: false, formats: ['fits', 'tiff'], ignored: [] })
  })

  it('[VSP-014] Given an unreadable address or no image kinds, When read, Then the defaults are used and each is reported as not read', () => {
    for (const bad of ['10.0.0.300', 'not an address', '10.0.0.1:0', '10.0.0.1:99999', 'a:b:c', '-bad-.host']) {
      const s = parseVesperaSettings({ vespera_host: bad }, null)
      expect([s.host, s.port, s.ignored]).toEqual(['10.0.0.1', 21, ['vespera_host']])
    }
    expect(parseVesperaSettings({ vespera_host: '10.0.0.1:21' }, null).ignored).toEqual([])
    expect(parseVesperaSettings({ vespera_formats: 'json' }, null)).toMatchObject({ formats: [...DEFAULT_VESPERA_FORMATS], ignored: ['vespera_formats'] })
    expect(parseVesperaSettings({ vespera_formats: 'png,raw' }, null).ignored).toEqual(['vespera_formats'])
    expect(parseVesperaSettings({ vespera_formats: '' }, null).ignored).toEqual([])
  })

  it('[VSP-014] Given addresses, When checked, Then IPv4 addresses and host names pass and other text does not', () => {
    expect(['10.0.0.1', '192.168.4.1', 'vespera', 'vespera-pro.local'].every(isScopeHost)).toBe(true)
    expect(['10.0.0', '10.0.0.256', '', 'a_b', 'x..y', '-x', `${'a'.repeat(64)}.com`].some(isScopeHost)).toBe(false)
  })
})

describe('copy pace', () => {
  it('[VIN-029] Given bytes done over time, When the pace is read, Then speed and time left follow, and the first second gives none', () => {
    expect(copyPace(0, 1000, 5000)).toEqual({ fraction: 0, bytesPerSecond: null, remainingSeconds: null })
    expect(copyPace(500, 1000, 999)).toEqual({ fraction: 0.5, bytesPerSecond: null, remainingSeconds: null })
    expect(copyPace(500, 1000, 2000)).toEqual({ fraction: 0.5, bytesPerSecond: 250, remainingSeconds: 2 })
    expect(copyPace(10, 0, 2000)).toMatchObject({ fraction: 1, remainingSeconds: 0 })
    expect(copyPace(2000, 1000, 2000)).toMatchObject({ fraction: 1, remainingSeconds: 0 })
    expect(copyPace(-5, -1, Number.NaN)).toEqual({ fraction: 1, bytesPerSecond: null, remainingSeconds: null })
  })
})
