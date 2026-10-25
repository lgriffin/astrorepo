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

## Coming next

Slice X2 places the FITS files you have already captured at their solved footprints over the
grid; slice X3 works out each panel's coverage, its usable exposure per filter, and the gaps.
