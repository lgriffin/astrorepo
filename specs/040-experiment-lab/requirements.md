# 040 Experiment lab: requirements

Slice 6 of the observation intelligence proposal
([docs/proposals](../../docs/proposals/observation-intelligence-and-mosaics.md), section 4). It runs
one stack through Siril_Scripts v2 two to four ways, each into its own folder, so the results can
be compared side by side and one preferred, without the stack or any result being overwritten. The
IDs PE-001 to PE-004 are the proposal's; PE-005 onwards are added here.

## What slice 6 delivers

- A target's **Stack and process** tab has an **Experiments** card:
  - **New experiment**: a name, what it is for, one of the target's stacks, and two to four
    variants, each a Siril_Scripts profile and quality. The stack's size and SHA-256 are kept.
  - Each variant is given its own TARGET name, such as `M31-exp2-B`, so Siril_Scripts writes it to
    `processed/M31-exp2-B` beside the stack and no two variants share a folder.
  - **Queue for the run window** or **Run as soon as possible** queues one post-process job per
    variant that has not run, or whose run failed or was cancelled. A variant that succeeded is
    never run again.
  - Each variant shows its state from its job, and, once it succeeded, the files it left with their
    sizes, recorded once by SHA-256.
  - **Compare**: every finished variant's final image with the same auto-stretch, side by side or
    two under a slider, with the same figures for each (background, noise, noise over background,
    clipped highlights, crushed shadows, the brightest star's FWHM) and, figure by figure, which
    variant measures lowest. No winner is named.
  - **Prefer** marks one finished variant; the others are kept.
  - **Export report** (Markdown) or **Export JSON**: the input and whether it is unchanged, each
    variant's settings, the program, arguments and folder it ran with, the tools' versions, the
    job's exit code and times, its files by SHA-256, and what reproducing it takes.

## Changes to the proposal

- The MVP the proposal names: an existing stack and post-processing variants. Stacking variants,
  sweeps, SyQon steps and matched regions of interest wait.
- A variant's settings are the profile and quality Siril_Scripts v2 offers, from fixed lists, so
  no argument or command can be passed through an experiment (proposal: "allowlisted validated
  adapters only").
- Variants need the target's coordinates: Siril_Scripts looks its TARGET up on SIMBAD when none are
  given, and a variant's TARGET is not a real name.
- The lab never deletes a file. Outputs stay until the user removes them in the file manager; the
  report says where each is (PE-003).
- Experiments belong to a target. Linking one to a project waits for a use.

## Requirements

| ID | Pattern | Requirement |
|----|---------|-------------|
| PE-001 | Event | When an experiment is created, the system shall persist the input stack's path, size and SHA-256 and each variant's processing parameters, and shall not change them afterwards. |
| PE-002 | Event | When a variant executes, the system shall record the program, its arguments and folder, the tools' versions, the job and its log, its exit status and times, and once it succeeds the identity (name, size, SHA-256) of every file it wrote. |
| PE-003 | Ubiquitous | The system shall write each variant to its own folder, never run a variant that succeeded again, and retain all successful variant outputs until the user explicitly removes them. |
| PE-004 | Unwanted | If a required processor is unavailable, an option is invalid, the variants are fewer than two, more than four or the same, the target has no coordinates, the stack has changed or gone, or the disk cannot hold the runs, then the system shall refuse to create or run the experiment, queue nothing and explain the missing prerequisite. |
| PE-005 | Event | When the user compares an experiment, the system shall show every finished variant's final image with the same stretch, side by side or under a slider, with the same figures for each and which variant measures lowest on each figure, without naming any one variant best. |
| PE-006 | Event | When the user prefers a finished variant, the system shall mark that one and keep every other variant and its files; a variant that has not finished cannot be preferred. |
| PE-007 | Event | When the user exports an experiment, the system shall save a Markdown or JSON report of the input and whether it is unchanged, each variant's settings, run, exit status and files, and the limits on reproducing it, such as proprietary tools or unknown versions. |
