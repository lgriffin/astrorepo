import type { GridDefinition, PlannedPanel } from '@astro/domain'

export type WorkspaceStatus = 'active' | 'archived'

/** A mosaic workspace: a named plan on the sky, revised by saving new revisions. */
export interface WorkspaceRecord {
  id: string
  name: string
  /** The target it was started from, if any; the plan does not depend on it. */
  targetId: string | null
  status: WorkspaceStatus
  createdAt: Date
  /** The newest revision; revisions count from 1. */
  latestRevision: number
}

/** One saved revision of a workspace: the grid as defined and the panels laid out from it, never changed once saved. */
export interface StoredRevision {
  workspaceId: string
  revision: number
  grid: GridDefinition
  panels: PlannedPanel[]
  note: string | null
  savedAt: Date
}

/**
 * Driven port: mosaic workspaces and their revisions. A revision, once added, is kept as it was
 * saved, so captures placed on it stay traceable. Adapters: SQLite (desktop), in-memory (testkit).
 */
export interface MosaicWorkspaceStore {
  /** Every workspace, newest first. */
  list(): Promise<WorkspaceRecord[]>
  get(id: string): Promise<WorkspaceRecord | null>
  /** Creates a workspace with its first revision; the store gives it its id. */
  create(workspace: Pick<WorkspaceRecord, 'name' | 'targetId' | 'createdAt'>, first: Omit<StoredRevision, 'workspaceId' | 'revision'>): Promise<WorkspaceRecord>
  /** Adds the next revision; refuses (throws) when that number is not one past the latest. */
  addRevision(revision: StoredRevision): Promise<void>
  /** A workspace's revisions, oldest first. */
  revisions(id: string): Promise<StoredRevision[]>
  revision(id: string, revision: number): Promise<StoredRevision | null>
  update(id: string, change: Partial<Pick<WorkspaceRecord, 'name' | 'status'>>): Promise<void>
}
