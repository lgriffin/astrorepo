# Feature Specification: Universal Astrophotography Observatory

**Feature Branch**: `001-universal-observatory`  
**Created**: 2026-07-15  
**Status**: Draft  
**Input**: User description: "Vision Expansion - Transform the Messier Catalog manager into a complete astrophotography observatory management system supporting any astronomical target from any catalogue, with full project lifecycle management, observation sessions, equipment tracking, collections, dashboards, and poster generation."

## Clarifications

### Session 2026-07-15

- Q: Should the Siril folder structure feature support only Siril's layout or be customisable for other processing tools? → A: Siril default with customisable templates — ship with Siril's lights/darks/biases/flats layout as the default, allow user to define additional folder templates for other tools
- Q: Should observation planning compute target visibility locally or fetch from external services? → A: Local computation — calculate rise/set, transit, altitude, and imaging windows from RA/Dec + observatory coordinates + date/time using standard astronomical algorithms (works offline)
- Q: Should the system support one observatory location or multiple? → A: Multiple locations — register several sites (home observatory, dark site, travel locations), one marked as primary/default for planning views
- Q: Should the system support importing session data from existing capture tools? → A: Out of scope — data ingestion is a separate concern; the system assumes users already have data in folders on their machine and references files by path
- Q: Should observation sessions link to a registered Observatory location? → A: Linked with override — sessions default to selecting a registered Observatory but allow a free-text location for one-off sites

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and Search Any Astronomical Target (Priority: P1)

An astrophotographer wants to find an astronomical object by any name, catalogue designation, or common alias and immediately see all known information about it. They type "Orion Nebula" and the system returns the same result as searching for "M42", "NGC 1976", or "Sh2-281". From the result they can view the object's type, coordinates, alternate designations, and begin planning an imaging project.

**Why this priority**: This is the foundational interaction of the entire system. Without reliable object discovery and identity resolution across catalogues, no other feature can function. Every subsequent workflow begins with finding a target.

**Independent Test**: Can be fully tested by searching for known objects using different designations and verifying the same target is returned each time. Delivers immediate value by replacing manual cross-referencing across separate catalogue lists.

**Acceptance Scenarios**:

1. **Given** a target exists with multiple catalogue designations, **When** the user searches by any one of those designations, **Then** the system returns the same target with all known alternate names displayed
2. **Given** a target has a common name (e.g., "Horsehead Nebula"), **When** the user searches by that common name, **Then** the system returns the matching target
3. **Given** a search term matches multiple distinct targets, **When** the user searches, **Then** the system presents all matches ranked by relevance with enough context to distinguish them
4. **Given** a search term matches no known target, **When** the user searches, **Then** the system clearly indicates no results and offers the option to create a custom target with that name

---

### User Story 2 - Manage Multi-Catalogue Object Identity (Priority: P1)

An astrophotographer needs the system to understand that a single physical object can appear in many catalogues. They view a target and see its canonical identifier, all alternate names, and every cross-catalogue reference. When a new catalogue is added to the system, existing objects that appear in it are automatically linked rather than duplicated.

**Why this priority**: Object identity is inseparable from search. Duplicate objects would corrupt every downstream feature: collections, sessions, progress tracking, and dashboards would all show inconsistent data.

**Independent Test**: Can be tested by verifying that known multi-catalogue objects (e.g., M42/NGC 1976/Sh2-281) exist as a single entity with all designations listed, and that adding a new catalogue reference to an existing object does not create a duplicate.

**Acceptance Scenarios**:

1. **Given** an object exists in multiple catalogues, **When** the user views that object, **Then** all catalogue designations and common names are displayed together
2. **Given** the user adds a cross-catalogue reference to an existing target, **When** they save the change, **Then** searching by the new reference returns the existing target rather than creating a duplicate
3. **Given** two targets are discovered to be the same physical object, **When** the user merges them, **Then** all sessions, images, collections, and notes from both are consolidated under a single target

---

### User Story 3 - Record Observation Sessions (Priority: P2)

An astrophotographer returns from an imaging night and wants to log everything about the session: date, location, sky conditions (seeing, transparency, moon phase, moon distance), equipment used, exposure strategy, and captured frames. They associate the session with one or more targets and record which frames were accepted or rejected. Over time, a target accumulates many sessions spanning months or years, building a complete history of its data acquisition.

**Why this priority**: Sessions are the primary data-entry point. Without session recording, the system cannot track what data exists for each target or provide meaningful progress and analytics.

**Independent Test**: Can be tested by creating a session, associating it with a target, entering observing conditions and frame counts, and verifying the session appears in the target's history with all details intact.

**Acceptance Scenarios**:

1. **Given** a target exists, **When** the user creates a new observation session for it, **Then** the session is linked to the target and records date, location, sky quality, weather, seeing, transparency, moon phase, and moon distance
2. **Given** a session is being recorded, **When** the user enters equipment, exposure strategy, and frame counts, **Then** all details are persisted and visible in the session record
3. **Given** a target has multiple sessions, **When** the user views the target, **Then** all sessions are listed chronologically with summary statistics (total frames, total exposure time, date range)
4. **Given** one imaging session captured multiple targets in the same field, **When** the user associates the session with additional targets, **Then** the session appears in each target's history without duplication

---

### User Story 4 - Organise Targets into Collections (Priority: P2)

An astrophotographer wants to group targets into meaningful collections such as "Messier Collection", "Winter Targets", "Competition Images", or "Needs More Data". A single target can appear in multiple collections simultaneously. Collections can be curated automatically from catalogue membership (every Messier object belongs to the Messier Collection) or created manually with arbitrary criteria.

**Why this priority**: Collections transform raw target lists into meaningful groupings that drive workflows, progress tracking, and poster generation. Without collections, the system is a flat database rather than an organised observatory.

**Independent Test**: Can be tested by creating a collection, adding targets to it, verifying a target appears in multiple collections, and confirming that removing a target from one collection does not affect its membership in others.

**Acceptance Scenarios**:

1. **Given** a user wants to organise targets, **When** they create a new collection with a name and optional description, **Then** the collection is available and targets can be added to it
2. **Given** a target exists, **When** the user adds it to multiple collections, **Then** the target appears in all assigned collections and changes to the target are reflected everywhere
3. **Given** a catalogue-based collection (e.g., Messier), **When** the user views it, **Then** it shows completion progress (e.g., "78 / 110") and clearly distinguishes completed, in-progress, and unstarted targets
4. **Given** the user removes a target from a collection, **When** the removal is confirmed, **Then** the target remains in the system and in any other collections it belongs to

---

### User Story 5 - Track Project Lifecycle (Priority: P3)

An astrophotographer wants to track each target through its imaging lifecycle: Planned, Scheduled, Observed, Raw Captured, Calibrated, Registered, Integrated, Processing, Edited, Published, Printed, Archived. They move a target forward through these stages as work progresses, giving them a clear view of where every project stands. The default workflow stages can be customised to match their personal process.

**Why this priority**: Lifecycle tracking transforms the system from a catalogue into a project management tool. It enables the dashboard to show meaningful progress and helps the user prioritise what to work on next.

**Independent Test**: Can be tested by advancing a target through each workflow stage and verifying the current stage is accurately reflected in all views (target detail, dashboard, collection).

**Acceptance Scenarios**:

1. **Given** a new target is added, **When** the user views it, **Then** it starts at the "Planned" stage by default
2. **Given** a target is at stage "Observed", **When** the user advances it to "Raw Captured", **Then** the stage change is recorded with a timestamp
3. **Given** the user has a custom workflow, **When** they modify the default stages (add, remove, or reorder), **Then** all new targets use the updated workflow and existing targets retain their current stage
4. **Given** a target is at any stage, **When** the user views its history, **Then** they can see the complete timeline of stage transitions with dates

---

### User Story 6 - Register and Track Equipment (Priority: P3)

An astrophotographer registers their equipment (telescopes, cameras, mounts, guide systems, filters, accessories) in the system. When recording observation sessions, they select from their registered equipment rather than re-entering details. Over time, the system builds a complete history of which equipment was used for which targets, enabling equipment-based analytics.

**Why this priority**: Equipment tracking eliminates repetitive data entry during session recording and enables valuable cross-cutting analytics (e.g., "show all targets imaged with my new camera").

**Independent Test**: Can be tested by registering equipment items, associating them with a session, and verifying the equipment appears in both the session record and the equipment history.

**Acceptance Scenarios**:

1. **Given** the user wants to register equipment, **When** they add a new item with type (camera, telescope, mount, etc.) and details, **Then** the item is available for selection in future sessions
2. **Given** registered equipment exists, **When** the user creates an observation session, **Then** they can select from their equipment inventory rather than typing details manually
3. **Given** equipment has been used across multiple sessions, **When** the user views an equipment item, **Then** they see a history of all sessions and targets where it was used

---

### User Story 7 - View Observatory Dashboard (Priority: P4)

An astrophotographer wants a single overview of their entire observatory: total targets tracked, targets completed, objects in progress, breakdown by object type and catalogue, total observation nights, total exposure time, storage consumed, most-used equipment, and records such as deepest integration or longest-running project. This replaces the Messier-only progress view with a comprehensive observatory-wide perspective.

**Why this priority**: The dashboard provides motivation, insight, and planning value. However, it depends on targets, sessions, equipment, and workflow data being in place first.

**Independent Test**: Can be tested by populating the system with sample targets, sessions, and equipment data, then verifying the dashboard displays accurate aggregate statistics.

**Acceptance Scenarios**:

1. **Given** the system contains targets in various states, **When** the user opens the dashboard, **Then** they see counts for total targets, completed, in-progress, and planned
2. **Given** observation sessions have been recorded, **When** the user views the dashboard, **Then** they see total observation nights, total exposure time, and total captured frames
3. **Given** equipment has been used across sessions, **When** the user views the dashboard, **Then** they see most-used equipment and equipment-based summaries
4. **Given** targets belong to catalogues, **When** the user views the dashboard, **Then** they see a breakdown by catalogue with completion progress for each

---

### User Story 8 - Generate Collection Posters (Priority: P4)

An astrophotographer wants to generate a visual poster for any collection, not just the Messier catalogue. Each poster displays a grid of tiles, one per target in the collection. Tiles with completed images show the user's best/latest processed image. Tiles for missing or incomplete targets are clearly distinguished. The user can generate posters for the Messier Collection, Caldwell Collection, a custom "Top 25 Images" collection, or any other grouping.

**Why this priority**: Posters are a flagship visual feature that showcases achievement and motivates continued work. However, they depend on collections, targets, and processed images being available.

**Independent Test**: Can be tested by creating a collection with a mix of completed (with images) and incomplete targets, generating a poster, and verifying tiles display correctly with appropriate visual distinction.

**Acceptance Scenarios**:

1. **Given** a collection exists with some completed targets (having final images) and some incomplete targets, **When** the user generates a poster, **Then** the poster displays tiles for every target in the collection with images for completed targets and placeholder indicators for incomplete ones
2. **Given** a target has multiple processed images, **When** the poster is generated, **Then** the most recently processed image is used for that target's tile
3. **Given** the user has multiple collections, **When** they choose to generate a poster, **Then** they can select any collection as the source
4. **Given** a collection is fully complete (all targets have final images), **When** the poster is generated, **Then** every tile shows an image with no placeholder indicators

---

### User Story 9 - Define Target Relationships (Priority: P5)

An astrophotographer wants to record that certain targets are related. For example, the Horsehead Nebula is contained within the Orion Molecular Cloud, or M81 and M82 are companion galaxies often captured together. Relationship types include Contains, Nearby, Parent Region, Satellite Galaxy, Companion Galaxy, Neighbour, Part of Mosaic, and Captured Together. Navigating from one target to its related targets provides spatial and scientific context.

**Why this priority**: Relationships enrich the data model and aid planning (knowing nearby objects helps frame shots), but are not essential for core workflows.

**Independent Test**: Can be tested by creating two targets, defining a relationship between them, and verifying navigation from either target shows the relationship.

**Acceptance Scenarios**:

1. **Given** two targets exist, **When** the user defines a relationship between them with a type (e.g., "Contains"), **Then** the relationship appears on both targets' detail views
2. **Given** a target has related objects, **When** the user views the target, **Then** related objects are listed with their relationship type and can be navigated to directly
3. **Given** a relationship is bidirectional (e.g., "Companion Galaxy"), **When** it is defined from target A to target B, **Then** target B also shows the reciprocal relationship to target A

---

### User Story 10 - Create Custom Targets (Priority: P5)

An astrophotographer wants to create targets for subjects that do not appear in any standard catalogue: widefield panoramas (Milky Way Panorama), transient events (Comet C/2025, ISS Transit), atmospheric phenomena (Aurora, Meteor Shower), or creative composites. Custom targets should behave identically to catalogue objects: they have sessions, belong to collections, follow workflows, track equipment, and appear on dashboards and posters.

**Why this priority**: Custom targets ensure the system covers every imaging project, not just catalogued deep-sky objects. However, the core system must work for catalogued objects first.

**Independent Test**: Can be tested by creating a custom target, adding a session to it, placing it in a collection, and verifying it appears in the dashboard and can be included in a poster.

**Acceptance Scenarios**:

1. **Given** the user wants to image a non-catalogue subject, **When** they create a custom target with a name, type, and optional coordinates, **Then** the target is created and behaves identically to any catalogue object
2. **Given** a custom target exists, **When** the user records sessions, tracks workflow stages, and adds it to collections, **Then** all features work exactly as they do for catalogue targets
3. **Given** a custom target is created with a name matching an existing target's alias, **When** the system detects the conflict, **Then** it warns the user and offers to link to the existing target instead

---

### User Story 11 - Generate Processing Folder Structure for a Target (Priority: P3)

An astrophotographer selects a target and clicks a button to generate a ready-made folder structure on disk for organising captured data. By default the system creates a Siril-compatible layout with subdirectories for lights, darks, biases, and flats. The user can also define custom folder templates to match other processing tools (e.g., PixInsight, Astro Pixel Processor) and select which template to apply. The generated folders are rooted in a user-configurable base directory with the target name as the parent folder.

**Why this priority**: One-click folder creation eliminates repetitive manual setup before every imaging session and ensures consistent organisation across all targets. It directly supports the processing workflow stages (Raw Captured through Integrated).

**Independent Test**: Can be tested by selecting a target, generating a folder structure, and verifying the correct subdirectories are created on disk at the expected path.

**Acceptance Scenarios**:

1. **Given** a target exists and a base directory is configured, **When** the user triggers folder creation using the default Siril template, **Then** the system creates a directory named after the target containing subdirectories for lights, darks, biases, and flats
2. **Given** a custom folder template has been defined, **When** the user selects that template during folder creation, **Then** the system creates the directory structure matching the custom template
3. **Given** folders already exist for a target at the expected path, **When** the user triggers folder creation again, **Then** the system preserves existing folders and files without overwriting, creating only missing subdirectories
4. **Given** no base directory has been configured, **When** the user triggers folder creation, **Then** the system prompts them to set a base directory before proceeding

---

### User Story 12 - Plan Observations Using Observatory Location (Priority: P3)

An astrophotographer registers their observatory location (latitude, longitude, altitude) in the system. When viewing any target, they can see computed visibility data for that location: rise and set times, transit time and altitude, current altitude and azimuth, best imaging window, hours above a usable horizon, and moon separation. This allows them to plan which targets to image on a given night and prioritise targets approaching their seasonal visibility window. All calculations are performed locally using the target's RA/Dec coordinates, the observatory location, and the selected date/time.

**Why this priority**: Planning is essential to efficient use of clear nights. Knowing when and where a target is visible eliminates guesswork and external tool switching. Ranked at P3 because it requires the target catalogue and coordinates to be in place first.

**Independent Test**: Can be tested by registering an observatory location, selecting a target with known coordinates, choosing a date, and verifying the computed rise/set/transit times match expected astronomical values for that location and date.

**Acceptance Scenarios**:

1. **Given** an observatory location is registered, **When** the user views a target with known RA/Dec coordinates, **Then** the system displays rise time, set time, transit time, transit altitude, and best imaging window for the current date
2. **Given** an observatory location is registered, **When** the user selects a future date, **Then** visibility data is recalculated for that date
3. **Given** multiple targets exist, **When** the user views a planning view for a specific night, **Then** targets are ranked or filterable by visibility quality (hours above horizon, transit altitude, moon separation)
4. **Given** a target has no known coordinates, **When** the user views it, **Then** the system indicates that visibility data cannot be computed and does not show planning metrics

---

### Edge Cases

- What happens when two separate catalogue entries are later discovered to be the same physical object? The system must support merging targets, consolidating all sessions, images, and collection memberships under one unified target.
- How does the system handle a catalogue object with no known coordinates (e.g., some historical entries)? The target is created with coordinates marked as unknown and can still participate in all workflows.
- What happens when a target is removed from a collection that defines a poster? The poster regenerates with a placeholder tile for the removed target's slot.
- How does the system handle extremely large collections (e.g., full NGC with thousands of objects)? The system must remain responsive when browsing, searching, and rendering posters for collections with 10,000+ entries.
- What happens when an observation session is associated with a target that is later merged into another? The session is automatically reassigned to the surviving target.
- How does the system handle duplicate equipment entries (e.g., two cameras with the same model name)? Each equipment item is a distinct entity; duplicate names are permitted to support users who own multiple units of the same model.
- What happens when a target name contains characters that are invalid in file/folder names (e.g., "NGC 1234/5")? The system sanitises the name for folder creation while preserving the original name in the application.
- What happens when the user deletes a registered Observatory that has sessions linked to it? The sessions retain their location data (observatory name and coordinates at time of recording) even if the Observatory entity is removed.

## Requirements *(mandatory)*

### Functional Requirements

**Target Management**

- **FR-001**: System MUST support a universal Target model from which all object types inherit, including Galaxy, Emission Nebula, Reflection Nebula, Planetary Nebula, Dark Nebula, Open Cluster, Globular Cluster, Star Cluster, Supernova Remnant, Molecular Cloud, Galaxy Cluster, Star, Comet, Asteroid, Planet, Moon, Solar Object, Variable Star, Widefield Region, Constellation, Custom Target, and Unknown Object
- **FR-002**: System MUST maintain a canonical identifier, alternate names, cross-catalogue references, and optional SIMBAD/NED identifiers for every target
- **FR-003**: System MUST resolve any known alias or designation to the correct target when searching, ensuring that all names for the same physical object return the same result
- **FR-004**: System MUST allow users to create custom targets for non-catalogue subjects, and these targets MUST support all features available to catalogue targets
- **FR-005**: System MUST support merging two targets that are discovered to represent the same physical object, consolidating all associated data

**Catalogue Management**

- **FR-006**: System MUST include pre-loaded data for the following catalogues: Messier (M), NGC, IC, Sharpless (Sh2), Caldwell, Barnard Dark Nebulae, Lynds Bright Nebulae (LBN), Lynds Dark Nebulae (LDN), Abell Planetary Nebulae, Abell Galaxy Clusters, PGC, UGC, Melotte, Collinder, Trumpler, PK Planetary Nebulae, RCW, Gum, vdB Reflection Nebulae
- **FR-007**: System MUST support adding new catalogues without requiring changes to existing data or core functionality (pluggable catalogue architecture)

**Collections**

- **FR-008**: System MUST allow users to create, edit, and delete collections with a name and optional description
- **FR-009**: System MUST allow a target to belong to zero or more collections simultaneously without data duplication
- **FR-010**: System MUST provide catalogue-based collections automatically (e.g., Messier Collection containing all 110 Messier objects) with completion tracking
- **FR-011**: System MUST display independent completion statistics for each collection (completed / total)

**Observation Sessions**

- **FR-012**: System MUST allow recording observation sessions that capture: date, observatory location (selected from registered Observatory locations or entered as free-text for one-off sites), sky quality, weather, seeing, transparency, moon phase, moon distance, equipment used, guiding details, camera, exposure strategy, captured frame counts, session notes, rejected frame counts, and accepted frame counts
- **FR-013**: System MUST allow a session to be associated with one or more targets (multi-target imaging)
- **FR-014**: System MUST allow a target to accumulate an unlimited number of sessions over time

**Equipment**

- **FR-015**: System MUST allow registering equipment items with a type (Camera, Telescope, Reducer, Barlow, Mount, Guide Camera, Guide Scope, Filter Wheel, Filters, Rotator, Dew Heater, Power Supply, Mini PC, Observatory) and descriptive details
- **FR-016**: System MUST allow selecting from registered equipment when recording sessions
- **FR-017**: System MUST track equipment usage history across all sessions

**Workflow**

- **FR-018**: System MUST provide a default workflow with stages: Planned, Scheduled, Observed, Raw Captured, Calibrated, Registered, Integrated, Processing, Edited, Published, Printed, Archived
- **FR-019**: System MUST allow users to customise workflow stages (add, remove, reorder)
- **FR-020**: System MUST record timestamped stage transitions for each target

**Relationships**

- **FR-021**: System MUST allow defining relationships between targets with types: Contains, Nearby Objects, Parent Region, Satellite Galaxy, Companion Galaxy, Neighbour, Part of Mosaic, Captured Together
- **FR-022**: System MUST display reciprocal relationships (if A contains B, B shows it is contained by A)

**Dashboard**

- **FR-023**: System MUST provide an observatory-wide dashboard showing: total targets, completed targets, objects in progress, objects by type, objects by catalogue, observation nights, total FITS files, total exposure time, storage consumed, average integration time, most-used equipment, largest dataset, deepest integration, longest project, and oldest unfinished project
- **FR-024**: System MUST provide per-collection progress views with independent completion statistics

**Posters**

- **FR-025**: System MUST generate visual posters for any collection, displaying a tiled grid where each tile represents a target
- **FR-026**: System MUST display the user's most recently processed image for completed targets and a clearly distinct placeholder for incomplete targets on posters
- **FR-027**: The existing Messier poster MUST be preserved as a flagship view within the new poster system

**Observatory & Observation Planning**

- **FR-034**: System MUST allow users to register multiple observatory locations, each with a name, latitude, longitude, and altitude, with one location designated as the primary/default for planning views
- **FR-035**: System MUST compute target visibility data locally from the target's RA/Dec coordinates, the registered observatory location, and a selected date/time, including: rise time, set time, transit time, transit altitude, current altitude and azimuth, best imaging window, hours above a configurable minimum horizon altitude, and moon separation
- **FR-036**: System MUST allow users to select any date (current or future) for visibility calculations
- **FR-037**: System MUST provide a planning view that ranks or filters targets by visibility quality for a given night (hours above horizon, transit altitude, moon separation)
- **FR-038**: System MUST gracefully handle targets without known coordinates by indicating that visibility data is unavailable

**Folder Structure Generation**

- **FR-029**: System MUST allow users to generate a processing folder structure on disk for any target with a single action
- **FR-030**: System MUST ship with a default Siril-compatible folder template containing subdirectories: lights, darks, biases, flats
- **FR-031**: System MUST allow users to define, save, and select custom folder templates specifying an arbitrary nested directory structure
- **FR-032**: System MUST create folders within a user-configurable base directory, using the target name as the parent folder
- **FR-033**: System MUST NOT overwrite or delete existing files or folders when generating a structure; only missing directories are created

**Project Structure**

- **FR-028**: Every target MUST own a project structure that organises: metadata, sessions, raw data references, calibration references, integrated data, processing state, final images, reference images, notes, publications, equipment used, processing history, and versions

### Key Entities

- **Target**: The central entity representing any astronomical object. Holds a canonical identifier, object type, coordinates (RA/Dec), alternate names, cross-catalogue references, current workflow stage, and links to sessions, collections, relationships, and project data
- **Catalogue**: A named astronomical catalogue (e.g., Messier, NGC). Contains a registry of objects with their catalogue-specific designations. Supports pluggable addition of new catalogues
- **ObjectIdentity**: The cross-referencing layer that maps multiple designations and aliases to a single Target. Includes SIMBAD and NED identifiers where available
- **Collection**: A named grouping of targets, either auto-generated from a catalogue or manually curated by the user. Tracks completion progress (completed / total)
- **ObservationSession**: A record of a single imaging night, capturing date, location, conditions, equipment, exposure strategy, and frame statistics. Linked to one or more targets
- **Equipment**: A registered piece of observatory hardware (camera, telescope, mount, etc.) with type, name, and details. Referenced by sessions to build usage history
- **WorkflowStage**: A configurable stage in the imaging lifecycle. The ordered sequence of stages defines the project workflow. Each target tracks its current stage and transition history
- **Relationship**: A typed, directed link between two targets (Contains, Nearby, Companion, etc.) with automatic reciprocal display
- **FolderTemplate**: A named directory structure blueprint (e.g., "Siril Default", "PixInsight") defining the nested subdirectories to create when generating a processing folder for a target. One built-in template ships by default; users can create additional templates
- **Observatory**: A registered observing location with name, latitude, longitude, and altitude. Multiple locations can be registered (e.g., home observatory, dark site, travel site) with one designated as primary/default. Used as the reference point for all local visibility and planning computations

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can find any target by searching for any of its known designations or common names, with results appearing in under 2 seconds for catalogues containing up to 50,000 objects
- **SC-002**: The system ships with pre-loaded data for at least 20 astronomical catalogues covering a combined total of at least 30,000 unique targets
- **SC-003**: Users can record a complete observation session (all fields) in under 5 minutes, with equipment selection from a pre-registered inventory
- **SC-004**: Users can track any target through the full imaging lifecycle, with 100% of stage transitions recorded with timestamps
- **SC-005**: Collection progress is accurately calculated and updated immediately when targets change status, with progress displayed as completed / total
- **SC-006**: The observatory dashboard displays all specified metrics with data refreshed within 5 seconds of any underlying change
- **SC-007**: Poster generation supports collections of up to 500 targets, rendering a complete poster within 10 seconds
- **SC-008**: Custom targets participate in 100% of the features available to catalogue targets (sessions, collections, workflows, posters, relationships, dashboard)
- **SC-009**: Target merging consolidates all associated data (sessions, images, collections, relationships, notes) with zero data loss
- **SC-010**: The system handles a personal observatory with up to 100,000 tracked targets and 10,000 observation sessions without noticeable performance degradation in search, browsing, or dashboard views
- **SC-011**: Computed visibility data (rise/set/transit times) is accurate to within 2 minutes compared to established ephemeris tools for any target with known RA/Dec coordinates
- **SC-012**: Users can generate a complete processing folder structure for a target in under 2 seconds

## Assumptions

- This is a single-user personal observatory application, not a multi-user or collaborative platform
- The application operates primarily offline with local data; external service integrations (SIMBAD, NASA, AstroBin, etc.) are future enhancements and not required for the initial release
- Automatic Target Recognition (plate-solving and auto-identification of objects in images) is a future capability and is out of scope for this specification
- Pre-loaded catalogue data will be sourced from publicly available astronomical databases and bundled with the application
- The existing Messier poster functionality is preserved and becomes one instance of the new universal poster system, not a separate feature
- "Storage consumed" in dashboard metrics refers to tracking file sizes referenced by the system, not managing the actual file storage
- The default workflow stages (Planned through Archived) serve as a sensible starting point; users are expected to customise these to match their personal process
- Equipment items are user-defined entries, not sourced from an external product database
- Image files (FITS, TIFF, PNG, etc.) are referenced by path rather than stored within the application's own data store
- Data ingestion from external capture tools (NINA, APT, SharpCap, etc.) is a separate concern and out of scope for this feature; the system assumes users already have data organised in folders on their machine
