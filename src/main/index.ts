import { app, BrowserWindow } from 'electron'
import path from 'path'
import { initDatabase } from './db/connection'
import { registerIpcHandlers } from './ipc/handlers'
import { loadCatalogueSeedData } from './services/catalogue'
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
  initDatabase()
  try {
    loadCatalogueSeedData()
    autoGenerateCatalogueCollections()
  } catch (err) {
    console.error('Seed data loading failed (non-fatal):', err)
  }
  registerIpcHandlers()
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
