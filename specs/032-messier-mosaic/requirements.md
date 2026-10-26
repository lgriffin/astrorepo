# 032 Messier mosaic: requirements

This is slice J, the Messier poster from the blueprint, reshaped by Leigh's request (October
2026): "create a mosaic of the Messier objects wherein it picks up the image file and has it
embedded into the mosaic … press a button to view the mosaic and intelligently it should tie into
the observation capabilities so that we are able to seamlessly see what targets we have gaps for."

The app already had a Posters page that drew a grid of a collection's names, coloured by workflow
stage. It showed no images and said nothing about when a missing object can be shot. This slice
adds the mosaic as its own place and leaves Posters as it is.

## What this slice delivers

- **A Messier mosaic** under Collections in the sidebar, opened by a button on Home ("Where your
  targets are") and on Posters. All 110 objects in Messier order, eleven to a row, ten rows.
- **Your own pictures in the tiles.** Each tile shows the object's own image: its newest finished
  JPEG or PNG, else a finished TIFF, else a finished FITS, else its newest colour master, else any
  master. A finished image is drawn with its own tones and colours; a master is auto-stretched as
  the inspector stretches it.
- **What is missing.** Each tile says how far the object has come: imaged, stacked but not
  finished, captured but not stacked, or not captured yet. Counts and a progress bar sit above.
- **When each gap is up.** With the site set, a tile without a finished image says whether the
  object is up tonight (hours above 30°, how close the moon comes, whether its season closes
  within 30 days), up but kept out by a bright moon, in season from a later month (and its best
  month), or never high enough from the site. Filters show all, not imaged, not captured, or
  missing and up tonight.
- **Details.** Opening a tile shows a larger picture, the object's type, constellation and
  magnitude, its state and integration, its outlook and 12 months of usable hours, with links to
  its target page and the Sky planner.
- **Next actions.** Home's Next actions names the three Messier objects with nothing captured that
  are up tonight, after tonight's captures and planned mosaic tiles and before stacking. Each opens
  the mosaic on its tile.
- **Save as image.** The mosaic is saved as one PNG with every picture and label.

## Changes to the blueprint

- **A mosaic of the catalogue, not a poster of a collection.** The blueprint's slice J was a
  printable poster. Leigh asked for the Messier mosaic with gaps tied into planning, so the mosaic
  is a live page first and a PNG second; printing layouts for other collections stay on Posters.
- **Objects come from the seeded catalogue.** Each of the 110 is the target its Messier
  `catalogue_entries` row names. The scanner links frames to that target through its aliases, so
  "M 31" frames and the "Andromeda Galaxy" target are one tile.
- **Pictures are found, never chosen.** The tile takes the newest picture by a fixed order of
  formats rather than asking Leigh to pick one. Choosing a picture per object is a follow-up.
- **JPEG and TIFF are drawn by the desktop host.** The app reads FITS and PNG itself, on the
  inspector's worker thread. JPEG and TIFF need a decoder it does not have, so the Electron host
  lends its native images: on Windows the system thumbnailer, which also reads TIFF. A file the
  host cannot decode falls through to the object's next picture.
- **Images loose in the shared images folder.** The image scan files images that sit directly in
  `<home>/images` under that folder for every object they name. There, only files whose names give
  the object's Messier number count as its pictures, so one object's image never fills another's
  tile.
- **The outlook reuses the forward plan.** Tonight, the closing-season nights and the 52 weekly
  nights come from the same ephemeris, altitude limit (30°), minimum usable hours (1) and
  bright-moon rule as the Sky planner, so the mosaic and Home never disagree about tonight.

## Mosaic

| ID | Pattern | Requirement |
|----|---------|-------------|
| MES-001 | Ubiquitous | The system shall show the Messier objects in the catalogue as a mosaic of tiles in Messier order, eleven to a row, each with its designation and common name, with how many of the 110 are imaged, stacked, captured and not captured. |
| MES-002 | Ubiquitous | The system shall mark each tile imaged when a finished image of the object is on disk, whatever the last scan counted, stacked when it has a master or processed image but no finished one, captured when it has light subs but no stack, and not captured otherwise. |
| MES-003 | Ubiquitous | The system shall show in each tile a picture of the object's own image, trying its finished JPEG and PNG images, then finished TIFF, then finished FITS, then colour masters, then other masters, newest first within each, drawing a finished image with its own tones and a master auto-stretched, at most 512 pixels wide; besides the target's own images folder, folders directly in the library's shared images folder named for the object (its Messier number, name or an alias) and images loose there whose names give its Messier number shall count, and no others there. |
| MES-004 | Unwanted | If one of an object's images cannot be drawn (including a TIFF where the system has no thumbnailer, or a JPEG over 25 MB that would have to be decoded on the main process), then the system shall try its next image, and when none can be drawn it shall show the tile without a picture and say why. |
| MES-005 | Optional | Where the observing site is set, the system shall say for each object whether it is up tonight, with its usable hours, how close the moon comes and the days until its season closes when that is within the planning window; up tonight but ruled out by a bright moon; in season from a later month in the next 12, with its best month; or never in season from the site in the next 12 months. |
| MES-006 | Event | When the user picks a filter, the system shall dim every tile but those the filter shows: all of them, those not imaged, those not captured, or those not imaged that are up tonight. |
| MES-007 | Event | When the user opens a tile, the system shall show a larger picture, the object's type, constellation and magnitude, its state and integration, its outlook with its usable hours per night in each of the next 12 months, and links to its target page and the Sky planner. |
| MES-010 | State | While the observing site is not set, the system shall show the mosaic with its pictures and states and say that setting the site shows when each gap is up. |
| MES-011 | Unwanted | If the window asks for the picture of a Messier number outside 1 to 110, then the system shall refuse it without reading any file; the window names an object by number and never a path. |
| MES-012 | Ubiquitous | The system shall draw tile pictures one at a time, read FITS and PNG pixels on the inspector's worker thread, and keep the last 300 drawn pictures until their file changes, so reopening the mosaic redraws nothing unchanged. |

## Ties into planning

| ID | Pattern | Requirement |
|----|---------|-------------|
| MES-008 | Ubiquitous | The system shall list in Next actions the three Messier objects with nothing captured that are up tonight and not ruled out by the moon, closing seasons first and then the most usable hours, after tonight's captures and planned mosaic tiles and before stacking, leaving out an object already listed as a capture and one whose finished image is in its folder, and listing none when tonight's plan fails. |
| MES-013 | Ubiquitous | The system shall open the mosaic from its own page under Targets (spec 041 V2 moved it from Collections), from a button on Home and on Posters, and from a Messier gap in Next actions, on that object's tile. |

## Saving

| ID | Pattern | Requirement |
|----|---------|-------------|
| MES-009 | Event | When the user presses Save as image, the system shall save the mosaic as one PNG of every tile in Messier order, eleven to a row, each with its picture cropped square or a dark square with its designation, and its designation and name beneath. |
