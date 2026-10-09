# 023 Hub: SyQon CLI and tool health: requirements

This is slice N, the fourth of the SyQon-inspired slices (see the roadmap). Leigh decided that
SyQon Studio's command-line tool joins the tool hub of spec 015 as an adapter, the way Siril and
RC Astro did, and runs through the job runner of spec 016. The hub also learns to say whether
each tool is healthy: its version, and whether the catalogues it needs are installed. Every tool's
exit code is read through one contract.

The facts about SyQon come from its developer pages (syqon.eu/develop), read on 9 October 2026:
- the headless CLI is `syqon-cli`;
- it is found in this order: a path the user set, the `SYQON_CLI_PATH` environment variable, the
  standard install folder, then the Windows App Paths registry key;
- `--list-models` lists the models with whether the account may use each. The stable model ids
  include `axiom-mini` (star separation, free with an account), `parallax-nano` (sharpening,
  free), `prism-essential` (denoise, included) and `deep-gradient` (gradient removal, included);
- progress goes to stderr, and the output path is the only thing on stdout;
- it takes an argument array, never a shell string, and never replaces an output unless told to;
- it exits with codes 0 to 7, or 130 when cancelled. Code 4 means the account does not include
  the model.

SyQon's integration kit is licensed PolyForm Noncommercial. Astrorepo calls the CLI the user
installed and never bundles it.

## What this slice delivers

- **SyQon in Settings > Tools.** The SyQon CLI appears with where it was found, its version and
  the models it lists, each marked available or not. ASTAP appears too, for health only.
- **Tool health.** Each tool shows its version, or "Unknown" when it has no version flag the app
  relies on. Under each tool, the catalogues it needs show as installed (and where) or not
  installed (and every folder looked in), with a folder setting:
  - ASTAP's star database;
  - Siril's Gaia catalogue for colour calibration (SPCC);
  - RC Astro's model files.
- **Get set up.** A catalogue missing for a tool that is found adds a step to the checklist on
  Home.
- **SyQon steps on a target's page.** Under **3 · Post-process**, a SyQon Studio section offers:
  - star separation, sharpening, denoise or gradient removal for the target's stack;
  - only the models the CLI reports as available for that step;
  - an output beside the stack, named after the step;
  - a **Replace it** box when that file is already there.

  Queued, the step runs in the job runner, and its progress shows as a percentage or the CLI's
  last line.
- **One exit-code contract.** Siril, Siril_Scripts, the RC Astro CLI and the SyQon CLI each have
  an exit-code table. The table turns an exit code into an outcome, a plain message and whether
  queueing it again could help.

## Changes to the blueprint

- **ASTAP is health only here.** Plate solving is slice D (spec 024), built in parallel. This
  slice finds ASTAP and its star database and exposes a pure `astapCatalogues(dirListing)` that
  slice D reuses; it builds no plate solver.
- **Checking a tool now runs it, a little.** Spec 015 found tools without running any (NFR-011).
  A version needs the tool's own version flag and SyQon's models need `--list-models`, so Settings
  runs those two flags and nothing else (NFR-017). Finding tools and building recipes still runs
  nothing.
- **A missing catalogue blocks the step that needs it.** RC Astro's tools need their models when
  the CLI is found. Siril's Gaia SPCC catalogue is shown but optional: without it Siril's colour
  calibration fetches Gaia data online, so blocking on it would stop runs that work.
  A missing one is named, and the run is not queued, rather than failing at 2am.
- **SyQon writes beside the stack**, as Siril_Scripts does, so a stack in a folder the app only
  reads is refused. An output already there is replaced only when the user ticks Replace it.

## Assumptions to confirm

These are not named in the SyQon pages Leigh summarised, or in the other tools' documentation
the app relies on. Each is coded so that it can be changed in one place.

- SyQon exit codes 1, 2, 3, 5, 6 and 7 get a generic message ("stopped with exit code N; its
  last lines in the log say why"), and are treated as worth retrying (`EXIT_CODES` in
  `packages/domain/src/exit-codes.ts`).
- The SyQon run flags are `--model <id> --input <file> --output <file>`, plus `--overwrite`
  (`syqonCommand`).
- The availability words that count as available are available, yes, ok, ready, installed,
  included, free, entitled, licensed, enabled and true. Any other word counts as not available
  (`parseSyqonModels`).
- A SyQon output is about the size of its input (`syqonNeededBytes`).
- The RC Astro CLI and ASTAP document no version flag, so their versions show as Unknown.
- Siril's local SPCC catalogue is the Gaia DR3 XP-sampled files `siril_cat*_xpsamp*.dat`. It is
  looked for in Siril's `share/siril/catalogue`, then `%LOCALAPPDATA%\siril\catalogue` (or
  `~/.local/share/siril/catalogue`), and the folder can be set.
- RC Astro's models are `BlurXTerminator*`, `NoiseXTerminator*` and `StarXTerminator*` model
  files beside the CLI or in its `models` folder.

## SyQon CLI

| ID | Pattern | Requirement |
|----|---------|-------------|
| HUB-006 | Ubiquitous | The system shall look for the SyQon CLI in the path the user set, then the SYQON_CLI_PATH environment variable, then SyQon Studio's install folders, then the Windows App Paths registry key, reading the registry with an argument array and never a shell. |
| HUB-007 | Event | When the SyQon CLI is found, the system shall list its models with --list-models, reading one model per line with its id first and an availability word, and offer for each step only the models it reports as available. |
| HUB-011 | Event | When the user confirms a SyQon step (star separation, sharpen, denoise or gradient removal) for a target's stack, the system shall queue the CLI with the stack as input, an output beside it, the chosen model and the overwrite flag only when the user chose to replace an existing output, and show its progress from stderr as a percentage or, when it prints none, its last line. |
| HUB-013 | Unwanted | If the SyQon CLI exits with code 4, then the system shall say that the account does not include that model and that queueing it again will not help until that changes. |
| HUB-014 | Unwanted | If a file already exists where a SyQon step writes and the user has not chosen to replace it, or the stack is in a folder the app only reads, then the system shall not queue the step and shall say why. |

## Tool health

| ID | Pattern | Requirement |
|----|---------|-------------|
| HUB-008 | Ubiquitous | The system shall show each found tool's version from its own version flag, and Unknown for a tool without a version flag the app relies on or one that prints no version. |
| HUB-009 | Ubiquitous | The system shall show, for each found tool, whether the catalogues it needs are installed (ASTAP's star database, Siril's Gaia SPCC catalogue and RC Astro's model files), with the folder they are in or every folder it looked in. |
| HUB-010 | Unwanted | If a catalogue that a found tool cannot run without is not installed, then the system shall add it to the Get set up checklist and refuse to queue a step that needs it with a message naming the catalogue; a catalogue the tool can do without (Siril's Gaia SPCC catalogue, which Siril fetches online when absent) shall be shown but block nothing. |
| HUB-015 | Ubiquitous | The system shall find ASTAP in the user's setting, on PATH or in its install folder, and name the star databases installed beside it (such as D50 or H18) from their .290 and .1476 files, without plate solving. |

## Exit codes

| ID | Pattern | Requirement |
|----|---------|-------------|
| HUB-012 | Ubiquitous | The system shall read the exit code of every program the job runner starts (Siril, Siril_Scripts with the RC Astro CLI, and the SyQon CLI) through one contract that gives an outcome, a plain message and whether running it again could help, treating SyQon's code 130 as cancelled. |

## Quality

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-017 | Ubiquitous | The system shall run a tool to check its health only with its version flag or the SyQon CLI's --list-models, as an argument array without a shell, for at most ten seconds, writing nothing, and shall never bundle the SyQon CLI. |
