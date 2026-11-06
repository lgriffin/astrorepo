# 018 Gentle scan: requirements

Leigh scanned his library on the Windows PC and the machine locked up until he killed the app.
The scan ran as one uninterrupted block on the app's main process: it walked every folder, read
every FITS header and wrote over a million header rows without once letting the app, or the PC,
take a turn. On a synthetic library of 20,000 Seestar subs that was one 85-second freeze; a real
library several times larger, on a spinning disk or the NAS, froze for far longer.

Time is not the constraint on a big library; staying out of the way is. This slice makes the scan
slow and gentle on purpose, rather than fast and greedy.

## What this slice delivers

- **The scan runs in the background, paced.** The walk, the header reads and the database writes
  happen a small piece at a time. The scan works in slices of at most 25 ms and rests between them
  so it uses no more than 40% of the time, leaving the app, the disk and the CPU for everything
  else. At most four files are asked of the disk at once, so the disk or the NAS is never flooded.
- **Live counts.** The Library page shows files found, read of how many new or changed, unchanged
  and unreadable, instead of a spinner that might mean anything.
- **Cancel, and carry on later.** The Library page has Cancel. Files read before the cancel stay
  indexed, so the next scan reads only what the cancelled one did not reach (ING-008 does this:
  an indexed file whose size and modified time are unchanged is not read again).
- **A ceiling on header reads.** A file named `.fit` that has no END card is given up on after
  200 header blocks (576 KB) instead of being read to its end.
- **Cheaper writes.** Row ids for headers come from a monotonic ULID factory: `ulid()` drew fresh
  randomness for each of the million ids and cost two thirds of the scan's time. SQLite runs with
  `synchronous = NORMAL`, which is safe with WAL.

## Changes to the blueprint

- **ING-007 lands now**, without the NAS core-api. The counts come from the desktop scan itself.
- **Pause is Cancel.** Because a rescan skips everything already read, cancelling and scanning
  again later is a pause that survives closing the app. A separate Pause button would add state
  without adding anything a user could do.
- **No worker thread yet.** Moving the scan to a worker thread would need its own database
  connection and its own build entry in electron-vite. Pacing keeps the main process responsive
  without either; a worker can follow if a real library shows it is needed.

## Ingest

| ID | Pattern | Requirement |
|----|---------|-------------|
| ING-007 | Event | When a library or folder scan is running, the system shall report the files found, the new or changed files to read and how many have been read, the unchanged files kept, and the files set aside as unreadable. |
| ING-014 | Event | When the user cancels a running scan, the system shall stop at its next checkpoint, keep every file it has already indexed, and report the scan as cancelled. |
| ING-015 | Unwanted | If a file's header has no END card within its first 200 blocks, then the system shall treat the file as unreadable without reading the rest of it. |

## Non-functional

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-013 | Ubiquitous | The system shall scan in slices of work separated by rests, so that it never holds the app's main process for a whole scan and uses at most the configured share of the time, and shall run at most one scan of any folder at once. |
| NFR-022 | Ubiquitous | The system shall measure a scan's slices in the time the main process spends running code, not in time spent waiting for the disk, and shall have at most four file stats or header reads under way at once, each header asked for four blocks at a time. |

## Update, 6 November 2026: waiting is not work

Leigh's library scan on Windows (21,053 FITS files on a local disk) had read 120 headers after
four minutes. The pacer measured its slices by the clock, so every millisecond a file open or a
stat spent waiting on the disk counted as work and was followed by a rest one and a half times
as long. Windows makes each open and stat wait a few milliseconds even on a local disk (the
virus scanner looks at each file), and the scan stat'ed every file twice (once for the folder
sizes, once for the rescan stamps) and read each header a block at a time, one file after
another.

With 8 ms of simulated latency per call, 1,000 files took 112 seconds. Now:

- **Slices count busy time only** (NFR-022), from Node's event loop utilisation, so waiting for
  the disk is never rested for. The app stays as responsive as before: the longest pause of the
  main process on 20,000 local files stayed under 40 ms.
- **Four files in flight.** Stats and header reads overlap their waits, four at a time.
- **One read per header.** Four 2,880-byte blocks are asked for at once, so a typical Seestar or
  Vespera header costs one round trip; directories are listed 256 entries per call.

The same 1,000 files with 8 ms per call now take 11 seconds.
