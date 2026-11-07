# 047 Catalogue names: requirements

Leigh found (7 November 2026) that M101.png showed as M33 in the gallery. The catalogue seeder
folded every object into the first target holding any of its names, and M33 carried the alias
"Pinwheel Galaxy" (M101's name), so M101 and NGC 5457 became aliases of the Triangulum Galaxy.

A check of `data/catalogues` that day found 31 names and aliases pointing at objects more than a
degree apart (C31 on IC 405, IC 1805 and NGC 1499; C83 on NGC 4945 and NGC 5236; the Spindle on
M102 and NGC 3115; the Hamburger on NGC 3628 and NGC 5128; M109 and NGC 3992 130° apart). Worse,
comparing every position with OpenNGC showed about 1,100 of the 1,700 NGC and IC numbers placed
tens of degrees from where the object is, with made-up types and constellations, and Caldwell
listing 50 of its 109 objects, some under the wrong NGC number (C30 as NGC 7160, C68 as NGC 6752).

## What this slice delivers

- **Catalogues from one source.** `scripts/catalogues/build-seed.ts` builds the five catalogues
  from Stellarium's deep-sky catalogue (pinned commit, GPL-2.0-or-later): position, magnitude,
  size and type from Stellarium, the constellation worked out from the position, and cross numbers
  (M31 is NGC 224) from Stellarium's cross-index only. Messier and Caldwell are whole; NGC and IC
  list every object Stellarium names, then the brightest, up to 500 and 200. Positions agree with
  OpenNGC to within half a degree for all but a few large or disputed nebulae.
- **One name, one object.** A common name goes to one object: the one most of Stellarium's
  sources call it (well-known names first); a name the old catalogues gave an object stays when
  Stellarium does not give it elsewhere. A test fails if any name or alias points at objects a
  degree or more apart.
- **Seeding that cannot merge far objects.** An object joins a target only when it shares a name,
  lies within a degree and is not a second number of the same catalogue.
- **Installs repair themselves once.** On start, an install seeded from older catalogues is
  repaired: a target that held two objects keeps the one it is named for and the other gets its
  own target; frames move by FITS OBJECT (else their folder's name) and library folders by name
  to the target that now goes by that name; the catalogues' aliases and entries are written afresh
  and their collections refilled. Aliases you gave, targets you made, stages, notes and anything
  else on a target stay where they are.

## Out of scope

- Moving other things linked to a split target (sessions, goals, jobs, projects, mosaics): they
  stay on the target they were on, which keeps its name.
- The library's per-target totals (`target_home_data`) for a split target: the next home scan
  works them out again.
- A Sharpless catalogue beyond the 30 regions listed since spec 001.

## Catalogue data

| ID | Pattern | Requirement |
|----|---------|-------------|
| CAT-001 | Ubiquitous | The system shall ship the Messier (110 objects), Caldwell (109), Sharpless, NGC and IC catalogues with each object's position, magnitude, size, type, constellation and cross numbers taken from one named source, and each file shall name that source and the version it was built as. |
| CAT-002 | Ubiquitous | The system shall give no name or alias in the built-in catalogues to objects one degree or more apart. |

## Seeding and repair

| ID | Pattern | Requirement |
|----|---------|-------------|
| CAT-003 | Event | When the built-in catalogues are seeded, the system shall make one target per object, joining an object to a target only when the target goes by one of the object's names, lies within one degree of it and has no entry in the object's catalogue yet. |
| CAT-004 | Event | When an install seeded from other catalogues is repaired, the system shall give each catalogue object the target named for it, else the one holding its entry, else a new one, and shall move each frame (by FITS OBJECT, else its folder's name) and each library folder (by name) linked to a catalogue target to the target that now goes by that name. |
| CAT-005 | Ubiquitous | The system shall, on repair, write the catalogues' own aliases and entries afresh, keep every alias the user gave and every target the user made, and remove only catalogue targets that no catalogue lists and that nothing of the user's points at (no frame, library folder, workflow stage, alias the user gave or link to another target). |
| CAT-006 | Event | When the app starts, the system shall seed or repair the catalogues only if the catalogue version the install records differs from the shipped one, and shall record the shipped version once done; resetting the database clears the recorded version. |
| CAT-007 | Ubiquitous | The system shall match a frame's FITS OBJECT to a catalogue number in any spelling, such as "Messier 31", "Caldwell 14" or "NGC0224". |
