import type Database from 'better-sqlite3'
import type { CompanionDevice, CompanionDeviceStore } from '@astro/application'
import type { CompanionScreen } from '@astro/domain'

interface Row {
  id: string
  name: string
  key_hash: string
  screen: string
  paired_at: string
  last_seen_at: string | null
}

const toDevice = (r: Row): CompanionDevice => ({
  id: r.id,
  name: r.name,
  keyHash: r.key_hash,
  screen: r.screen as CompanionScreen,
  pairedAt: new Date(r.paired_at),
  lastSeenAt: r.last_seen_at === null ? null : new Date(r.last_seen_at)
})

const COLUMNS = 'id, name, key_hash, screen, paired_at, last_seen_at'

/** CompanionDeviceStore over the companion_devices table. */
export class SqliteCompanionStore implements CompanionDeviceStore {
  constructor(private readonly db: Database.Database) {}

  async listCompanions(): Promise<CompanionDevice[]> {
    return (this.db.prepare(`SELECT ${COLUMNS} FROM companion_devices ORDER BY paired_at, id`).all() as Row[]).map(toDevice)
  }

  async companionByKeyHash(keyHash: string): Promise<CompanionDevice | null> {
    const row = this.db.prepare(`SELECT ${COLUMNS} FROM companion_devices WHERE key_hash = ?`).get(keyHash) as Row | undefined
    return row ? toDevice(row) : null
  }

  async addCompanion(d: CompanionDevice): Promise<void> {
    this.db.prepare(`INSERT INTO companion_devices (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`).run(
      d.id, d.name, d.keyHash, d.screen, d.pairedAt.toISOString(), d.lastSeenAt?.toISOString() ?? null
    )
  }

  async removeCompanion(id: string): Promise<boolean> {
    return this.db.prepare('DELETE FROM companion_devices WHERE id = ?').run(id).changes > 0
  }

  async setCompanionScreen(id: string, screen: CompanionScreen): Promise<boolean> {
    return this.db.prepare('UPDATE companion_devices SET screen = ? WHERE id = ?').run(screen, id).changes > 0
  }

  async markCompanionSeen(id: string, at: Date): Promise<void> {
    this.db.prepare('UPDATE companion_devices SET last_seen_at = ? WHERE id = ?').run(at.toISOString(), id)
  }
}
