import fs from 'fs'
import path from 'path'
import type { JobLogs } from '@astro/application'

/** One log file per job in a folder the app owns. */
export class FileJobLogs implements JobLogs {
  constructor(private readonly dir: string) {}

  private file(jobId: string): string {
    // Job ids are ULIDs; anything else never names a file.
    if (!/^[A-Za-z0-9_-]+$/.test(jobId)) throw new Error(`Not a job id: ${jobId}`)
    return path.join(this.dir, `${jobId}.log`)
  }

  append(jobId: string, text: string): void {
    fs.mkdirSync(this.dir, { recursive: true })
    fs.appendFileSync(this.file(jobId), text)
  }

  async read(jobId: string, maxBytes: number): Promise<string> {
    const file = this.file(jobId)
    let handle: fs.promises.FileHandle
    try {
      handle = await fs.promises.open(file, 'r')
    } catch {
      return ''
    }
    try {
      const { size } = await handle.stat()
      const length = Math.min(size, maxBytes)
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, size - length)
      return buffer.toString('utf8')
    } finally {
      await handle.close()
    }
  }
}
