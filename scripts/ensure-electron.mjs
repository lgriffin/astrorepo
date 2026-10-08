// Ensures the Electron binary is downloaded; npm install can skip its
// postinstall script, which makes `electron-vite dev` fail with "Electron uninstall".
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electronDir = dirname(require.resolve('electron/package.json'))

if (!existsSync(join(electronDir, 'path.txt'))) {
  console.log('Electron binary missing, downloading...')
  execSync('node install.js', { cwd: electronDir, stdio: 'inherit' })
}
