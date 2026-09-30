# 016 Job runner: requirements

Slice G. A stack or post-processing run the user confirms on a target's page is queued and run on
the Windows PC by the app itself, through the tool hub. Siril is heavy and can tie the PC up, so
the queue behaves like a small CI runner: jobs wait for a nightly run window and an idle PC, run
one at a time at low priority, and each keeps a log.

## What this slice delivers

- **Queue this stack** under a target's stacking plan, and **Queue post-processing** under its
  Siril_Scripts recipe. Each opens a confirm step (the script, the frames, the disk it needs and
  whether it fits, where it writes) with two choices: queue for the run window, or run as soon as
  possible.
- A **Jobs** page: whether the run window is open or when it next opens, how busy the PC is, the
  running job with its time so far and live log, the queue in the order it will run with each
  job's estimate and why it is waiting, and the last 20 finished jobs with their logs. Run now
  and Cancel on each job.
- **Settings > Run window**: when the window opens and closes (default 02:00 to 03:00), how long
  the PC must be idle first (10 minutes) and the CPU use above which a job waits (30%).

## Changes to the blueprint

- **Scheduled, not run-immediately.** The blueprint's job runner started a job when asked. Leigh
  asked for "a small CI like system" that runs Siril "at opportunities": inside a window he sets,
  when utilisation allows. Run now remains for a job he wants straight away.
- **Predictable utilisation.** A job's length is predicted from this PC's last five successful
  runs of the same kind (seconds per GB written), with a first-run guess until there are any. A
  window job that would run past the close lets a later job that fits go first and waits for the
  next night; one longer than the whole window starts when it can, since it would never fit.
- **Never stopped at the close.** A job running when the window closes is left to finish: stopping
  Siril partway throws its work away.
- **No shell.** The .bat that starts Siril_Scripts only finds Git Bash and passes its arguments to
  postprocess.sh, so the runner starts postprocess.sh with Git Bash itself. Paths are passed as
  arguments, never parsed by Command Prompt, so a path the copy-paste command must refuse still
  runs.
- **The app must be open.** Jobs start from the app's own timer; it keeps the PC awake while a
  job runs. Waking the PC or starting the app for the window (Windows Task Scheduler) is left for
  later.
- **pg-boss waits.** The blueprint queued jobs in pg-boss on the NAS. Until the NAS core-api
  exists, the queue is a SQLite table on the PC that runs the jobs.

## Queueing

| ID | Pattern | Requirement |
|----|---------|-------------|
| JOB-001 | Event | When the user confirms a stack or post-processing run, the system shall work the plan out again from the target's own folders, the index and the disk and queue it only if it still holds: a stock script with its calibration present, or the confirmed stack outside the folders the app only reads with every tool found where Siril_Scripts runs it, and a disk that reports room. |
| JOB-012 | Ubiquitous | The system shall let the user set when the run window opens and closes, how long the PC must be idle and the CPU use above which a job waits, with defaults of 02:00 to 03:00, 10 minutes and 30%. |

## Scheduling

| ID | Pattern | Requirement |
|----|---------|-------------|
| JOB-002 | State | While the run window is closed, the system shall not start a job queued for the window, and shall say when the window next opens. |
| JOB-003 | State | While the PC has been used within the idle time, or its CPU use is above the limit, the system shall not start a window job, and shall say which. |
| JOB-004 | Ubiquitous | The system shall run one job at a time, at below-normal priority, Run now jobs first and then in the order they were queued. |
| JOB-005 | Unwanted | If a window job is predicted to run past the window's close, then the system shall start a later job that fits instead and keep it for the next window, unless it is longer than the whole window. |
| JOB-006 | Ubiquitous | The system shall predict each job's length from this PC's recent runs of the same kind, else from a first-run guess, and say which. |
| JOB-007 | Unwanted | If the disk a job writes to no longer has the space it needs, or does not report its free space, then the system shall not start it and shall say how much is short or that the space is unknown. |
| JOB-011 | Event | When the user chooses Run now, the system shall start the job as soon as no other job runs, whatever the window and the PC's load. |

## Running

| ID | Pattern | Requirement |
|----|---------|-------------|
| JOB-008 | Unwanted | If the app closes while a job runs, then the system shall stop the job and, at the next start, queue it again, failing it once it has been stopped twice. |
| JOB-009 | Ubiquitous | The system shall keep each job's output in a log the user can read while it runs and after, and record its exit code, a failure's reason and how long it took. |
| JOB-010 | Event | When the user cancels a job, the system shall take it off the queue, or stop it and every program it started, and a job cancelled while it was being started shall not run. |

## Non-functional

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-012 | Ubiquitous | The system shall run jobs' programs directly, never through a shell, with commands built in the main process from the index rather than taken from the page. |
