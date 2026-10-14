import fs from 'fs'
import path from 'path'
import type { LandingArea } from '@astro/application'

/** The path itself or its closest ancestor that exists. */
async function nearestExisting(p: string): Promise<string> {
  let current = path.resolve(p)
  for (;;) {
    if (await fs.promises.stat(current).then(() => true, () => false)) return current
    const up = path.dirname(current)
    if (up === current) return current
    current = up
  }
}

/** The folder on this PC that copies from a scope land in (spec 033). Reads only, and follows no link under its root. */
export class NodeLandingArea implements LandingArea {
  join(root: string, parts: string[]): string {
    let at = root
    for (const part of parts) {
      at = path.join(at, part)
      // A link or junction under the root could send copies anywhere, so none is followed.
      const link = (() => {
        try {
          return fs.lstatSync(at).isSymbolicLink()
        } catch {
          return false
        }
      })()
      if (link) throw new Error(`${at} is a link to another folder, so nothing is copied through it.`)
    }
    return at
  }

  async folders(dir: string): Promise<string[]> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])
    return entries.filter(e => e.isDirectory()).map(e => e.name).sort()
  }

  async sizes(paths: string[]): Promise<(number | null)[]> {
    return Promise.all(paths.map(p => fs.promises.stat(p).then(s => (s.isFile() ? s.size : -1), () => null)))
  }

  async freeBytes(dir: string): Promise<number | null> {
    const stats = await fs.promises.statfs(await nearestExisting(dir)).catch(() => null)
    return stats ? Number(stats.bavail) * Number(stats.bsize) : null
  }
}
