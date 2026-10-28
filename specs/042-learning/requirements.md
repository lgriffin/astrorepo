# 042 Learning while you observe: requirements

Leigh asked (28 October 2026): "I'm super interested in astrophysics, can we make the app more
educational and integrate learning opportunities as the user is using it". The app teaches inside
the places already used (a target's page, Tonight, the FITS headers, stacking, mosaics, the
gallery), not in a separate course, and where it can the explanation is worked out from the user's
own numbers. Every fact names a source, so nothing is invented (PRODUCT.md).

The whole plan (slices L1 to L7) is in the plan document linked from `docs/roadmap.md`. Only the
slice being built has requirements here (charter III).

## L1: foundation

- A knowledge base in `packages/domain/src/learning.ts`: concepts (a one-line answer, a
  paragraph, a formula where there is one, related concepts, sources) and a primer for every kind of
  object a target can be (what it is, what makes its light, where it comes from, what to look for,
  how its physics shapes the imaging, and a warning where one is needed). It reaches the renderer
  over `learning:library`; a source opens by id over `learning:open-source`.
- One shared **Why?** control (`components/ui/Explain.tsx`) and a **The physics** card on every
  target's Overview, with the target's magnitude and size told in words.
- **Settings → Learning**: off, short or deep (the default since L2, Leigh's choice).

| ID | Pattern | Requirement |
|----|---------|-------------|
| LRN-001 | Event | When the user opens a Why? beside a value, the system shall show the concept behind it at the user's learning level, with its related concepts to open in place and the sources it rests on, and shall close it on Escape, on Close or on a click outside, giving focus back to the Why?. |
| LRN-002 | Ubiquitous | The system shall name at least one source for every concept and object primer, link only to concepts and sources the knowledge base holds, and keep each concept's one-line answer within 160 characters. |
| LRN-003 | Ubiquitous | The system shall show on every target's Overview a primer for its kind of object, saying what it is, what makes its light, where it comes from, what to look for and how its physics shapes the imaging, including the finer kinds the shipped catalogues store (spiral, elliptical and irregular galaxies, and nebulae), and shall show the not yet known primer for a kind it does not know. |
| LRN-004 | Event | When the user chooses a learning level of off, short or deep in Settings → Learning, the system shall save it and apply it at once, saving quick changes in the order they were made and keeping a choice made on the screen over a saved level read afterwards, deep being the level until one is chosen. |
| LRN-005 | Unwanted | If the page asks to open a source that the knowledge base does not hold, then the system shall open nothing, since a source's address never comes from the page. |
| LRN-006 | Ubiquitous | The system shall tell a target's angular size against the width of the full Moon. |
| LRN-007 | Ubiquitous | The system shall show an object's safety warning, such as never pointing at the Sun without a certified solar filter, at every learning level including off, and whether or not the knowledge base has loaded. |

## L2: your object in numbers

- Every Messier object's distance as the range Wikipedia's "Messier object" table gives (read 28
  October 2026), in `packages/domain/src/learning-distances.ts`, found by any of a target's names.
- The physics card's **In numbers** part: how far away it is, how long its light has travelled and
  when that light set out (a calendar year within the last 5,200 years, otherwise the earliest of
  five dated milestones it is older than: writing, farming, Homo sapiens, the first stone tools,
  the end of the dinosaurs), and its true width from its size on the sky. Over `learning:object`.
- The learning level is deep until the user chooses (Leigh, 28 October 2026).

| ID | Pattern | Requirement |
|----|---------|-------------|
| LRN-008 | Ubiquitous | The system shall show a target with a published distance as the middle of its published range in light years, with the range when its ends differ, marked approximate where the source is, and name the source. |
| LRN-009 | Ubiquitous | The system shall work out a target's true width as its distance times its angular size in radians, and show none when the catalogue gives no angular size, and show nothing in numbers for a target with no published distance. |
| LRN-010 | Ubiquitous | The system shall say when a target's light set out: as a calendar year when it set out within the last 5,200 years, and otherwise as before the earliest dated milestone it is older than, citing that milestone's source. |

## L3: reading your FITS headers

- A dictionary of about fifty common header keywords in `packages/domain/src/learning-fits.ts`:
  what each means and why it matters, filed once under its family for numbered ones (NAXISn,
  CRVALn, CDi_j), marked as part of the FITS standard or a capture-software convention.
- The headers table on a file's page gains a **What it means** column, and the page a
  **Your setup** card: image scale, field of view, sampling against 2″ seeing, and the scale a
  plate solve measured. Over `learning:fits`, which takes the header lines the page already holds.
- XPIXSZ is taken to include any binning, as the MaxIm DL convention most capture software
  follows defines it; not yet checked against Seestar or Vespera files.

| ID | Pattern | Requirement |
|----|---------|-------------|
| LRN-011 | Ubiquitous | The system shall explain each header keyword the dictionary holds, numbered keywords by their family and each keyword once, with what it means, why it matters at the deep level, a concept to follow where there is one, and whether the FITS standard defines it or it is a capture-software convention, citing the FITS standard or the FITS article accordingly. |
| LRN-012 | Ubiquitous | The system shall work out a file's image scale as 206.265 × XPIXSZ ÷ FOCALLEN arcseconds per pixel, its field from NAXIS1 and NAXIS2, and its sampling against 2″ seeing (under-sampled above half the seeing, over-sampled below a third of it), and show no setup when the focal length or pixel size is missing or not positive. |
| LRN-013 | Event | When a file has been plate solved, the system shall show the image scale the solve measured, from the first column of the CD matrix when it has one (as the sky overlay reads it) and otherwise from CDELT1, the last card of a repeated keyword counting. |
| LRN-014 | State | While the learning level is off, the system shall not explain a file's header or show its setup. |

## L4: why tonight looks like this

- How far the Sun sinks below the user's horizon tonight, from the site's latitude and the date
  (`packages/domain/src/learning-sky.ts`, the Sun's declination by the cosine approximation the
  Wikipedia article "Position of the Sun" gives, good to about a degree), and so how dark the night
  gets, with when that changes. Shown under Tonight on Home over `learning:tonight`.
- Why? beside tonight's dark window (twilight), the Moon (its phases), a bright-moon note
  (moonlight), the best targets (airmass), and on the Sky planner beside twilight times and seasons.

| ID | Pattern | Requirement |
|----|---------|-------------|
| LRN-015 | Ubiquitous | The system shall work out how far below the horizon the Sun gets at its lowest tonight at the user's latitude, as 90° less the size of latitude plus the Sun's declination (−23.44° × cos(360° ÷ 365 × (day of year + 10))), and say whether that gives full darkness (18° or more), astronomical twilight at best (12° to 18°), nautical twilight at best (6° to 12°) or civil twilight all night, or the midnight sun when the Sun stays up; for the forward plan's own night, keeping to how dark the plan found it, and showing a depth short of a threshold rounded down. |
| LRN-016 | Ubiquitous | The system shall say, looking up to a year ahead, when fully dark nights return after a night short of full darkness, or end after a fully dark night, and say nothing when they never change. |
| LRN-017 | Ubiquitous | The system shall offer the idea behind tonight's dark window, the Moon's phase, a bright-moon note, the height of the best targets, twilight times and target seasons, and while learning is off shall not work out or show tonight's darkness. |

## L5: stacking physics and emission lines

- **What your filters catch** under a target's forecast on Stack and process: for each filter its
  frames name, the light it passes, and for narrowband and dual-band filters each emission line with
  its wavelength, colour and the atom behind it (`packages/domain/src/learning-filters.ts`).
- Why? on the forecast (why each hour buys less: √N) and on the Stack card (why stacking works,
  what bias, darks and flats do); at the deep level, with two or more narrowband filters, the
  Hubble palette.

| ID | Pattern | Requirement |
|----|---------|-------------|
| LRN-018 | Ubiquitous | The system shall recognise a target's filters by the names capture software writes (narrowband Hα, Hβ, O III, S II and N II, common dual-band makes, luminance, red, green, blue, UV/IR-cut and light-pollution filters), say what each passes, give each emission line it passes with its wavelength, colour and sources, explain each filter once, and leave out names it does not recognise. |
| LRN-019 | Ubiquitous | The system shall offer, on a target's Stack and process tab, why stacking works and why each extra hour buys less, what calibration frames do, the idea behind each emission line, and at the deep level with two or more narrowband filters the Hubble palette. |
| LRN-020 | State | While the learning level is off, the system shall not explain a target's filters. |

