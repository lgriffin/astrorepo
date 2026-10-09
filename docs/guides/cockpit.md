# Using the cockpit

Home is the cockpit. Until the app is set up, it opens with a **Get set up** checklist:
1. Set your site.
2. Choose your home folder.
3. Scan your library.
4. Find Siril.

Each step links to where it is done and is ticked off once it is. **Hide** puts the checklist
away; **Start again** in Settings brings it back.

Below that, from the top, Home shows:
1. **Next actions**: what is worth doing next.
2. **Coming nights** and **Hidden in your files**, side by side.
3. **Where your targets are**: how many targets are at each stage.
4. **Other checks**.

Everything on it is worked out from the files the app has indexed (the Library and FITS files
scans), so it changes as you capture, stack and process. Totals, catalogue progress and
breakdowns by object type and equipment are on **Insights**, under **Your observatory**.

## Coming nights

Next to the hidden-data card, the **Coming nights** card plans ahead from your site: tonight's
targets given the moon, targets whose season is closing, and the next new-moon window. See
[Planning ahead](planning.md) for what each part means.

## Progress strip

Six boxes count your targets by how far they have got, from their files rather than the manual
workflow stage:

| Stage | Means |
|---|---|
| Planned | You set an integration goal but have no subs yet. Catalogue targets you have not set a goal for are not counted. |
| Capturing | Subs exist, less than the ready-to-stack amount (2 hours by default). |
| Enough data | At least 2 hours of subs and no stack yet. |
| Stacked | A stacked FITS exists for the target. |
| Processed | Processed files (for example TIFFs from Siril) exist in the target's folder. |
| Final | Finished images (JPEG or PNG) exist in the target's folder. |

A target sits at the furthest stage it has evidence for.

## Hidden in your files

One line per kind of data that is there but not yet turned into anything. Each line has a Review
button that opens the page where you can act on it.

- **Nights of subs never stacked.** Nights whose subs are newer than the target's latest stack
  (or every night, if it was never stacked). The biggest targets are named.
- **Subs with no target.** Light frames the scanner could not link to a target, grouped by the
  folder they are in. Link them on the FITS files page and they start counting.
- **Calibration frames that match no lights.** Darks at a gain, exposure and temperature (within
  2 °C and 1 s) no lights use, flats for a filter no lights use, and biases at a gain no lights
  use. A setting missing from a header never counts as a mismatch.
- **Subs rejected by quality checks.** Subs the quality analysis flagged for rejection, including
  ones with no target yet, so you can leave them out of the next stack.

- **Files that could not be read.** Files with a FITS extension the scanner could not parse, with
  the reason for the first few. They are kept aside rather than skipped silently, and leave the
  list once a rescan can read them.
- **Duplicate files.** Press **Check for duplicates** at the top of the card. The check samples
  the start and end of every indexed FITS file and reads in full only files whose samples match,
  so it is quick; a second check reads only files that changed on disk since it last looked. It
  reports how many copies exist and how much space they take, and **Show where the copies are**
  lists every path in each group (the 50 biggest groups, with a count of the rest). Files that
  have moved or cannot be read (for example on a NAS share that is offline) are skipped and
  counted. Nothing is ever deleted.

## Next actions

One ranked list of what to do, captures first because a night does not wait:

1. **Shoot tonight, season closing**: targets up tonight whose season ends within 30 days,
   soonest first. These are marked high priority.
2. **Shoot tonight**: your other targets with work left that are up for at least an hour above
   30°, most hours first.
3. **Mosaic tiles with no lights**: for a target with a saved mosaic plan, each tile nothing has
   been captured for yet, with how many of the next 30 nights it is up for an hour above 30°
   (see [Planning a mosaic](#planning-a-mosaic)).
4. **Stack**: the stacking suggestions below, most waiting data first.

Each capture says how long the target is up above 30°, how close the moon comes, the days left in
its season when it is closing, and how far it is from its integration goals. Goals count per filter:
2 hours of Ha past its goal does not make up for OIII you have not started. Under a bright moon only
emission targets are suggested, and only with a dual-band or narrowband filter (see
[Planning ahead](planning.md)). On a night with nothing to shoot, or before you have set your site,
the list starts with stacking. Captures are worked out afresh each night, so they have no Dismiss
button.

When a target already has a stack queued or running in Jobs, its stacking suggestion says so
("Queued in Jobs for the run window", or "Stacking now") and its button opens Jobs instead of
the target, so Home never asks you to stack something that is already on its way.

Below the list, **Other checks** keeps the calibration, integration-goal and quality warnings (such
as lights with no matching darks) in a section of their own, so a long to-do list never hides them.

## Stacking suggestions

Stacking suggestions say how much data is waiting:

- **Ready to stack**: at least 2 hours of subs and no stack, with the number of subs and nights.
- **Worth a restack**: at least 1 hour of subs captured after the newest stack.

Subs rejected by quality checks never count toward either amount, nor toward "Enough data" on
the progress strip.

Among themselves, stacking suggestions are ordered by unprocessed integration, largest first. **Dismiss** hides a suggestion
until that target's data changes: a new sub, stack, processed or final file, or a sub re-read with
a different filter, scope or quality verdict, brings it back.

## On a target's page

A target's page has four parts, in tabs under its name. Its image and its other names stay
beside every part.

- **Overview**: what the files say (below), the next step for the target in one sentence, and the
  workflow stage.
- **Stack and process**: the whole flow from raw frames to a processed image, as numbered steps.
  **1 · Grade the lights** measures every light and grades it (see below). **2 · Stack** is Prep
  for Siril and the stacking plan. **3 · Post-process** is the Siril_Scripts recipe. **4 · Runs**
  lists this target's queued, running and recent jobs. **5 · Archive** archives the finished
  target (see [Archiving a finished target](#archiving-a-finished-target)). When a stack or
  post-processing job is already queued or running, its step says so at the top and does not
  offer to queue it again.
- **Files**: the target's folders, with buttons to open each one, **Compare images** and
  **Palettes** (see [Inspecting an image](#inspecting-an-image)), and what the index knows about
  its FITS files.
- **Notes and nights**: your notes, the description, the nights you logged and the catalogue
  details.

A stacking suggestion on Home and each job on the Jobs page open the target at **Stack and
process**.

"What the files say" shows the target's integration split by filter, by scope and by observing
night, when it was last captured, how many stacks it has, how many nights are not in a stack yet,
and how close it is to its integration goal.

An observing night is the date the evening began, so a session that runs past midnight counts as
one night.

## Preparing a target for Siril

In **Stack and process**, step 1, **Prep for Siril** builds the folders Siril expects (lights, darks, flats and
biases) in the app's work area and opens it. Your target folder is not touched. Frames in session
subfolders are included, and a frame in a folder named for its type (such as `darks`) goes to that
Siril folder when its header does not say. Preparing again replaces any frame whose source has
changed since. Frames are
hard-linked when the work area is on the same disk (instant, no extra space) and copied when it is
not, for example when the frames live on the NAS. The work area is under the app's data folder
unless you set `work_area_path` in Settings. A work area inside the target folder, the home or
master FITS folder, or any scanned folder is refused, since the app never writes there. Siril only
reads these frames; do not edit them in place, because a hard link shares its bytes with the
original.

You only need Prep for Siril to run Siril yourself: a queued stack prepares the folders on its own
before Siril starts.

## Stacking plan

Under **Prep for Siril**, the stacking plan says which of Siril's stock preprocessing scripts
to run on the prepared folders, and whether your disk has room, before anything is written.

- **Which script.** Colour frames with biases, flats and darks get `OSC_Preprocessing.ssf`. With
  darks but not all three sets, `OSC_Preprocessing_WithoutFlat.ssf`; with no darks,
  `OSC_Preprocessing_WithoutDBF.ssf`. Siril's scripts use flats and biases only with all three
  sets, so the plan says when yours are left out. Mono frames need all three sets for
  `Mono_Preprocessing.ssf`; without them no stock script fits, and the plan says what is missing.
  A light whose header names a Bayer pattern is colour; frames never scanned are taken as colour,
  since the Seestar and the Vespera are colour cameras.
- **How much space.** Siril's stock scripts keep every intermediate file (converted, calibrated
  and registered copies of every light), so a stack needs many times the size of the lights. The
  plan adds up each stage the way Leigh's Siril space estimator does, plus what Prep for Siril
  must copy: each frame on another disk from the work area, unless an up-to-date copy is already
  there (frames on the same disk are hard-linked for free). It then says whether that fits in the
  free space on the work area's disk, or by how much it is short. Files an earlier run left in the
  work folder's `process` and `masters` folders are reported but not counted as free, since they
  may belong to another script; delete them to get the space back.
- **Every script and its stages** lists the other stock scripts for your sensor (Bayer drizzle,
  Ha or Ha+OIII extraction for dual-band data) with their size, whether they fit, what
  calibration they would need, and a stage-by-stage breakdown.

Sizes come from each light's header (width and height). For a folder not yet scanned in the FITS
Analyzer, the plan guesses the frame size from the file size and says the figures are
approximate. When the lights are not all one size, every light is counted at the largest, so the
plan never comes out too small. Making the plan writes nothing, anywhere.

## Post-processing

Once a target has a stack, step 2 of **Stack and process** shows the Siril_Scripts v2 command to
finish it. The recipe
uses the newest stack still on disk: an integration the FITS files scan indexed (not a calibrated
sub or a master calibration frame), or the `result*.fit` Siril left in the target's work folder.
Pick another from the list if there are several.

- **Profile and quality.** The profile comes from the object type, the way Siril_Scripts would
  choose it from SIMBAD: galaxies get `galaxy`; emission, reflection, planetary and dark nebulae
  and supernova remnants get `nebula`; clusters get `cluster`; stars get `stellar`; anything
  else gets `broadband`. Quality starts at `normal`. Change either and the command follows.
- **What the command carries.** The target name (spaces dropped, as the output folder is named
  after it), the target's coordinates so no SIMBAD lookup is needed, and focal length and pixel
  size from the stack's headers (or the target's lights), so Siril plate-solves a Seestar stack
  with its 2.9 µm pixels rather than Siril_Scripts' default of 2 µm.
- **What it skips.** Without the RC Astro CLI, the command adds `--no-bxt --no-nxt --no-sxt` and
  says so.
- **Where it writes and how much.** Siril_Scripts writes `processed/<TARGET>/` beside the stack.
  The panel gives the space the run uses at its busiest (every intermediate file at once) and
  what it keeps, against the free space on that disk. A stack in a folder the app only reads
  gets a warning, since the script would write there.

Press **Queue post-processing** to have the app run it (see Jobs below), or copy the command and
run it in Command Prompt on the PC (on Linux or macOS, any shell; every argument is quoted so
paths stay literal). A path holding characters Command Prompt acts on (`% ! ^ & | < > "`) gets
no command to copy, and the panel says which to rename; queueing it still works, because the app
runs the script without Command Prompt. Working the recipe out runs nothing and writes nothing.

## Jobs

Stacking and post-processing can tie the PC up for an hour or more, so the app runs them like a
small CI runner rather than straight away.

- **Queueing.** Under a target's stacking plan, **Queue this stack** runs the recommended stock
  script; under its post-processing recipe, **Queue post-processing** runs Siril_Scripts v2.
  Either first shows what will run: the script, the frames, the disk it needs and whether it
  fits, and where it writes. Then choose **Queue for the run window** or **Run as soon as
  possible**. The app works the plan out again from the target's own folders before queueing,
  and refuses it if the tools, calibration frames or disk space are no longer there, or the
  confirmed stack has gone. Post-processing is refused for a stack in a folder the app only
  reads (Siril_Scripts writes beside it), and on Windows when Siril or RC Astro is installed
  anywhere but where Siril_Scripts runs it from. A stack Siril made in the work area is fine. A stack job lays the frames out in the
  work area (Prep for Siril) before Siril starts.
- **When jobs start.** A window job starts only inside the run window (02:00 to 03:00 unless you
  change it in **Settings > Run window**), once nobody has used the keyboard or mouse for 10
  minutes and CPU use is below 30%. Set the same time for both ends to allow any time of day.
  One job runs at a time, at below-normal priority, and a job still running when the window
  closes is left to finish. A Run now job ignores the window and the idle check.
- **Predicted length.** Each job's length is predicted from this PC's last five successful runs
  of the same kind, per GB it writes; until there are any, from a first-run guess (a minute and
  a half per GB for stacking, fifteen for post-processing, ten for a SyQon step), and the Jobs page says which. A job
  that would run past the window's close lets a shorter one go first and waits for the next
  night; a job longer than the whole window starts anyway, since it would never fit.
- **Disk space.** Free space is checked again just before a job starts. A job whose disk is
  short, or will not report its free space, waits and says so, and the next job may go instead.
- **The Jobs page** shows whether the window is open, how busy the PC was at the last check, the
  running job with its time so far, the queue in the order it will run with why each waits, and
  the last 20 finished jobs. **Log** shows a job's output (live while it runs), the exact program
  and arguments it ran, and its exit code. **Cancel** stops a running job and everything it
  started (Siril, RC Astro), or takes a queued one off the queue; **Run now** moves a queued job
  ahead of the window.
- **Keep the app open.** Jobs start from the app's own timer, so it must be running at the
  window's time; it keeps the PC awake while a job runs. If the app closes mid-job, the job is
  stopped and queued again at the next start, and marked failed after the second time.

The runner starts programs directly (Siril's `siril-cli -d <work folder> -s <script>`, Git Bash
running `postprocess.sh`, or `syqon-cli`), never through a shell. Logs are kept in the app's data
folder under `jobs/`. However a run ends, its exit code is read the same way for every tool: done,
failed with a plain message, or cancelled. A failure that will happen again until something
changes (such as a SyQon model your account lacks) says so in the note.

## Tools

**Settings → Tools** lists the programs the app hands work to: Siril, Siril_Scripts v2, the RC
Astro CLI, on Windows Git Bash (which Siril_Scripts' `.bat` needs), the SyQon CLI and ASTAP. Each
is looked for in the path you save there, then on PATH, then in its usual install folder; for
Siril_Scripts, the repo folder, its `v2` folder or `postprocess.bat` itself will do, as long as
`postprocess.sh` sits beside it. The SyQon CLI is looked for in SyQon's own order instead (see
below). A tool that is not found lists every place the hub looked. The SyQon CLI and ASTAP are
optional (ASTAP is the preferred plate solver, and Siril solves when it is missing), so a missing
one says "Not installed (optional)" rather than counting as a gap. Siril_Scripts runs Siril and RC Astro from `C:/Program Files/...` without
searching, so a tool found anywhere else is flagged. Siril's stock scripts are found where Siril
installs them, under `share/siril/scripts` beside its `bin` folder.

- **Versions.** Each tool shows its version, from its own version flag: `siril-cli --version`,
  `bash --version` and `syqon-cli --version`. The RC Astro CLI, ASTAP and Siril_Scripts have no
  version flag the app relies on (Siril_Scripts' entry would start processing), so theirs reads
  Unknown. Asking for a version is the only time the app runs a tool to check it: with an
  argument array, never Command Prompt, stopped after ten seconds, writing nothing.
- **Catalogues.** Under each tool, the catalogues it needs show as installed, with the folder
  and what is there, or not installed, with every folder looked in. You can name the folder:
  - **ASTAP star database**: files such as `d50_0101.1476` or `h17_0101.290` beside ASTAP or in
    `C:\Program Files\astap`, named by database (D50, H18). Plate solving (below) uses ASTAP
    when it is found.
  - **Siril's Gaia SPCC catalogue**: the Gaia `siril_cat*_xpsamp*.dat` files Siril's catalogue
    installer puts in `%LOCALAPPDATA%\siril\catalogue`, or Siril's own `share/siril/catalogue`.
    It is optional: without it Siril's colour calibration fetches Gaia data online, so a missing
    one is shown here but blocks nothing. Install it to calibrate offline.
  - **RC Astro model files**: the BlurXTerminator, NoiseXTerminator and StarXTerminator models
    beside the CLI or in its `models` folder. Checked only when the RC Astro CLI is found (without
    it, Siril_Scripts skips those stages). Until the installer's file names are confirmed, a
    missing one is shown here but blocks nothing.

  A catalogue that a found tool cannot run without also adds a step to **Get set up** on Home. A catalogue
  whose tool is not found is not checked.

## SyQon Studio's CLI

SyQon Studio's headless `syqon-cli` runs its models on this PC: star separation (`axiom-mini`),
sharpening (`parallax-nano`), denoise (`prism-essential`) and gradient removal
(`deep-gradient`), among others. Install SyQon Studio and sign in; astrorepo calls the CLI you
installed and never bundles or ships it, because SyQon's integration kit is licensed PolyForm
Noncommercial.

- **Where it is found.** In SyQon's own order: the path you save in Settings → Tools, the
  `SYQON_CLI_PATH` environment variable, the install folders
  `%LOCALAPPDATA%\Programs\SyQon Studio\` and `%ProgramFiles%\SyQon Studio\`, then the Windows
  App Paths registry key for `syqon-cli.exe` (HKLM, then HKCU), read with `reg query`.
- **Models.** Settings → Tools runs `syqon-cli --list-models` and lists each model with its step
  and whether your account may use it. Only models it reports as available are offered. A
  target's page reuses the list for two minutes; opening Settings → Tools always asks afresh.
- **Running a step.** On a target's **Stack and process**, under **3 · Post-process**, the
  SyQon Studio section picks a stack, a step and a model:
  - the output goes beside the stack, named after the step (`result_3600s_starless.fit`,
    `_sharpened`, `_denoised`, `_gradient-removed`);
  - if that file is already there, the step is not queued until you tick **Replace it**, which
    adds the CLI's overwrite flag. Nothing is ever replaced without it, and the disk still needs
    room for a full new copy, since SyQon may write it before the old one goes;
  - SyQon's own outputs are never offered as stacks, so a step's output does not become the
    next default;
  - a stack in a folder the app only reads is refused, since SyQon writes beside it;
  - **Queue this step** shows what will run, then queues it for the run window or as soon as
    possible, like the other jobs.
- **Progress and results.** While it runs, the Jobs page shows SyQon's progress from its stderr
  as a percentage, or its last line when it prints no percentage. Only whole lines are read. The output path it prints on
  stdout is written to the log.
- **When it fails.** Exit code 4 means your SyQon account does not include that model; the job
  says so, and that queueing it again will not help until that changes. Code 130 means it was
  cancelled. SyQon's pages do not yet say what codes 1 to 3 and 5 to 7 mean, so those say the
  code and point to the log.

## Rescanning

Scanning a folder again reads only files that are new or whose size or modified time changed.
Everything else keeps its target link, headers and quality verdict, so a rescan of a big library
is quick. Scanning a subfolder of one already scanned, or the same folder typed with a trailing
slash, reuses those rows too. Unreadable files that have not changed stay in the "could not be
read" list without being read again.

## Grading the lights

Before a stack, **1 · Grade the lights** on a target's Stack and process measures every light from
its pixels: FWHM (how wide the stars are, in the frame's own pixels), eccentricity (how trailed
they are, 0 for round), how many stars it holds, the sky background and noise, and SNR (how well
the stars stand out). A colour camera's frames are binned 2×2 first, so the Bayer pattern is not
mistaken for stars. Your files are only read.

**Measure lights** works through them a few at a time, away from the rest of the app so it stays
responsive; **Stop** stops between batches and the next press carries on. Each night and filter then shows its median FWHM and stars, a trend line of
FWHM over star-count bars in capture order (rejected frames in red), and every frame with its
grade and the reasons for it.

A light is **rejected** when its eccentricity is above the limit, or its FWHM, star count or
background is far from the median of its own night and filter (so a soft night is not thrown out
whole). Set the limits in **Settings > Frame grading**; changing them grades every light again
straight away. **Your choice** beside a frame keeps or rejects it whatever the limits say, until
you set it back to **By the limits**. A light that could not be read shows why and stays in the
stack.

Only kept lights go to Siril: the stacking plan counts them, and Prep for Siril and queued stacks
place only them, removing any rejected light an earlier run left in the work area. Anything else
in the work folders, such as frames you added by hand, stays. Kept lights get
a weight (their SNR squared against the best one) for weighted stacking. **Export CSV** saves every
measurement, grade and reason for a spreadsheet.

### Stacking advice

Under the stacking plan, each script says how much memory it needs. When the PC has less free
than one pass needs, Siril stacks in blocks, which is slower. When it has less than the least it
can work with, the plan says whether closing other programs (or leaving it for the night window)
will do, or whether to stack fewer lights at a time.

**Stacking advice** opens below the plan:

- **Image scale and drizzle.** The scale in arc seconds per pixel comes from the lights' focal
  length and pixel size. Bayer drizzle is suggested only for colour lights coarser than 2"/px
  with at least 100 kept, and it shows how much more disk it needs. When the folder lacks
  calibration frames the drizzle script needs, it says which instead. Drizzle also needs frames
  that were dithered.
- **Rejection.** The method that suits how many lights are kept, with the `rej` arguments to use
  in Siril.
- **Calibration.** Whether the darks, flats and biases in the folder match the lights. When they
  do not, it says what differs on the nearest frame (a warmer sensor, another exposure, gain or
  filter). When a few frames match no light beside ones that do, it counts them and asks you to
  move them out. Siril's stock scripts use every frame in the folder either way. A Seestar target is
  told it needs no calibration frames, because the Seestar calibrates on board.
- **Nights.** Each night's lights, how many grading kept, their median FWHM and the flats taken
  that night. **Leave out** rejects a whole night's lights in this folder, and **Use again** hands
  them back to the grading limits. A frame you kept or rejected by hand keeps your choice either
  way. When some nights have no flats of their own, the plan warns that one master flat
  will calibrate every night.

Tonight's plan and the next actions also watch the balance of narrowband targets. When a filter
has under a third of the integration of the target's best-covered filter, they suggest capturing
it, for example: "Capture OIII: it has 40 m against 6 h of Ha." Luminance is left out of the
balance, and a filter you set a goal for counts before its first frame ("it has nothing yet").

## What made a stack

A queued stack runs Siril's stock script one step at a time: convert, calibrate, register and
stack each run on their own. The Jobs page and step **4 · Runs** show the step that is running.

- **When the app closes during a stack**, the next start carries on from the step it stopped
  at. If the frames changed since (a light graded out, a new night added, a frame rewritten or
  one dropped into the work folder by hand) or Siril's script changed, it starts from the first
  step, sets aside anything the stopped attempt wrote, and the log says why. Results an earlier
  stack left in the work folder are never claimed by a later run.
- **When every step succeeds**, each result Siril saved gets a manifest beside it, for example
  `result_3600s.fit.astrorepo.json`. The manifest records the script, each step and how long it
  took, every frame by folder with its source, and the lights grading left out.
- **When a step fails, you cancel, or the manifest cannot be written**, any result the run wrote
  is moved, with any manifest beside it, to the work folder's `failed` folder, so it is never
  mistaken for a finished stack. A cancel between steps stops the next step from starting. When the failure is one Siril
  often hits (a full disk, too little memory, too few stars to register, frames of different
  sizes, a file another program holds open), the job says what it usually means and what to do.

Step **4 · Runs** lists the target's runs, newest first. Each shows how far it got, whether it
carried on from an earlier run, and the results it published.

## Archiving a finished target

When a target is done, step **5 · Archive** on its Stack and process keeps what matters and gives
the disk back. Nothing is copied or removed until you press **Archive** and confirm.

**What it shows first.** A table of every folder in the target's work folder: its size, the space
removing it frees, and whether it can be rebuilt.

- The laid-out `lights`, `darks`, `flats` and `biases` can be rebuilt when the stack manifest
  names every frame in them and those frames are still where it says, for every run that used
  the folder. When Prep for Siril
  hard-linked them (the work area is on the same disk as the frames), removing them frees nothing,
  and the table says so.
- `process`, Siril's working files, is usually the big one. It can be rebuilt when a stack
  manifest exists and its frames are all still there: queue the stack again.
- `failed` holds results of runs that did not finish. Nothing needs it; tick it if you do not
  want to look into those runs.
- `.astrorepo` holds the step scripts, which every stack writes again.
- The stacks, manifests, `masters` and `processed` (finished images) are kept in the archive.

Folders that can be rebuilt start ticked. A stack run before manifests existed, or by hand in
Siril, has no manifest, so only `failed` and the step scripts are offered.

**Linked or self-contained.**

- **Linked** copies only what is kept. The raw frames stay where they are, on the NAS, and the
  archive lists where each one is. It is small and fast.
- **Self-contained** also copies every raw frame the manifests name into the archive's
  `frames` folder, so the archive holds everything needed to stack again.

Each archive is a new folder named after the target and the day, for example
`M 42 2026-10-09`, with an index, `astrorepo-archive.json`, that lists every kept file with its
size and every raw frame with its source. Set where archives go in Settings → Folders →
Archive folder; until you do, they go in the work area's `archive` folder. The archive folder
must be outside the folders the app only reads.

**Safe by design.**

- The archive is built in a hidden staging folder and renamed into place only when every copy
  has the size it should. If a copy fails, nothing is left behind and nothing is removed, so you
  can fix the cause and try again.
- If any file or folder in the work folder cannot be read, the step says which and does nothing,
  rather than judge a folder on a partial listing.
- When one frame file is hard-linked from two folders you tick, the space it frees is counted once
  both are ticked, so the figure in the confirmation is what the disk gets back.
- Every ticked folder is checked for links before any is removed. If a removal still stops part
  way (a file in use, say), the archive stays, the step says what was removed and what was not,
  and you can remove the rest by hand.
- Only the folders you ticked are removed, only from the work folder, and only after the archive
  is in place. Source folders are never touched.
- A target with any job queued or running (a stack, post-processing, a SyQon step or a plate
  solve) cannot be archived until it ends, and a run queued for it while the archive is under way waits until the archive finishes.

Afterwards the step says "Archived on 9 Oct 2026, linked." with the archive folder and the space
removing intermediates freed. Stacking suggestions leave the target out until new frames arrive.

## Plate solving

**Where it points**, on a target's Overview, says where its files point on the sky. **Plate
solve** queues one job in Jobs that places, one after another:
- one light from each folder of each night (the one in the middle of the night's run);
- every master stack.

Files already placed are skipped, so asking again only solves what is new; a file whose solve
failed counts as not placed and is tried again. The job runs as soon as nothing else is running,
since a solve takes seconds; it shows the file it is on, and Cancel stops it before the next file
starts.

- **Near the target first, then the whole sky.** Each solve starts from the catalogue position of
  the target the file is filed under. When the solver finds no match there, the file is solved
  once more over the whole sky (slower) before the failure is kept, so files filed under the
  wrong name are still placed and flagged.

- **Which solver.** ASTAP when Settings → Tools finds it (`astap_cli` or `astap`), otherwise
  Siril's own solver. With neither, the card says so and nothing is queued. ASTAP needs one of its
  star databases installed beside it; without one, each solve fails with ASTAP's own message.
- **Your files are not touched.** Each file is hard linked, or copied when that is not possible,
  into `solve/<target>` in the work area. The solver runs there, and its copy and result files
  are removed after each solve.
- **No solve when the headers know.** A file that already carries a position in its headers (a
  WCS, as Siril and the Seestar write into stacks) is placed from them without solving. The centre
  is the image's middle pixel, worked out from the WCS's reference pixel, not the reference
  position itself.

Each solved file shows its centre, field size, pixel scale and rotation, and which solver placed
it. A file that could not be solved shows why. Two checks follow from the solves:
- **May be filed under the wrong name** appears when most of the files point further from the
  catalogue position of the target's name than their own field is wide. Check the OBJECT header,
  or link the files to the right target.
- **Rotation by night** shows each night's camera angle. When two nights differ by more than 2°,
  the card says the stack will have ragged edges. A half turn from a meridian flip counts as the
  same angle, since Siril turns those frames back.

## Planning a mosaic

**Plan a mosaic**, at the foot of the Sky planner (or from a target's Where it points card),
splits a target too big for one field into panels:
1. Search for the target. Its size comes from the catalogue.
2. Pick the scope and camera (and reducer) from Equipment; the field of view is the one the
   Equipment page works out. With none picked, the field of the target's solved lights is used.
3. Set the rotation (the camera angle, east of north) and the overlap. Panels always overlap by
   at least 15%; 20% is the default. A turned grid is sized for the target's extent along the
   turned panels, so a long target at 45° gets rows as well as columns.

The plan lists each tile, row by row from the top left, with its centre as RA hh:mm:ss and Dec
±dd:mm:ss. Each tile shows what is captured for it so far and the hours it still needs for the
target's integration goal (each panel needs the whole goal). With your site set, it then counts
the next 90 nights on which every panel is above 30° for at least an hour in darkness, and lists
them as runs of dates. A target that fits one field gets one tile and is told it needs no mosaic.

**Export CSV** saves the tiles (centre in both forms, rotation and hours needed) for a capture
program such as NINA or the Seestar app. **Save plan** keeps it for the target; from then on Next
actions names each tile with no lights yet.

**Panels.** Once lights are plate solved, those whose fields overlap each other or a planned tile
(corners included, each field turned to its rotation) are grouped as the panels of one mosaic, and
a tile's integration counts every night's lights from its folder. When panels were captured under
different target names (for example "M 31 panel 2"), the card names those targets; **Save plan**
links them to the main one as part of its mosaic, once whichever side it is saved from. Looking at
a target or trying out a plan links nothing.

## Inspecting an image

**On the FITS files page**, open a file and its **Inspector** reads the pixels:

- **A histogram** of every channel on one chart, all binned over the same range so a value sits
  at the same place on every line. A colour camera's raw frame is read channel by channel from
  its Bayer pattern, so red, green and blue each get a line; a stack in colour does too; a mono
  frame has one. Counts are on a log scale so the faint tail shows.
- **Median, noise, saturated and clipped to black** for each channel. The noise comes from the
  median absolute deviation, so stars and nebula barely move it. When more than 0.1% of a
  channel is saturated or clipped to black, a sentence says so and what it costs.
- **The brightest unsaturated star**: its FWHM in pixels, its peak above the sky, where it is,
  and its profile from the centre outwards. A saturated star's core is flat, so it is skipped:
  a star counts as saturated when any of its own pixels comes within 2% of the ceiling, in any
  colour or any pixel of a raw frame's Bayer cell, even if the average does not.
- **A preview**, stretched so the sky sits at a quarter grey. When the file's header holds a
  plate solution, the preview says where it points and the scale, and **Grid and labels** draws
  right ascension and declination lines and the Messier, NGC and IC objects in the field, each
  with a circle of its size. The header's own transform is used as it is, so pixels that are not
  square still get a true grid. A file whose header has no solution uses its stored plate solve
  instead (see Plate solving), and says which solver placed it; a solve that did not record
  whether the image is mirrored is drawn as the sky is seen, and says east and west may be
  swapped. Files with neither do not offer the grid. Compare images uses the same rule.

The pixels are read on a separate thread, one image at a time, and only the figures and a
preview at most 1024 pixels wide come back, so the app stays responsive while a large frame is
read; the figures and the preview come from one read of the file. Images over 200 megapixels
are refused from their header before their pixels are read, and a PNG whose data would unpack
to more than its stated size is refused as damaged.

**On a target's Files**:

- **Compare images** shows any two of the target's masters or finished images side by side, or
  under a **Slider** you drag across. Both get the same auto-stretch rule, worked out from each
  image's own sky. Under the slider each side carries its own image's grid and labels. Finished images are the FITS and PNG files in the target's images folder and
  the folders directly in it; JPEG and TIFF are not read yet.
- **Palettes** lists HOO, SHO, HSO, RGB and LRGB with what goes where, and what each lacks:
  - HOO needs Ha and OIII; SHO and HSO need SII as well.
  - RGB needs red, green and blue, or a colour camera's stack without a narrowband filter.
  - LRGB adds luminance.
  - A colour camera behind a dual-band filter (L-eXtreme, L-eNhance, ALP-T and the like) gives
    Ha from its red pixels and OIII from its green and blue ones. A plain light-pollution filter
    (one named LP, say) is broadband, so it gives red, green and blue.

  **Preview** combines the masters, each stretched on its own, in the palette's colours. A
  channel captured but not stacked yet says which lights to stack first. **Use this one** saves
  the palette for the target, and step **3 · Post-process** shows it beside the Siril_Scripts
  command. Siril_Scripts processes one stack, so the palette is a reminder of how to combine
  the channels, not part of the command.
