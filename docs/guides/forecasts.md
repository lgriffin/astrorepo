# Forecasts: what another hour of capture buys

Hours captured are not hours kept. A target's **Stack and process** tab, a mosaic's page and a
project's page now show what was acquired apart from what was accepted, and what more capture is
expected to buy, always with the model, what it assumes and the frames it was worked out from.
Spec [039](../../specs/039-integration-forecasts/requirements.md); the proposal behind it is in
[docs/proposals](../proposals/observation-intelligence-and-mosaics.md).

## On a target

**What another hour buys** sits under the quality card on the **Stack and process** tab:

- one line for all filters and one per filter: frames and how many were rejected, the time
  acquired and the time accepted, and the goal with the capture still needed to reach it;
- the expected gain in signal to noise from 30 minutes, an hour and two hours more, each with its
  range and its kind. Type a length to see that too; it stays after a keep or reject. Point at a
  number to see the model, frames and assumptions behind that filter's forecast;
- the filter the next hour helps most;
- **What this rests on**: the assumptions in words, the model's name and how many frames (and how
  many measured) it used, then each filter's own, since one filter can be measured while another
  is not. A light the quality analysis flagged counts as rejected unless kept by hand.

Keeping or rejecting a frame on the quality card changes the numbers the next time they are shown:
nothing is stored, so nothing goes stale.

## The three kinds of forecast

| Kind | When | What it means |
|---|---|---|
| Measured | 10 frames or more, and 10 kept frames measured | Accepted time is weighted by each frame's star SNR² against the median kept frame, and the range spans the 10th to 90th percentile of that weight as well as the acceptance |
| Theoretical | Light kept, but too few frames or none measured | Every kept second counts the same; with under 10 frames it says to treat it as a rough guide |
| Not enough data | Nothing kept yet | No number at all |

The model, `sqrt-v1`, says signal to noise grows with the square root of accepted exposure for
comparable subs limited by sky background, and that new capture is kept at the rate so far (with
the 90% interval of that rate as the range). Seeing, the moon and the season are not modelled.

## On a mosaic and a project

A mosaic's page shows the same per panel and filter, from the frames its coverage counts, and
ranks the panel filters by what the next hour buys. Panel forecasts are always theoretical, since
coverage counts frames capture by capture rather than measuring each.

A [project](projects.md) lists its **bottlenecks**: the filters of unfinished targets and panels
still short of their goals, most helped by the next hour first. A project's usable light follows
the quality card too, so a reject there shows in its progress. Without grading, the bottlenecks are
forecast from the indexed lights, flagged ones rejected. On a mosaic the rate quoted under **What
this rests on** is every panel's together; each panel's forecast uses its own, and a rejected frame
copied into two folders counts once.
