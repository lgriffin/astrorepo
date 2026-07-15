# Seed Data Flow

When the application starts, it checks whether catalogue data has already been loaded into the database. If not (first run, or after a database reset), it reads JSON seed files from the `data/catalogues/` directory and populates the targets, catalogues, catalogue entries, and aliases tables. The loader performs deduplication by matching incoming objects against existing targets by name and known aliases, so re-running the seed process is safe and idempotent. After all catalogue data is loaded, the FTS (full-text search) index is rebuilt and auto-generated collections are created -- one per catalogue -- so users immediately have browsable groupings.

```mermaid
flowchart TD
    Start(["App Startup<br/>(main process ready)"]) --> CheckDB{"Catalogues table<br/>has rows?"}

    CheckDB -- "Yes (already seeded)" --> SkipSeed["Skip seeding,<br/>continue startup"]
    CheckDB -- "No (empty database)" --> ScanDir["Scan data/catalogues/<br/>for JSON seed files"]

    ScanDir --> LoadFile["Load next JSON<br/>seed file"]

    LoadFile --> ParseCat["Parse catalogue metadata<br/>(name, abbreviation,<br/>total_objects, is_builtin)"]
    ParseCat --> InsertCat["Insert into catalogues table"]

    InsertCat --> NextObj{"More objects<br/>in file?"}

    NextObj -- "Yes" --> ReadObj["Read next object<br/>(name, type, RA, Dec,<br/>magnitude, aliases)"]

    ReadObj --> MatchCheck{"Match existing target<br/>by canonical_name<br/>or alias?"}

    MatchCheck -- "Match found" --> LinkExisting["Use existing target_id"]
    MatchCheck -- "No match" --> CreateTarget["Insert new target<br/>into targets table"]

    CreateTarget --> SetStage["Set workflow_stage<br/>= 'planned'"]
    SetStage --> LinkExisting

    LinkExisting --> InsertEntry["Insert catalogue_entry<br/>(catalogue_id, target_id,<br/>designation)"]

    InsertEntry --> InsertAliases["Insert target_aliases<br/>(alias, source)<br/>skip duplicates"]

    InsertAliases --> NextObj

    NextObj -- "No" --> MoreFiles{"More JSON<br/>seed files?"}

    MoreFiles -- "Yes" --> LoadFile
    MoreFiles -- "No" --> RebuildFTS["Rebuild FTS5<br/>search index<br/>(targets + aliases)"]

    RebuildFTS --> GenCollections["Auto-generate collections<br/>(one per catalogue,<br/>is_auto = true,<br/>source_catalogue_id set)"]

    GenCollections --> PopCollections["Populate collection_memberships<br/>from catalogue_entries"]

    PopCollections --> Done(["Seeding complete,<br/>continue startup"])

    SkipSeed --> Done

    style Start fill:#0f172a,stroke:#38bdf8,color:#e2e8f0
    style Done fill:#0f172a,stroke:#34d399,color:#e2e8f0
    style CheckDB fill:#1e293b,stroke:#f59e0b,color:#fbbf24
    style MatchCheck fill:#1e293b,stroke:#f59e0b,color:#fbbf24
    style NextObj fill:#1e293b,stroke:#f59e0b,color:#fbbf24
    style MoreFiles fill:#1e293b,stroke:#f59e0b,color:#fbbf24
```
