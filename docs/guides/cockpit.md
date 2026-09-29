# Using the cockpit

The dashboard opens on the cockpit: what is hiding in your files, how far each target has got,
and what is worth doing next. Everything on it is worked out from the files the app has indexed
(the Library and FITS Analyzer scans), so it changes as you capture, stack and process.

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
  folder they are in. Link them in the FITS Analyzer and they start counting.
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

## Suggestions

Stacking suggestions say how much data is waiting:

- **Ready to stack**: at least 2 hours of subs and no stack, with the number of subs and nights.
- **Worth a restack**: at least 1 hour of subs captured after the newest stack.

Subs rejected by quality checks never count toward either amount, nor toward "Enough data" on
the progress strip.

Suggestions are ordered by unprocessed integration, largest first. **Dismiss** hides a suggestion
until that target's data changes: a new sub, stack, processed or final file, or a sub re-read with
a different filter, scope or quality verdict, brings it back.

## On a target's page

"What the files say" shows the target's integration split by filter, by scope and by observing
night, when it was last captured, how many stacks it has, how many nights are not in a stack yet,
and how close it is to its integration goal.

An observing night is the date the evening began, so a session that runs past midnight counts as
one night.

## Preparing a target for Siril

On a target's page, **Prep for Siril** builds the folders Siril expects (lights, darks, flats and
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

## Rescanning

Scanning a folder again reads only files that are new or whose size or modified time changed.
Everything else keeps its target link, headers and quality verdict, so a rescan of a big library
is quick. Scanning a subfolder of one already scanned, or the same folder typed with a trailing
slash, reuses those rows too. Unreadable files that have not changed stay in the "could not be
read" list without being read again.
