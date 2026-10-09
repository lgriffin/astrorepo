import fs from 'fs'
import path from 'path'
import type { RunArea } from '@astro/application'
import { FAILED_FOLDER, MANIFEST_SUFFIX, STEP_FOLDER, type StackManifest } from '@astro/domain'
import { ownFolder } from './node-siril-workspace'

export { STEP_FOLDER }

/** Whether `p` is inside `dir`, both resolved. */
function inside(dir: string, p: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(p))
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/**
 * A plain folder of the work folder, made when missing. Throws when it is a link or resolves
 * outside the work folder, so nothing the app writes or moves can land elsewhere through it.
 */
async function ownSubfolder(workDir: string, folder: string): Promise<string> {
  await fs.promises.mkdir(path.join(workDir, folder), { recursive: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  })
  return (await ownFolder(workDir, folder)) as string
}

/** RunArea on the local disk. Every write lands inside the work folder it is given. */
export class NodeRunArea implements RunArea {
  async readText(file: string): Promise<string> {
    return fs.promises.readFile(file, 'utf8')
  }

  async writeStep(workDir: string, name: string, text: string): Promise<string> {
    if (name !== path.basename(name)) throw new Error(`${name} is not a plain file name.`)
    const dir = await ownSubfolder(workDir, STEP_FOLDER)
    const file = path.join(dir, name)
    await fs.promises.writeFile(file, text, 'utf8')
    return file
  }

  async setAside(workDir: string, run: string, paths: string[]): Promise<string[]> {
    const mine = paths.filter(p => inside(workDir, p))
    if (mine.length === 0) return []
    await ownSubfolder(workDir, FAILED_FOLDER)
    const dir = await ownSubfolder(workDir, `${FAILED_FOLDER}/${path.basename(run)}`)
    const moved: string[] = []
    for (const p of mine) {
      const to = path.join(dir, path.basename(p))
      await fs.promises.rename(p, to)
      moved.push(to)
      // A manifest an earlier run published beside this file no longer describes it.
      for (const side of [`${p}${MANIFEST_SUFFIX}`, `${p}${MANIFEST_SUFFIX}.tmp`]) {
        await fs.promises.rename(side, path.join(dir, path.basename(side))).catch(error => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        })
      }
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
