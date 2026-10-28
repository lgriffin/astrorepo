import type Database from 'better-sqlite3'
import type { TargetFacts, TargetFactsSource } from '@astro/application'

/** TargetFactsSource over the targets, catalogue_entries and target_aliases tables (specs/042-learning). */
export class SqliteTargetFacts implements TargetFactsSource {
  constructor(private readonly db: Database.Database) {}

  async facts(targetId: string): Promise<TargetFacts | null> {
    const target = this.db
      .prepare('SELECT canonical_name, angular_size_arcmin FROM targets WHERE id = ?')
      .get(targetId) as { canonical_name: string; angular_size_arcmin: number | null } | undefined
    if (!target) return null
    const designations = this.db
      .prepare('SELECT designation AS name FROM catalogue_entries WHERE target_id = ? ORDER BY designation')
      .all(targetId) as { name: string }[]
    const aliases = this.db
      .prepare('SELECT alias AS name FROM target_aliases WHERE target_id = ? ORDER BY alias')
      .all(targetId) as { name: string }[]
    return {
      names: [target.canonical_name, ...designations.map(d => d.name), ...aliases.map(a => a.name)],
      angularSizeArcmin: target.angular_size_arcmin
    }
  }
}
