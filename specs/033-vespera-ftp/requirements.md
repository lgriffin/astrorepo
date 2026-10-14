# 033 Vespera control: requirements

Leigh asked (14 October 2026) for "a native FTP connection capability to the Vespera for image
movement", with a control tab of its own. The Vespera Pro serves its storage over FTP on its own
Wi-Fi at 10.0.0.1, and that is the only way to get its raw frames off it. This slice is the
Vespera page under Files: it connects to the scope and, through spec 034's review and transfer,
copies the sessions Leigh picks into the library, where the home scan picks them up.

## What this slice delivers

- **A Vespera page** under Files in the sidebar, with two cards:
  - **Connection**: the scope's address (10.0.0.1 unless changed), the folder copies land in and
    the kinds of file to copy (FITS frames and TIFF by default; the scope's JPEG previews and JSON
    metadata when ticked).
  - **On the Vespera**: spec 034's review and transfer, which scans the scope, shows each session
    for review and copies the ones picked.
- **Where copies land.** Settings → Folders → Vespera copies, or, when that is not set, the home
  folder's `raw` folder. Each session lands in `<target>/<session folder>/<run>/…` (spec 034),
  so the home scan matches the target folder to its target and indexes the frames like any
  other raw folder.
- **Copies only add files.** Nothing on the scope is removed, renamed or written (the adapter
  refuses to send any command that could), and nothing on the PC is overwritten. How a copy lands,
  resumes and is checked is spec 034's (review and transfer).
- **A native FTP client.** Written on Node's sockets with no FTP library: anonymous sign-in,
  binary mode, extended or plain passive mode, MLSD listings with Unix or DOS LIST as the
  fallback. The parsing of everything the scope sends is in the domain and fuzzed.

## What is known about the Vespera, and what is not

From Vaonis's support pages and owners' write-ups (Galactic Hunter, Cloudy Nights, Waloszek):
the scope serves FTP at 10.0.0.1 with no password; observations are folders in `user`, named
with a date and time stamp and the target when one was chosen; each holds `01-images-initial`
and, after a reframe or refocus, `02-images-adjust-framing` or `02-images-adjust-focus`, with
FITS, TIFF and JPEG files depending on what Singularity saves, and JSON metadata; darks saved in
expert mode are in `expert mode`. Owners report that folders can be copied but not deleted over
FTP, which suits this slice.

**Not yet checked against a real scope** (see the roadmap's open asks):

- the exact folder name format (the parser accepts the date first or after the target, with or
  without separators);
- whether the server speaks MLSD or only LIST, EPSV or only PASV (all four are handled);
- the darks folder's exact name and the Vespera Pro's firmware differences;
- whether the FITS headers name the target (OBJECT) the way the home scan expects.

## Changes to the blueprint

- **Slice F is split.** The blueprint's F was "Vespera + XISF". This is the Vespera half;
  XISF, and reading the JSON metadata into the index, wait for a sample night (#23).
- **Copies run while you watch, not in the job runner.** The job runner starts external programs
  in a night window while the PC is idle. A copy runs no program and needs the PC on the
  scope's Wi-Fi, which is when Leigh is at the scope, so it runs when the transfer is started on the Vespera page.
- **The charter's read-only rule gains one exception.** Copies from a scope are the one way the
  app adds files to a folder it indexes, and only new files at the user's request; it still never
  moves, renames, changes or deletes a file there.

## Out of scope

- Deleting observations from the scope (owners report the server refuses it, and Singularity
  does it).
- Copying while observing (watching for new frames as they arrive).
- The Vespera III and Pro 2, which use a USB-C cable instead of FTP.
- Reading the observation's JSON metadata into the index.

## Looking at the scope

| ID | Pattern | Requirement |
|----|---------|-------------|
| VSP-002 | Unwanted | If nothing answers at the Vespera's address or the scope refuses the sign-in, then the system shall say so with the address it tried and what to check, and change nothing. |
| VSP-014 | Unwanted | If the saved Vespera address or kinds of file to copy cannot be read, then the system shall use the default (10.0.0.1 on port 21; FITS frames and TIFF) and say so on the Vespera page. |

## Copying

| ID | Pattern | Requirement |
|----|---------|-------------|
| VSP-012 | Ubiquitous | The system shall land copies in the folder set in Settings as Vespera copies, or in the home folder's raw folder when none is set, and shall refuse to copy when neither is set. |

## Quality

| ID | Pattern | Requirement |
|----|---------|-------------|
| VSP-005 | Ubiquitous | The system shall only read from the scope: it shall send no FTP command that removes, renames or writes a file there, refuse a command holding a line break, and open every data connection to the scope's own address whatever address the scope names. |

## Superseded by spec 034 (14 October 2026)

Leigh asked for one copy flow, so the list, copy and progress of this slice were replaced by
spec 034's review and transfer. The retired requirements, and what replaced each:

- VSP-001 (look for observations): VIN-001 and VIN-007 (scan).
- VSP-003 (copy picked observations): VIN-016 and VIN-019 (copy into `<target>/<session folder>`).
- VSP-004 (skip files already copied): VIN-023 (resume).
- VSP-006 (never overwrite): VIN-018 (never copy into another session's folder).
- VSP-007 (failed or short transfers): VIN-020 and VIN-021 (`.part` file, size check).
- VSP-008 (index after a copy): VIN-028.
- VSP-009 (cancel): VIN-022 and VIN-031 (pause instead of cancel).
- VSP-010 (room with a 1% margin): VIN-027.
- VSP-011 (progress; one copy at a time): VIN-029 (progress, speed and time left; one copy at a time).
- VSP-013 (Windows-safe names): VIN-030.
- VSP-015 (read the folder name): VIN-001 and VIN-002 (session folder grammar).
