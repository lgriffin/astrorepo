# 025 Gallery inspector: requirements

This is slice H1, the first half of the gallery (see the roadmap). SyQon Studio has a scientific
image inspector, a narrowband palette simulator, a compare view and a coordinate overlay. Its
editing stays in Siril, RC Astro and SyQon; what astrorepo takes is the looking:
- what one file's pixels say;
- which palettes a target's filters allow, and how each would look;
- two of a target's images side by side;
- where a solved image points, with the catalogue objects in it.

## What this slice delivers

- **Inspector** on the FITS files page. Opening a file shows:
  - a histogram per channel (red, green and blue for a colour sensor's raw frame or a colour
    image, luminance for a mono one);
  - the median, the noise (from the median absolute deviation) and the share of saturated and of
    black-clipped pixels for each channel, with a sentence when either is worth knowing;
  - the brightest star that did not saturate: its FWHM, peak and radial profile;
  - a small auto-stretched preview, with a coordinate grid and catalogue labels when the file's
    header carries a plate solution.
- **Palettes** on a target's Files. HOO, SHO, HSO, RGB and LRGB, each with what goes where and
  what stands in its way. A palette whose channels all have a master can be previewed: the main
  process sends a small grey preview of each channel and the window colours and combines them.
  The palette chosen is saved for the target and shown beside the post-processing command.
- **Compare images** on a target's Files. Any two of its masters or finished images, side by
  side or under a slider, each from a preview at most 1024 pixels wide with the same auto-stretch.
- **Coordinate grid and catalogue labels**: right ascension and declination lines and the
  Messier, NGC and IC objects in the field, drawn over a preview whose header is solved.

## Changes to the blueprint

- **The field comes from the file's own header, else its stored plate solve.** A FITS file whose
  header carries a TAN solution (CRVAL1/2 with a CD matrix, or CDELT1/2 and CROTA2) has a field;
  the header is read with the pixels, so a solved file the scan has not indexed yet still gets
  its grid. A file without one uses the plate solve slice D stored for its path (INS-012), when
  that solve succeeded over an image of the same size; others do not offer the overlay. The
  field's shape is slice D's solved field, which records whether the image is mirrored when the
  solver says (from the sign of the WCS's CD determinant, or Siril's "(flipped)"); a stored solve
  that does not say is drawn as the sky is seen, with a sentence that east and west may be
  swapped. A header's own transform is kept whole, so pixels that are not square or a skewed
  matrix still place the grid exactly.
- **Finished images are FITS and PNG.** The images folder and the folders directly in it are
  listed. JPEG and TIFF need a decoder the app does not have yet, so they are not offered for
  comparing; Siril_Scripts v2 writes a PNG and a FITS of every finished image.
- **The palette is a hint, not an argument.** Siril_Scripts v2 processes one stack and has no
  palette option, so the choice is shown beside its command rather than added to it.
- **Each image is stretched by the same rule, not by the same numbers.** A linear master and a
  finished image differ too much for one set of numbers to suit both. The auto-stretch puts each
  image's sky at a quarter grey, as Siril's and PixInsight's screen stretch do.

## Inspector

| ID | Pattern | Requirement |
|----|---------|-------------|
| INS-001 | Event | When the user opens a file on the FITS files page, the system shall show for each channel (red, green and blue for a colour sensor's raw frame or a colour image, else luminance) its histogram over one range shared by every channel, median, noise from the median absolute deviation, and the share of saturated and of black-clipped pixels, reading the file once for these figures and its preview. |
| INS-002 | Event | When the user opens a file on the FITS files page, the system shall show the FWHM, peak above the sky and radial profile of the brightest star none of whose own pixels (each colour plane, or each pixel of a raw frame's 2×2 cells) reaches 98% of the ceiling, or say that none stands out. |
| INS-003 | Unwanted | If an image cannot be read, then the system shall say why and what to do instead of showing figures. |

## Palettes

| ID | Pattern | Requirement |
|----|---------|-------------|
| INS-004 | Ubiquitous | The system shall list a target's palettes from the filters it has masters or integration for: HOO needs Ha and OIII, SHO and HSO need SII, Ha and OIII, RGB needs red, green and blue or a colour camera's broadband stack, and LRGB adds luminance; a colour camera behind a dual-band filter gives Ha and OIII, and one behind a broadband light-pollution filter (such as one named LP) gives red, green and blue. |
| INS-005 | Event | When the user previews a palette whose channels all have a master, the system shall send a small auto-stretched grey preview of each channel and draw them combined in the palette's colours; when a channel has no master, it shall say which lights to stack. |
| INS-006 | Event | When the user chooses a palette the target's filters allow, the system shall save it for the target and show it beside the post-processing command as a hint for Siril_Scripts; it shall refuse a palette the filters do not allow. |

## Compare

| ID | Pattern | Requirement |
|----|---------|-------------|
| INS-007 | Event | When the user picks two of a target's masters or finished FITS and PNG images, the system shall show them side by side and under a slider, each from a preview at most 1024 pixels wide with the same auto-stretch rule, and each with its own grid and labels on its own side of the slider. |
| INS-008 | Unwanted | If the window asks for an image that is not one of the target's masters or finished images, then the system shall refuse it without reading it. |

## Overlay

| ID | Pattern | Requirement |
|----|---------|-------------|
| INS-009 | Ubiquitous | The system shall place right ascension and declination lines, labelled in whole minutes of time and arc, on a solved image's pixels by the gnomonic projection: through a header's own reference pixel and CD matrix, else from a stored solve's centre, rotation, scale, size and mirroring. |
| INS-010 | Ubiquitous | The system shall place on a solved image the Messier, NGC and IC objects whose centre falls inside it, each once, with its size as a circle. |
| INS-011 | Optional | Where an image's header carries a TAN plate solution with a declination within ±90°, the system shall offer the coordinate grid and catalogue labels on its preview and say where it points; otherwise, and without a stored plate solve (INS-012), it shall not offer them. |
| INS-012 | Optional | Where an image's header carries no plate solution but a stored plate solve (specs/024-sky-geometry) placed that file at the same size, the system shall use that solve for the coordinate grid, the catalogue labels and where it points, and say which solver placed it; a solution in the header wins over a stored solve; when the solve did not record whether the image is mirrored, it shall say that east and west may be swapped. |

## Quality

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-019 | Ubiquitous | The system shall read an image's pixels on a worker thread, one image at a time, refusing images over 200 megapixels from the header before reading pixel data (and PNG data that would unpack beyond its stated size), and send the window only statistics and previews at most 1024 pixels wide, never a full frame. |
