import type { MosaicAssignmentStore, MosaicWorkspaceStore, RevisionSummary, StoredRevision, WorkspaceRecord } from '@astro/application'
import { DEFAULT_GRID_OVERLAP, type AssignmentOverride, type GridDefinition } from '@astro/domain'

const copy = <T>(value: T): T => structuredClone(value)

/** Mosaic workspaces in memory, ids w1, w2, ... in the order they are made. */
export class InMemoryMosaicWorkspaceStore implements MosaicWorkspaceStore {
  readonly workspaces = new Map<string, WorkspaceRecord>()
  readonly saved = new Map<string, StoredRevision[]>()
  private next = 1

  async list(): Promise<WorkspaceRecord[]> {
    return [...this.workspaces.values()].map(copy).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
  }

  async get(id: string): Promise<WorkspaceRecord | null> {
    const w = this.workspaces.get(id)
    return w ? copy(w) : null
  }

  async create(workspace: Pick<WorkspaceRecord, 'name' | 'targetId' | 'createdAt'>, first: Omit<StoredRevision, 'workspaceId' | 'revision'>): Promise<WorkspaceRecord> {
    const id = `w${this.next++}`
    const record: WorkspaceRecord = { id, ...workspace, status: 'active', latestRevision: 1 }
    this.workspaces.set(id, record)
    this.saved.set(id, [copy({ ...first, workspaceId: id, revision: 1 })])
    return copy(record)
  }

  async addRevision(revision: StoredRevision): Promise<void> {
    const w = this.workspaces.get(revision.workspaceId)
    if (!w) throw new Error(`No mosaic workspace ${revision.workspaceId}.`)
    if (revision.revision !== w.latestRevision + 1) throw new Error(`Revision ${revision.revision} does not follow revision ${w.latestRevision}.`)
    this.saved.get(w.id)?.push(copy(revision))
    w.latestRevision = revision.revision
  }

  async revisions(id: string): Promise<StoredRevision[]> {
    return (this.saved.get(id) ?? []).map(copy)
  }

  async history(id: string): Promise<RevisionSummary[]> {
    return (this.saved.get(id) ?? []).map(r => ({ revision: r.revision, savedAt: new Date(r.savedAt), note: r.note, rows: r.grid.rows, columns: r.grid.columns }))
  }

  async revision(id: string, revision: number): Promise<StoredRevision | null> {
    const r = (this.saved.get(id) ?? []).find(x => x.revision === revision)
    return r ? copy(r) : null
  }

  async update(id: string, change: Partial<Pick<WorkspaceRecord, 'name' | 'status'>>): Promise<void> {
    const w = this.workspaces.get(id)
    if (w) Object.assign(w, change)
  }
}

/** A grid for tests: 2 by 2 over M 31 with a Seestar-sized field, 15% overlap, up axis north. */
export function gridDefinition(over: Partial<GridDefinition> = {}): GridDefinition {
  return {
    centre: { raDeg: 10.6847, decDeg: 41.2688 },
    positionAngleDeg: 0,
    rows: 2,
    columns: 2,
    overlapX: DEFAULT_GRID_OVERLAP,
    overlapY: DEFAULT_GRID_OVERLAP,
    field: { widthDeg: 0.72, heightDeg: 1.28, source: 'manual', label: null },
    ...over
  }
}

/** Overrides in memory, one per capture per workspace. */
export class InMemoryMosaicAssignmentStore implements MosaicAssignmentStore {
  /** Per workspace, every change in the order made; null overrides are clears. */
  readonly changes = new Map<string, { captureId: string; revision: number; override: AssignmentOverride | null }[]>()

  async overrides(workspaceId: string, revision: number): Promise<AssignmentOverride[]> {
    const latest = new Map<string, { revision: number; override: AssignmentOverride | null }>()
    for (const c of this.changes.get(workspaceId) ?? []) {
      const had = latest.get(c.captureId)
      if (c.revision <= revision && (!had || c.revision >= had.revision)) latest.set(c.captureId, c)
    }
    return [...latest.values()]
      .map(c => c.override)
      .filter((o): o is AssignmentOverride => o !== null)
      .map(copy)
      .sort((a, b) => a.captureId.localeCompare(b.captureId))
  }

  async set(workspaceId: string, override: AssignmentOverride): Promise<void> {
    this.record(workspaceId, override.captureId, override.revision, copy(override))
  }

  async clear(workspaceId: string, captureId: string, revision: number): Promise<void> {
    this.record(workspaceId, captureId, revision, null)
  }

  private record(workspaceId: string, captureId: string, revision: number, override: AssignmentOverride | null) {
    const all = (this.changes.get(workspaceId) ?? []).filter(c => !(c.captureId === captureId && c.revision === revision))
    this.changes.set(workspaceId, [...all, { captureId, revision, override }])
  }
}
