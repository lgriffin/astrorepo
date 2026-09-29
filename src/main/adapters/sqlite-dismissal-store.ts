import type Database from 'better-sqlite3'
import type { DismissalStore } from '@astro/application'
import type { Dismissal } from '@astro/domain'

/** DismissalStore over the dismissed_suggestions table. */
export class SqliteDismissalStore implements DismissalStore {
  constructor(private readonly db: Database.Database) {}

  async listDismissals(): Promise<Dismissal[]> {
    const rows = this.db.prepare(
      'SELECT suggestion_id, target_id, fingerprint, dismissed_at FROM dismissed_suggestions ORDER BY dismissed_at'
    ).all() as { suggestion_id: string; target_id: string; fingerprint: string; dismissed_at: string }[]
    return rows.map(r => ({
      suggestionId: r.suggestion_id,
      targetId: r.target_id,
      fingerprint: r.fingerprint,
      dismissedAt: new Date(r.dismissed_at)
    }))
  }

  async saveDismissal(d: Dismissal): Promise<void> {
    this.db.prepare(
      `INSERT INTO dismissed_suggestions (suggestion_id, target_id, fingerprint, dismissed_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(suggestion_id) DO UPDATE SET target_id = excluded.target_id,
         fingerprint = excluded.fingerprint, dismissed_at = excluded.dismissed_at`
    ).run(d.suggestionId, d.targetId, d.fingerprint, d.dismissedAt.toISOString())
  }
}
