# 034 Vespera Pro ingest: requirements

Today a night on the Vespera Pro comes off the scope the way Vaonis documents it: join the scope's
Wi-Fi, open FileZilla on 10.0.0.1, hunt through dated folders, drag files down and rename them by
hand. This slice makes that a read-only scan, a review of what each session holds, and a
confirmed, resumable, verified copy of the ticked sessions, each into its target's folder under a
folder whose name astrorepo makes itself, such as `M31/M31_2026-10-14_FIT=400_TIF=1`. The scope is only ever read: astrorepo never writes to it and never
deletes from it, under any setting, mode or flag.

The design is Leigh's "Vespera Pro FTP Ingest Design" document (2026-10-14). This slice builds it
on the FTP connection of spec 033 (the Vespera control page): the rules, the use cases, the ports
and their adapters, and the "On the Vespera" card. Leigh then asked (14 October 2026) for one copy
flow on the Vespera page, so this slice also replaces spec 033's list, copy and progress: the page
is spec 033's Connection card (address, landing folder, kinds of file) and this slice's review and
copy. The CLI the design mentions waits for the app's CLI.

## What this slice delivers

- `packages/domain/src/vespera-ingest.ts`: the session, run and file grammar; counts and findings;
  target names; the destination folder grammar; the copy order; the manifest.
- `packages/application/src/use-cases/vespera-ingest.ts`: scan, identify a target, plan a
  transfer, run or resume it, and the queue that copies the ticked sessions one after another.
- Ports in `packages/application/src/ports/vespera-ingest.ts`: `VesperaScope` (read-only),
  `IngestDisk`, `VesperaMetadata`, `VesperaTransferStore`; fakes in the testkit, contract suites,
  and their adapters: `FtpVesperaScope` (spec 033's FTP connection, plus REST), `NodeIngestDisk`,
  `NodeVesperaMetadata` (a JPEG EXIF reader and the scanner's FITS card parser) and
  `FileVesperaTransferStore` (`astrorepo.transfers.json` at the top of the landing folder, as the
  design puts the index in the repository root).
- The "On the Vespera" card (`src/renderer/components/vespera/IngestPanel.tsx`) through
  `vespera-ingest:*` IPC and `src/main/vespera-ingest-host.ts`, which indexes the copies when a
  queue ends (`src/main/vespera-host.ts`, as spec 033 did).
- Gherkin features in `features/vespera/`, seeded with the `user/` listing of Leigh's scope.

## Decisions

- **One copy flow (Leigh, 14 October 2026).** Spec 033's "On the Vespera" list, Copy selected and
  Cancel are gone; this slice's review and copy took their place. What spec 033 did that the design
  did not say is kept: several sessions copy in one go, the disk is checked for room first, and the
  copies are indexed when the copy ends.
- **Copies land in the target's folder.** A session goes to `<landing>/<target>/<session folder>`,
  where `<target>` is the folder name's target part (`M31`). Spec 033 landed copies the same way, so
  the home scan matches the target folder to its target; the design's own name is the session
  folder's.
- **The kinds of file come from the Connection card**, FITS and TIFF unless changed (Leigh: "I want
  the TIFF to export, I have no interest in the json files at present"). The design's FITS-only
  default and the per-session kind boxes are gone.
- **Pause replaces Cancel.** A paused copy keeps its `.part` file and carries on; nothing is lost
  that a cancel would have kept.

- **Only FITS frames are checked for gaps.** A frame's number counts shots taken, so the stacked
  JPEGs (and their JSON) skip the number of every frame left out of the stack. Checking them would
  warn on every cloudy night; the design's GAP_IN_FRAMES is kept for the raw frames, which the
  scope saves for every exposure.
- **FITS_LT_JPEG needs FITS.** A run with JPEGs and no FITS had raw saving off; that is NO_FITS
  (info), not a partial listing.
- **FITS_GT_JPEG needs JPEGs.** With JPEG output off there is nothing to compare.
- **The destination root is the landing folder** of spec 033 (Settings → Folders), remembered as
  the design asks, so the two copy flows land in one place.
- **The job is recorded twice.** In the store (for the review screen's "already in the repository")
  and as `astrorepo.transfer.json` in the destination folder, which is how a folder of the same
  name is told to be this session's (resume) or another's (refuse).
- **The destination's sizes are trusted at resume.** A committed file whose size still matches is
  not fetched again; the SHA-256 in the manifest is of the local copy (`sha256:` dropped), as the
  scope publishes no hashes.
- **Sh2 keeps its hyphen in a folder name** (`Sh2-155`), so the number does not run into the 2.
- **A folder name's duplicate suffix accepts any number from 2.** The design's `[2-9]\d*` would
  not read back `_10`; the grammar here is `[2-9]|[1-9]\d+`.
- **Identification stops at the first clue that names a target**, as each read competes with the
  copy for the scope's Wi-Fi. `crossCheck` also reads observation.json when the folder already
  named it, which is how TARGET_MISMATCH arises in practice.

## Open questions (from the design)

- The TIFF file name with TIFF export on, and the keys inside observation.json, are not yet seen on
  Leigh's unit; the parser takes `img-NNNN.tif(f)` and the keys in `OBSERVATION_TARGET_KEYS`.
- Whether the scope's FTP server honours REST: the port's read says where it really started, and
  the copy starts again from 0 when it did not.
- Expert-mode darks are listed (the scan says they are there) and never copied.

## Scan

| ID | Pattern | Requirement |
|----|---------|-------------|
| VIN-001 | Event | When a scan is requested, the system shall list the scope's user folder (matched without regard to case) and list one session for each folder in it other than expert-mode, keyed by the folder's raw name, with its kind, start and label read from that name. |
| VIN-002 | Ubiquitous | The system shall take a session's label as everything after its kind, underscores and spaces included, and shall read a lowercase kind it does not know with its timestamp intact. |
| VIN-003 | Unwanted | If a session folder's name has no valid timestamp, then the system shall still list it as a session of kind unknown starting at its earliest file, with the info finding NO_TIMESTAMP. |
| VIN-004 | Ubiquitous | The system shall classify a run folder by the suffix of its name (pointing or images, then initial, adjust-framing or adjust-focus) and shall use any numeric prefix only to order runs. |
| VIN-005 | Unwanted | If a run folder or a file matches no known pattern, then the system shall still count it, as an unknown run or a file of kind other, and raise an info finding. |
| VIN-006 | Ubiquitous | The system shall read no file's content during a scan, and shall list the scope's folders one at a time. |
| VIN-007 | Ubiquitous | The system shall count each session's files by kind (FITS, TIFF, JPEG, JSON and other) per run and in total, with their total bytes, keep each file's listed size (and its modified time where the listing gives one), and stamp each session with when its listing finished. |
| VIN-008 | Unwanted | If a session's counts look wrong, then the system shall raise findings: NO_IMAGES_RUN and FITS_LT_JPEG at error; EMPTY_RUN, NO_TIFF and GAP_IN_FRAMES at warn; MANY_TIFF, NO_FITS, FITS_GT_JPEG and JSON_MISMATCH at info. |
| VIN-009 | Ubiquitous | The system shall never compare a file count with the stacked-frame count in a JPEG's EXIF, which this firmware writes one short. |

## Target

| ID | Pattern | Requirement |
|----|---------|-------------|
| VIN-010 | Event | When a session's target is identified, the system shall try its folder's label, then observation.json, then the EXIF description of the last stacked JPEG of its last image run, stop at the first that names a target, and record which one as the target's confidence. |
| VIN-011 | Unwanted | If none of those names a target, then the system shall read the OBJECT card of the first FITS frame, and if that names none either, shall leave the target unknown. |
| VIN-012 | Ubiquitous | The system shall write a catalogue designation as its prefix, one space and its number (ic443, IC-443 and IC 443 all become IC 443), take a leading designation from a label with words after it, map known common names to their designation, and mark any other name for review. |
| VIN-013 | Unwanted | If two clues name different targets, then the system shall keep the cheaper clue's target and raise TARGET_MISMATCH at warn. |
| VIN-014 | Event | When the user names a session's target, the system shall use that name with confidence manual and keep what it found before in the evidence. |
| VIN-015 | Unwanted | If a session has an error finding or an unknown target, then the system shall refuse to plan its transfer. |

## Transfer

| ID | Pattern | Requirement |
|----|---------|-------------|
| VIN-016 | Event | When a session's copy is planned, the system shall put it in the target's folder under the landing folder, in a folder named {target}_{YYYY-MM-DD} followed by _FIT={count} when FITS are included and one _{KIND}={count} for each other included kind the session has files of, in the order FIT, TIF, JPG, JSON (the kinds chosen on the Vespera page, FITS and TIFF unless changed), and shall record the job before any byte is copied. |
| VIN-017 | Ubiquitous | The system shall make every destination folder name match the one destination grammar and read back from it, turning each run of characters outside A-Z, a-z, 0-9 and - in the target part into one -, and keeping the name within 80 characters by shortening the target part only. |
| VIN-018 | Unwanted | If the destination folder already exists, then the system shall offer to resume when it holds the same session and otherwise refuse with DEST_EXISTS, or take the next free _2, _3 suffix when asked, and shall never copy into another session's folder. |
| VIN-019 | State | While a transfer runs, the system shall copy one file at a time, FITS by frame number, then JPEG, then TIFF, then JSON, into the scope's run folder names kept verbatim under the destination folder. |
| VIN-020 | Ubiquitous | The system shall write each file to <name>.part and rename it only once its size equals the size the scope listed. |
| VIN-021 | Unwanted | If a file's size comes out wrong three times, then the system shall pause the job with SIZE_MISMATCH. |
| VIN-022 | Unwanted | If the link to the scope drops, then the system shall pause the job and never fail it. |
| VIN-023 | Event | When a paused job is resumed, the system shall list its session again, raise SESSION_GREW (and NAME_COUNT_STALE when the name's counts no longer match) if its files changed, keep the folder's name, and carry on from the first file not yet committed. |
| VIN-024 | Optional | Where the scope honours REST, the system shall resume a .part file from its length, and otherwise fetch the file again from its start. |
| VIN-025 | Ubiquitous | The system and its scope adapter shall never send the scope a command that writes, renames, makes or deletes anything (STOR, APPE, RNFR, RNTO, MKD, RMD, DELE and the like). |
| VIN-026 | Event | When every included file is committed, the system shall hash each copy with SHA-256, write astrorepo.manifest.json (session, target with confidence and evidence, folder name, kinds and counts, each file's remote and local path, size and hash, and the findings) and mark the job done. |
| VIN-027 | Unwanted | If the disk where copies land lacks room for the bytes a copy has still to copy and 1% more, then the system shall pause it with SPACE_SHORT before copying anything and say how much more room it needs. |
| VIN-028 | Event | When a copy of one or more sessions ends having copied any, the system shall index the copies, with a home scan when the landing folder is the home folder's raw folder (after any home scan already running) and with a FITS scan of the landing folder otherwise, and say on the Vespera page how that went. |
| VIN-029 | State | While a copy is under way, the system shall show which session of how many it is on, the file being copied, the files and bytes done, the speed and the time left, and shall refuse to start another copy or to scan the scope. |
| VIN-030 | Unwanted | If a run folder's name is one Windows would not keep as it is, then the system shall leave its files on the scope and raise UNSAFE_NAME at warn. |
| VIN-031 | Event | When the user copies the sessions they ticked, the system shall copy them one after another, report and skip any it refuses (with the next free name offered), and stop before the next session when one pauses or fails. |
