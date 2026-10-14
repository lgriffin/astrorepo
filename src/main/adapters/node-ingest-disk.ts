import fs from 'fs'
import path from 'path'
import type { IngestDisk, IngestWriter } from '@astro/application'

const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT'

/** IngestDisk on the local disk or a mounted share: where copies from the scope land. */
export class NodeIngestDisk implements IngestDisk {
  join(dir: string, ...parts: string[]): string {
    return path.join(dir, ...parts)
  }

  async exists(p: string): Promise<boolean> {
    return fs.promises.stat(p).then(() => true, () => false)
  }

  async size(p: string): Promise<number | null> {
    try {
      const st = await fs.promises.stat(p)
      return st.isFile() ? st.size : null
    } catch (e) {
      if (missing(e)) return null
      throw e
    }
  }

  async append(p: string, from: number): Promise<IngestWriter> {
    await fs.promises.mkdir(path.dirname(p), { recursive: true })
    const handle = await fs.promises.open(p, 'a+')
    try {
      await handle.truncate(Math.max(0, from))
    } catch (e) {
      await handle.close()
      throw e
    }
    let closed = false
    return {
      write: async chunk => {
        await handle.appendFile(chunk)
      },
      close: async () => {
        if (closed) return
        closed = true
        await handle.close()
      }
    }
  }

  async rename(from: string, to: string): Promise<void> {
    await fs.promises.rename(from, to)
  }

  async remove(p: string): Promise<void> {
    await fs.promises.rm(p, { force: true })
  }

  async readText(p: string): Promise<string | null> {
    try {
      return await fs.promises.readFile(p, 'utf8')
    } catch (e) {
      if (missing(e)) return null
      throw e
    }
  }

  async writeText(p: string, text: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(p), { recursive: true })
    const tmp = `${p}.${process.pid}.tmp`
    await fs.promises.writeFile(tmp, text, 'utf8')
    await fs.promises.rename(tmp, p)
  }

  async freeBytes(p: string): Promise<number | null> {
    let at = path.resolve(p)
    // The folder a copy goes into is made as it starts, so ask about the nearest folder there is.
    for (;;) {
      const stats = await fs.promises.statfs(at).catch(() => null)
      if (stats) return Number(stats.bavail) * Number(stats.bsize)
      const up = path.dirname(at)
      if (up === at) return null
      at = up
    }
  }
}
