import type Database from 'better-sqlite3'
import { ulid } from 'ulid'
import type { ExperimentRecord, ExperimentStore, NewExperiment, VariantRecord, VariantRun } from '@astro/application'
import type { OutputFile, Profile, Quality, VariantLetter } from '@astro/domain'

interface ExperimentRow {
  id: string
  target_id: string
  number: number
  name: string
  objective: string
  input_path: string
  input_size: number
  input_modified_at: string | null
  input_sha256: string
  preferred_variant_id: string | null
  created_at: string
}

interface VariantRow {
  id: string
  letter: VariantLetter
  profile: Profile
  quality: Quality
  output_label: string
  output_dir: string
  run: string | null
  outputs: string | null
  outputs_recorded_at: string | null
}

const toRun = (json: string): VariantRun => {
  const r = JSON.parse(json) as Omit<VariantRun, 'queuedAt'> & { queuedAt: string }
  return { ...r, queuedAt: new Date(r.queuedAt) }
}

/** ExperimentStore over experiments and experiment_variants; a run and its outputs are kept as JSON. */
export class SqliteExperimentStore implements ExperimentStore {
  constructor(private readonly db: Database.Database) {}

  private toRecord(r: ExperimentRow): ExperimentRecord {
    const variants = this.db.prepare('SELECT * FROM experiment_variants WHERE experiment_id = ? ORDER BY letter').all(r.id) as VariantRow[]
    return {
      id: r.id,
      targetId: r.target_id,
      number: r.number,
      name: r.name,
      objective: r.objective,
      input: { path: r.input_path, sizeBytes: r.input_size, modifiedAt: r.input_modified_at ? new Date(r.input_modified_at) : null, sha256: r.input_sha256 },
      variants: variants.map(
        (v): VariantRecord => ({
          id: v.id,
          letter: v.letter,
          parameters: { profile: v.profile, quality: v.quality },
          outputLabel: v.output_label,
          outputDir: v.output_dir,
          run: v.run ? toRun(v.run) : null,
          outputs: v.outputs ? (JSON.parse(v.outputs) as OutputFile[]) : null,
          outputsRecordedAt: v.outputs_recorded_at ? new Date(v.outputs_recorded_at) : null
        })
      ),
      preferredVariantId: r.preferred_variant_id,
      createdAt: new Date(r.created_at)
    }
  }

  async list(targetId: string): Promise<ExperimentRecord[]> {
    return (this.db.prepare('SELECT * FROM experiments WHERE target_id = ? ORDER BY created_at DESC, number DESC').all(targetId) as ExperimentRow[]).map(r => this.toRecord(r))
  }

  async get(id: string): Promise<ExperimentRecord | null> {
    const row = this.db.prepare('SELECT * FROM experiments WHERE id = ?').get(id) as ExperimentRow | undefined
    return row ? this.toRecord(row) : null
  }

  async create(e: NewExperiment): Promise<ExperimentRecord> {
    const id = ulid()
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO experiments (id, target_id, number, name, objective, input_path, input_size, input_modified_at, input_sha256, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, e.targetId, e.number, e.name, e.objective, e.input.path, e.input.sizeBytes, e.input.modifiedAt?.toISOString() ?? null, e.input.sha256, e.createdAt.toISOString())
      const insert = this.db.prepare('INSERT INTO experiment_variants (id, experiment_id, letter, profile, quality, output_label, output_dir) VALUES (?, ?, ?, ?, ?, ?, ?)')
      for (const v of e.variants) insert.run(ulid(), id, v.letter, v.parameters.profile, v.parameters.quality, v.outputLabel, v.outputDir)
    })()
    return (await this.get(id)) as ExperimentRecord
  }

  async recordRun(variantId: string, run: VariantRun): Promise<void> {
    this.db.prepare('UPDATE experiment_variants SET run = ? WHERE id = ?').run(JSON.stringify({ ...run, queuedAt: run.queuedAt.toISOString() }), variantId)
  }

  async recordOutputs(variantId: string, outputs: OutputFile[], at: Date): Promise<void> {
    this.db.prepare('UPDATE experiment_variants SET outputs = ?, outputs_recorded_at = ? WHERE id = ? AND outputs IS NULL').run(JSON.stringify(outputs), at.toISOString(), variantId)
  }

  async prefer(experimentId: string, variantId: string | null): Promise<void> {
    this.db.prepare('UPDATE experiments SET preferred_variant_id = ? WHERE id = ?').run(variantId, experimentId)
  }
}
