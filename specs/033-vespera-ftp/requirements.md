# 033 Vespera control: requirements

Leigh asked (14 October 2026) for "a native FTP connection capability to the Vespera for image
movement", with a control tab of its own. The Vespera Pro serves its storage over FTP on its own
Wi-Fi at 10.0.0.1, and that is the only way to get its raw frames off it. This slice is the
Vespera page under Files: it lists what the scope holds, says what is already on the PC, and
copies the observations Leigh picks into the library, where the home scan picks them up.

## What this slice delivers

- **A Vespera page** under Files in the sidebar, with three cards:
  - **Connection**: the scope's address (10.0.0.1 unless changed), the folder copies land in, the
    kinds of file to copy (FITS frames and JSON metadata by default; the scope's TIFF stack and
    JPEG previews when ticked) and **Look for observations**.
  - **On the Vespera**: each observation newest first, with its date, target, how many FITS, TIFF
    and JPEG files it holds, and whether it is new, partly copied or all on the PC. New ones are
    ticked. Each ticked one shows the target folder it lands in, which can be renamed before
    copying (for an observation whose folder names no target, or names it differently from the
    library). **Copy selected** starts the copy.
  - **Copy**: the file being copied, files and bytes done, the speed and the time left, and
    **Cancel**. Once a copy ends, the list is read again and the copies are indexed.
- **Where copies land.** Settings → Folders → Vespera copies, or, when that is not set, the home
  folder's `raw` folder. Each observation lands in `<target>/<observation folder>/…`, keeping
  the scope's own `01-images-initial` and `02-images-adjust-framing` folders, so the home scan
  matches the target folder to its target and indexes the frames like any other raw folder.
- **Copies only add files.** Nothing on the scope is removed, renamed or written (the adapter
  refuses to send any command that could), and nothing on the PC is overwritten. Each file
  arrives as a partial file that takes its name only once it is whole and as long as the scope
  listed it. A copy that stops (Wi-Fi drop, cancel, full disk) keeps what it copied; copying
  again carries on from the next file.
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
  scope's Wi-Fi, which is when Leigh is at the scope, so it runs when Copy selected is pressed.
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
| VSP-001 | Event | When the user looks for observations, the system shall connect to the Vespera at the address in Settings, list every observation folder in the scope's user folder and its darks folder, and show each newest first with its date, target, how many files of each kind it holds, and how many of them are already on the PC. |
| VSP-002 | Unwanted | If nothing answers at the Vespera's address or the scope refuses the sign-in, then the system shall say so with the address it tried and what to check, and change nothing. |
| VSP-014 | Unwanted | If the saved Vespera address or kinds of file to copy cannot be read, then the system shall use the default (10.0.0.1 on port 21; FITS frames and JSON metadata) and say so on the Vespera page. |
| VSP-015 | Ubiquitous | The system shall read an observation's date, time and target from its folder name, with the date before or after the target and with or without separators, and shall keep a date that is not a real day or a time that is not a real time as part of the target. |

## Copying

| ID | Pattern | Requirement |
|----|---------|-------------|
| VSP-003 | Event | When the user copies the observations they picked, the system shall copy each of their files of the kinds chosen into the landing folder under a folder named after its target (the name the user confirmed, else the one in the observation's name) and then the observation's own folder, keeping the scope's folders inside it. |
| VSP-004 | Ubiquitous | The system shall skip a file already at its landing place with the size the scope lists, so a copy that stopped part way carries on from the next file when it is run again. |
| VSP-006 | Ubiquitous | The system shall never overwrite a file on the PC: a file already at a copy's landing place with another size, or a second file that would land in the same place, is left as it is and reported. |
| VSP-007 | Unwanted | If a file's transfer fails or the bytes received differ from the size the scope listed, then the system shall leave no file or partial file at its place, keep the files already copied, stop the copy and say which file failed and why. |
| VSP-009 | Event | When the user cancels a copy, the system shall stop at the next chunk of the file under way, remove that file's partial copy, and keep the files already copied. |
| VSP-010 | Unwanted | If the landing folder's disk lacks room for the files to copy with a 1% margin, then the system shall copy nothing and say how much more room it needs. |
| VSP-011 | State | While a copy is under way, the system shall show the file being copied, the files and bytes done of the total, the speed and the time left, and shall refuse to start another copy or to look for observations. |
| VSP-012 | Ubiquitous | The system shall land copies in the folder set in Settings as Vespera copies, or in the home folder's raw folder when none is set, and shall refuse to copy when neither is set. |
| VSP-013 | Ubiquitous | The system shall name every landing folder and file so Windows accepts it, and shall leave out any name from the scope that holds a slash, a line break or another control character, or is "." or "..". |
| VSP-008 | Event | When a copy that brought files in ends, the system shall index them, with a home scan when the landing folder is inside the home folder and with a FITS scan of the landing folder otherwise, and say on the Vespera page how that went. |

## Quality

| ID | Pattern | Requirement |
|----|---------|-------------|
| VSP-005 | Ubiquitous | The system shall only read from the scope: it shall send no FTP command that removes, renames or writes a file there, refuse a command holding a line break, and open every data connection to the scope's own address whatever address the scope names. |
