# Data Model

The Astrorepo database contains 16 tables (14 domain tables plus a full-text search virtual table and an app settings key-value store). The schema is centred on **targets** -- the celestial objects an astrophotographer wants to image. Targets are organised into **catalogues** (Messier, NGC, etc.) via catalogue entries, grouped into user or auto-generated **collections**, and linked to **observation sessions** that record imaging runs. Equipment, observatories, and workflow state are tracked as first-class entities. All foreign keys use integer IDs with cascading deletes where appropriate.

```mermaid
erDiagram
    targets {
        int id PK
        text canonical_name
        text object_type
        real ra_hours
        real dec_degrees
        real magnitude
        real angular_size_arcmin
        text constellation
        text description
        text simbad_id
        text ned_id
        text workflow_stage
        int is_custom
        text folder_path
        text notes
        text created_at
        text updated_at
    }

    target_aliases {
        int id PK
        int target_id FK
        text alias "UNIQUE"
        text source
    }

    catalogues {
        int id PK
        text name
        text abbreviation
        text description
        int total_objects
        int is_builtin
        text created_at
    }

    catalogue_entries {
        int id PK
        int catalogue_id FK
        int target_id FK
        text designation
    }

    collections {
        int id PK
        text name
        text description
        int is_auto
        int source_catalogue_id FK
        text created_at
        text updated_at
    }

    collection_memberships {
        int collection_id PK,FK
        int target_id PK,FK
        text added_at
    }

    observation_sessions {
        int id PK
        text date
        int observatory_id FK
        text location_freetext
        real sky_quality
        text weather
        text seeing
        text transparency
        real moon_phase
        real moon_distance
        text guiding_notes
        text exposure_strategy
        int total_frames
        int accepted_frames
        int rejected_frames
        real total_exposure_sec
        text notes
        text created_at
        text updated_at
    }

    session_targets {
        int session_id PK,FK
        int target_id PK,FK
        int is_primary
    }

    equipment {
        int id PK
        text name
        text equipment_type
        text manufacturer
        text model
        text serial_number
        text notes
        int is_active
        text created_at
    }

    session_equipment {
        int session_id PK,FK
        int equipment_id PK,FK
        text role
    }

    observatories {
        int id PK
        text name
        real latitude
        real longitude
        real altitude_m
        text timezone
        int is_primary
        text notes
        text created_at
    }

    workflow_stages {
        int id PK
        text name
        int sort_order
        int is_default
    }

    workflow_transitions {
        int id PK
        int target_id FK
        text from_stage
        text to_stage
        text transitioned_at
        text notes
    }

    target_relationships {
        int id PK
        int source_target_id FK
        int related_target_id FK
        text relationship_type
        text created_at
    }

    folder_templates {
        int id PK
        text name
        text structure
        int is_builtin
        text created_at
    }

    app_settings {
        text key PK
        text value
    }

    targets ||--o{ target_aliases : "has aliases"
    targets ||--o{ catalogue_entries : "listed in"
    targets ||--o{ collection_memberships : "belongs to"
    targets ||--o{ session_targets : "observed in"
    targets ||--o{ workflow_transitions : "transitions through"
    targets ||--o{ target_relationships : "source of"
    targets ||--o{ target_relationships : "related to"

    catalogues ||--o{ catalogue_entries : "contains"
    catalogues ||--o| collections : "auto-generates"

    collections ||--o{ collection_memberships : "includes"

    observation_sessions ||--o{ session_targets : "observes"
    observation_sessions ||--o{ session_equipment : "uses"
    observation_sessions }o--|| observatories : "located at"

    equipment ||--o{ session_equipment : "used in"
```
