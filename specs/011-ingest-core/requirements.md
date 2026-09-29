# 011 Ingest core: requirements

Slice B of the cockpit blueprint, reshaped around the scanner the app already has. It makes
indexing safe (source folders are never changed), honest (unreadable files are kept aside with a
reason instead of skipped silently), fast on a rescan, and able to find duplicate files across
every folder the app has indexed.

## What this slice delivers

- "Prep for Siril" no longer renames files in your target folder. It builds the lights, darks,
  flats and biases folders in the app's own work area, from hard links where the disk allows and
  copies otherwise, and opens that folder.
- A rescan reads only new or changed files. Unchanged files keep their row, headers, target link
  and quality verdict.
- Files the scanner cannot read go to a quarantine list with the reason, and appear in the
  cockpit's "Hidden in your files" card.
- "Check for duplicates" on that card hashes the indexed FITS files and reports duplicate copies
  and the space they take. Nothing is ever deleted.

## Changes to the blueprint

- **SHA-256, not BLAKE3.** In Node, the native SHA-256 is faster than any JavaScript BLAKE3 and
  needs no new dependency. Hashes carry an algorithm prefix (`sha256:`), so a native BLAKE3 can
  replace it later without confusion.
- **Sample first, hash later.** Subs from one camera all share a size, so size alone does not
  narrow the search. The first and last 64 KiB (which include the FITS header and its DATE-OBS)
  do, so only files whose samples collide are read in full (ING-012, new).
- **No asset/location tables yet.** Duplicates are reported from a per-path hash table. The
  asset model arrives with the Postgres store, where it can be designed once.
- **ING-002 and ING-007 wait.** Indexing TIFF, PNG and JPEG alongside FITS, and live progress
  counts, belong with the NAS core-api, which runs imports in the background.
- **ING-013 is new**: the Siril work area that replaces the renaming prep.
- **DSC-015 is new**: the cockpit surfaces unreadable files and duplicates, which spec 010 left
  for this slice.

## Ingest

| ID | Pattern | Requirement |
|----|---------|-------------|
| ING-001 | Ubiquitous | The system shall treat every indexed source folder as read-only and shall never move, rename, modify or delete a file within it. |
| ING-003 | Event | When two or more indexed files have identical content, the system shall report them as one duplicate group listing every path and the bytes reclaimable, without deleting anything. |
| ING-006 | Unwanted | If a file cannot be parsed, then the system shall quarantine it with the parse error and continue the scan. |
| ING-008 | Event | When a folder is scanned or checked for duplicates again, the system shall reuse the stored metadata and hashes of files whose size and modified time are unchanged, and read only new or changed files. |
| ING-012 | Ubiquitous | The system shall read a file in full for hashing only when its size and its sampled first and last bytes match another file's. |
| ING-013 | Event | When the user prepares a target for Siril, the system shall build lights, darks, flats and biases folders in its own work area from hard links to, or copies of, the source frames. |

## Discovery

| ID | Pattern | Requirement |
|----|---------|-------------|
| DSC-015 | Ubiquitous | The system shall include in its hidden-data report the files that could not be read, with their reasons, and the duplicate files with the bytes they take. |
