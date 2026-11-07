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
import { encodeRgbPng } from '../../src/main/fits/png-encoder'
import { freePort, root, serve, servedInvoker } from '../shared/served-app'
import { DEMO_SITE, DEMO_TARGETS, demoFiles, demoLoggedNights } from './library'
import { fitsFile, greyLevels, pictureRgb, starfield, tiffFile, DEMO_SIZE } from './encode'

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const out = path.resolve(arg('--out') ?? path.join(root, '.demo'))
const keepServing = process.argv.includes('--serve')

/** Writes every file of the library under `library`. */
function writeLibrary(library: string): number {
  const files = demoFiles()
  files.forEach((f, i) => {
    const file = path.join(library, ...f.path.split('/'))
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const hue = DEMO_TARGETS.findIndex(t => t.name === f.target)
    const field = starfield(hue * 1000 + (f.kind === 'light' ? i : 0))
    if (f.kind === 'light' || f.kind === 'master') fs.writeFileSync(file, fitsFile(f.cards ?? {}, field))
    else if (f.kind === 'tif') fs.writeFileSync(file, tiffFile(greyLevels(field)))
    else fs.writeFileSync(file, encodeRgbPng(DEMO_SIZE, DEMO_SIZE, pictureRgb(greyLevels(field), hue)))
  })
  return files.length
}

async function waitForScan(invoke: <T>(channel: string, args?: unknown) => Promise<T>): Promise<{ status: string; error: string | null; totalTargetsFound: number }> {
  for (let i = 0; i < 600; i++) {
    const p = await invoke<{ status: string; error: string | null; totalTargetsFound: number }>('home:scan-progress')
    if (p.status === 'done' || p.status === 'error' || p.status === 'cancelled') return p
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('The library scan did not finish within 150 seconds')
}

async function main(): Promise<void> {
  const library = path.join(out, 'library')
  const data = path.join(out, 'data')
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(data, { recursive: true })
  const count = writeLibrary(library)
  console.log(`Wrote ${count} files to ${path.relative(root, library) || library}`)

  const port = keepServing ? Number(process.env.ASTRO_PORT ?? 8090) : await freePort()
  const server = await serve(port, data)
  try {
    const base = `http://127.0.0.1:${port}`
    const invoke = await servedInvoker(base)
    await invoke('settings:set', { key: 'home_folder_path', value: library })
    await invoke('settings:set-site', DEMO_SITE)
    for (const night of demoLoggedNights()) await invoke('sessions:create', night)
    const started = await invoke<{ started: boolean; reason?: string }>('home:scan-start')
    if (!started.started) throw new Error(`The library scan did not start: ${started.reason ?? 'no reason given'}`)
    const scan = await waitForScan(invoke)
    if (scan.status !== 'done') throw new Error(`The library scan ended ${scan.status}${scan.error ? `: ${scan.error}` : ''}`)
    console.log(`Indexed ${scan.totalTargetsFound} targets into ${path.relative(root, data) || data}`)
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
