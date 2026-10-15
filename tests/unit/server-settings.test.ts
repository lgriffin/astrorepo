import path from 'path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PORT, serverSettings } from '../../src/server/settings'

describe('The headless server settings (specs/035-pi-variant)', () => {
  it('[PI-013] Given no settings on Linux, When read, Then it binds to 127.0.0.1 on the default port and shares the desktop app\'s data folder', () => {
    const s = serverSettings({}, 'linux', '/home/pi', '/opt/astrorepo')
    expect(s).toEqual({
      dataFolder: path.join('/home/pi', '.config', 'astrorepo'),
      seedFolder: path.join('/opt/astrorepo', 'data', 'catalogues'),
      staticDir: path.join('/opt/astrorepo', 'out', 'renderer'),
      bind: '127.0.0.1',
      port: DEFAULT_PORT,
      extraHosts: []
    })
    expect(DEFAULT_PORT).toBe(8090)
  })

  it('[PI-013] Given Windows and macOS, When read, Then the data folder is where Electron keeps it', () => {
    expect(serverSettings({ APPDATA: 'C:\\Users\\leigh\\AppData\\Roaming' }, 'win32', 'C:\\Users\\leigh', 'C:\\astro').dataFolder).toBe(path.join('C:\\Users\\leigh\\AppData\\Roaming', 'astrorepo'))
    expect(serverSettings({}, 'darwin', '/Users/leigh', '/x').dataFolder).toBe(path.join('/Users/leigh', 'Library', 'Application Support', 'astrorepo'))
    expect(serverSettings({ XDG_CONFIG_HOME: '/cfg' }, 'linux', '/home/pi', '/x').dataFolder).toBe(path.join('/cfg', 'astrorepo'))
  })

  it('[PI-013] Given ASTRO_ settings, When read, Then each overrides its default', () => {
    const s = serverSettings({ ASTRO_DATA: '/mnt/nas/astrorepo', ASTRO_STATIC: '/srv/ui', ASTRO_BIND: '0.0.0.0', ASTRO_PORT: '9000', ASTRO_HOSTS: 'astropi, observatory ,' }, 'linux', '/home/pi', '/x')
    expect(s).toMatchObject({ dataFolder: '/mnt/nas/astrorepo', staticDir: '/srv/ui', bind: '0.0.0.0', port: 9000, extraHosts: ['astropi', 'observatory'] })
  })

  it('[PI-014] Given an ASTRO_PORT that is not a port number, When read, Then the server refuses to start and says why', () => {
    for (const bad of ['abc', '0', '70000', '80.5', '']) {
      expect(() => serverSettings({ ASTRO_PORT: bad }, 'linux', '/h', '/x')).toThrow(`ASTRO_PORT must be a port number from 1 to 65535, not "${bad}".`)
    }
  })
})
