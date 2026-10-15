import { app, BrowserWindow } from 'electron'
import path from 'path'
import { initDatabase } from './db/connection'
import { registerHandlers } from './ipc/handlers'
import { ChannelRouter } from './transport/router'
import { electronDesktop } from './electron/electron-desktop'
import { electronJobsEnvironment } from './electron/jobs-environment'
import { hostOverIpc } from './electron/ipc-host'
import { startJobs } from './jobs-host'
import { composeCompanion, drawNativeThumbnails, inspectOnWorkers, measureOnWorkers, shrinkPicturesWith, useAppData } from './composition'
import { ServedDesktop } from './http/served-desktop'
import { makeCompanionHost, osNetwork } from './http/companion-host'
import { registerCompanionHandlers } from './ipc/companion-handlers'
import { getSetting, setSetting } from './services/settings'
import { nativeThumbnail } from './electron/native-thumbnails'
import { shrinkPicture } from './electron/picture-shrinker'
import createMeasureWorker from './workers/measure-worker?nodeWorker'
import createInspectWorker from './workers/inspect-worker?nodeWorker'
import { loadCatalogueSeedData, useSeedFolder } from './services/catalogue'
import { autoGenerateCatalogueCollections } from './services/collection'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'AstroRepo — Observatory Manager',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  const db = initDatabase(app.getPath('userData'))
  useSeedFolder(app.isPackaged ? path.join(process.resourcesPath, 'data', 'catalogues') : path.join(app.getAppPath(), 'data', 'catalogues'))
  useAppData(app.getPath('userData'))
  const measurer = measureOnWorkers(() => createMeasureWorker({}))
  const pixels = inspectOnWorkers(() => createInspectWorker({}))
  shrinkPicturesWith(shrinkPicture)
  drawNativeThumbnails(nativeThumbnail)
  app.on('will-quit', () => {
    void measurer.dispose()
    void pixels.dispose()
  })
  try {
    loadCatalogueSeedData()
    autoGenerateCatalogueCollections()
  } catch (err) {
    console.error('Seed data loading failed (non-fatal):', err)
  }
  const router = new ChannelRouter()
  registerHandlers(router, electronDesktop)
  // Companion screens get the same channels with the served Desktop, so nothing they do opens a
  // dialog on this PC (specs/035-pi-variant, companion slice).
  const companionRouter = new ChannelRouter()
  registerHandlers(companionRouter, new ServedDesktop(path.join(app.getPath('userData'), 'exports')))
  const companion = () => composeCompanion(db)
  const companionHost = makeCompanionHost({
    router: companionRouter,
    staticDir: path.join(__dirname, '../renderer'),
    companion,
    settings: { get: getSetting, set: setSetting },
    network: osNetwork
  })
  registerCompanionHandlers(router, { host: companionHost, companion })
  hostOverIpc(router)
  companionHost.resume().catch(err => console.error('Companion screens were not served:', err))
  app.on('will-quit', () => { void companionHost.stop() })
  startJobs(electronJobsEnvironment()).catch(err => console.error('The job runner did not start:', err))
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
