import type { AssignmentOverride, FilterSeconds, GridDefinition, PlannedPanel } from '@astro/domain'

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

/** A line of a workspace's history: enough to list a revision without reading its panels. */
export interface RevisionSummary {
  revision: number
  savedAt: Date
  note: string | null
  rows: number
  columns: number
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
  /** The same revisions as summaries, oldest first, without their panels. */
  history(id: string): Promise<RevisionSummary[]>
  revision(id: string, revision: number): Promise<StoredRevision | null>
  update(id: string, change: Partial<Pick<WorkspaceRecord, 'name' | 'status'>>): Promise<void>
}

/**
 * Driven port: what the user said about captures on a workspace (put on a panel, or left out),
 * kept apart from what is computed so working placements out again never loses it (MO-009).
 * Each change is kept with the revision it was made on, so a later change never alters what an
 * earlier revision shows. Adapters: SQLite (desktop), in-memory (testkit).
 */
export interface MosaicAssignmentStore {
  /** The overrides in force at a revision: per capture, the last one made on that revision or before, unless cleared then. */
  overrides(workspaceId: string, revision: number): Promise<AssignmentOverride[]>
  /** Sets the capture's override from its revision on, replacing one made on the same revision. */
  set(workspaceId: string, override: AssignmentOverride): Promise<void>
  /** Clears it from that revision on, so the computed placement counts again there; earlier revisions keep theirs. */
  clear(workspaceId: string, captureId: string, revision: number, at: Date): Promise<void>
}

/**
 * Driven port: a target's integration goals, one per filter, which each panel of its mosaic is
 * measured against (MO-008). Adapters: SQLite (desktop), in-memory (testkit).
 */
export interface IntegrationGoalSource {
  /** The target's goals by filter, in seconds, ordered by filter; empty when none is set. */
  goalsOf(targetId: string): Promise<FilterSeconds[]>
}
