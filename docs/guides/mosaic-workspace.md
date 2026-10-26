# Mosaics: a plan on the sky

**Collections → Mosaics** keeps a mosaic as a grid drawn on the sky by its coordinates. Each panel
has a name (R1C1, R1C2, …), an exact ICRS centre and the rectangle it covers, and the plan is kept
revision by revision so that captures placed on it stay traceable. Spec
[037](../../specs/037-mosaic-workspace/requirements.md); the proposal behind it is in
[docs/proposals](../proposals/observation-intelligence-and-mosaics.md).

The Sky planner's **Plan a mosaic** card is still the quick answer to "how many panels does this
target need". **Open in Mosaics** on that card, or **Open its Sky planner plan** on the Mosaics
page, copies its saved plan into a mosaic.

## Drawing a grid

1. Name it, and optionally start from a target. Picking a target puts the grid on its catalogue
   position and lists its solved files: **choosing a file** centres one panel on exactly what that
   file shows, turned the way it was.
2. Type the centre in any usual form. RA is hours (`20:59:17`, `20h59m17s`, `20 59 17`, `20.99h`)
   or degrees (`314.82`); Dec is `+44:31:44`, `44°31'44"` or degrees. Anything out of range is
   refused, not guessed.
3. Set rows and columns (up to 12 each), the overlap across and down (15% to start) and the
   position angle.
4. The field of each panel comes from a scope and camera in Equipment, or is typed in arc minutes.
5. Drag the drawing, or use **Move half a panel**, **Turn** and **Add a row** / **Remove a
   column**. Every change is laid out again from the numbers: moving the grid moves its centre.

The drawing has north up and east on the left, as the sky is seen.

## The conventions

| | |
|---|---|
| Coordinates | ICRS (J2000) RA and Dec in degrees, RA in [0°, 360°) |
| Position angle | of a panel's up edge, measured from north through east |
| Rotation in the export | CROTA2 as ASTAP and Siril report it: minus the position angle |
| Panel names | R<row>C<column> from the top left of the grid as drawn |
| Footprint | the field's rectangle on the panel's own tangent plane, corners from top left clockwise |

Panel centres are spaced by one field less the overlap on the grid's tangent plane, so a grid
near a pole or across RA 0° is spaced by angle on the sky, never by a fixed step in RA. Each panel
is drawn on its own tangent plane at the grid's up axis carried to its centre; near a pole that
angle differs between panels, and the export gives each panel's own.

## Revisions

**Save as revision N** adds a revision only when the panels or where the field came from change;
saving the same grid again says nothing changed. If the same mosaic was saved from elsewhere in the
meantime, the save is refused and asks you to open the latest revision. Earlier revisions are kept exactly as saved, with their panels, and open from
the links under the panel table. Editing an earlier revision and saving it makes a new latest
revision; nothing is overwritten.

## Exports

**Export CSV** and **Export JSON** write the revision on screen: the plan's name, the revision,
`ICRS`, and for each panel its id, row and column, centre as `hh:mm:ss ±dd:mm:ss` and degrees,
position angle and rotation, the field, and the four corners. A device-specific export (a
Seestar or N.I.N.A. sequence) can be built from the JSON later.

## Your captures on the grid

**Captures on this revision** places what you have already shot. A capture is either a master,
or the lights of one target from one folder on one night: plate solving (on the target's page, or
**Plate solve** here) solves one light of each such group, and that solve places the whole group.
Folder and file names are never used to decide the panel.

Each capture is drawn at its solved footprint, with its thumbnail laid on it, over the panels:

- **Green**: most of it (60% or more, and clearly more than in any other panel) falls in one
  panel, so it is placed there.
- **Amber**: it sits between panels, or only partly on the grid; it is placed on the panel holding
  most of it, and every overlap is listed with its share, so check it.
- **Red**: you put it on a panel by hand that its footprint does not reach. Your choice counts, but
  stays flagged.
- **Grey**: you left it out.

Click a capture (on the drawing or in the table) to put it on a panel by hand, leave it out, or go
back to the computed panel; a reason is optional and kept. Dashed outlines are your placements.
Click a panel to list everything that falls on it. Your placements are kept apart from what is
computed, with the revision you made them on: open a later revision and they are shown for review.

Below the drawing, trays list the mosaic's targets' captures **not solved yet** (with the solver's
reason when it failed), those **outside the grid**, and your placements on files **no longer in
the index**, kept with where they last pointed in case the files come back.

When you change the grid and save, the captures that would change panel are listed first; **Save
anyway** saves the revision, and the earlier revision keeps its placements.

Not yet checked against real files: the thumbnail's orientation on a mirrored or bottom-up FITS,
and the solver rotation sign on real ASTAP and Siril output. Spec 024's own overlap check on the
target page still reads the rotation as a position angle; this page does not.

## How much is covered

**Coverage** works out what your captures add up to on this revision, from their solved footprints
only: a capture that is not solved, or that you left out, adds nothing until it is.

- **The heat map** shades the sky inside the panels by usable exposure, all filters together or one
  you pick; sky inside a panel that no counted capture covers is marked in the warning colour.
- **The panel table** gives each panel's covered share of its area, its shallowest and deepest
  exposure, its gaps (each with its share and where it lies, such as "toward the north-east"), and
  its exposure per filter against the target's goal for that filter. A panel is *covered* at 95% of
  its area; meeting its goals is shown apart, so covered never means finished.
- **What counts** lists each capture with the exposure it adds and why any of it does not count.

Each frame counts once. Frames grading rejects and frames with no exposure time add nothing; a
frame indexed twice (the same full content hash, for example a copy in a landing folder and in
the target's home) counts from its first path only, as long as the file has not changed since it
was hashed; and a master adds no exposure on a panel where lights of its filter are counted, since
it is made of them. Only what counts covers sky, so such a master, or one with no exposure time,
covers nothing either. A capture's exposure counts toward the
one panel it is on, so the panels add up to the mosaic's total; the heat map adds it wherever the
capture covers, which is how deep each part of the sky really is.

Coverage is sampled on the grid's tangent plane in square cells, a sixteenth of a panel's shorter
side (bigger on a large grid), each weighted by its area on the sphere, so a share is good to about
one cell along each edge of a panel.

**Next session** lists the panels still to shoot, the least covered first, each with where to point
(a point inside its largest gap, nearest the gap's middle, when it is partly covered, else its
centre) and what each filter
still needs. **Export next session CSV** or **JSON** writes the same list with the aim as
`hh:mm:ss ±dd:mm:ss` and degrees, the position angle and solver rotation, and seconds per filter
had, wanted and still needed.

Not yet checked against real files: whether Siril writes a master's EXPTIME as one sub or as the
whole stack (a master's exposure counts only where no lights of its filter are counted).

## Coming next

A [mosaic campaign](projects.md) follows a mosaic panel by panel with its own rule for finished:
coverage, goals per panel, and a stack, a processed file or a finished image of its target.
