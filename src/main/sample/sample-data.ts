/**
 * Sample data on first run (specs/046-everyday-ux, U5): the demo library built into a folder of
 * the app's own, opened with a database of its own, so someone can see every page with something
 * in it before they point the app at their files. Their own database is never opened while the
 * sample is on, and leaving removes only the folder the sample made.
 */
import fs from 'fs'
import path from 'path'
import { encodeRgbPng } from '../fits/png-encoder'
import { DEMO_MARKER, DEMO_SITE, DEMO_TARGETS, demoFiles, demoLoggedNights } from './library'
import { DEMO_SIZE, fitsFile, greyLevels, pictureRgb, starfield, tiffFile } from './encode'

/** Writes every file of the demo library under `library`; returns how many. */
export function writeSampleLibrary(library: string): number {
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

/** Calls a channel, the way the router, the served app and a test fake all can. */
export type SeedInvoke = <T>(channel: string, args?: unknown) => Promise<T>

interface ScanProgress {
  status: string
  error: string | null
  totalTargetsFound: number
}

/**
 * Indexes a written library through the app's own channels: the home folder and site, a scan to
 * the end, then the logged nights on the targets the scan made. Used by `npm run demo` and by the
 * sample on its first start.
 */
export async function seedLibrary(invoke: SeedInvoke, library: string, wait: { tries?: number; everyMs?: number } = {}): Promise<{ targets: number }> {
  const tries = wait.tries ?? 600
  const everyMs = wait.everyMs ?? 250
  await invoke('settings:set', { key: 'home_folder_path', value: library })
  await invoke('settings:set-site', DEMO_SITE)
  const started = await invoke<{ started: boolean; reason?: string }>('home:scan-start')
  if (!started.started) throw new Error(`The library scan did not start: ${started.reason ?? 'no reason given'}`)
  let scan: ScanProgress | null = null
  for (let i = 0; i < tries && !scan; i++) {
    const p = await invoke<ScanProgress>('home:scan-progress')
    if (p.status === 'done' || p.status === 'error' || p.status === 'cancelled') scan = p
    else await new Promise(r => setTimeout(r, everyMs))
  }
  if (!scan) throw new Error(`The library scan did not finish within ${Math.round((tries * everyMs) / 1000)} seconds`)
  if (scan.status !== 'done') throw new Error(`The library scan ended ${scan.status}${scan.error ? `: ${scan.error}` : ''}`)
  const mine = await invoke<{ targets: Array<{ id: string; canonicalName: string; aliases: string[] }> }>('targets:search', { query: '', scope: 'mine', limit: 100 })
  for (const { target, folder, ...night } of demoLoggedNights()) {
    const match = mine.targets.find(t => [t.canonicalName, ...t.aliases].some(n => n.replace(/\s+/g, '') === folder))
    if (!match) throw new Error(`The scan did not find ${target}`)
    // A seed cut short is run again from the start, so a night already logged is not logged twice.
    const logged = await invoke<{ total: number }>('sessions:list', { target_id: match.id, from_date: night.date, to_date: night.date })
    if (logged.total === 0) await invoke('sessions:create', { ...night, target_ids: [match.id] })
  }
  return { targets: scan.totalTargetsFound }
}

/** The setting the sample's own database keeps once it has been indexed, so it is indexed once. */
export const SAMPLE_SEEDED_KEY = 'sample_seeded'

/** Where the sample lives, inside the app's data folder: its files, its database, and the switch. */
export function samplePlaces(userData: string): { root: string; library: string; data: string; modeFile: string } {
  const root = path.join(userData, 'sample')
  return { root, library: path.join(root, 'library'), data: path.join(root, 'data'), modeFile: path.join(userData, 'sample-mode.json') }
}

/**
 * Whether the app opens the sample rather than the person's own data (EUX-014): the switch is on
 * and the sample's data folder is still there, so a sample removed by hand never stops the app.
 */
export function sampleActive(userData: string): boolean {
  const { modeFile, data } = samplePlaces(userData)
  try {
    return (JSON.parse(fs.readFileSync(modeFile, 'utf8')) as { active?: unknown }).active === true && fs.statSync(data).isDirectory()
  } catch {
    return false
  }
}

const marked = (root: string) => fs.existsSync(path.join(root, DEMO_MARKER))

/**
 * Builds the sample and turns it on for the next start (EUX-014). A sample folder left from before
 * is rebuilt; a folder of that name the app did not make is refused and left as it is.
 */
export function startSample(userData: string): { ok: true; files: number } | { ok: false; error: string } {
  const { root, library, data, modeFile } = samplePlaces(userData)
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0 && !marked(root)) {
    return { ok: false, error: `${root} holds files the app did not make, so the sample was not built there.` }
  }
  fs.rmSync(root, { recursive: true, force: true })
  fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(path.join(root, DEMO_MARKER), 'Sample data made by AstroRepo; leaving the sample removes this folder.\n')
  const files = writeSampleLibrary(library)
  // A new file in place of whatever was there, so a link at that name is replaced, never followed.
  fs.rmSync(modeFile, { force: true })
  fs.writeFileSync(modeFile, JSON.stringify({ active: true }) + '\n', { flag: 'wx' })
  return { ok: true, files }
}

/** Turns the sample off for the next start (EUX-016); its folder goes once its database is closed. */
export function leaveSample(userData: string): void {
  fs.rmSync(samplePlaces(userData).modeFile, { force: true })
}

/**
 * On a start with the sample off, removes the sample's folder if one is left (EUX-016). Only a
 * folder holding the sample's marker is removed; anything else is not touched.
 */
export function tidyAfterSample(userData: string): boolean {
  const { root } = samplePlaces(userData)
  if (sampleActive(userData)) return false
  // A switch left on for a sample that is gone is turned off.
  leaveSample(userData)
  if (!fs.existsSync(root) || !marked(root)) return false
  fs.rmSync(root, { recursive: true, force: true })
  return true
}
