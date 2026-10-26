# Experiments: try a stack several ways and keep the one you like

The **Experiments** card on a target's **Stack and process** tab runs one stack through
Siril_Scripts v2 two to four ways. Each way writes to its own folder, so nothing is overwritten. You
can compare the results side by side, prefer one, and export a report of exactly what ran. Spec
[040](../../specs/040-experiment-lab/requirements.md); the proposal behind it is in
[docs/proposals](../proposals/observation-intelligence-and-mosaics.md).

## Making one

Press **New experiment** and give:

- a name, and optionally what you want to find out (it goes in the report);
- the stack, from the same list the post-processing step offers;
- two to four **variants**, each a Siril_Scripts profile (`galaxy`, `nebula`, `cluster`,
  `stellar`, `broadband`, `minimal`) and quality (`light`, `normal`, `strong`). Two variants with
  the same settings are refused, since they would make the same image.

The stack's size and SHA-256 are recorded when the experiment is made. The target needs
coordinates: each variant gets its own TARGET name, such as `M31-exp2-B`, and Siril_Scripts would
otherwise look that name up on SIMBAD. That name is also its folder: `processed/M31-exp2-B`
beside the stack.

## Running it

**Queue for the run window** or **Run as soon as possible** queues one post-processing job per
variant, run one after another by the [job runner](cockpit.md#jobs). Before anything is queued,
the app checks:

- the stack still has its recorded SHA-256 (a stack made again since needs a new experiment);
- Siril_Scripts and the tools it needs are found where it runs them from;
- the disk holds what every variant keeps plus the last one's busiest moment.

If any check fails, nothing is queued and the card says why. A variant that failed or was
cancelled can be run again with the same buttons. A variant that finished never runs again, so its
files are never overwritten. When a variant finishes, the card lists the files it left, recorded
once by SHA-256.

## Comparing and choosing

Once two variants have finished, press **Compare**:

- each variant's final image (its final FITS, else its final PNG) is shown with the same
  auto-stretch, side by side, or two under a slider;
- one table gives the same figures for every variant: background, noise, noise over background,
  clipped highlights, crushed shadows and the brightest star's FWHM;
- for each figure, the card says which variant measures lowest. It never names a winner:
  smoothing lowers noise and loses detail, and a strong stretch clips. Look at the images.

**Prefer** marks the variant you like. The others and their files stay; nothing in the lab deletes
a file. Remove outputs you no longer want in the file manager.

## The report

**Export report** saves Markdown and **Export JSON** saves the same as data. Both hold:

- the stack's path, size and SHA-256, and whether it is still unchanged;
- each variant's settings and state;
- the program, arguments and folder it ran with, the tools' versions when it was queued, the
  job's exit code and times;
- the files it left, by SHA-256.

The report also says what reproducing the experiment takes. RC Astro's tools are proprietary and
their models change between versions, so a run with other versions will not match exactly.
