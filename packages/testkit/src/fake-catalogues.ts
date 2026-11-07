import { CROSS_REFERENCE, type CatalogueRepairPlan, type InstalledTarget, type LinkedItem, type SeedAlias, type SeedCatalogue } from '@astro/domain'
import type { CatalogueSeeds, CatalogueStore } from '@astro/application'

/** The built-in catalogues held in memory (specs/047-catalogue-names). */
export class InMemoryCatalogueSeeds implements CatalogueSeeds {
  constructor(
    private readonly catalogues: SeedCatalogue[],
    private readonly version = 'test'
  ) {}

  async read(): Promise<{ version: string; catalogues: SeedCatalogue[] }> {
    return { version: this.catalogues.length > 0 ? this.version : '', catalogues: this.catalogues }
  }
}

/** A target as an install was left by an earlier seeder, for CatalogueStore fakes and contract suites. */
export interface InstallTarget {
  id: string
  canonicalName: string
  isCustom?: boolean
  /** Workflow stage; anything but not_observed makes the target the user's. */
  stage?: string
  aliases?: SeedAlias[]
  entries?: Array<{ catalogue: string; designation: string }>
}

/** An install's catalogue state: what an earlier seeder and the user's library left in it. */
export interface CatalogueInstall {
  version?: string
  catalogues: Array<Omit<SeedCatalogue, 'objects'>>
  targets: InstallTarget[]
  frames?: Array<{ id: string; targetId: string; objectName: string | null; folderName: string | null }>
  folders?: Array<{ id: string; targetId: string; name: string }>
}

/** CatalogueStore in memory, with the same rules as the SQLite one. */
export class InMemoryCatalogueStore implements CatalogueStore {
  private saved: string | null
  private catalogues: Array<Omit<SeedCatalogue, 'objects'>>
  private targets: Array<Required<Omit<InstallTarget, 'aliases' | 'entries'>> & { facts?: unknown }>
  private aliases: Array<{ targetId: string } & SeedAlias>
  private entries: Array<{ targetId: string; catalogue: string; designation: string }>
  private frames: NonNullable<CatalogueInstall['frames']>
  private folders: NonNullable<CatalogueInstall['folders']>
  /** Each target's facts as last written, for tests. */
  readonly facts = new Map<string, unknown>()

  constructor(install: CatalogueInstall = { catalogues: [], targets: [] }) {
    this.saved = install.version ?? null
    this.catalogues = [...install.catalogues]
    this.targets = install.targets.map(t => ({ id: t.id, canonicalName: t.canonicalName, isCustom: t.isCustom ?? false, stage: t.stage ?? 'not_observed' }))
    this.aliases = install.targets.flatMap(t => (t.aliases ?? []).map(a => ({ targetId: t.id, ...a })))
    this.entries = install.targets.flatMap(t => (t.entries ?? []).map(e => ({ targetId: t.id, ...e })))
    this.frames = [...(install.frames ?? [])]
    this.folders = [...(install.folders ?? [])]
  }

  async version(): Promise<string | null> {
    return this.saved
  }

  async installed(): Promise<InstalledTarget[]> {
    return this.targets.map(t => ({
      id: t.id,
      canonicalName: t.canonicalName,
      isCustom: t.isCustom,
      isYours: t.isCustom || t.stage !== 'not_observed' || this.frames.some(f => f.targetId === t.id) || this.folders.some(f => f.targetId === t.id),
      aliases: this.aliases.filter(a => a.targetId === t.id).map(({ alias, source }) => ({ alias, source })),
      entries: this.entries.filter(e => e.targetId === t.id).map(({ catalogue, designation }) => ({ catalogue, designation }))
    }))
  }

  async linked(targetIds: string[]): Promise<{ frames: LinkedItem[]; folders: LinkedItem[] }> {
    return {
      frames: this.frames.filter(f => targetIds.includes(f.targetId)).map(f => ({ id: f.id, targetId: f.targetId, name: f.objectName, folderName: f.folderName })),
      folders: this.folders.filter(f => targetIds.includes(f.targetId)).map(f => ({ id: f.id, targetId: f.targetId, name: f.name }))
    }
  }

  async apply(plan: CatalogueRepairPlan, catalogues: Array<Omit<SeedCatalogue, 'objects'>>, version: string): Promise<void> {
    const abbreviations = catalogues.map(c => c.abbreviation)
    this.catalogues = [...this.catalogues.filter(c => !abbreviations.includes(c.abbreviation)), ...catalogues]
    this.aliases = this.aliases.filter(a => a.source !== CROSS_REFERENCE && !abbreviations.includes(a.source))
    this.entries = this.entries.filter(e => !abbreviations.includes(e.catalogue))
    this.targets = this.targets.filter(t => !plan.remove.includes(t.id))
    for (const t of plan.create) this.targets.push({ id: t.id, canonicalName: t.canonicalName, isCustom: false, stage: 'not_observed' })
    for (const t of [...plan.create, ...plan.update]) this.facts.set(t.id, t.facts)
    for (const a of plan.aliases) if (!this.aliases.some(x => x.alias === a.alias)) this.aliases.push(a)
    for (const e of plan.entries) {
      if (!this.entries.some(x => x.catalogue === e.catalogue && (x.designation === e.designation || x.targetId === e.targetId))) this.entries.push(e)
    }
    for (const m of plan.frames) this.frames = this.frames.map(f => (f.id === m.id ? { ...f, targetId: m.targetId } : f))
    for (const m of plan.folders) this.folders = this.folders.map(f => (f.id === m.id ? { ...f, targetId: m.targetId } : f))
    this.saved = version
  }
}
