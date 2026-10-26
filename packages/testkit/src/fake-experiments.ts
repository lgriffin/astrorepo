import type { ContentHasher, ExperimentRecord, ExperimentStore, FolderFile, NewExperiment, OutputFolder, VariantRun } from '@astro/application'
import type { OutputFile } from '@astro/domain'

const copy = <T>(value: T): T => structuredClone(value)

/** Experiments in memory, ids e1, e2 … and their variants e1-A, e1-B …, newest first. */
export class InMemoryExperimentStore implements ExperimentStore {
  readonly experiments = new Map<string, ExperimentRecord>()
  private next = 1

  async list(targetId: string): Promise<ExperimentRecord[]> {
    return [...this.experiments.values()]
      .filter(e => e.targetId === targetId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.number - a.number)
      .map(copy)
  }

  async get(id: string): Promise<ExperimentRecord | null> {
    const e = this.experiments.get(id)
    return e ? copy(e) : null
  }

  async create(experiment: NewExperiment): Promise<ExperimentRecord> {
    const id = `e${this.next++}`
    const record: ExperimentRecord = {
      ...copy(experiment),
      id,
      preferredVariantId: null,
      variants: experiment.variants.map(v => ({ ...copy(v), id: `${id}-${v.letter}`, run: null, outputs: null, outputsRecordedAt: null }))
    }
    this.experiments.set(id, record)
    return copy(record)
  }

  private variant(variantId: string) {
    for (const e of this.experiments.values()) {
      const v = e.variants.find(x => x.id === variantId)
      if (v) return v
    }
    return null
  }

  async recordRun(variantId: string, run: VariantRun): Promise<void> {
    const v = this.variant(variantId)
    if (v) v.run = copy(run)
  }

  async recordOutputs(variantId: string, outputs: OutputFile[], at: Date): Promise<void> {
    const v = this.variant(variantId)
    if (!v || v.outputs) return
    v.outputs = copy(outputs)
    v.outputsRecordedAt = at
  }

  async prefer(experimentId: string, variantId: string | null): Promise<void> {
    const e = this.experiments.get(experimentId)
    if (e) e.preferredVariantId = variantId
  }
}

/** Folders and files as text, so tests can change a file and see its hash change. */
export class InMemoryOutputFolder implements OutputFolder, Pick<ContentHasher, 'fullHash'> {
  readonly files = new Map<string, { content: string; modifiedAt: Date }>()
  readonly hashed: string[] = []
  /** Folders that exist even with nothing in them. */
  readonly folders = new Set<string>()

  put(path: string, content: string, modifiedAt = new Date('2026-10-26T09:00:00Z')): this {
    this.files.set(path, { content, modifiedAt })
    return this
  }

  async list(dir: string): Promise<FolderFile[] | null> {
    const inside = [...this.files.keys()].filter(p => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
    if (inside.length === 0) return this.folders.has(dir) ? [] : null
    return inside.sort().map(path => ({ path, name: path.slice(dir.length + 1), sizeBytes: (this.files.get(path) as { content: string }).content.length }))
  }

  async stat(path: string): Promise<{ sizeBytes: number; modifiedAt: Date } | null> {
    const f = this.files.get(path)
    return f ? { sizeBytes: f.content.length, modifiedAt: f.modifiedAt } : null
  }

  async fullHash(path: string): Promise<string> {
    const f = this.files.get(path)
    if (!f) throw new Error(`no such file: ${path}`)
    this.hashed.push(path)
    return `sha:${f.content}`
  }
}
