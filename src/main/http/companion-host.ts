import fs from 'fs'
import type http from 'http'
import os from 'os'
import path from 'path'
import type { Companion } from '@astro/application'
import type { ChannelRouter } from '../transport/router'
import { createHttpHost, hostsFor } from './http-host'

/** The port companions reach the PC on unless the person picks another. */
export const DEFAULT_COMPANION_PORT = 8090

/** What Settings → Companion screens shows about the PC's side. */
export interface CompanionHostStatus {
  enabled: boolean
  running: boolean
  port: number
  /** Addresses a companion can open, when running. */
  addresses: string[]
  /** Why it is not running although it is on, or null. */
  problem: string | null
}

export interface NetworkView {
  hostname: string
  /** Every address of every interface, for the Host check. */
  addresses: string[]
  /** The addresses worth showing: IPv4, not loopback. */
  shown: string[]
}

export interface CompanionHostOptions {
  /** Channels with the served Desktop, so nothing a companion does opens a dialog on the PC. */
  router: ChannelRouter
  staticDir: string
  companion: () => Companion
  settings: { get(key: string): string | null; set(key: string, value: string): void }
  network: () => NetworkView
  /** Listens on every interface; tests listen on loopback. */
  listen?: (server: http.Server, port: number) => Promise<void>
}

export interface CompanionHost {
  status(): CompanionHostStatus
  setEnabled(enabled: boolean, port?: number): Promise<CompanionHostStatus>
  /** At start: serves companions again when the person left it on. */
  resume(): Promise<CompanionHostStatus>
  stop(): Promise<void>
}

/** This PC's names and addresses, from the operating system. */
export function osNetwork(): NetworkView {
  const interfaces = Object.values(os.networkInterfaces()).flatMap(list => list ?? [])
  return {
    hostname: os.hostname(),
    addresses: interfaces.map(i => i.address),
    shown: interfaces.filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address)
  }
}

const listenEverywhere = (server: http.Server, port: number) =>
  new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject)
      resolve()
    })
  })

const validPort = (n: number) => Number.isInteger(n) && n >= 1024 && n <= 65535

/**
 * The desktop app's companion host (specs/035-pi-variant, PI-017): when "Allow companion screens" is
 * on, the same pages and channels are served to the home network, for paired screens only.
 */
export function makeCompanionHost(options: CompanionHostOptions): CompanionHost {
  let server: http.Server | null = null
  let problem: string | null = null
  const listen = options.listen ?? listenEverywhere

  const enabled = () => options.settings.get('companion_enabled') === 'true'
  const port = () => {
    const n = Number(options.settings.get('companion_port'))
    return validPort(n) ? n : DEFAULT_COMPANION_PORT
  }

  function status(): CompanionHostStatus {
    const net = options.network()
    const names = server ? [`${net.hostname}.local`, ...net.shown] : []
    return { enabled: enabled(), running: server !== null, port: port(), addresses: names.map(n => `http://${n}:${port()}/`), problem }
  }

  async function start(): Promise<void> {
    problem = null
    if (!fs.existsSync(path.join(options.staticDir, 'index.html'))) {
      problem = 'The pages companions are served are not built. Build astrorepo (npm run build) and turn this on again.'
      return
    }
    const candidate = createHttpHost({
      router: options.router,
      staticDir: options.staticDir,
      companions: options.companion(),
      // Asked on each request, so an address the PC gains while serving works as soon as Settings shows it.
      allowedHosts: () => {
        const net = options.network()
        return hostsFor(net.hostname, net.addresses, [])
      }
    })
    try {
      await listen(candidate, port())
      server = candidate
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      problem = code === 'EADDRINUSE' ? `Port ${port()} is already in use on this PC. Choose another port.` : `Companions cannot be served: ${(error as Error).message}`
    }
  }

  async function stop(): Promise<void> {
    const closing = server
    server = null
    if (closing) {
      closing.closeAllConnections()
      await new Promise<void>(resolve => closing.close(() => resolve()))
    }
  }

  // Turning on and off runs one change at a time, and each starts only if the saved choice is still
  // on, so quick changes in Settings never leave the PC listening while the setting says off.
  let changes: Promise<unknown> = Promise.resolve()
  const oneAtATime = <T>(work: () => Promise<T>): Promise<T> => {
    const run = changes.then(work)
    changes = run.catch(() => undefined)
    return run
  }

  return {
    status,
    setEnabled(on, newPort) {
      if (newPort !== undefined && !validPort(newPort)) return Promise.reject(new Error('The companion port is a whole number from 1024 to 65535.'))
      if (newPort !== undefined) options.settings.set('companion_port', String(newPort))
      options.settings.set('companion_enabled', on ? 'true' : 'false')
      return oneAtATime(async () => {
        await stop()
        problem = null
        if (enabled()) await start()
        return status()
      })
    },
    resume() {
      return oneAtATime(async () => {
        if (enabled() && !server) await start()
        return status()
      })
    },
    stop: () => oneAtATime(stop)
  }
}
