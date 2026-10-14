import { describe, expect, it } from 'vitest'
import { parseVesperaSettings } from '@astro/domain'
import { indexingText, toVesperaSettingsView, vesperaAddress } from '../../src/main/adapters/vespera-presenter'

describe('Vespera presenter', () => {
  it('[VIN-028] Given a copy that ended, When the indexing of its files is shown, Then it says how indexing them is going', () => {
    expect(indexingText({ kind: 'none' })).toBeNull()
    expect(indexingText({ kind: 'home-scan', status: 'scanning', error: null })).toMatch(/^Scanning the home folder/)
    expect(indexingText({ kind: 'home-scan', status: 'done', error: null })).toMatch(/show on their targets/)
    expect(indexingText({ kind: 'home-scan', status: 'error', error: 'disk gone' })).toBe('The home folder scan failed: disk gone. Scan again from Library.')
    expect(indexingText({ kind: 'home-scan', status: 'cancelled', error: null })).toMatch(/cancelled/)
    expect(indexingText({ kind: 'home-scan', status: 'idle', error: null })).toBeNull()
    expect(indexingText({ kind: 'folder-scan', folder: 'D:\\V', done: false, error: null })).toBe('Scanning D:\\V for the copies…')
    expect(indexingText({ kind: 'folder-scan', folder: 'D:\\V', done: true, error: null })).toBe('D:\\V was scanned: the copies show in FITS files.')
    expect(indexingText({ kind: 'folder-scan', folder: 'D:\\V', done: true, error: 'Scan already in progress' })).toMatch(/were not scanned/)
  })

  it('[VSP-014] Given settings that could not be read, When shown, Then each says what is used instead', () => {
    const view = toVesperaSettingsView(parseVesperaSettings({ vespera_host: 'nonsense here', vespera_formats: 'json' }, '/home/raw'))
    expect(view).toEqual({
      address: '10.0.0.1', landingRoot: '/home/raw', landingIsDefault: true, formats: ['fits', 'tiff'],
      notes: ['The saved Vespera address is not an address, so 10.0.0.1 is used.', 'The saved kinds of file to copy include no images, so FITS and TIFF are copied.']
    })
    expect(vesperaAddress({ host: 'v', port: 2121 })).toBe('v:2121')
  })
})
