import fs from 'fs'
import path from 'path'
import type { RunArea } from '@astro/application'
import { FAILED_FOLDER, MANIFEST_SUFFIX, type StackManifest } from '@astro/domain'

/** The work folder's own subfolder for the steps the app writes (NFR-015). */
export const STEP_FOLDER = '.astrorepo'

/** Whether `p` is inside `dir`, both resolved. */
function inside(dir: string, p: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(p))
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** RunArea on the local disk. Every write lands inside the work folder it is given. */
export class NodeRunArea implements RunArea {
  async readText(file: string): Promise<string> {
    return fs.promises.readFile(file, 'utf8')
  }

  async writeStep(workDir: string, name: string, text: string): Promise<string> {
    if (name !== path.basename(name)) throw new Error(`${name} is not a plain file name.`)
    const dir = path.join(workDir, STEP_FOLDER)
    await fs.promises.mkdir(dir, { recursive: true })
    const file = path.join(dir, name)
    await fs.promises.writeFile(file, text, 'utf8')
    return file
  }

  async setAside(workDir: string, run: string, paths: string[]): Promise<string[]> {
    const dir = path.join(workDir, FAILED_FOLDER, path.basename(run))
    const moved: string[] = []
    for (const p of paths) {
      if (!inside(workDir, p)) continue
      await fs.promises.mkdir(dir, { recursive: true })
      const to = path.join(dir, path.basename(p))
      await fs.promises.rename(p, to)
      moved.push(to)
    }
    return moved
  }

  async writeManifest(resultPath: string, manifest: StackManifest): Promise<string> {
    const file = `${resultPath}${MANIFEST_SUFFIX}`
    // Written whole to a temporary name and then renamed, so a reader never sees half a manifest.
    await fs.promises.writeFile(`${file}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    await fs.promises.rename(`${file}.tmp`, file)
    return file
  }
}
