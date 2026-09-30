# 015 Tool hub and post-processing recipes: requirements

Second part of slice C3 (recipes). The app gets one place that knows the external tools it hands
work to (the tool hub), and each target's page gets the Siril_Scripts v2 command for its stack:
profile from the object type, coordinates from the catalogue, optics from the headers, and the
disk space the run needs.

## What this slice delivers

- **Settings > Tools**: Siril, Siril_Scripts v2, the RC Astro CLI and (on Windows) Git Bash, each
  with where it was found (your setting, PATH or its usual install folder), or every place looked.
  A path saved here wins.
- A **Post-processing** section on a target's page: the newest stack (or one you pick), the
  profile and quality (changeable), the exact command with a Copy button, where it writes, the
  disk it needs at its busiest and what it keeps, and any stage it has to skip.

## Changes to the blueprint

- **A tool hub before the job runner.** Leigh asked for "a small gateway, hex-wise" to wire in
  the tools the app needs. The `ToolHub` port finds tools and the domain builds their commands;
  the job runner (slice G) will run them through the same port, so no use case knows where a
  program lives.
- **The recipe is shown, not run.** Running belongs to slice G, which adds the live log and
  confirmation. Until then the command is copied into a terminal on the PC.
- **No SIMBAD round trip.** Siril_Scripts looks the target up on SIMBAD for its coordinates and
  object type. The app already has both in its catalogue, so it passes `--profile` and
  `--coords`; SIMBAD is only used when a target has no coordinates.
- **Optics from the headers.** Siril_Scripts plate-solves with 250 mm and 2 µm unless told
  otherwise (the Vespera's). The recipe passes `--focal` and `--pixelsize` from FOCALLEN and
  XPIXSZ of the stack, or of the target's lights when a stack straight from Siril has none, so
  Seestar stacks (2.9 µm) solve.
- **Siril_Scripts' fixed tool paths are surfaced.** postprocess.sh runs Siril and RC Astro from
  `C:/Program Files/...` without searching, so a tool the hub finds elsewhere is flagged.

## Tool hub

| ID | Pattern | Requirement |
|----|---------|-------------|
| HUB-001 | Ubiquitous | The system shall list the external tools it hands work to, each with where it was found (the user's setting, PATH or a standard install folder). |
| HUB-002 | Event | When the user saves a tool's path in Settings, the system shall look there before PATH and the standard folders, and say when that path no longer exists. |
| HUB-003 | Unwanted | If Siril or the RC Astro CLI is found somewhere other than where Siril_Scripts v2 runs it from, then the system shall say so. |
| HUB-004 | Unwanted | If a tool is not found, then the system shall list every place it looked. |
| HUB-005 | Ubiquitous | The system shall find Siril's stock preprocessing scripts where Siril installs them beside siril-cli (added with spec 016, so a queued stack runs the installed script). |

## Post-processing recipe

| ID | Pattern | Requirement |
|----|---------|-------------|
| PPR-001 | Ubiquitous | The system shall propose, for a target's newest stack (indexed, or left by Siril in its work folder), the Siril_Scripts v2 command with the profile from the object type, the target's coordinates and the optics from the headers. |
| PPR-002 | Event | When the user picks another stack, profile or quality, the system shall rebuild the command with it. |
| PPR-003 | Unwanted | If the RC Astro CLI is not found, then the system shall skip BlurXTerminator, NoiseXTerminator and StarXTerminator in the command and say why. |
| PPR-004 | Unwanted | If Siril, Siril_Scripts or (on Windows) Git Bash is not found, then the system shall offer no command and name what is missing. |
| PPR-005 | Ubiquitous | The system shall estimate the disk the pipeline uses at its busiest and what it keeps, and whether the stack's disk has room. |
| PPR-006 | Unwanted | If the stack is in a folder the app only reads, then the system shall warn that Siril_Scripts writes its output beside it. |

## Non-functional

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-011 | Ubiquitous | The system shall find tools and build recipes without running any tool or writing any file. |
