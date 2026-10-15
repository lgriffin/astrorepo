import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { initDatabase } from '../main/db/connection'
import { registerHandlers } from '../main/ipc/handlers'
import { ChannelRouter } from '../main/transport/router'
import { createHttpHost, hostsFor } from '../main/http/http-host'
import { ServedDesktop } from '../main/http/served-desktop'
import { startJobs, type JobsHostEnvironment } from '../main/jobs-host'
import { useAppData } from '../main/composition'
import { loadCatalogueSeedData, useSeedFolder } from '../main/services/catalogue'
import { autoGenerateCatalogueCollections } from '../main/services/collection'
import { serverSettings } from './settings'

/**
 * astrorepo without Electron: the same handlers served over HTTP to a browser or a Raspberry Pi
 * kiosk (specs/035-pi-variant, slice 2). Run `npm run build`, then `npm run serve`.
 */
const settings = serverSettings(process.env, process.platform, os.homedir(), process.cwd())

fs.mkdirSync(settings.dataFolder, { recursive: true })
initDatabase(settings.dataFolder)
useAppData(settings.dataFolder)
useSeedFolder(settings.seedFolder)
try {
  loadCatalogueSeedData()
  autoGenerateCatalogueCollections()
} catch (err) {
  console.error('Seed data loading failed (non-fatal):', err)
}

const router = new ChannelRouter()
registerHandlers(router, new ServedDesktop(path.join(settings.dataFolder, 'exports')))

const quitters: (() => void)[] = []
const environment: JobsHostEnvironment = {
  dataFolder: settings.dataFolder,
  // The server cannot tell whether anyone is at the machine, so the run window never starts a job by
  // itself; Run now still does (PI-013).
  userIdleSeconds: () => 0,
  windowJobs: false,
  preventSleep: () => 0,
  allowSleep: () => undefined,
  onQuit: listener => { quitters.push(listener) }
}
startJobs(environment).catch(err => console.error('The job runner did not start:', err))

const addresses = Object.values(os.networkInterfaces()).flatMap(list => (list ?? []).map(i => i.address))
const server = createHttpHost({
  router,
  staticDir: settings.staticDir,
  token: crypto.randomBytes(24).toString('hex'),
  allowedHosts: hostsFor(os.hostname(), addresses, settings.extraHosts)
})

server.listen(settings.port, settings.bind, () => {
  console.log(`astrorepo is serving ${settings.staticDir} at http://${settings.bind === '0.0.0.0' ? os.hostname() : settings.bind}:${settings.port}/`)
  console.log(`Data folder: ${settings.dataFolder}`)
})

function quit(): void {
  for (const listener of quitters) listener()
  server.close(() => process.exit(0))
}
process.on('SIGINT', quit)
process.on('SIGTERM', quit)
