import type Database from 'better-sqlite3'
import { ulid } from 'ulid'
import type { MosaicWorkspaceStore, RevisionSummary, StoredRevision, WorkspaceRecord, WorkspaceStatus } from '@astro/application'
import type { FieldSource, PlannedPanel, SkyPoint } from '@astro/domain'

interface WorkspaceRow {
  id: string
  name: string
  target_id: string | null
  status: WorkspaceStatus
  created_at: string
  latest: number
}

interface RevisionRow {
  workspace_id: string
  revision: number
  centre_ra_deg: number
  centre_dec_deg: number
  position_angle_deg: number
  grid_rows: number
  grid_columns: number
  overlap_x: number
  overlap_y: number
  field_width_deg: number
  field_height_deg: number
  field_source: FieldSource
  field_label: string | null
  note: string | null
  saved_at: string
}

interface PanelRow {
  panel_id: string
  row: number
  col: number
  ra_deg: number
  dec_deg: number
  position_angle_deg: number
  footprint: string
}

const WORKSPACES = `SELECT w.*, (SELECT MAX(r.revision) FROM mosaic_revisions r WHERE r.workspace_id = w.id) AS latest FROM mosaic_workspaces w`

const toWorkspace = (r: WorkspaceRow): WorkspaceRecord => ({
  id: r.id,
  name: r.name,
  targetId: r.target_id,
  status: r.status,
  createdAt: new Date(r.created_at),
  latestRevision: r.latest
})

/**
 * MosaicWorkspaceStore over mosaic_workspaces, mosaic_revisions and mosaic_panels. A revision and
 * its panels are written in one transaction and never updated; the primary key refuses a second
 * revision with the same number.
 */
export class SqliteMosaicWorkspaceStore implements MosaicWorkspaceStore {
  constructor(private readonly db: Database.Database) {}

  async list(): Promise<WorkspaceRecord[]> {
    return (this.db.prepare(`${WORKSPACES} ORDER BY w.created_at DESC, w.id DESC`).all() as WorkspaceRow[]).map(toWorkspace)
  }

  async get(id: string): Promise<WorkspaceRecord | null> {
    const row = this.db.prepare(`${WORKSPACES} WHERE w.id = ?`).get(id) as WorkspaceRow | undefined
    return row ? toWorkspace(row) : null
  }

  async create(workspace: Pick<WorkspaceRecord, 'name' | 'targetId' | 'createdAt'>, first: Omit<StoredRevision, 'workspaceId' | 'revision'>): Promise<WorkspaceRecord> {
    const id = ulid()
    this.db.transaction(() => {
      this.db
        .prepare("INSERT INTO mosaic_workspaces (id, name, target_id, status, created_at) VALUES (?, ?, ?, 'active', ?)")
        .run(id, workspace.name, workspace.targetId, workspace.createdAt.toISOString())
      this.insertRevision({ ...first, workspaceId: id, revision: 1 })
    })()
    return { id, ...workspace, status: 'active', latestRevision: 1 }
  }

  async addRevision(revision: StoredRevision): Promise<void> {
    this.db.transaction(() => {
      const latest = (this.db.prepare('SELECT MAX(revision) AS n FROM mosaic_revisions WHERE workspace_id = ?').get(revision.workspaceId) as { n: number | null }).n
      if (latest === null) throw new Error(`No mosaic workspace ${revision.workspaceId}.`)
      if (revision.revision !== latest + 1) throw new Error(`Revision ${revision.revision} does not follow revision ${latest}.`)
      this.insertRevision(revision)
    })()
  }

  async revisions(id: string): Promise<StoredRevision[]> {
    const rows = this.db.prepare('SELECT * FROM mosaic_revisions WHERE workspace_id = ? ORDER BY revision').all(id) as RevisionRow[]
    return rows.map(r => this.toRevision(r))
  }

  async history(id: string): Promise<RevisionSummary[]> {
    const rows = this.db
      .prepare('SELECT revision, saved_at, note, grid_rows, grid_columns FROM mosaic_revisions WHERE workspace_id = ? ORDER BY revision')
      .all(id) as { revision: number; saved_at: string; note: string | null; grid_rows: number; grid_columns: number }[]
    return rows.map(r => ({ revision: r.revision, savedAt: new Date(r.saved_at), note: r.note, rows: r.grid_rows, columns: r.grid_columns }))
  }

  async revision(id: string, revision: number): Promise<StoredRevision | null> {
    const row = this.db.prepare('SELECT * FROM mosaic_revisions WHERE workspace_id = ? AND revision = ?').get(id, revision) as RevisionRow | undefined
    return row ? this.toRevision(row) : null
  }

  async update(id: string, change: Partial<Pick<WorkspaceRecord, 'name' | 'status'>>): Promise<void> {
    if (change.name !== undefined) this.db.prepare('UPDATE mosaic_workspaces SET name = ? WHERE id = ?').run(change.name, id)
    if (change.status !== undefined) this.db.prepare('UPDATE mosaic_workspaces SET status = ? WHERE id = ?').run(change.status, id)
  }

  private insertRevision(r: StoredRevision): void {
    const g = r.grid
    this.db
      .prepare(
        `INSERT INTO mosaic_revisions (workspace_id, revision, centre_ra_deg, centre_dec_deg, position_angle_deg, grid_rows, grid_columns,
           overlap_x, overlap_y, field_width_deg, field_height_deg, field_source, field_label, note, saved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(r.workspaceId, r.revision, g.centre.raDeg, g.centre.decDeg, g.positionAngleDeg, g.rows, g.columns, g.overlapX, g.overlapY,
        g.field.widthDeg, g.field.heightDeg, g.field.source, g.field.label, r.note, r.savedAt.toISOString())
    const panel = this.db.prepare(
      `INSERT INTO mosaic_panels (workspace_id, revision, panel_id, row, col, ra_deg, dec_deg, position_angle_deg, footprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const p of r.panels) {
      panel.run(r.workspaceId, r.revision, p.id, p.row, p.column, p.centre.raDeg, p.centre.decDeg, p.positionAngleDeg, JSON.stringify(p.footprint.vertices))
    }
  }

  private toRevision(r: RevisionRow): StoredRevision {
    const panels = (this.db.prepare('SELECT * FROM mosaic_panels WHERE workspace_id = ? AND revision = ? ORDER BY row, col').all(r.workspace_id, r.revision) as PanelRow[]).map(
      (p): PlannedPanel => ({
        id: p.panel_id,
        row: p.row,
        column: p.col,
        centre: { raDeg: p.ra_deg, decDeg: p.dec_deg },
        positionAngleDeg: p.position_angle_deg,
        footprint: { frame: 'ICRS', vertices: JSON.parse(p.footprint) as SkyPoint[] }
      })
    )
    return {
      workspaceId: r.workspace_id,
      revision: r.revision,
      grid: {
        centre: { raDeg: r.centre_ra_deg, decDeg: r.centre_dec_deg },
        positionAngleDeg: r.position_angle_deg,
        rows: r.grid_rows,
        columns: r.grid_columns,
        overlapX: r.overlap_x,
        overlapY: r.overlap_y,
        field: { widthDeg: r.field_width_deg, heightDeg: r.field_height_deg, source: r.field_source, label: r.field_label }
      },
      panels,
      note: r.note,
      savedAt: new Date(r.saved_at)
    }
  }
}
