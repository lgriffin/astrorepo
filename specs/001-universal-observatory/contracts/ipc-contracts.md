# IPC Contracts: Electron Main ↔ Renderer

**Date**: 2026-07-15  
**Branch**: `001-universal-observatory`

Electron applications communicate between the main process (Node.js — database, file system, computation) and the renderer process (React — UI) via IPC channels. Each channel defines a typed request/response contract.

## Target Service

### `targets:search`

Search targets by any designation, name, or alias.

**Request**: `{ query: string, limit?: number, offset?: number }`  
**Response**: `{ targets: TargetSummary[], total: number }`

### `targets:get`

Get full target details by ID.

**Request**: `{ id: string }`  
**Response**: `Target` (full entity with aliases, catalogue entries, current stage)

### `targets:create`

Create a custom target.

**Request**: `{ canonical_name: string, object_type: string, ra_hours?: number, dec_degrees?: number, description?: string }`  
**Response**: `Target`

### `targets:update`

Update target fields.

**Request**: `{ id: string, fields: Partial<Target> }`  
**Response**: `Target`

### `targets:merge`

Merge two targets into one.

**Request**: `{ keep_id: string, merge_id: string }`  
**Response**: `Target` (the surviving merged target)

### `targets:advance-stage`

Move a target to the next workflow stage.

**Request**: `{ id: string, to_stage: string, notes?: string }`  
**Response**: `{ target: Target, transition: WorkflowTransition }`

### `targets:visibility`

Compute visibility data for a target at an observatory on a date.

**Request**: `{ target_id: string, observatory_id: string, date: string (ISO 8601 date) }`  
**Response**: `{ rise: string | null, set: string | null, transit: string | null, transit_altitude: number | null, current_altitude: number, current_azimuth: number, best_window_start: string | null, best_window_end: string | null, hours_above_horizon: number, moon_separation: number, available: boolean }`

## Session Service

### `sessions:list`

List sessions, optionally filtered by target or date range.

**Request**: `{ target_id?: string, from_date?: string, to_date?: string, limit?: number, offset?: number }`  
**Response**: `{ sessions: SessionSummary[], total: number }`

### `sessions:get`

Get full session details.

**Request**: `{ id: string }`  
**Response**: `ObservationSession` (with equipment and target links)

### `sessions:create`

Record a new observation session.

**Request**: `ObservationSessionInput` (all session fields except id/timestamps)  
**Response**: `ObservationSession`

### `sessions:update`

Update session fields.

**Request**: `{ id: string, fields: Partial<ObservationSessionInput> }`  
**Response**: `ObservationSession`

## Collection Service

### `collections:list`

List all collections with completion stats.

**Request**: `{}`  
**Response**: `{ collections: CollectionWithStats[] }`

### `collections:get`

Get collection details with member targets.

**Request**: `{ id: string, limit?: number, offset?: number }`  
**Response**: `{ collection: Collection, targets: TargetSummary[], completed: number, total: number }`

### `collections:create`

Create a manual collection.

**Request**: `{ name: string, description?: string }`  
**Response**: `Collection`

### `collections:add-target`

Add a target to a collection.

**Request**: `{ collection_id: string, target_id: string }`  
**Response**: `{ success: boolean }`

### `collections:remove-target`

Remove a target from a collection.

**Request**: `{ collection_id: string, target_id: string }`  
**Response**: `{ success: boolean }`

## Equipment Service

### `equipment:list`

List all registered equipment.

**Request**: `{ type?: string }`  
**Response**: `{ equipment: Equipment[] }`

### `equipment:create`

Register new equipment.

**Request**: `{ name: string, equipment_type: string, manufacturer?: string, model?: string, notes?: string }`  
**Response**: `Equipment`

### `equipment:usage-history`

Get session history for an equipment item.

**Request**: `{ id: string }`  
**Response**: `{ sessions: SessionSummary[] }`

## Observatory Service

### `observatory:list`

List registered observatory locations.

**Request**: `{}`  
**Response**: `{ observatories: Observatory[] }`

### `observatory:create`

Register a new observatory location.

**Request**: `{ name: string, latitude: number, longitude: number, altitude_m: number, timezone?: string }`  
**Response**: `Observatory`

### `observatory:set-primary`

Set an observatory as the primary/default.

**Request**: `{ id: string }`  
**Response**: `Observatory`

## Folder Service

### `folders:generate`

Generate processing folder structure for a target.

**Request**: `{ target_id: string, template_id?: string }`  
**Response**: `{ path: string, created_dirs: string[] }`

### `folders:templates-list`

List available folder templates.

**Request**: `{}`  
**Response**: `{ templates: FolderTemplate[] }`

### `folders:template-create`

Create a custom folder template.

**Request**: `{ name: string, structure: object }`  
**Response**: `FolderTemplate`

## Dashboard Service

### `dashboard:stats`

Get observatory-wide statistics.

**Request**: `{}`  
**Response**: `DashboardStats` (all metrics from FR-023)

### `dashboard:catalogue-progress`

Get completion progress for all catalogues.

**Request**: `{}`  
**Response**: `{ catalogues: CatalogueProgress[] }`

## Planning Service

### `planning:tonight`

Get ranked target list for a specific night.

**Request**: `{ observatory_id: string, date: string, min_altitude?: number, min_hours?: number }`  
**Response**: `{ targets: PlannedTarget[] }` (sorted by imaging quality)

## Poster Service

### `poster:generate`

Generate a poster for a collection.

**Request**: `{ collection_id: string, format: 'png' | 'pdf', tile_size?: number }`  
**Response**: `{ path: string }` (path to generated file)

## Relationship Service

### `relationships:create`

Define a relationship between two targets.

**Request**: `{ source_target_id: string, related_target_id: string, relationship_type: string }`  
**Response**: `TargetRelationship`

### `relationships:list`

Get all relationships for a target.

**Request**: `{ target_id: string }`  
**Response**: `{ relationships: RelationshipWithTarget[] }` (includes reciprocal)
