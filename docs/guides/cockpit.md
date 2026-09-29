# Using the cockpit

The dashboard opens on the cockpit: what is hiding in your files, how far each target has got,
and what is worth doing next. Everything on it is worked out from the files the app has indexed
(the Library and FITS Analyzer scans), so it changes as you capture, stack and process.

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

Duplicate files are not listed yet; they need content hashes, which come with the ingest work.

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
