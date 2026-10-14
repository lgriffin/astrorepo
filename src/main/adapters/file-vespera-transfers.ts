import fs from 'fs'
import path from 'path'
import type { VesperaTransferStore } from '@astro/application'
import type { TransferJob } from '@astro/domain'

/** The index of transfers kept beside the copies, at the top of the folder they land in. */
export const TRANSFER_INDEX_FILE = 'astrorepo.transfers.json'

/**
 * VesperaTransferStore as one JSON file at the top of the folder copies land in (spec 034), so the
 * index travels with the repository it describes. Written whole through a temporary file, so a
 * reader never sees half of it. With no file (no landing folder yet) it keeps jobs in memory.
 */
export class FileVesperaTransferStore implements VesperaTransferStore {
  private memory: TransferJob[] = []

  constructor(private readonly file: string | null) {}

  private async load(): Promise<TransferJob[]> {
    if (this.file === null) return this.memory
    try {
      const doc = JSON.parse(await fs.promises.readFile(this.file, 'utf8')) as { jobs?: unknown }
      return Array.isArray(doc.jobs) ? (doc.jobs as TransferJob[]) : []
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw new Error(`${this.file} could not be read, so no transfer was recorded: ${(error as Error).message}`, { cause: error })
    }
  }

  private async write(jobs: TransferJob[]): Promise<void> {
    if (this.file === null) {
      this.memory = jobs
      return
    }
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    await fs.promises.writeFile(tmp, JSON.stringify({ schema: 1, jobs }, null, 2), 'utf8')
    await fs.promises.rename(tmp, this.file)
  }

  async save(job: TransferJob): Promise<void> {
    const jobs = (await this.load()).filter(j => j.id !== job.id)
    await this.write([...jobs, structuredClone(job)])
  }

  async get(id: string): Promise<TransferJob | null> {
    return (await this.load()).find(j => j.id === id) ?? null
  }

  async list(): Promise<TransferJob[]> {
    return [...(await this.load())].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? -1 : 1))
  }
}
