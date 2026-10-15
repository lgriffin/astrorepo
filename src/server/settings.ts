import path from 'path'

/** How the headless server starts, read from its environment (specs/035-pi-variant, PI-013). */
export interface ServerSettings {
  dataFolder: string
  seedFolder: string
  staticDir: string
  bind: string
  port: number
  extraHosts: string[]
}

/** The port the server listens on unless ASTRO_PORT says otherwise. */
export const DEFAULT_PORT = 8090

/**
 * Reads ASTRO_DATA, ASTRO_STATIC, ASTRO_BIND, ASTRO_PORT and ASTRO_HOSTS. The data folder defaults
 * to the desktop app's own (`%APPDATA%\astrorepo`, `~/Library/Application Support/astrorepo` or
 * `~/.config/astrorepo`), so both see the same library on one machine. The server binds to
 * 127.0.0.1 unless told otherwise, so nothing on the network reaches it by accident.
 */
export function serverSettings(env: Record<string, string | undefined>, platform: string, home: string, cwd: string): ServerSettings {
  const appData = platform === 'win32'
    ? env.APPDATA ?? path.join(home, 'AppData', 'Roaming')
    : platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support')
      : env.XDG_CONFIG_HOME ?? path.join(home, '.config')
  const port = Number(env.ASTRO_PORT)
  if (env.ASTRO_PORT !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) {
    throw new Error(`ASTRO_PORT must be a port number from 1 to 65535, not "${env.ASTRO_PORT}".`)
  }
  return {
    dataFolder: env.ASTRO_DATA || path.join(appData, 'astrorepo'),
    seedFolder: path.join(cwd, 'data', 'catalogues'),
    staticDir: env.ASTRO_STATIC || path.join(cwd, 'out', 'renderer'),
    bind: env.ASTRO_BIND || '127.0.0.1',
    port: env.ASTRO_PORT === undefined ? DEFAULT_PORT : port,
    extraHosts: (env.ASTRO_HOSTS ?? '').split(',').map(h => h.trim()).filter(h => h.length > 0)
  }
}
