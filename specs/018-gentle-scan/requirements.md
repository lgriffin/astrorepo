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
| ING-016 | Event | When a scan is checking its files for changes, the system shall report how many files have been checked; when it is reading headers and has read at least 50 files over at least 5 seconds, the system shall report about how long the rest will take at the pace kept so far. |

## Non-functional

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-013 | Ubiquitous | The system shall scan in slices of work separated by rests, so that it never holds the app's main process for a whole scan and uses at most the configured share of the time, and shall run at most one scan of any folder at once. |
| NFR-022 | Ubiquitous | The system shall measure a scan's slices in the time the main process spends running code, not in time spent waiting for the disk, and, when reading on the main process, shall have at most four file stats or header reads under way at once, each header asked for four blocks at a time. |
| NFR-023 | Ubiquitous | The desktop app shall read a scan's file stamps and FITS headers on eight reader threads, each reading one list of files at a time, and shall write each list to the index as soon as it is read, without waiting for the lists read beside it. |
| NFR-024 | Unwanted | If a reader thread fails or cannot start, then the system shall read that list, and the rest of the scan, on the main process, and shall not set any file aside as unreadable because of it. |

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

## Update, 8 November 2026: reading on reader threads

After the busy-time pacing, Leigh's scan read its images, but "20 at a time": 20,846 files still
took several minutes. Three things held it to that pace:

- **Node runs file calls on a pool of four threads** for the whole process, so however many
  files the scan asked for, at most four were with the disk at once.
- **Batches of 20 waited for their slowest file.** Four files were in flight inside each batch of
  20, and the next batch only started once all 20 were read and written, so the disk sat idle
  while the last file of each batch was read.
- **Every header was parsed on the main process**, which counts as busy time and earns a rest.

Now:

- **Eight reader threads** (NFR-023), started for each scan and stopped when it ends, each read a
  list at a time with plain blocking calls, so eight files are with the disk at once whatever
  Node's own pool is doing. They stamp files 64 to a list and read headers 16 to a list.
- **No batches.** Each list is written to the index the moment it comes back, so one slow file
  holds up only its own list. A cancel lets the lists under way finish and keeps them.
- **Less copying.** A reader thread sends the cards without their raw text, which the scan does
  not store, and the main process rebuilds the keyword map.
- **If a reader thread fails** (NFR-024), its list and the rest of the scan are read on the main
  process as before, still four files at a time. No file is called unreadable because a thread died.
- **Progress while checking, and time left** (ING-016). The Library page says how many files
  have been checked for changes, then how long reading the rest should take.

With 5 ms of simulated latency on every stat, open and read, 5,000 files took 28 seconds before;
they now take 12 seconds on eight threads (25 seconds read in place without the batches). With no
latency, 5,000 files take 2 seconds instead of 7; the main process's busy time fell by a third,
and its longest pause stayed around 40 ms. Eight is a deliberate middle: sixteen threads were
faster again on the simulated disk (7 seconds) but doubled the longest pause, and asks twice as
much of a NAS at once.

Camera RAW frames are read on the threads too, but their EXIF reader uses Node's shared pool, so
they still reach the disk four at a time. A blocking EXIF reader can follow if a RAW library needs it.

The worker thread this spec deferred is half done: the threads only read. Writing stays on the
main process, which owns the database connection, paced as before.
