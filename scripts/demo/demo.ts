/**
 * `npm run demo`: builds the demo library (specs/045-developer-experience, D4) and indexes it into
 * its own data folder through the headless server, so the app shows real-looking pages for
 * development, screenshots and docs without touching your own data.
 *
 *   npm run demo                 build .demo/library and index it into .demo/data
 *   npm run demo -- --serve      then keep serving it at http://127.0.0.1:8090
 *   npm run demo -- --out <dir>  build somewhere else
 *
 * The desktop app opens it with `npm run dev:demo`. Everything under the folder is rebuilt each time.
 */
import fs from 'fs'
import path from 'path'
import { freePort, root, serve, servedInvoker } from '../shared/served-app'
import { seedLibrary, writeSampleLibrary } from '../../src/main/sample/sample-data'
import { DEMO_MARKER, mayClear } from './library'

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  if (i < 0) return undefined
  const value = process.argv[i + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a folder`)
  return value
}
const out = path.resolve(arg('--out') ?? path.join(root, '.demo'))
const keepServing = process.argv.includes('--serve')

async function main(): Promise<void> {
  const library = path.join(out, 'library')
  const data = path.join(out, 'data')
  const clear = mayClear(out, root, fs.existsSync(out) ? fs.readdirSync(out) : null)
  if (!clear.ok) throw new Error(`Not building the demo: ${clear.reason}.`)
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(path.join(out, DEMO_MARKER), 'Made by npm run demo; the next run clears this folder.\n')
  const count = writeSampleLibrary(library)
  console.log(`Wrote ${count} files to ${path.relative(root, library) || library}`)

  const port = keepServing ? Number(process.env.ASTRO_PORT ?? 8090) : await freePort()
  const server = await serve(port, data)
  try {
    const base = `http://127.0.0.1:${port}`
    const invoke = await servedInvoker(base)
    const { targets } = await seedLibrary(invoke, library)
    console.log(`Indexed ${targets} targets into ${path.relative(root, data) || data}`)
    if (keepServing) {
      console.log(`\nThe demo is at ${base} (Ctrl+C to stop).`)
      await new Promise(() => undefined)
    }
    console.log('\nOpen it with `npm run demo -- --serve` (in a browser) or `npm run dev:demo` (the desktop app).')
  } finally {
    if (!keepServing) server.kill()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
