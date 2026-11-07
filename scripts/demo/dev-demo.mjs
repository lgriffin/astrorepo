/**
 * `npm run dev:demo`: the desktop app in development, on the demo library's data folder
 * (specs/045-developer-experience, DEV-016). Build the demo first with `npm run demo`.
 */
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const data = path.join(root, '.demo', 'data')
if (!fs.existsSync(data)) {
  console.error('There is no demo library yet. Build it with: npm run demo')
  process.exit(1)
}
const cli = path.join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
const child = spawn(process.execPath, [cli, 'dev'], { cwd: root, stdio: 'inherit', env: { ...process.env, ASTRO_DATA: data } })
child.on('exit', code => process.exit(code ?? 0))
