# 022 Archive: requirements

This is slice P2, the fourth of the SyQon-inspired slices (see the roadmap). SyQon Studio keeps a
project two ways: a self-contained archive (SYQ) and a compact project that links to its sources
(SYQPRJ). Astrorepo does the same for a finished target's Siril work folder. Space matters most:
a stacked target's work folder often holds ten times its raw frames in Siril's working files, so
the archive shows what each of those folders takes and frees before anything is removed.

## What this slice delivers

- **Archive this target.** Step **5 · Archive** on a target's Stack and process keeps:
  - the stacks and their manifests (`result_*.fit` and `*.astrorepo.json` from spec 021);
  - the master calibration frames (`masters/`);
  - the finished images (`processed/`, from Siril_Scripts);
  - any other file the work folder holds that is not an intermediate.
- **Linked or self-contained.**
  - **Linked**: copies only what is kept. The raw frames stay where they are, on the NAS, and the
    archive's index lists the path of every raw frame the manifests name.
  - **Self-contained**: also copies those raw frames into the archive's `frames/<folder>`, so the
    archive needs nothing else.
- **Space first.** Before anything is copied or removed, a table lists each folder of the work
  folder: its size, the space removing it frees, and whether it can be rebuilt. The intermediates
  are:
  - the laid-out `lights`, `darks`, `flats` and `biases`;
  - Siril's `process`;
  - `failed`, the results of runs that did not finish (spec 021);
  - `.astrorepo`, the step scripts.

  The ones that can be rebuilt are ticked. `failed` can be ticked by hand, since nothing needs it.
  Nothing else can be removed.
- **An index.** Each archive holds `astrorepo-archive.json` (format `astrorepo-archive`, version
  1). It lists:
  - every kept file with its size;
  - the manifests;
  - every raw frame with its source path, size and copy in the archive (if any);
  - the intermediates the work folder held and whether each could be rebuilt.
- **Archived state.** The target's page shows "Archived on 9 Oct 2026, linked." with the archive
  folder, and stacking suggestions leave the target out until new frames arrive.
- **Where archives go.** Settings → Folders → Archive folder, for example a share on the NAS.
  When it is not set, archives go in the work area's `archive` folder. Each archive is a new
  folder named after the target and the day, such as `M 42 2026-10-09`.

## Changes to the blueprint

- **Rebuildable means a manifest proves it.** A folder of laid-out frames can be rebuilt only when
  a stack manifest names every file in it and every source it names is still there. `process` can
  be rebuilt when a manifest exists and all its sources are there, by queuing the stack again.
  Without a manifest (a stack from before spec 021, or one run by hand) nothing is offered except
  the failed runs and step scripts.
- **Hard links free nothing.** Prep for Siril hard-links frames when the work area shares a disk
  with them, so removing the laid-out lights gives back nothing. The archive counts a file with
  other names as freeing nothing unless every name is removed, and a symbolic link (which Siril's
  `convert` may make in `process`) as nothing at all.
- **Copies run while you wait, not in the job runner.** The job runner (spec 016) starts external
  programs in a night window while the PC is idle. An archive runs no program, and its removals
  need the user there to confirm them, so the copy runs when the user presses Archive. A failed or
  interrupted copy leaves nothing behind, so it is always safe to try again.
- **All or nothing.** The archive is built in a staging folder beside its destination. Every copy's
  size is checked against the plan, the index is written, and only then is the folder renamed into
  place. Intermediates are removed only after that, and only those the user ticked.

## Out of scope

- Restoring an archive into a work folder (rebuilding is queuing the stack again from its sources).
- Archiving the target's NAS folders (`stacked`, `tif`, `images`); the archive covers the work
  folder the app owns.
- Compressing archives.

## Preview

| ID | Pattern | Requirement |
|----|---------|-------------|
| ARC-001 | Event | When the user opens a target's archive step, the system shall show each folder of its work folder with its size, the space removing it frees, and whether it can be rebuilt, before anything is copied or removed. |
| ARC-002 | Ubiquitous | The system shall count a hard-linked file as freeing no space unless every one of its names is removed, including names in other folders the user ticked, and a symbolic link as freeing none. |
| ARC-003 | Ubiquitous | The system shall treat a folder of laid-out frames as rebuildable only when a stack manifest in the work folder names every file in it and every source any manifest names for it, from every run, still exists, treat Siril's process folder as rebuildable only when a manifest exists and all its sources exist, and never treat the failed runs folder as rebuildable; if any part of the work folder cannot be read, it shall judge nothing and remove nothing. |

## Archiving

| ID | Pattern | Requirement |
|----|---------|-------------|
| ARC-004 | Event | When the user archives a target linked, the system shall copy its stacks, manifests, masters and finished images into a new archive folder with an index listing each kept file with its size and the source path of every raw frame the manifests name. |
| ARC-005 | Event | When the user archives a target self-contained, the system shall also copy every raw frame the manifests name that still exists into the archive folder, each source under its own name when two runs used one name, and record in the index where each came from. |
| ARC-006 | Unwanted | If a copy fails or a copied file's size differs from the plan, then the system shall remove the staging folder, leave no archive folder behind, and remove nothing from the work folder. |
| ARC-007 | Unwanted | If the archive folder already exists, lies in a folder the app only reads, overlaps the work folder, or its disk lacks the room the copy needs, then the system shall refuse to archive and say what to change. |
| ARC-008 | Unwanted | If any job for the target (a stack, post-processing, SyQon step or plate solve) is queued or running, then the system shall refuse to archive it; while an archive is under way, the system shall not start any job for that target. |
| ARC-009 | Event | When an archive has been made, the system shall remove from the work folder only the intermediate folders the user ticked that are rebuildable or hold runs that did not finish, checking every one for links before removing any; if a removal stops part way, the system shall record what was removed and say that the archive was made and what was left. |
| ARC-010 | Event | When a target is archived, the system shall keep the date, the kind of archive, the archive folder and what removing intermediates freed, and show them on the target's Stack and process page. |
| ARC-011 | State | While a target is archived and its frames are unchanged since, the system shall leave it out of the stacking suggestions. |
| ARC-012 | Ubiquitous | The system shall put each archive in a new folder named after the target and the day, inside the archive folder set in Settings, or the work area's archive folder when none is set. |

## Quality

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-016 | Ubiquitous | The system shall write an archive only inside its new archive folder, remove only the work folder's intermediate folders, and never write to or remove from a source folder. |
