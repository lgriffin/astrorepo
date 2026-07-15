import Database from 'better-sqlite3'

export function initFts(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS targets_fts USING fts5(
      canonical_name,
      aliases,
      description,
      constellation,
      content='',
      tokenize='unicode61 remove_diacritics 2'
    );
  `)

  const hasTriggers = sqlite
    .prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='trigger' AND name='targets_fts_insert'")
    .get() as { cnt: number }

  if (hasTriggers.cnt === 0) {
    sqlite.exec(`
      CREATE TRIGGER targets_fts_insert AFTER INSERT ON targets BEGIN
        INSERT INTO targets_fts(rowid, canonical_name, aliases, description, constellation)
        VALUES (
          new.rowid,
          new.canonical_name,
          COALESCE((SELECT group_concat(alias, ' | ') FROM target_aliases WHERE target_id = new.id), ''),
          COALESCE(new.description, ''),
          COALESCE(new.constellation, '')
        );
      END;

      CREATE TRIGGER targets_fts_delete AFTER DELETE ON targets BEGIN
        INSERT INTO targets_fts(targets_fts, rowid, canonical_name, aliases, description, constellation)
        VALUES (
          'delete',
          old.rowid,
          old.canonical_name,
          COALESCE((SELECT group_concat(alias, ' | ') FROM target_aliases WHERE target_id = old.id), ''),
          COALESCE(old.description, ''),
          COALESCE(old.constellation, '')
        );
      END;

      CREATE TRIGGER targets_fts_update AFTER UPDATE ON targets BEGIN
        INSERT INTO targets_fts(targets_fts, rowid, canonical_name, aliases, description, constellation)
        VALUES (
          'delete',
          old.rowid,
          old.canonical_name,
          COALESCE((SELECT group_concat(alias, ' | ') FROM target_aliases WHERE target_id = old.id), ''),
          COALESCE(old.description, ''),
          COALESCE(old.constellation, '')
        );
        INSERT INTO targets_fts(rowid, canonical_name, aliases, description, constellation)
        VALUES (
          new.rowid,
          new.canonical_name,
          COALESCE((SELECT group_concat(alias, ' | ') FROM target_aliases WHERE target_id = new.id), ''),
          COALESCE(new.description, ''),
          COALESCE(new.constellation, '')
        );
      END;

      CREATE TRIGGER target_alias_insert AFTER INSERT ON target_aliases BEGIN
        UPDATE targets SET updated_at = datetime('now') WHERE id = new.target_id;
      END;

      CREATE TRIGGER target_alias_delete AFTER DELETE ON target_aliases BEGIN
        UPDATE targets SET updated_at = datetime('now') WHERE id = old.target_id;
      END;
    `)
  }
}

export function rebuildFtsIndex(sqlite: Database.Database): void {
  sqlite.exec("DELETE FROM targets_fts;")
  sqlite.exec(`
    INSERT INTO targets_fts(rowid, canonical_name, aliases, description, constellation)
    SELECT
      t.rowid,
      t.canonical_name,
      COALESCE((SELECT group_concat(ta.alias, ' | ') FROM target_aliases ta WHERE ta.target_id = t.id), ''),
      COALESCE(t.description, ''),
      COALESCE(t.constellation, '')
    FROM targets t;
  `)
}
