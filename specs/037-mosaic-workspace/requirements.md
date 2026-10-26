# 037 Mosaic workspace: requirements

Slices X1 to X3 of the observation intelligence proposal
([docs/proposals](../../docs/proposals/observation-intelligence-and-mosaics.md), section 6). A
mosaic is drawn on the sky as a grid of named panels, kept revision by revision, and then filled
with the FITS files actually captured, at the places their solves put them. The IDs are the
proposal's `MO-` IDs; the ones it did not have (MO-014 onwards) are added here.

This spec grows slice by slice: only the requirements a merged slice builds are listed.

## What slice X1 delivers

- **Mosaics** under Collections lists every saved mosaic and draws a new one. A grid starts from:
  - a centre typed in hours, sexagesimal or degrees;
  - a target from the catalogue (its centre, and its Sky planner plan with **Open its Sky planner plan**);
  - a solved file of the target (its centre, turn and field).
- The grid is rows × columns (up to 12 each) with an overlap across and down (15% to start), a
  position angle and a field from Equipment or typed in. Moving, turning, adding or removing a row
  or column, or dragging the drawing, lays the grid out again in the core.
- Each panel R1C1… has an ICRS centre, its own position angle and a footprint polygon on its own
  tangent plane, and says on how many of the coming 30 nights it clears the altitude limit.
- **Save as revision N** keeps every earlier revision as it was saved. **Export CSV** and **Export
  JSON** write the panels of the revision on screen.

## What slice X2 delivers

- A mosaic's page shows **Captures on this revision**: each solved light group (one target, one
  folder, one night, placed by its one solve) and each master drawn at its solved footprint over the
  panels, with its thumbnail laid on the footprint, every panel it meets and the share of each.
- A capture mostly in one panel (60% of it or more, and 20 points clear of the next) is placed there
  without review; one shared between panels is placed on the panel with most of it and marked to
  review. An edge brush under 2% of the capture is not counted as an overlap.
- Clicking a capture puts it on a panel by hand or leaves it out, with a reason; clicking a panel
  lists what falls on it. A hand placement is kept apart from the computed one and is marked a
  conflict when the capture's footprint does not reach that panel.
- Trays list the mosaic's targets' captures not solved yet (with **Plate solve**), those solved
  outside the grid, and hand placements on files the index no longer has.
- Saving a changed grid first lists the captures that would change panel.

## Changes to the proposal

- **A capture, not a frame.** Spec 024 solves one light per folder per night, so the lights of one
  target in one folder on one night are placed together by that solve; a master is placed on its own.

- **Position angle, stated once.** A position angle is that of the panel's up axis, east of north.
  Plate solvers report CROTA2, the same turn the other way, so the export carries both.
- **Each panel's own angle.** Panel centres are spaced on the grid's tangent plane, and each panel
  is drawn on its own tangent plane at the grid's up axis carried to its centre. Near a pole the
  angle differs from panel to panel, which is what the camera needs to be turned to there.
- **Per-panel overrides wait.** Moving one panel on its own (D1.5) and per-rig capture
  configurations come after slice X3, when there are captures to move it to.
- **The Sky planner card stays.** It answers how many panels a target needs; **Open its Sky
  planner plan** copies it into a workspace. Its saved plan is not changed.

## Planning a mosaic

| ID | Pattern | Requirement |
|----|---------|-------------|
| MO-001 | Event | When a user creates a mosaic, the system shall generate persistable ICRS panel centre coordinates, a position angle and a planned sky footprint for each panel named R<row>C<column> from the grid's centre, position angle, rows, columns, overlap across and down, and field of view, and keep them as revision 1. |
| MO-002 | Event | When the grid's size, centre, angle, overlap or field changes, the system shall lay the panels out again from the changed grid, and when such a change is saved it shall add it as the next revision, saving nothing when the panels and the field's source would be the same as the latest revision's. |
| MO-003 | Optional | Where a planned grid crosses RA 0° or approaches a celestial pole, the system shall lay out panels whose centres and footprints stay valid ICRS positions with neighbours spaced by the field less the overlap on the sky, not by a constant offset in RA. |
| MO-004 | Event | When an indexed light group or master has a plate solve, the system shall work out its footprint on the sky from the solve's centre, scale, size, rotation and mirroring, and every panel of the revision that footprint overlaps by area on the sphere. |
| MO-005 | Event | When a capture's footprint overlaps several panels, the system shall keep every overlap with the share of the capture and of the panel, place it on the panel holding most of it, and mark it for review unless that panel clearly holds most of it. |
| MO-006 | Unwanted | If a capture of the mosaic's targets has no plate solve, or its solve failed, then the system shall not place it on any panel, list it as not solved with the solver's reason, and offer to plate solve its target. |
| MO-007 | Event | When the user opens a mosaic revision, the system shall draw the planned panels and the captures' solved footprints, with their thumbnails, in the same tangent-plane projection about the grid's centre. |
| MO-009 | Event | When a user puts a capture on a panel by hand or leaves it out, the system shall keep that apart from the computed placement with the revision it was made on, mark a hand placement whose footprint does not reach the panel as a conflict, and restore the computed placement when it is cleared. |
| MO-010 | Event | When the user saves a changed mosaic plan, the system shall keep every earlier revision and its panels exactly as they were saved, and show any of them on request; before saving it shall list the captures whose panel would change, and keep a hand placement made on an earlier revision but mark it for review. |
| MO-013 | Event | When a capture the user placed or left out is no longer in the index, the system shall keep what they said with where its last solve pointed, list it as no longer in the index, and not place it on any panel. |
| MO-012 | Event | When users export a capture plan, the system shall write each panel's stable identifier, ICRS centre coordinates as text and degrees, position angle and solver rotation, field, footprint corners and the plan revision as CSV or JSON. |
| MO-014 | Event | When the user types a centre, the system shall read right ascension as hours (hh:mm:ss, hh mm ss or decimal with h) or decimal degrees and declination as ±dd:mm:ss or decimal degrees, and refuse text out of range, or with the other coordinate's unit marks or marks out of order, rather than guess. |
| MO-015 | Unwanted | If a grid has no name, a declination beyond ±90°, rows or columns outside 1 to 12, an overlap outside 0% to 60%, a field outside 0° to 30° or a span of more than 60° a side, then the system shall refuse to save it and say each problem; a save that another save overtook is refused as well, keeping the other. |
| MO-016 | State | While the observing site is set, the system shall show for each panel of a mosaic how many of the coming 30 nights it clears the altitude limit for the minimum usable hours, and the first of them. |
| MO-017 | Event | When the user opens a target's Sky planner plan as a mosaic, the system shall create a mosaic with the same rows, columns, overlap, rotation and field centred on the target, and say what is missing when the target has no plan to give. |
