# 044 Library layout: requirements

Leigh asked (6 November 2026), after a library scan: "how does it identify items? Say my home
folder for example it contains a folder called raw, stacked, TIF and images, each of those all map
to different parts of the app, should we add that granularity in settings?" and then
"intelligently discovering it is good and suggesting a layout is better".

Until now the scan looked only for folders named exactly `raw`, `stacked`, `tif` and `images`
under the home folder. On Windows the names matched in any case; on Linux (the Pi server) `TIF`
did not match `tif`.

## What this slice delivers

- **A suggested layout.** The app looks inside the home folder: each folder's name (Lights,
  Masters, Exports, Final...) and the names of a sample of the files inside it (light frames,
  files named as stacks or masters, TIFF, PNG and JPEG). It suggests one folder for each part and
  says why, in plain sentences.
- **Your choice, in Settings → Folders.** Under the home folder, a Library layout card lists the
  four parts: the folder each reads now and whether you chose it, it was found by its name, or it
  is not there; Choose, Use the suggestion and Default. A chosen folder may be anywhere, such as a
  stacked folder on another drive, and the app only reads it, like the home folder.
- **Before a scan.** Library shows the suggestion above the scanner when it would change a folder,
  with one button to use it.
- **Everywhere a part is read.** The library scan, the Gallery, the Messier mosaic and the Vespera
  copies' default landing all read the folder chosen for their part. The scan shows each part's
  folder as it goes.
- **Case does not matter** for the conventional names on any system.

## Out of scope

- A library filed by target first (`M 31/raw`, `M 31/stacked`): the card says it looks that way,
  but the scan still reads one folder per part with a folder per target inside it.
- Reading file headers to judge a folder: names only, so a survey of a large library takes moments.

## Layout

| ID | Pattern | Requirement |
|----|---------|-------------|
| LAY-001 | Ubiquitous | The system shall read each part of the library (raw frames, stacked masters, TIFF exports, finished pictures) from the folder the user chose for it, or else from the folder directly under the home folder named raw, stacked, tif or images in any letter case. |
| LAY-002 | Event | When the library layout is asked for, the system shall look at each folder directly under the home folder, leaving out hidden folders and links, and at the names of up to 60 files from up to 2,000 entries up to four folders deep inside each, without reading any file. |
| LAY-003 | Ubiquitous | The system shall suggest at most one folder for each part and at most one part for each folder, judged by the folder's name and by the share of sampled files that are light frames or camera RAW, stacks or masters, TIFF, or PNG and JPEG pictures, taking the strongest pairs first, and shall give the reasons for each suggestion. |
| LAY-004 | Ubiquitous | The system shall read the folder chosen for a part, wherever it is, in the library scan, the Gallery, the Messier mosaic and the Vespera copies' default landing, and shall treat a chosen folder as read only, as it does the home folder. |
| LAY-005 | Ubiquitous | The system shall offer a suggestion only for a part whose suggested folder differs from the folder read now, shall never change a folder the user chose, and shall show such a suggestion on Library above the scanner. |
| LAY-006 | Unwanted | If a chosen folder is not a folder that can be read, or two parts would read the same folder or one inside the other, then the system shall refuse the choice, say why, and save nothing. |
| LAY-007 | Ubiquitous | The system shall say when more than half of the folders under the home folder are named for sky objects that the library looks filed by target first, which the scan does not read yet. |
| LAY-008 | Event | When a library scan reaches a part, the system shall show the folder it is reading for that part. |
