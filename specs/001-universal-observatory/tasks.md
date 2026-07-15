# Tasks: Universal Astrophotography Observatory

**Input**: Design documents from `/specs/001-universal-observatory/`  
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/ipc-contracts.md, quickstart.md

**Tests**: Not explicitly requested in the feature specification. Test tasks are included in the Polish phase only.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Electron + React + TypeScript project initialization

- [x] T001 Initialize Electron project with React, TypeScript, Vite, and electron-forge in package.json, tsconfig.json, vite.config.ts, and electron-builder.yml
- [x] T002 Create Electron main process entry point with window creation in src/main/index.ts
- [x] T003 [P] Create React renderer entry point with routing shell in src/renderer/App.tsx
- [x] T004 [P] Define all shared TypeScript interfaces for entities in src/shared/types.ts (Target, Catalogue, CatalogueEntry, TargetAlias, Collection, CollectionMembership, ObservationSession, SessionTarget, SessionEquipment, Equipment, Observatory, WorkflowStage, WorkflowTransition, TargetRelationship, FolderTemplate, AppSettings)
- [x] T005 [P] Configure Tailwind CSS and global styles in src/renderer/styles/
- [x] T006 [P] Configure Vitest for unit and integration testing in vitest.config.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, seed data, IPC infrastructure, and core Target entity that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Configure better-sqlite3 connection with WAL mode and Drizzle ORM setup in src/main/db/connection.ts and drizzle.config.ts
- [x] T008 Define Target table schema in src/main/db/schema.ts (id, canonical_name, object_type, ra_hours, dec_degrees, magnitude, angular_size_arcmin, constellation, description, simbad_id, ned_id, workflow_stage, is_custom, folder_path, notes, created_at, updated_at)
- [x] T009 [P] Define TargetAlias table schema in src/main/db/schema.ts (id, target_id FK, alias, source)
- [x] T010 [P] Define Catalogue and CatalogueEntry table schemas in src/main/db/schema.ts
- [x] T011 [P] Define WorkflowStage table schema with default stage seed data in src/main/db/schema.ts and src/main/db/seed/workflow-stages.ts
- [x] T012 [P] Define AppSettings table schema in src/main/db/schema.ts
- [x] T013 Create SQLite FTS5 virtual table (targets_fts) with triggers for Target and TargetAlias sync in src/main/db/fts.ts
- [x] T014 Create database migration runner and initial migration in src/main/db/migrations/
- [x] T015 Set up IPC handler registration framework with typed channel definitions in src/main/ipc/handlers.ts
- [x] T016 Create useIPC React hook for typed main↔renderer communication in src/renderer/hooks/useIPC.ts
- [x] T017 Create reusable UI shell components (layout, sidebar navigation, page container) in src/renderer/components/common/Layout.tsx, Sidebar.tsx, PageContainer.tsx

**Checkpoint**: Database initialised, IPC working, basic app shell renders with navigation

---

## Phase 3: User Story 1 — Browse and Search Any Astronomical Target (Priority: P1) MVP

**Goal**: Users can search for any astronomical object by any designation or common name and view its details

**Independent Test**: Search for "M42", "NGC 1976", "Orion Nebula" — all return the same target with full details displayed

### Implementation for User Story 1

- [x] T018 [US1] Implement TargetService with search (FTS5 query), getById, and list methods in src/main/services/target.ts
- [x] T019 [US1] Register IPC handlers for targets:search and targets:get channels in src/main/ipc/handlers.ts
- [x] T020 [P] [US1] Create SearchBar component with debounced input and result dropdown in src/renderer/components/target/SearchBar.tsx
- [x] T021 [P] [US1] Create TargetCard component displaying name, type badge, constellation, and magnitude in src/renderer/components/target/TargetCard.tsx
- [x] T022 [US1] Create TargetList page with search bar, type filters, and paginated results grid in src/renderer/pages/TargetList.tsx
- [x] T023 [US1] Create TargetDetail page showing canonical name, all aliases, catalogue designations, coordinates, description, and workflow stage in src/renderer/pages/TargetDetail.tsx

**Checkpoint**: Can search targets, view results list, click through to full target detail page

---

## Phase 4: User Story 2 — Manage Multi-Catalogue Object Identity (Priority: P1)

**Goal**: System understands cross-catalogue identity — one physical object, many designations. Pre-loaded catalogue data is searchable.

**Independent Test**: View M42 and see NGC 1976, Sh2-281, and "Orion Nebula" all listed. Search by any of these to find the same target.

### Implementation for User Story 2

- [x] T024 [US2] Create Messier catalogue seed data JSON (110 objects with RA/Dec, type, common names, NGC cross-refs) in data/catalogues/messier.json
- [x] T025 [P] [US2] Create NGC/IC catalogue seed data JSON (top objects with cross-references) in data/catalogues/ngc-ic.json
- [x] T026 [P] [US2] Create seed data JSONs for Sharpless, Caldwell, Barnard, Abell PN, Abell Clusters, and remaining catalogues in data/catalogues/
- [x] T027 [US2] Implement CatalogueService with seed data loader, cross-reference resolver, and catalogue listing in src/main/services/catalogue.ts
- [x] T028 [US2] Implement TargetAlias management and alias conflict detection in src/main/services/target.ts (extend existing)
- [x] T029 [US2] Implement target merge functionality (consolidate aliases, catalogue entries, sessions, collections, relationships) in src/main/services/target.ts (extend existing)
- [x] T030 [US2] Run seed data loader on first launch and display catalogue designations and cross-references on TargetDetail page in src/renderer/pages/TargetDetail.tsx (extend existing)

**Checkpoint**: App launches with 30K+ pre-loaded targets from 20+ catalogues, all searchable by any designation or common name. Target merge works.

---

## Phase 5: User Story 3 — Record Observation Sessions (Priority: P2)

**Goal**: Users can log observation sessions with full metadata and associate them with targets

**Independent Test**: Create a session for M42, enter all fields (date, location, conditions, equipment, frames), verify it appears in M42's session history

### Implementation for User Story 3

- [x] T031 [US3] Define ObservationSession, SessionTarget, and SessionEquipment table schemas in src/main/db/schema.ts (extend existing)
- [x] T032 [US3] Implement SessionService with create, update, list (by target, by date range), and getById methods in src/main/services/session.ts
- [x] T033 [US3] Register IPC handlers for sessions:create, sessions:list, sessions:get, sessions:update channels in src/main/ipc/handlers.ts (extend existing)
- [x] T034 [P] [US3] Create SessionForm page with all fields (date, location, sky quality, weather, seeing, transparency, moon phase/distance, exposure strategy, frame counts, notes) and multi-target association in src/renderer/pages/SessionForm.tsx
- [x] T035 [P] [US3] Create SessionList component with chronological listing, summary stats (total frames, exposure), and date range filter in src/renderer/components/session/SessionList.tsx
- [x] T036 [US3] Add session history section to TargetDetail page showing all sessions for that target in src/renderer/pages/TargetDetail.tsx (extend existing)

**Checkpoint**: Can record sessions with all metadata, associate with one or more targets, view session history on any target

---

## Phase 6: User Story 4 — Organise Targets into Collections (Priority: P2)

**Goal**: Users can create collections, add targets, and see completion progress for catalogue-based collections

**Independent Test**: Create a "Winter Targets" collection, add targets, verify target appears in multiple collections. View Messier Collection with completion progress.

### Implementation for User Story 4

- [x] T037 [US4] Define Collection and CollectionMembership table schemas in src/main/db/schema.ts (extend existing)
- [x] T038 [US4] Implement CollectionService with create, addTarget, removeTarget, list (with completion stats), and getById (with member targets) in src/main/services/collection.ts
- [x] T039 [US4] Auto-generate catalogue-based collections (Messier, Caldwell, etc.) from seed data during first launch in src/main/services/catalogue.ts (extend existing)
- [x] T040 [US4] Register IPC handlers for collections:list, collections:get, collections:create, collections:add-target, collections:remove-target channels in src/main/ipc/handlers.ts (extend existing)
- [x] T041 [P] [US4] Create Collections page listing all collections with completion progress bars (completed/total) in src/renderer/pages/Collections.tsx
- [x] T042 [US4] Create CollectionDetail page showing member targets with status indicators (completed, in-progress, unstarted) in src/renderer/pages/CollectionDetail.tsx

**Checkpoint**: Collections exist for every catalogue with accurate completion tracking. Manual collections can be created and managed. Targets appear in multiple collections.

---

## Phase 7: User Story 5 — Track Project Lifecycle (Priority: P3)

**Goal**: Users can advance targets through configurable workflow stages with timestamped transitions

**Independent Test**: Advance a target from Planned → Observed → Integrated, verify stage history shows all transitions with dates

### Implementation for User Story 5

- [x] T043 [US5] Define WorkflowTransition table schema in src/main/db/schema.ts (extend existing)
- [x] T044 [US5] Implement WorkflowService with advanceStage, getHistory, and customise stages (add, remove, reorder) in src/main/services/workflow.ts
- [x] T045 [US5] Register IPC handlers for targets:advance-stage channel in src/main/ipc/handlers.ts (extend existing)
- [x] T046 [US5] Create WorkflowStepper component showing current stage with advance/back controls in src/renderer/components/target/WorkflowStepper.tsx
- [x] T047 [US5] Add workflow stepper and stage transition history timeline to TargetDetail page in src/renderer/pages/TargetDetail.tsx (extend existing)
- [x] T048 [US5] Create workflow stage customisation UI in Settings page allowing add/remove/reorder of stages in src/renderer/pages/Settings.tsx

**Checkpoint**: Targets move through lifecycle stages, all transitions are timestamped, custom stages can be defined

---

## Phase 8: User Story 6 — Register and Track Equipment (Priority: P3)

**Goal**: Users can register equipment and select from inventory when recording sessions

**Independent Test**: Register a telescope, create a session selecting it, verify the telescope appears in usage history

### Implementation for User Story 6

- [x] T049 [US6] Define Equipment table schema in src/main/db/schema.ts (extend existing)
- [x] T050 [US6] Implement EquipmentService with create, list (by type), update, and getUsageHistory in src/main/services/equipment.ts
- [x] T051 [US6] Register IPC handlers for equipment:list, equipment:create, equipment:usage-history channels in src/main/ipc/handlers.ts (extend existing)
- [x] T052 [P] [US6] Create Equipment page with registration form and equipment inventory list by type in src/renderer/pages/Equipment.tsx
- [x] T053 [US6] Add equipment selection (multi-select from inventory) to SessionForm page in src/renderer/pages/SessionForm.tsx (extend existing)

**Checkpoint**: Equipment registered, selectable in sessions, usage history shows all sessions and targets

---

## Phase 9: User Story 11 — Generate Processing Folder Structure (Priority: P3)

**Goal**: One-click folder creation on disk with Siril-compatible default template and custom templates

**Independent Test**: Select a target, click "Create Folders", verify lights/darks/biases/flats directories created at configured base path

### Implementation for User Story 11

- [x] T054 [US11] Define FolderTemplate table schema with built-in Siril template seed data in src/main/db/schema.ts (extend existing) and src/main/db/seed/folder-templates.ts
- [x] T055 [US11] Implement FolderService with generateFolders (creates dirs on disk, sanitises target name), listTemplates, and createTemplate in src/main/services/folder.ts
- [x] T056 [US11] Register IPC handlers for folders:generate, folders:templates-list, folders:template-create channels in src/main/ipc/handlers.ts (extend existing)
- [x] T057 [P] [US11] Create FolderTemplateManager component for viewing, creating, and editing custom templates in src/renderer/components/target/FolderTemplateManager.tsx
- [x] T058 [US11] Add "Generate Folders" button with template selection to TargetDetail page and base directory configuration to Settings page in src/renderer/pages/TargetDetail.tsx and src/renderer/pages/Settings.tsx (extend existing)

**Checkpoint**: Folders created on disk with correct structure, custom templates work, re-running preserves existing files

---

## Phase 10: User Story 12 — Plan Observations Using Observatory Location (Priority: P3)

**Goal**: Register observatory locations and see computed visibility data (rise/set/transit) for any target

**Independent Test**: Register home observatory coordinates, view M42, verify rise/set/transit times match known values for that location and date

### Implementation for User Story 12

- [x] T059 [US12] Define Observatory table schema in src/main/db/schema.ts (extend existing)
- [x] T060 [US12] Implement ObservatoryService with create, list, setPrimary, and delete in src/main/services/observatory.ts
- [x] T061 [US12] Implement EphemerisService using astronomy-engine with getVisibility (rise, set, transit, altitude, azimuth, best window, hours above horizon, moon separation) and getTonightTargets (ranked list) in src/main/services/ephemeris.ts
- [x] T062 [US12] Register IPC handlers for observatory:list, observatory:create, observatory:set-primary, targets:visibility, planning:tonight channels in src/main/ipc/handlers.ts (extend existing)
- [x] T063 [P] [US12] Create Observatory page with location registration form (name, lat, lon, altitude) and primary selection in src/renderer/pages/Observatory.tsx
- [x] T064 [US12] Add visibility data panel (rise/set/transit/altitude/moon separation) with date picker to TargetDetail page in src/renderer/pages/TargetDetail.tsx (extend existing)
- [x] T065 [US12] Create Planning page showing ranked targets for a selected night with filtering by visibility quality in src/renderer/pages/Planning.tsx

**Checkpoint**: Observatory locations registered, visibility data computed and displayed per target, nightly planning view ranks targets by imaging quality

---

## Phase 11: User Story 7 — View Observatory Dashboard (Priority: P4)

**Goal**: Single overview showing observatory-wide statistics and catalogue completion progress

**Independent Test**: With populated data, verify dashboard shows correct counts for targets, sessions, exposure time, and per-catalogue progress

### Implementation for User Story 7

- [x] T066 [US7] Implement DashboardService with aggregate queries for all metrics (total targets, completed, in-progress, by type, by catalogue, observation nights, total exposure, storage, equipment stats, records) in src/main/services/dashboard.ts
- [x] T067 [US7] Register IPC handlers for dashboard:stats and dashboard:catalogue-progress channels in src/main/ipc/handlers.ts (extend existing)
- [x] T068 [P] [US7] Create StatCard, ProgressBar, and CatalogueProgressList reusable components in src/renderer/components/dashboard/
- [x] T069 [US7] Create Dashboard page assembling all stat cards, catalogue progress, equipment summary, and record highlights in src/renderer/pages/Dashboard.tsx

**Checkpoint**: Dashboard shows accurate, live statistics across the entire observatory

---

## Phase 12: User Story 8 — Generate Collection Posters (Priority: P4)

**Goal**: Generate visual poster grids for any collection, with user images for completed targets and placeholders for incomplete ones

**Independent Test**: Generate a Messier poster with a mix of completed (with images) and incomplete targets, verify grid renders correctly and exports to PNG

### Implementation for User Story 8

- [x] T070 [US8] Implement PosterService with generatePoster (computes grid layout, reads thumbnail images, renders via offscreen canvas) and export to PNG/PDF in src/main/services/poster.ts
- [x] T071 [US8] Register IPC handler for poster:generate channel in src/main/ipc/handlers.ts (extend existing)
- [x] T072 [P] [US8] Create PosterTile component (image tile for completed targets, styled placeholder for incomplete) and PosterGrid component (responsive tile layout) in src/renderer/components/poster/PosterTile.tsx and PosterGrid.tsx
- [x] T073 [US8] Create Poster page with collection selector, live poster preview, and export button in src/renderer/pages/Poster.tsx

**Checkpoint**: Posters render for any collection, completed targets show images, incomplete show placeholders, PNG/PDF export works

---

## Phase 13: User Story 9 — Define Target Relationships (Priority: P5)

**Goal**: Users can define typed relationships between targets with automatic reciprocal display

**Independent Test**: Define "Horsehead Nebula contains Flame Nebula", verify both targets show the relationship from their respective perspectives

### Implementation for User Story 9

- [x] T074 [US9] Define TargetRelationship table schema in src/main/db/schema.ts (extend existing)
- [x] T075 [US9] Implement RelationshipService with create, list (with reciprocal computation), and delete in src/main/services/relationship.ts
- [x] T076 [US9] Register IPC handlers for relationships:create and relationships:list channels in src/main/ipc/handlers.ts (extend existing)
- [x] T077 [US9] Add related objects section with relationship type labels and navigation links to TargetDetail page in src/renderer/pages/TargetDetail.tsx (extend existing)

**Checkpoint**: Relationships defined and displayed reciprocally, navigable from either target

---

## Phase 14: User Story 10 — Create Custom Targets (Priority: P5)

**Goal**: Users can create non-catalogue targets that behave identically to catalogue objects

**Independent Test**: Create "Milky Way Panorama" custom target, add a session, put it in a collection, advance its workflow, verify it appears on dashboard and in poster

### Implementation for User Story 10

- [x] T078 [US10] Implement custom target creation in TargetService with alias conflict detection and warning in src/main/services/target.ts (extend existing)
- [x] T079 [US10] Register IPC handler for targets:create channel in src/main/ipc/handlers.ts (extend existing)
- [x] T080 [US10] Create CustomTargetForm component with name, type selector, optional coordinates, and description fields in src/renderer/components/target/CustomTargetForm.tsx
- [x] T081 [US10] Add "Create Custom Target" action to TargetList page and integrate form as a modal or separate view in src/renderer/pages/TargetList.tsx (extend existing)

**Checkpoint**: Custom targets created and participate in all features (sessions, collections, workflows, posters, relationships, dashboard) identically to catalogue targets

---

## Phase 15: Polish & Cross-Cutting Concerns

**Purpose**: Testing, quality, and cross-cutting improvements

- [x] T082 [P] Write unit tests for TargetService (search, merge, alias resolution) in tests/unit/target-service.test.ts
- [x] T083 [P] Write unit tests for EphemerisService (compare computed rise/set/transit against known almanac values) in tests/unit/ephemeris-service.test.ts
- [x] T084 [P] Write unit tests for FolderService (template generation, name sanitisation, idempotent creation) in tests/unit/folder-service.test.ts
- [x] T085 [P] Write integration tests for catalogue seed loading and cross-reference resolution in tests/integration/catalogue-seed.test.ts
- [x] T086 [P] Write integration tests for session recording with multi-target and equipment associations in tests/integration/session-recording.test.ts
- [x] T087 Write Zod boundary validation tests in tests/unit/ipc-validation.test.ts
- [x] T088 [P] Write unit tests for WorkflowService, CollectionService, EquipmentService, ObservatoryService, RelationshipService, DashboardService
- [x] T089 [P] Add Zod validation schemas to all IPC handler boundaries in src/main/ipc/schemas.ts
- [x] T090 Create Mermaid architecture diagrams in docs/architecture/
- [x] T091 Write comprehensive README.md with project overview, setup, and documentation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 + US2 (Phases 3–4)**: Depend on Foundational. US2 depends on US1 (extends TargetService)
- **US3–US12 (Phases 5–10)**: Depend on Foundational. Can proceed in parallel with each other after US1 is complete
- **US7 + US8 (Phases 11–12)**: Depend on earlier stories for meaningful data but are not blocked — can render with empty state
- **US9 + US10 (Phases 13–14)**: Depend on Foundational only. Can proceed in parallel with other P3+ stories
- **Polish (Phase 15)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no story dependencies
- **US2 (P1)**: After US1 (extends TargetService and TargetDetail page)
- **US3 (P2)**: After Foundational — independent of other stories (Equipment schema defined here, used by US6)
- **US4 (P2)**: After Foundational — independent of other stories
- **US5 (P3)**: After Foundational — independent
- **US6 (P3)**: After US3 (SessionEquipment defined in US3 schema; equipment selection added to SessionForm)
- **US11 (P3)**: After Foundational — independent (filesystem only)
- **US12 (P3)**: After Foundational — independent
- **US7 (P4)**: After Foundational — works with empty data, gains value as stories complete
- **US8 (P4)**: After US4 (needs Collection service)
- **US9 (P5)**: After Foundational — independent
- **US10 (P5)**: After US1 (extends TargetService and TargetList)

### Within Each User Story

- Schema/models before services
- Services before IPC handlers
- IPC handlers before UI pages
- Core implementation before extending existing pages

### Parallel Opportunities

- **Phase 1**: T003, T004, T005, T006 can all run in parallel
- **Phase 2**: T009, T010, T011, T012 can all run in parallel (independent schema definitions)
- **After Foundational**: US3, US4, US5, US11, US12, US9 can all start in parallel (independent stories)
- **After US1**: US2, US10 can start
- **After US3**: US6 can start
- **After US4**: US8 can start
- **Within each story**: Tasks marked [P] can run in parallel

---

## Parallel Example: User Story 1

```text
# After Foundational phase, launch in parallel:
Task T020: "Create SearchBar component in src/renderer/components/target/SearchBar.tsx"
Task T021: "Create TargetCard component in src/renderer/components/target/TargetCard.tsx"

# Then sequentially:
Task T022: "Create TargetList page" (depends on T020, T021)
Task T023: "Create TargetDetail page" (depends on T018 service)
```

## Parallel Example: Independent Stories (after Foundational)

```text
# These stories can be worked on simultaneously by different developers or in any order:
Phase 5 (US3): Record Observation Sessions
Phase 6 (US4): Organise Collections
Phase 7 (US5): Track Lifecycle
Phase 9 (US11): Folder Generation
Phase 10 (US12): Observatory Planning
Phase 13 (US9): Target Relationships
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (Search & Browse)
4. Complete Phase 4: User Story 2 (Catalogue Identity & Seed Data)
5. **STOP and VALIDATE**: App launches with 30K+ targets, searchable by any name, with full cross-catalogue identity

### Incremental Delivery

1. Setup + Foundational → App shell with database
2. US1 + US2 → Searchable catalogue browser (MVP!)
3. US3 + US4 → Session recording and collections with progress
4. US5 + US6 → Workflow lifecycle and equipment tracking
5. US11 + US12 → Folder generation and observation planning
6. US7 + US8 → Dashboard analytics and poster generation
7. US9 + US10 → Relationships and custom targets
8. Each increment adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Schema extensions (adding tables to schema.ts) are cumulative — each story extends the existing schema file
- IPC handler extensions are cumulative — each story adds channels to the existing handlers.ts
- TargetDetail page grows across stories — each story adds its section (sessions, workflow, visibility, relationships)
