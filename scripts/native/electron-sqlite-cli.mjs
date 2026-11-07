#!/usr/bin/env node
// Runs the Electron better-sqlite3 build (electron-sqlite.mjs) for this checkout: on install, and with
// --force from `npm run native:electron`, which replaces a build Electron will not load (DEV-002).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchElectronSqlite } from './electron-sqlite.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
fetchElectronSqlite({ root, force: process.argv.includes('--force') })
