# Projects: campaigns that keep track of themselves

**Plan → Projects** keeps a campaign: a catalogue to work through, targets for a season, one
target taken deep, a mosaic panel by panel, or your own list. Each project has a rule for what
finished means, and its progress is worked out from the index every time you open it, so new files
count as soon as they are scanned, graded, solved or stacked. Nothing is imported twice and no file
is changed. Spec [038](../../specs/038-astronomy-projects/requirements.md); the proposal behind it
is in [docs/proposals](../proposals/observation-intelligence-and-mosaics.md).

## Starting a project

Pick the kind, name it, and give what the kind needs:

| Kind | What it needs | Its targets |
|---|---|---|
| Catalogue campaign | a catalogue (Messier, Caldwell, …) | the catalogue's, in designation order |
| Seasonal campaign | the two dates it runs between | those you add |
| Target depth | one target | that one, which stays |
| Mosaic campaign | one of your [mosaics](mosaic-workspace.md) | its panels, and its target for the stacks and images |
| Personal collection | nothing, or one of your collections | the collection's and those you add |

A catalogue or collection is linked, not merged: the project copies its targets in and never
changes it. When it gains targets later, the project says how many and **Add them** brings them in. A target you take out stays out: it is not offered back unless you add it again by hand. If the mosaic a mosaic campaign follows is deleted, the campaign shows one task, "The mosaic is gone", and can never look complete.

## What finished means

The rule is a set of parts, each asked or not, each reported on its own:

- **Usable light** per filter: each target's own integration goals (set on its Stacks line), or
  the same goals for every target or panel. Lights the quality analysis flags for rejection do not
  count, and a keep or reject on a target's quality card counts the next time the project is opened. With each target's own goals asked, a target without any is not finished; its next step
  is to set them. No goals are made up for you.
- **Every panel covered** (mosaic campaigns): 95% of a panel's area under counted captures, as the
  mosaic's coverage card works it out, with each frame counted once.
- **A stack**, **a processed file** (such as a TIFF in the target's folder) and **a finished image**
  (a JPEG or PNG in its images folder).

Each kind starts with a rule you can change at any time, on the project's page with **Save the
rule**: a catalogue campaign asks for a finished image, a seasonal campaign for the targets' goals
and a stack, a target depth project for the goals and a processed file, a mosaic campaign for
coverage and the goals on every panel.

## Reading a project

- **Progress** gives the done total and each asked part counted apart ("Integrated 3 of 5",
  "Published 1 of 5"), so a weak part is never hidden by the total.
- Each target shows its **stage**, the furthest of not observed, acquired, stacked, processed and
  published; each mosaic panel shows not started, partly covered or covered. Beside it is every
  part met or not and why ("OIII needs 1.5 h"), and its light per filter against the goals.
- **Next steps** has one step per unfinished task. Work that needs no sky comes first (setting
  goals, finishing an image, processing, stacking), then captures with the least left to capture
  first, so nearly finished targets close. A panel short of coverage is aimed at the middle of its
  largest gap.

**Pause** stops a project suggesting anything while its progress is still worked out; **Archive**
puts it away. A seasonal campaign says how many days until it starts, how many are left, or that
it has closed.

## Exporting

**Export manifest CSV** writes one row per task: its stage, whether it is done, each part and the
next step. **Export manifest JSON** adds the rule, the tallies and each task's light per filter, for
other tools to read. Files are named from the project, such as `Messier_marathon-manifest.csv`.

## Bottlenecks

The project's page lists its bottlenecks: the filters of unfinished targets and panels still short
of their goals, by what the next hour of capture is expected to buy, most first. See
[forecasts](forecasts.md).
