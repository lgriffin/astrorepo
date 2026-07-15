# Data Model: Universal Astrophotography Observatory

**Date**: 2026-07-15  
**Branch**: `001-universal-observatory`  
**Storage**: SQLite via better-sqlite3 + Drizzle ORM

## Entity Relationship Overview

```
Catalogue ──1:N──► CatalogueEntry ──N:1──► Target
                                            │
                    TargetAlias ◄──1:N──────┤
                                            │
                    TargetRelationship ◄──N:N┤
                                            │
              CollectionMembership ◄──N:N───┤──N:N──► Collection
                                            │
                    WorkflowTransition ◄──1:N┤
                                            │
               SessionTarget ◄──N:N────────┤──N:N──► ObservationSession
                                                        │
                              SessionEquipment ◄──N:N───┤──N:N──► Equipment
                                                        │
                                                        └──N:1──► Observatory (nullable)

FolderTemplate (standalone)
AppSettings (standalone)
```

## Entities

### Target

The central entity. Represents a single physical astronomical object.

| Field              | Type        | Constraints                                    |
|--------------------|-------------|------------------------------------------------|
| id                 | TEXT (ULID) | PRIMARY KEY                                    |
| canonical_name     | TEXT        | NOT NULL, UNIQUE                               |
| object_type        | TEXT        | NOT NULL, one of defined enum values            |
| ra_hours           | REAL        | Nullable (custom targets may lack coordinates) |
| dec_degrees        | REAL        | Nullable                                       |
| magnitude          | REAL        | Nullable                                       |
| angular_size_arcmin| REAL        | Nullable                                       |
| constellation      | TEXT        | Nullable                                       |
| description        | TEXT        | Nullable                                       |
| simbad_id          | TEXT        | Nullable                                       |
| ned_id             | TEXT        | Nullable                                       |
| workflow_stage     | TEXT        | NOT NULL, DEFAULT 'planned'                    |
| is_custom          | INTEGER     | NOT NULL, DEFAULT 0 (boolean)                  |
| folder_path        | TEXT        | Nullable (path to generated folder)            |
| notes              | TEXT        | Nullable                                       |
| created_at         | TEXT        | NOT NULL, ISO 8601                             |
| updated_at         | TEXT        | NOT NULL, ISO 8601                             |

**Object type enum**: galaxy, emission_nebula, reflection_nebula, planetary_nebula, dark_nebula, open_cluster, globular_cluster, star_cluster, supernova_remnant, molecular_cloud, galaxy_cluster, star, comet, asteroid, planet, moon, solar_object, variable_star, widefield_region, constellation, custom, unknown

**Validation**:
- canonical_name must be unique across all targets
- ra_hours: 0.0–24.0 when present
- dec_degrees: -90.0–90.0 when present

### TargetAlias

Alternate names and designations for a target.

| Field     | Type        | Constraints                  |
|-----------|-------------|------------------------------|
| id        | TEXT (ULID) | PRIMARY KEY                  |
| target_id | TEXT        | NOT NULL, FK → Target        |
| alias     | TEXT        | NOT NULL                     |
| source    | TEXT        | Nullable (e.g., "common_name", "catalogue", "user") |

**Validation**:
- UNIQUE(alias) — no two targets can share an alias (enforces identity resolution)
- If a conflict is detected during import, the system should flag it for manual resolution

### Catalogue

A registered astronomical catalogue.

| Field        | Type        | Constraints           |
|--------------|-------------|-----------------------|
| id           | TEXT (ULID) | PRIMARY KEY           |
| name         | TEXT        | NOT NULL, UNIQUE      |
| abbreviation | TEXT        | NOT NULL, UNIQUE      |
| description  | TEXT        | Nullable              |
| total_objects| INTEGER     | Nullable              |
| is_builtin   | INTEGER     | NOT NULL, DEFAULT 1   |
| created_at   | TEXT        | NOT NULL, ISO 8601    |

### CatalogueEntry

Links a target to its designation within a specific catalogue.

| Field         | Type        | Constraints                |
|---------------|-------------|----------------------------|
| id            | TEXT (ULID) | PRIMARY KEY                |
| catalogue_id  | TEXT        | NOT NULL, FK → Catalogue   |
| target_id     | TEXT        | NOT NULL, FK → Target      |
| designation   | TEXT        | NOT NULL                   |

**Validation**:
- UNIQUE(catalogue_id, designation) — each catalogue designation is unique within its catalogue
- UNIQUE(catalogue_id, target_id) — a target appears at most once per catalogue

### Collection

A named grouping of targets.

| Field          | Type        | Constraints                |
|----------------|-------------|----------------------------|
| id             | TEXT (ULID) | PRIMARY KEY                |
| name           | TEXT        | NOT NULL, UNIQUE           |
| description    | TEXT        | Nullable                   |
| is_auto        | INTEGER     | NOT NULL, DEFAULT 0        |
| source_catalogue_id | TEXT  | Nullable, FK → Catalogue   |
| created_at     | TEXT        | NOT NULL, ISO 8601         |
| updated_at     | TEXT        | NOT NULL, ISO 8601         |

**Notes**:
- `is_auto = 1` + `source_catalogue_id` → auto-generated catalogue collection (membership derived from CatalogueEntry)
- `is_auto = 0` → manually curated, membership via CollectionMembership

### CollectionMembership

Many-to-many link between targets and manual collections.

| Field         | Type        | Constraints                   |
|---------------|-------------|-------------------------------|
| collection_id | TEXT        | NOT NULL, FK → Collection     |
| target_id     | TEXT        | NOT NULL, FK → Target         |
| added_at      | TEXT        | NOT NULL, ISO 8601            |

**Validation**:
- PRIMARY KEY (collection_id, target_id)
- Only used for manual collections (is_auto = 0)

### ObservationSession

A record of a single imaging session.

| Field              | Type        | Constraints                   |
|--------------------|-------------|-------------------------------|
| id                 | TEXT (ULID) | PRIMARY KEY                   |
| date               | TEXT        | NOT NULL, ISO 8601 date       |
| observatory_id     | TEXT        | Nullable, FK → Observatory    |
| location_freetext  | TEXT        | Nullable (for one-off sites)  |
| sky_quality        | REAL        | Nullable (SQM reading)        |
| weather            | TEXT        | Nullable                      |
| seeing             | TEXT        | Nullable                      |
| transparency       | TEXT        | Nullable                      |
| moon_phase         | REAL        | Nullable (0.0–1.0)            |
| moon_distance      | REAL        | Nullable (degrees)            |
| guiding_notes      | TEXT        | Nullable                      |
| exposure_strategy  | TEXT        | Nullable                      |
| total_frames       | INTEGER     | Nullable                      |
| accepted_frames    | INTEGER     | Nullable                      |
| rejected_frames    | INTEGER     | Nullable                      |
| total_exposure_sec | REAL        | Nullable                      |
| notes              | TEXT        | Nullable                      |
| created_at         | TEXT        | NOT NULL, ISO 8601            |
| updated_at         | TEXT        | NOT NULL, ISO 8601            |

**Validation**:
- At least one of observatory_id or location_freetext should be present
- accepted_frames + rejected_frames <= total_frames when all present

### SessionTarget

Many-to-many link between sessions and targets.

| Field       | Type | Constraints                        |
|-------------|------|------------------------------------|
| session_id  | TEXT | NOT NULL, FK → ObservationSession  |
| target_id   | TEXT | NOT NULL, FK → Target              |
| is_primary  | INTEGER | NOT NULL, DEFAULT 1 (boolean)   |

**Validation**:
- PRIMARY KEY (session_id, target_id)
- is_primary indicates the intended target vs incidental objects in field

### Equipment

A registered piece of observatory hardware.

| Field        | Type        | Constraints                     |
|--------------|-------------|---------------------------------|
| id           | TEXT (ULID) | PRIMARY KEY                     |
| name         | TEXT        | NOT NULL                        |
| equipment_type | TEXT      | NOT NULL, one of defined enum   |
| manufacturer | TEXT        | Nullable                        |
| model        | TEXT        | Nullable                        |
| serial_number| TEXT        | Nullable                        |
| notes        | TEXT        | Nullable                        |
| is_active    | INTEGER     | NOT NULL, DEFAULT 1             |
| created_at   | TEXT        | NOT NULL, ISO 8601              |

**Equipment type enum**: camera, telescope, reducer, barlow, mount, guide_camera, guide_scope, filter_wheel, filter, rotator, dew_heater, power_supply, mini_pc, observatory_dome

### SessionEquipment

Many-to-many link between sessions and equipment.

| Field        | Type | Constraints                        |
|--------------|------|------------------------------------|
| session_id   | TEXT | NOT NULL, FK → ObservationSession  |
| equipment_id | TEXT | NOT NULL, FK → Equipment           |
| role         | TEXT | Nullable (e.g., "primary_camera")  |

**Validation**:
- PRIMARY KEY (session_id, equipment_id)

### Observatory

A registered observing location.

| Field      | Type        | Constraints             |
|------------|-------------|-------------------------|
| id         | TEXT (ULID) | PRIMARY KEY             |
| name       | TEXT        | NOT NULL, UNIQUE        |
| latitude   | REAL        | NOT NULL, -90.0–90.0    |
| longitude  | REAL        | NOT NULL, -180.0–180.0  |
| altitude_m | REAL        | NOT NULL, DEFAULT 0     |
| timezone   | TEXT        | Nullable                |
| is_primary | INTEGER     | NOT NULL, DEFAULT 0     |
| notes      | TEXT        | Nullable                |
| created_at | TEXT        | NOT NULL, ISO 8601      |

**Validation**:
- Exactly one observatory should have is_primary = 1 at any time (enforced in application logic)
- latitude: -90.0 to 90.0
- longitude: -180.0 to 180.0

### WorkflowStage

Configurable workflow stages.

| Field      | Type        | Constraints             |
|------------|-------------|-------------------------|
| id         | TEXT (ULID) | PRIMARY KEY             |
| name       | TEXT        | NOT NULL, UNIQUE        |
| sort_order | INTEGER     | NOT NULL                |
| is_default | INTEGER     | NOT NULL, DEFAULT 1     |

**Default stages** (sort_order 1–12): planned, scheduled, observed, raw_captured, calibrated, registered, integrated, processing, edited, published, printed, archived

### WorkflowTransition

Records stage changes for a target.

| Field        | Type        | Constraints             |
|--------------|-------------|-------------------------|
| id           | TEXT (ULID) | PRIMARY KEY             |
| target_id    | TEXT        | NOT NULL, FK → Target   |
| from_stage   | TEXT        | Nullable (null for initial) |
| to_stage     | TEXT        | NOT NULL                |
| transitioned_at | TEXT     | NOT NULL, ISO 8601      |
| notes        | TEXT        | Nullable                |

### TargetRelationship

Typed directed link between two targets.

| Field            | Type        | Constraints                |
|------------------|-------------|----------------------------|
| id               | TEXT (ULID) | PRIMARY KEY                |
| source_target_id | TEXT        | NOT NULL, FK → Target      |
| related_target_id| TEXT        | NOT NULL, FK → Target      |
| relationship_type| TEXT        | NOT NULL, one of enum      |
| created_at       | TEXT        | NOT NULL, ISO 8601         |

**Relationship type enum**: contains, nearby, parent_region, satellite_galaxy, companion_galaxy, neighbour, part_of_mosaic, captured_together

**Validation**:
- source_target_id != related_target_id
- UNIQUE(source_target_id, related_target_id, relationship_type)

**Reciprocal display** (computed, not stored):
- contains ↔ contained_by
- parent_region ↔ child_region
- satellite_galaxy ↔ host_galaxy
- All others are symmetric

### FolderTemplate

A blueprint for creating processing folder structures.

| Field      | Type        | Constraints             |
|------------|-------------|-------------------------|
| id         | TEXT (ULID) | PRIMARY KEY             |
| name       | TEXT        | NOT NULL, UNIQUE        |
| structure  | TEXT        | NOT NULL (JSON)         |
| is_builtin | INTEGER     | NOT NULL, DEFAULT 0     |
| created_at | TEXT        | NOT NULL, ISO 8601      |

**Default Siril template structure** (JSON):
```json
{
  "lights": {},
  "darks": {},
  "biases": {},
  "flats": {}
}
```

**Custom template example** (PixInsight):
```json
{
  "lights": {},
  "darks": {},
  "flats": {},
  "bias": {},
  "masters": {
    "master_dark": {},
    "master_flat": {},
    "master_bias": {}
  },
  "registered": {},
  "integrated": {}
}
```

### AppSettings

Application-wide settings (key-value store).

| Field | Type | Constraints        |
|-------|------|--------------------|
| key   | TEXT | PRIMARY KEY        |
| value | TEXT | NOT NULL           |

**Known settings**:
- `base_folder_path`: root directory for folder structure generation
- `default_folder_template_id`: ID of the default FolderTemplate
- `min_horizon_altitude`: minimum altitude for planning (default: 30)
- `default_workflow_stages`: JSON array of default stage IDs

## Indexes

- `idx_target_alias_alias` on TargetAlias(alias) — fast alias lookups
- `idx_target_canonical` on Target(canonical_name) — fast name search
- `idx_target_type` on Target(object_type) — filter by type
- `idx_target_stage` on Target(workflow_stage) — filter by stage
- `idx_catalogue_entry_designation` on CatalogueEntry(designation) — fast designation search
- `idx_catalogue_entry_target` on CatalogueEntry(target_id) — find all catalogues for a target
- `idx_session_date` on ObservationSession(date) — chronological queries
- `idx_session_observatory` on ObservationSession(observatory_id) — filter by location
- `idx_collection_membership_target` on CollectionMembership(target_id) — find all collections for a target
- `idx_workflow_transition_target` on WorkflowTransition(target_id) — target history
- `idx_relationship_source` on TargetRelationship(source_target_id) — find related targets
- `idx_relationship_related` on TargetRelationship(related_target_id) — find reverse relationships

## Full-Text Search

SQLite FTS5 virtual table for target search:

**targets_fts**: canonical_name, aliases (concatenated), description, constellation

Populated via triggers on Target and TargetAlias inserts/updates/deletes. Supports prefix queries, phrase matching, and ranking by relevance.
