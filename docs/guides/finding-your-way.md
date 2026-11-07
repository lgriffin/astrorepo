# Finding your way around

The sidebar lists eight places. Each one holds a few pages, shown as a row of links above the page
title, and the place opens on its first page. A page's title is always its name in that row, and
the line under the title says what the page answers. Live detail, such as how many targets there
are, sits on a smaller line below that.

| Place | Pages | Go there to |
|---|---|---|
| Home | Home | See what is hiding in your files and what to do next. See [Using the cockpit](cockpit.md). |
| Targets | Targets, Collections, Messier mosaic | Find every object you have captured or plan to, work through a catalogue, and see all 110 Messier objects with your own pictures ([guide](messier-mosaic.md)). A target's own page holds its files, its stacking plan, its post-processing recipe and its notes. |
| Plan | Sky planner, Projects, Mosaics | Check tonight's sky, the moon and each target's season ([guide](planning.md)), run campaigns over several targets, and draw mosaics on the sky. |
| Process | Jobs, Stacks, Calibration | Queue stacking and post-processing runs for the run window ([guide](cockpit.md#jobs)), compare integration with each goal, and check darks, flats and biases. |
| Data | Library, FITS files, Nights, Vespera, Storage | Scan your folders, read the FITS headers, look back over every night, copy observations off the Vespera ([guide](vespera.md)) and watch disk use. |
| Gallery | Pictures, Posters | Browse your finished pictures and what each shows ([guide](gallery.md)), and print a collection as a poster. |
| Insights | Insights | See totals, catalogue progress, and seeing, filter and activity trends. |
| Settings | Settings | Your site and equipment, folders, tools, run window and appearance, one section at a time (see [Settings](#settings)). |

## Go to (Ctrl+K)

Press **Ctrl+K** (Cmd+K on a Mac), or choose **Go to** at the top of the sidebar, then type part of
a name. Every page, every Settings section and a few common actions (log a night, plan a mosaic)
are listed. Type two letters or more and matching targets appear too, ranked with everything
else. Use the arrow keys to move, Enter to open and Esc to close. Opening a page puts the
keyboard on that page; closing without one puts it back where it was.

## Keyboard

Press **?** (anywhere but a text field), or choose **Shortcuts** near the bottom of the sidebar, to
see every key AstroRepo answers. **Tab** moves from control to control; the first stop is **Skip
to the page**. Rows, cards and calendar days that open something take focus too: press **Enter**
or **Space** on one to open it, as a click would. A sortable column's heading is a button; press
it again to sort the other way. **Esc** closes the palette, the shortcuts, an explanation or a
picture.

To give your pages more room, choose **Fold** at the bottom of the sidebar. The sidebar then shows
only icons, each named when you hover over it. AstroRepo remembers this choice on that screen.

To record a night by hand, use **Log a night** on Home or on Nights. It is an action rather than a
place, so it is not in the sidebar (it is in Go to).

## Getting set up

On a fresh install Home opens with **Get set up**: your site, your home folder, a library scan and
Siril, each linking to where it is done. Pages with nothing to show yet say what would appear there
and link to the step that fills them. The site is set only in **Settings → Your site**; every page
that needs it links there.

## Scanning your library

**Library** scans your home folder in four parts: raw frames and stacked masters for their FITS
(and camera RAW) headers, TIFF exports and finished pictures for what they say about progress. It runs in the background while you use the rest
of the app, shows the files found and read as it goes, and **Cancel** stops it keeping everything
read so far, so the next scan carries on from there. Only new or changed files are read again.

The scan rests between short slices of work so the app never freezes, but it never rests for
time spent waiting on the disk, and it keeps four files in flight. On Windows each file open
waits a little even on a local disk; expect tens of thousands of files to take minutes, not hours.

### Your library's layout

By default each part is the folder named `raw`, `stacked`, `tif` or `images` directly in the home
folder, in any letter case. If yours are named differently, **Settings → Folders → Library layout**
looks inside your home folder and suggests a folder for each part, with its reasons: a folder
called Lights or Subs, or one where most files are light frames, looks like raw frames; Masters, or
files named Stacked_ or master_, looks like stacked masters; Exports or TIFF files like TIFF
exports; Final, Processed or PNG and JPEG files like finished pictures. It only reads folder and
file names. **Use** takes a suggestion, **Choose** picks any folder (another drive is fine), and
**Default** goes back to the conventional name. A folder you chose is never changed by a
suggestion, and the app only ever reads it.

When a suggestion would change something, Library shows it above the scanner first, with one
button to use it. Two parts cannot share a folder or sit one inside the other. The Gallery, the
Messier mosaic and Vespera copies (when no landing folder is set) follow the same layout. A home
folder filed by target first (`M 31/raw`, `M 31/stacked`) is spotted and said, but not read yet.

## Pages below a place

A target, a collection, a project, a mosaic and the night form belong to a page. While you are on
one, its place stays lit in the sidebar and a link above the title (for example **Targets**) takes
you back.

## Your targets

**Targets** opens on **Yours**: the targets something of yours points at, whether a file in the
library or FITS index, a library folder, a night you logged, a stage past "not observed", a target
you added by hand, or a collection you made. The catalogue's own collections, such as Messier, do
not count. **Whole catalogue** lists everything the app knows. Search, type, stage and sort work the
same on both. If nothing of yours matches a search, a button searches the whole catalogue for it.

To change several targets at once, press **Choose targets**. A checkbox appears beside each card,
**Choose this page** ticks every card shown, and a bar at the bottom moves the chosen targets to a
stage, adds them to a collection or deletes them (after asking). **Done** leaves choosing.

## The jobs line

While a job runs or waits, a line under the sidebar says so on every page: the running job's name,
or how many jobs are queued and why the next one has not started (the run window, disk space, a
busy PC), in the same words as the Jobs page. Click it to open Jobs. When nothing is
queued the line is not shown.

## Settings

Settings shows one section at a time. The sections are listed by group down the side (in a
drop-down list when the window is narrow):

| Group | Sections |
|-------|----------|
| Your observatory | **Your site**, **Equipment** (scopes, cameras, filters and the field of view they give), **Weather** |
| Files and tools | **Folders**, **Tools**, **Import and export** |
| Processing | **Run window**, **Frame grading** |
| This app | **Appearance**, **Companion screens**, **Start again** |

Links elsewhere open the section they name: "Change the run window in Settings" on Jobs opens
**Run window**, and "Set your site in Settings" on Home opens **Your site**. An old link to the
Equipment page opens **Settings > Equipment**. Go to finds sections by their name or by words
for what is in them, such as "telescope", "theme" or "latitude".

## Words

Buttons, labels and titles are written the way you would say them ("Open target", "Save
location"), with capitals only for names such as Siril or Messier, acronyms such as FITS, and the
places in the sidebar. When a message sends you somewhere, it uses the sidebar's name for it, so
"Settings → Tools" is the Tools section of Settings. The overhaul that brought this in is
[spec 017](../../specs/017-unified-ux/requirements.md).
