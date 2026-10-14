# 031 Gallery: requirements

This is slice H2, the second half of the gallery (see the roadmap). Leigh asked (2026-10-14) for
"a general Gallery capability which shows the PNG images from the root in a traditional Gallery
capability. Each image should have a side bar with details of it abstracted from the image name
e.g. M31.png should pull information on what the M31 is and give links to other parts of the
system if we wanted to go exploring the data."

H1 (spec 025) looks at one target's masters and finished images from its page. H2 is the other
way in: every finished picture at once, as a gallery, each one leading back to its target.

## What this slice delivers

- **Gallery** replaces the Images page (the sidebar's Files → Gallery). It shows every PNG and
  JPEG in the images folder of the home folder and the folders inside it as a grid of thumbnails,
  newest first, captioned with the object each shows. A search box and a sort (newest, name,
  object) narrow it down.
- **Viewer and side panel.** Picking a picture shows it larger beside a side panel; the arrow keys
  move through the pictures. The panel says, for each object the picture's name names:
  - what it is: a sentence ("A galaxy in Andromeda, magnitude 3.4, 3°, about 6 full moons
    across."), its type, constellation, magnitude, size, coordinates and other names;
  - when it is best placed: the month it is highest at midnight, how high it climbs from the
    user's site, and whether a dual-band or narrowband filter suits it;
  - what the user has of it: light frames, integration, nights, the last night, masters and its
    workflow stage;
  - links to explore: its target page (overview, files and compare, stack and process, notes and
    nights), its mosaic plan in the Sky planner, its collections, the picture's folder, and its
    SIMBAD and Wikipedia pages.

## Changes to the blueprint

- **The root is the images folder of the home folder.** The home scan already treats
  `<home>/images` as the place for finished pictures, and the old Images page read it; the gallery
  reads the same folder and every folder inside it, leaving out hidden folders and links so a loop
  or a link out of the folder is never followed. Browsing the NAS beyond that waits for #38.
- **PNG and JPEG only.** The window can draw both; TIFF needs a decoder the app does not have (as
  in spec 025), so TIFF exports are left out rather than shown as empty tiles.
- **The name is read, the pixels are not.** The objects come from the file's name, else the
  nearest folder that names one, matched against the app's own catalogues (Messier, NGC, IC,
  Caldwell, Sharpless and the targets' aliases). A plate-solved picture's field is spec 025's
  overlay; the gallery does not solve.
- **What an object is comes from the app's catalogue, with two pages to read more.** The seeded
  catalogues hold type, constellation, magnitude, size and position but no prose, so the panel
  writes one sentence from those and offers the object's SIMBAD and Wikipedia pages. The app
  builds those two addresses from the catalogue and opens them in the browser; the window cannot
  name any other address.
- **The image-by-object lookup is shared.** `readImageName` and `objectNameIndex` in
  `packages/domain/src/object-names.ts` and the `ObjectCatalogue` port are what any other slice
  that needs a picture's object (the Messier poster, J) should use.

## Gallery

| ID | Pattern | Requirement |
|----|---------|-------------|
| GAL-001 | Event | When the user opens the gallery, the system shall show every PNG and JPEG file in the images folder of the home folder and in the folders inside it, to eight folders deep and leaving out hidden folders and links, as a grid of thumbnails, newest first, each captioned with the objects its name names or else its file name, and let the user search by file or object name and sort by date, name or object. |
| GAL-002 | Event | When the user picks a picture, the system shall show it larger beside a side panel with its file name, folder, size and date, and move to the previous or next picture with the arrow keys or buttons. |
| GAL-003 | Ubiquitous | The system shall read the objects a picture shows from its file name, else from the nearest folder it is in that names one, recognising Messier, NGC, IC, Caldwell and Sharpless designations in any letter case, with or without a space, underscore, hyphen or leading zeros (M31, m_031, Messier 31, NGC7000, Sh2-155), and the catalogue's common names and aliases as whole words, written with spaces, separators or in camel case (Andromeda Galaxy, AndromedaGalaxy), naming each object once. |
| GAL-004 | Unwanted | If a number in a name has no catalogue prefix, is beyond the last object of its catalogue, or a common name is shorter than four letters or part of a longer word, then the system shall not count it as an object. |

## Side panel

| ID | Pattern | Requirement |
|----|---------|-------------|
| GAL-005 | Event | When the user picks a picture whose name names a catalogue object, the system shall show for each object its name and designations, one sentence on what it is, where it is, how bright and how large, and its type, constellation, magnitude, size, right ascension, declination and other names. |
| GAL-006 | Event | When the user picks a picture whose name names a catalogue object, the system shall show what the user has of it: light frames, integration, nights with frames, the last of them, stacked masters and its workflow stage. |
| GAL-007 | Event | When the user picks a picture whose name names a catalogue object, the system shall show the month it is highest at midnight, how high it climbs from the user's site or that it never rises there (or, without a site, a link to set one), and whether a dual-band or narrowband filter suits it. |
| GAL-008 | Event | When the user picks a picture whose name names a catalogue object, the system shall link to its target page's overview, files, stack and process, and notes and nights, its mosaic plan in the Sky planner, its collections and the picture's folder, and open its SIMBAD or Wikipedia page in the browser from an address the app builds from the catalogue. |
| GAL-009 | Unwanted | If neither a picture's name nor its folders name a catalogue object, then the side panel shall say so and how to name the file so it is recognised. |
| GAL-010 | Unwanted | If a picture's name holds a designation the app's catalogues do not hold, then the side panel shall say that designation is not in the catalogue. |
| GAL-011 | Unwanted | If the window asks for a picture the images folder did not list, then the system shall refuse it without reading it. |
| GAL-012 | State | While no home folder is set or it has no images folder, the gallery shall say so and link to Settings → Folders. |
| GAL-013 | Unwanted | If a picture cannot be read, then the system shall show why in its place. |

## Quality

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-021 | Ubiquitous | The system shall send the window thumbnails at most 400 pixels wide and the larger view at most 2048 pixels wide, shrunk in the main process when the picture can be decoded, shall not send a file over 50 MB that it could not shrink, and shall never write, rename or move a file in the images folder. |
