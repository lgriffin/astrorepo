# 017 Unified experience: requirements

Leigh asked for "a general UX overhaul ... to make it a simple and unified experience for the end
user". The app grew one slice at a time on top of an older set of pages, and it shows. This spec
records the audit, the shape the app is moving to, and the requirements of each slice as it is
built. Only the slice being built has requirements here (charter III); the rest is the plan.

## Audit (September 2026)

**Navigation.** The sidebar listed 17 places in one flat column, in the order they were added:
Dashboard, Targets, Library, New Session, Collections, Equipment, Images, FITS Analyzer, Stacking,
Jobs, Calibration, Insights, Sky Planner, Timeline, Analytics, Posters, Settings. The four places
used daily (the cockpit, a target, tonight's sky, the job queue) sat at positions 1, 2, 13 and 10.
"New Session" was an action listed as a place. Nothing said which pages were for looking back and
which for acting.

**Naming.** A place had one name in the sidebar and another on its page: Dashboard was "Observatory
Dashboard", Analytics was "Storage Analytics", Timeline was "Session Timeline", Stacking was
"Stacking Analysis", Insights was "Data Insights", Posters was "Collection Poster", Calibration was
"Calibration Library", New Session was "Record Session". Suggestions said "View Target" in title
case beside sentence-case text. Presenter text said "the FITS Analyzer" and "Settings > Tools" for
places the user reaches by other names or not at all.

**Repeated patterns.** Every page draws its own cards (`bg-astro-surface border ... rounded-lg p-4`
with an uppercase `h2`) and its own stat tiles; TargetDetail has private `Section` and `Field`
helpers the other pages cannot use. Stat grids on the dashboard repeat what Insights and Stacks
show. The observer location can be typed on Settings and again on the Sky planner. Detail pages
each draw their own "Back" button; list pages none.

**Bolted-on flows.**
- The dashboard opens on the cockpit, then eight stat tiles, four library tiles, catalogue
  progress and equipment, and puts **Next actions**, the list Leigh asked the first screen to
  answer, at the very bottom.
- A target's page stacks eleven sections in one column in the order they were built: what the
  files say, workflow, home folder with the stacking plan, post-processing, observation data,
  details, description, notes, sessions, then the sidebar. Stacking and post-processing are two
  separate panels with separate Queue buttons, and nothing on the page shows a job already queued
  for the target.
- Jobs runs unseen: nothing outside the Jobs page says a job is running or waiting.
- "Change the run window in Settings" and "Open Settings" open the top of a long Settings page,
  not the part they name.

## The unified shape

One map of places (`src/shared/navigation.ts`) drives the sidebar, every page title and subtitle,
the group shown above a title and the back link on a detail page:

| Group | Places |
|---|---|
| (daily) | Home, Targets, Sky planner, Jobs |
| Files | Library, FITS files, Images, Calibration |
| Review | Nights, Stacks, Insights, Storage |
| Collections | Collections, Posters |
| Setup | Equipment, Settings |

Logging a night is an action on Home and Nights. The job runner's state sits under the sidebar on
every page. Settings is split into named sections that other pages link straight to.

The slices, each its own pull request:

| Slice | What changes |
|---|---|
| U1 · One map | Grouped sidebar, one name per place, back links, jobs status on every page, links into Settings sections |
| U2 · Home first | Home opens on Next actions and Coming nights; hidden data and progress follow; the stat grids move to Insights; shared `Card`, `Stat` and `EmptyState` components replace per-page markup |
| U3 · A target in one flow | A target's page as tabs (Overview, Process, Files, Notes); Process runs plan → stack → post-process → jobs for this target as one flow, showing what is already queued |
| U4 · Setup once | The site is set in one place (Settings), the Sky planner links to it; a setup checklist on Home until the site, folders and tools are set |
| U5 · Consistent words | Suggestion and button labels in sentence case, presenter text naming places as the sidebar does, empty states that say what to do next |

## U1 · One map

| ID | Pattern | Requirement |
|----|---------|-------------|
| UX-001 | Ubiquitous | The system shall list each place once in the sidebar, the four daily places (Home, Targets, Sky planner, Jobs) first and the rest under Files, Review, Collections and Setup, with logging a night offered as an action on Home and Nights rather than as a place. |
| UX-002 | Ubiquitous | The system shall title each place's page with its sidebar label and always say under the title what the page answers, with any live detail such as a count on a line of its own. |
| UX-003 | State | While the user is on a page below a place, such as a target, a collection or the night form, the system shall keep that place lit in the sidebar and link back to it above the page title. |
| UX-004 | State | While a job runs or waits in the queue, the system shall say so under the sidebar on every page, naming the running job, or saying how many wait and, in the job runner's own words, why the next one has not started. |
| UX-005 | Event | When the user follows a link to Settings from another page, the system shall open Settings at the section the link names. |

## U2 · Home first

| ID | Pattern | Requirement |
|----|---------|-------------|
| UX-006 | Ubiquitous | The system shall open Home on Next actions, followed by Coming nights and what is hiding in the files, then how far the targets have got, each part loading on its own and saying, with a way to try again, when it could not be read, and shall show the totals and breakdowns on Insights instead. |
| UX-007 | State | While a target has a stack job queued or running, the system shall say so on that target's stacking suggestion on Home, keeping that line current while Home stays open, and link it to Jobs rather than to the target. |
| UX-008 | Ubiquitous | The system shall draw the cards on Home, Jobs and a target's page, and what each says when it is empty, with one shared card and empty-state component. |

## U3 · A target in one flow

| ID | Pattern | Requirement |
|----|---------|-------------|
| UX-009 | Ubiquitous | The system shall split a target's page into Overview, Stack and process, Files, and Notes and nights, opening on the part a link names and on Overview otherwise. |
| UX-010 | Ubiquitous | The system shall show stacking, post-processing and the target's runs as numbered steps, in that order, on Stack and process. |
| UX-011 | State | While a target has a job queued or running, the system shall say so at the top of the step the job belongs to instead of offering to queue that step again, and list the job, with the target's last five finished jobs, under Runs. |
| UX-012 | Event | When the user opens the target of a stacking suggestion or of a job, the system shall open that target on Stack and process. |

## U4 · Setup once

| ID | Pattern | Requirement |
|----|---------|-------------|
| UX-013 | Ubiquitous | The system shall take the site only in Settings > Your site, with the Sky planner and Home linking there rather than asking for it themselves. |
| UX-014 | State | While the site, the home folder, a library scan or Siril is missing, the system shall show a Get set up checklist on Home that links each missing step to where it is done, until every step is done or the user hides it. |
| UX-015 | Ubiquitous | The system shall say on each empty Library, FITS files and Images page what would appear there and link to the step that fills it. |

## U5 · Consistent words

| ID | Pattern | Requirement |
|----|---------|-------------|
| UX-016 | Ubiquitous | The system shall write every button, labelled figure, tab and card title in sentence case, keeping capitals only for names, acronyms and the places the sidebar lists. |
| UX-017 | Ubiquitous | The system shall offer each suggestion's action in sentence case ("Open target") and, in any message that sends the user elsewhere, name the place as the sidebar and Settings sections name it. |
