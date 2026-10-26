import type { CompletionRule, ProjectKind, ProjectStatus, ProjectWindow } from '@astro/domain'

/** An astronomy project as kept (specs/038-astronomy-projects). */
export interface ProjectRecord {
  id: string
  name: string
  kind: ProjectKind
  status: ProjectStatus
  rule: CompletionRule
  /** The dates a seasonal campaign is shot in; null for other kinds. */
  window: ProjectWindow | null
  /** The catalogue or collection it was started from, linked, never merged: membership is not task state. */
  catalogueId: string | null
  collectionId: string | null
  /** The mosaic workspace a mosaic campaign tracks. */
  workspaceId: string | null
  /** Its targets, in the order they were added. */
  targetIds: string[]
  createdAt: Date
  updatedAt: Date
}

export type NewProject = Omit<ProjectRecord, 'id' | 'status' | 'updatedAt'>

/**
 * Driven port: astronomy projects and their targets. Progress is never kept here; it is worked
 * out from the index each time (AP-002). Adapters: SQLite (desktop), in-memory (testkit).
 */
export interface ProjectStore {
  /** Every project, newest first. */
  list(): Promise<ProjectRecord[]>
  get(id: string): Promise<ProjectRecord | null>
  /** Creates an active project; the store gives it its id. */
  create(project: NewProject): Promise<ProjectRecord>
  update(id: string, change: Partial<Pick<ProjectRecord, 'name' | 'status' | 'rule' | 'window'>>, at: Date): Promise<void>
  /** Adds targets after those it has, each once; ones it has already are left where they are. */
  addTargets(id: string, targetIds: string[], at: Date): Promise<void>
  removeTarget(id: string, targetId: string, at: Date): Promise<void>
}

/** A catalogue or collection a project can start from. */
export interface ProjectSource {
  id: string
  name: string
  /** Targets in it. */
  size: number
}

/**
 * Driven port: what a project links to, read only: catalogues and collections with their
 * targets, and target names. Adapters: SQLite (desktop), in-memory (testkit).
 */
export interface ProjectSources {
  catalogues(): Promise<ProjectSource[]>
  /** The catalogue's targets in designation order; empty when there is no such catalogue. */
  catalogueTargets(catalogueId: string): Promise<string[]>
  collections(): Promise<ProjectSource[]>
  /** The collection's targets in the order they were added; empty when there is no such collection. */
  collectionTargets(collectionId: string): Promise<string[]>
  /** The names of those targets that exist; unknown ids are left out. */
  targetNames(targetIds: string[]): Promise<Map<string, string>>
}
