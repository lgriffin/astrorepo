# 026 Other rigs: requirements

This is slice O, the last of the SyQon-inspired slices (see the roadmap). Leigh shoots a Seestar
S50 and a Vaonis Vespera Pro, both colour cameras that write FITS. Other people shoot DSLRs and
mirrorless cameras that write camera RAW, mono cameras behind a filter wheel, and comets. This
slice lets the cockpit index, plan and stack for them, without getting in Leigh's way: everything
here only appears when such frames or settings exist.

## What this slice delivers

- **Camera RAW.** A scan indexes CR2, NEF, ARW, DNG and the other TIFF-based RAW formats from
  their tags, into the same index as FITS frames:
  - the camera's make and model, the capture time, the exposure and the image size;
  - ISO, kept as the gain, so calibration matching works as it does for FITS;
  - the focal length and pixel size, when the camera records them, for the image scale;
  - the temperature, when the EXIF records one outside the maker note.

  The stacking plan treats RAW lights as colour and recommends Siril's colour script, whose
  `convert` step reads RAW itself.
- **Mono cameras with filters.** When mono lights carry two filters or more, the plan stacks each
  filter on its own. Each filter gets its own work folder with its own lights and flats and the
  shared darks and biases, and runs Siril's mono script. Each filter shows its frames, space,
  missing flats and, once stacked, its channel master.
- **The filter to shoot tonight.** For a target shot through a filter wheel, tonight's plan and the
  next actions say which filter to capture. Narrowband while the moon is bright, broadband while it
  is dark, and within that the channel that lags first, for example: "Narrowband while the moon is
  bright: capture OIII, it has 40 m against 6 h of Ha."
- **Comets.** A target whose type is comet takes its orbit from the Minor Planet Center's one-line
  format. The app works out where the comet is in each light. It then writes the positions file
  for Siril's comet registration into the work folder, with the comet's motion for the
  registration step.

## Changes to the blueprint

- **No RAW decoder.** The app reads RAW tags with a small TIFF reader of its own, with no new
  library. Pixels are never decoded, so frame grading does not measure RAW lights. They show why
  and stay in the stack, as any light that cannot be measured does (GRD-005). Siril reads the
  pixels through LibRaw when it stacks.
- **CR3 and RAF are found, not read.** Canon's CR3 is ISO base media and Fujifilm's RAF its own
  container, not TIFF. They are listed with the files that could not be read, saying so, and
  Siril still gets them, since LibRaw reads both. Converting them to DNG (Adobe's free converter)
  gets them indexed.
- **A RAW frame's type comes from its name.** RAW files record no frame type. A word in the file
  name decides ("DARK_300s_0001.CR2", "M31_LIGHT_0001.CR2"), else the folder it sits in when that
  folder is named for its frames ("Darks", "flats_2024-03-10"). Only the nearest folder counts,
  so a target folder called "Dark Shark" never turns its lights into darks. Anything else is a
  light.
- **The capture time keeps the camera's clock.** EXIF times are local. When the camera records its
  offset (OffsetTimeOriginal, EXIF 2.31) the time is turned into UTC. Otherwise it is kept as
  written and the header row says the time zone is unknown; comet positions then need the
  camera's clock on UTC.
- **Filters are named, not guessed.** Filter planning starts only when lights carry two filters the
  app can name: Ha, OIII, SII, NII, H-beta, L, R, G, B and their usual spellings. The Seestar's LP
  and IR-cut filters and dual-band filters are neither narrowband nor broadband, so Leigh's targets
  never get a filter suggestion. The lagging channel reuses the channel balance of spec 020.
- **Per-filter stacks reuse the job runner.** Each filter's stack is an ordinary queued stack whose
  work folder is `filters/<filter>` inside the target's work folder, with the step-by-step runs,
  carrying on and manifests of spec 021. A stack that would mix filters in one folder is refused.
- **Comet positions are two-body.** The orbit is the MPC's osculating orbit around the Sun, solved
  with universal variables so elliptic, parabolic and hyperbolic comets take the same path. The
  Earth comes from astronomy-engine (VSOP87), with the site's offset when it is set. The position
  is astrometric J2000, corrected for light time, at mid-exposure (DATE-OBS plus half the
  exposure). Planets' pull and the comet's own outgassing are left out, which is why the
  accuracy target below is set near the elements' epoch.
- **The positions file is the app's, the registration Siril's.** The file is a CSV with one row per
  light: frame name, UTC date, RA and Dec in degrees. The registration step names Siril's comet
  registration and gives the comet's motion in arc seconds an hour and its direction. The app
  does not drive Siril's comet registration itself, since Siril's stock scripts have no comet step.

## Camera RAW

| ID | Pattern | Requirement |
|----|---------|-------------|
| RIG-001 | Ubiquitous | The system shall index camera RAW frames in CR2, NEF, ARW, DNG and other TIFF-based RAW formats from their TIFF and EXIF tags alone, into the index FITS frames use: camera make and model, capture time, exposure, ISO as gain, image size, focal length and pixel size, and the temperature where the EXIF records one outside the maker note. |
| RIG-017 | Ubiquitous | The system shall take a camera RAW frame's type from a frame-type word in its file name, else from its nearest folder when that folder is named for its frames, else take it as a light. |
| RIG-002 | Event | When a scan finds a CR3 or RAF file, the system shall list it among the files it could not read, saying it was found and its metadata is not read, and still lay it out for Siril. |
| RIG-003 | Unwanted | If a camera RAW file is not TIFF underneath or its tags point past its end, then the system shall set it aside with the files it could not read, with the reason. |
| RIG-004 | Event | When a stack's lights include camera RAW frames, the system shall lay them out in the Siril work area as they are, take them as colour, recommend Siril's colour script and say in the plan that its convert step reads RAW. |
| RIG-005 | Unwanted | If frame grading measures a camera RAW light, then the system shall record that its pixels are not measured and keep it in the stack. |

## Mono cameras with filters

| ID | Pattern | Requirement |
|----|---------|-------------|
| RIG-006 | Optional | Where a stack's mono lights carry two filters or more, the system shall plan one stack per filter in its own work folder, with each filter's lights, its own flats and the shared darks and biases, and show each one's frames, space and missing calibration for Siril's mono script. |
| RIG-007 | Event | When a filter's stack has left a result in its work folder, the system shall list it as that filter's channel master, and say how many channels still need one. |
| RIG-008 | Ubiquitous | The system shall count each filter's flats from the flats taken with that filter, name the filters with none of their own, and say how many lights and flats record no filter. |
| RIG-009 | Event | When the user queues one filter's stack, the system shall lay out only that filter's lights and flats with every dark and bias in the filter's work folder and run Siril's mono script there. |
| RIG-018 | Unwanted | If a stack of mono lights that carry several filters is queued as one, then the system shall refuse it and ask for each filter's stack instead. |

## Planning

| ID | Pattern | Requirement |
|----|---------|-------------|
| RIG-010 | Event | When tonight's plan names a target with two filters or more that it can name, the system shall suggest the filter to capture: narrowband while the moon is bright and broadband while it is dark, the lagging channel of that family first, else its least captured. |

## Comets

| ID | Pattern | Requirement |
|----|---------|-------------|
| RIG-011 | Event | When the user pastes a comet's line in the Minor Planet Center's one-line format, the system shall read the perihelion date, perihelion distance, eccentricity, inclination, node, argument of perihelion and epoch from it and keep them with the target. |
| RIG-012 | Unwanted | If the line cannot be read as an MPC comet orbit, then the system shall say which part is wrong and keep the orbit it had. |
| RIG-013 | Ubiquitous | The system shall work out a comet's astrometric J2000 right ascension and declination at each kept light's mid-exposure from its two-body orbit around the Sun, seen from the site when set and the Earth's centre otherwise, corrected for light time. |
| RIG-014 | Event | When the user asks for the positions file, the system shall write one row per light (frame name, UTC date, RA and Dec in degrees) into the stack's work folder, and give the step that registers on the comet with its motion in arc seconds an hour and its direction. |
| RIG-015 | Unwanted | If a comet's lights include some with no capture time, then the system shall leave them out of the positions file and say how many. |

## Staying out of the way

| ID | Pattern | Requirement |
|----|---------|-------------|
| RIG-016 | State | While a target has no camera RAW lights, no mono lights with two named filters or more and is not a comet, the system shall show none of this slice's notes, plans, suggestions or steps. |

## Quality

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-020 | Ubiquitous | The system shall place a comet within 1 arc minute of a published ephemeris for the same osculating elements near their epoch, and shall write its positions file only inside the stack's work folder. |
