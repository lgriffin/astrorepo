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
3. **Stack**: the stacking suggestions below, most waiting data first.

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
  **1 · Stack** is Prep for Siril and the stacking plan. **2 · Post-process** is the Siril_Scripts
  recipe. **3 · Runs** lists this target's queued, running and recent jobs. When a stack or
  post-processing job is already queued or running, its step says so at the top and does not
  offer to queue it again.
- **Files**: the target's folders, with buttons to open each one, and what the index knows about
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
  a half per GB for stacking, fifteen for post-processing), and the Jobs page says which. A job
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

The runner starts programs directly (Siril's `siril-cli -d <work folder> -s <script>`, or Git
Bash running `postprocess.sh`), never through a shell. Logs are kept in the app's data folder
under `jobs/`.

## Tools

**Settings → Tools** lists the programs the app hands work to: Siril, Siril_Scripts v2, the RC
Astro CLI and, on Windows, Git Bash (which Siril_Scripts' `.bat` needs). Each is looked for in
the path you save there, then on PATH, then in its usual install folder; for Siril_Scripts, the
repo folder, its `v2` folder or `postprocess.bat` itself will do, as long as `postprocess.sh`
sits beside it. A tool that is not found lists
every place the hub looked. Siril_Scripts runs Siril and RC Astro from `C:/Program Files/...`
without searching, so a tool found anywhere else is flagged. Siril's stock scripts are found
where Siril installs them, under `share/siril/scripts` beside its `bin` folder. Nothing is run to
check.

## Rescanning

Scanning a folder again reads only files that are new or whose size or modified time changed.
Everything else keeps its target link, headers and quality verdict, so a rescan of a big library
is quick. Scanning a subfolder of one already scanned, or the same folder typed with a trailing
slash, reuses those rows too. Unreadable files that have not changed stay in the "could not be
read" list without being read again.
