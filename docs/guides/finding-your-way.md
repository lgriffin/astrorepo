# Finding your way around

The sidebar lists every place in the app once. The four you use most sit at the top; the rest are
grouped by what you go there to do. A page's title is always its name in the sidebar, and the line
under the title says what the page answers. Live detail, such as how many targets there are,
sits on a smaller line below that.

## The daily places

- **Home**: what is hiding in your files and what to do next. See [Using the cockpit](cockpit.md).
- **Targets**: every object you have captured or plan to. A target's own page holds its files, its
  stacking plan, its post-processing recipe and its notes.
- **Sky planner**: tonight's sky, the moon and each target's season from your site. See
  [Planning ahead](planning.md).
- **Jobs**: stacking and post-processing runs waiting for the run window, the one running now and
  the ones that finished, with their logs. See [Jobs](cockpit.md#jobs).

## The groups

| Group | Places | Go there to |
|---|---|---|
| Files | Library, FITS files, Images, Calibration | Scan your folders, read what the FITS headers say, browse finished images, and check darks, flats and biases |
| Review | Nights, Stacks, Insights, Storage | Look back: every night you imaged, integration against goals, seeing and filter trends, and disk use |
| Collections | Collections, Posters | Work through a catalogue such as Messier, and print it as a poster |
| Setup | Equipment, Settings | Record your scopes and cameras, and set your site, folders, tools and run window |

To record a night by hand, use **Log a night** on Home or on Nights. It is an action rather than a
place, so it is not in the sidebar.

## Pages below a place

A target, a collection and the night form belong to a place. While you are on one, that place
stays lit in the sidebar and a link above the title (for example **← Targets**) takes you back.

## The jobs line

While a job runs or waits, a line under the sidebar says so on every page: the running job's name,
or how many jobs are queued and why the next one has not started (the run window, disk space, a
busy PC), in the same words as the Jobs page. Click it to open Jobs. When nothing is
queued the line is not shown.

## Settings

Settings is one page in sections: **Your site**, **Folders**, **Tools**, **Run window**, **Import
and export** and **Start again**. The buttons at the top jump to each. Links elsewhere open the
section they name: "Change the run window in Settings" on Jobs opens **Run window**, and "Set your
site in Settings" on Home's Coming nights card opens **Your site**.

## What is changing next

The overhaul lands in slices ([spec 017](../../specs/017-unified-ux/requirements.md)). Next, Home
opens on Next actions and Coming nights, and a target's page becomes one flow from plan to stack
to post-processing to jobs.
