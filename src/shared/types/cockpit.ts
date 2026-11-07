/** The cockpit: discovery, suggestions, tools, jobs and grades (specs 010 to 023). */

// Cockpit discovery (specs/010-discovery-cockpit)

export type ProgressState = 'planned' | 'capturing' | 'enough-data' | 'stacked' | 'processed' | 'final'

export interface IntegrationBucketView {
  key: string
  integrationSec: number
  subCount: number
}

export interface TargetDiscoveryView {
  targetId: string
  targetName: string
  integrationSec: number
  subCount: number
  rejectedSubCount: number
  byFilter: IntegrationBucketView[]
  byScope: IntegrationBucketView[]
  byNight: IntegrationBucketView[]
  lastCapturedAt: string | null
  stackCount: number
  lastStackedAt: string | null
  unstackedNights: string[]
  unstackedSec: number
  goalSec: number | null
  processedCount: number
  finalCount: number
  progress: ProgressState
}

/** One line of the "hidden in your files" card. */
export interface HiddenDataItem {
  id: string
  kind: 'never-stacked' | 'unassigned' | 'orphan-calibration' | 'rejected' | 'quarantined' | 'duplicates'
  title: string
  detail: string
  /** Where in the app to act on it. */
  link: string | null
}

export interface DuplicateView {
  duplicateFiles: number
  reclaimableBytes: number
  /** The biggest groups, up to 50; `totalGroups` counts them all. */
  groups: { sizeBytes: number; paths: string[] }[]
  totalGroups: number
  stats: { indexed: number; reused: number; sampled: number; fullyHashed: number; unreadable: number }
  summary: string
}

/** Result of preparing a Siril work area; the source folder is only read. */
export interface SirilWorkspaceView {
  workDir: string
  linked: number
  copied: number
  existing: number
  /** Lights grading rejected, left out of the work area. */
  rejected: number
  /** Files an earlier run left that the plan no longer holds, removed from the work area. */
  pruned: number
  byFolder: { lights: number; darks: number; flats: number; biases: number }
}

/** One stock Siril script in a target's stacking plan (specs/014-siril-space). */
export interface SirilScriptView {
  /** The script's file name, as Siril lists it, for example "OSC_Preprocessing.ssf". */
  file: string
  /** The script's id, for queueing it. */
  script: string
  /** The job runner can queue it: lights to stack, its calibration present and room on the disk. */
  canQueue: boolean
  label: string
  recommended: boolean
  /** Space the run needs, including what Prep must copy, less what an earlier run left. */
  needed: string
  verdict: 'fits' | 'short' | 'unknown'
  verdictText: string
  /** The calibration folders it needs that the target lacks, as a sentence; null when none. */
  missing: string | null
  stages: { name: string; size: string; cumulative: string; files: number }[]
  /** Memory the stack needs against the PC's (specs/020); null without a frame size. */
  memory: { fit: 'one-pass' | 'blocks' | 'short' | 'unknown'; text: string } | null
}

/** One observing night of a stack's lights (ADV-007). */
export interface StackNightView {
  /** The night's key, for leaving it out or using it again. */
  night: string
  label: string
  lights: number
  kept: number
  rejected: number
  medianFwhm: string | null
  flats: number
  /** The user left this night out; frames kept by hand stay in. */
  leftOut: boolean
}

/** Advice beside the stacking plan (specs/020-stacking-advice). */
export interface StackAdviceView {
  /** "2.42\"/px", or null when the headers do not say. */
  scale: string | null
  drizzle: { suggest: boolean; text: string }
  rejection: { method: string; siril: string; text: string }
  calibration: { kind: 'dark' | 'flat' | 'bias'; status: 'matches' | 'mismatch' | 'none' | 'not-needed'; text: string }[]
  /** Null when grading is not wired or the folder has no lights. */
  nights: StackNightView[] | null
  sharedFlatsNote: string | null
}

export interface SirilPlanView {
  /** The recommended script's file name, or null when none of Siril's stock scripts fits. */
  recommended: string | null
  reason: string
  frames: string
  prepNote: string
  freeSpace: string | null
  /** Set when dimensions or sensor type were guessed, or the lights differ in size. */
  approximateNote: string | null
  /** Set when an earlier run left files in the work folder, which the plan does not count as free. */
  leftoverNote: string | null
  /** Set when grading leaves lights out of the stack (specs/019-frame-grading). */
  gradingNote: string | null
  scripts: SirilScriptView[]
  advice: StackAdviceView
  /** Set when some lights are camera RAW (RIG-004). */
  rawNote: string | null
  /** For mono lights with two filters or more: one stack per filter (RIG-006 to RIG-008). */
  filters: FilterPlanView | null
}

/** One filter's stack in a mono plan (specs/026-other-rigs). */
export interface FilterStackView {
  filter: string
  workDir: string
  frames: string
  needed: string | null
  verdict: 'fits' | 'short' | 'unknown'
  verdictText: string
  /** The calibration Siril's mono script needs that this filter lacks, as a sentence. */
  missing: string | null
  /** The job runner can queue this filter's stack. */
  canQueue: boolean
  /** The channel master a finished stack left, or null when there is none yet. */
  master: string | null
}

export interface FilterPlanView {
  intro: string
  /** Lights or flats no filter takes, and filters with no flats of their own. */
  notes: string[]
  stacks: FilterStackView[]
  /** What to do with the channel masters once there are some. */
  mastersNote: string
}

/** A comet's positions in its lights and the plan step that registers on it (specs/026-other-rigs). */
export interface CometPlanView {
  /** False for a target that is not a comet: nothing is shown (RIG-016). */
  show: boolean
  orbit: { name: string; text: string } | null
  count: number
  /** The first and last positions and a few between, for checking. */
  positions: { frame: string; time: string; ra: string; dec: string }[]
  undatedNote: string | null
  motion: string | null
  observerNote: string | null
  /** The step that uses the positions file; null until there are positions. */
  step: string | null
  file: string | null
  canWrite: boolean
  writtenNote: string | null
  /** Set when writing the positions file was refused; nothing was written. */
  writeError?: string
}

export interface CockpitOverview {
  progress: { state: ProgressState; label: string; count: number }[]
  hidden: HiddenDataItem[]
}

/** A target named in a plan, with the one line that says why. */
export interface PlanTargetView {
  targetId: string
  targetName: string
  detail: string
}

export interface TonightView {
  night: string
  /** ISO instants; the renderer shows them in local time. */
  darkStart: string
  darkEnd: string
  darkness: 'astronomical' | 'nautical'
  moonPercent: number
  /** The moon's phase and whether it rises in the dark window, as a phrase: "moon 20% lit". */
  moonSummary: string
  /** Why the list is short or empty because of the moon, when it is. */
  moonNote: string | null
  darknessNote: string | null
  choices: PlanTargetView[]
}

export interface DarkWindowView {
  newMoon: string
  start: string
  end: string
  label: string
  targets: PlanTargetView[]
}

export interface TargetSeasonView {
  targetId: string
  targetName: string
  bestMonth: string | null
  months: { month: string; hoursPerNight: number; newMoon: boolean }[]
}

export type ForwardPlanView =
  | { status: 'no-site'; message: string }
  | {
      status: 'ok'
      site: { latitudeDeg: number; longitudeDeg: number }
      /** The night the plan is for, worked out at the site, whether or not it has a dark window. */
      night?: string
      /** Null when the sun never gets 12° below the horizon tonight. */
      tonight: TonightView | null
      closing: PlanTargetView[]
      windows: DarkWindowView[]
      seasons: TargetSeasonView[]
    }

/** One night on Home's clear-skies card (specs/036-clear-skies). */
export interface NightSkyView {
  night: string
  /** "Tonight", then "Fri 16 Oct". */
  label: string
  verdict: 'clear' | 'clear-spells' | 'cloudy' | 'no-forecast' | 'no-darkness'
  /** "Clear skies", "Clear spells", "Cloudy", "No forecast yet" or "No dark window". */
  headline: string
  darkStart: string | null
  darkEnd: string | null
  /** The longest clear stretch, when the night has clear spells. */
  spellStart: string | null
  spellEnd: string | null
  /** Short figures: cloud, chance of rain, clear hours, the moon. */
  figures: string[]
  /** Sentences: what the user's weather service says, dew, why a clear forecast was held back. */
  notes: string[]
  warnings: { level: 'yellow' | 'orange' | 'red' | 'unknown'; text: string }[]
}

export type ClearSkiesView =
  | { status: 'no-site'; message: string }
  | { status: 'off'; message: string }
  | {
      status: 'ok'
      nights: NightSkyView[]
      /** Each source asked, and why it could not be used, if it could not. */
      sources: { name: string; problem: string | null }[]
      /** Who the forecast is from, as each provider's licence asks. */
      credit: string | null
    }

/** Tonight's sky at a glance on Home (specs/043-sky-insight). Times are ISO strings. */
export type SkyInsightView =
  | { status: 'no-site'; message: string }
  | {
      status: 'ok'
      night: string
      /** How tonight suits faint galaxies and nebulae (NSI-006). */
      faint: 'good' | 'possible' | 'poor' | 'none'
      /** "Good", "Possible", "Poor", "No proper dark": the word on the badge before the summary. */
      faintLabel: string
      /** One sentence: the night for faint targets and why (NSI-007). */
      summary: string
      dark: {
        start: string
        end: string
        hours: number
        /** "9 h 40 min". */
        text: string
        darkness: 'astronomical' | 'nautical'
        /** "12 min longer than last night", or null when unchanged or not known. */
        change: string | null
      } | null
      moon: {
        percent: number
        trend: 'waxing' | 'waning' | null
        /** "Waning crescent". */
        phase: string
        upHours: number
        /** "Up for 1 h of the dark", "Down all through the dark", "Up all through the dark". */
        up: string
        /** Each stretch of the dark with the Moon up, in order. */
        spans: { start: string; end: string }[]
        /** "8 h 40 min". */
        moonFree: string
      } | null
      cloud: {
        state: 'forecast' | 'off' | 'unavailable'
        /** "Clear", "Clear spells", "Cloudy", "No forecast yet", "Forecast off", "Forecast unavailable". */
        headline: string
        /** The forecast's verdict for the night, or null with the forecast off or unavailable. */
        verdict: NightSkyView['verdict'] | null
        cloudPct: number | null
        /** "6 h clear of 9 h 40 min dark", or why there is no figure. */
        detail: string
        dew: boolean
      }
      /** The user's sky on the Bortle scale; null until set in Settings → Your site. */
      sky: { bortle: number; name: string; sqm: number | null; from: 'reading' | 'class' } | null
    }

/** One external tool in Settings > Tools (specs/015-tool-hub). */
export interface ToolView {
  id: string
  label: string
  purpose: string
  settingKey: string
  found: boolean
  path: string | null
  /** How it was found: "Your setting", "On PATH" or "Standard install folder". */
  how: string | null
  /** Set when the user's saved path does not exist. */
  settingNote: string | null
  /** Places looked when not found. */
  looked: string[]
  /** Set when Siril_Scripts v2 will not run it from where it was found. */
  warning: string | null
  notNeeded: boolean
  /** No step the app runs today needs it (SyQon CLI, ASTAP), so a missing one is not a gap. */
  optional: boolean
  /** The catalogues it needs (specs/023-hub-syqon). */
  catalogues: CatalogueView[]
}

/** A catalogue a tool needs: ASTAP's star database, Siril's Gaia SPCC catalogue, RC Astro's models. */
export interface CatalogueView {
  id: string
  label: string
  state: 'present' | 'missing' | 'not-checked'
  /** "Installed in C:\Program Files\astap: D50 (1476 files)." or what to do when it is missing. */
  text: string
  /** Folders looked in when missing. */
  looked: string[]
  /** app_settings key for a folder the user names. */
  settingKey: string
}

export interface ToolsView {
  windows: boolean
  summary: string
  tools: ToolView[]
  /** Labels of catalogues missing for tools that are found, for the Get set up checklist. */
  missingCatalogues: string[]
}

/** Each tool's version and SyQon's models, from asking the tools themselves (specs/023-hub-syqon). */
export interface ToolHealthView {
  /** By tool id: "1.4.0", or "Unknown". */
  versions: Record<string, string>
  /** Every model the SyQon CLI listed; null when it could not be asked. */
  models: { id: string; step: string; available: boolean; status: string }[] | null
  /** Why the models are not listed; null when they are. */
  modelsNote: string | null
}

/** One SyQon CLI step for a target's stack (specs/023-hub-syqon). */
export interface SyqonView {
  /** Set when there is nothing to run yet, saying why. */
  message: string | null
  stacks: { path: string; label: string }[]
  stackPath: string | null
  steps: { id: string; label: string }[]
  step: string
  /** Models the account may use for the step. */
  models: string[]
  model: string | null
  output: string | null
  outputExists: boolean
  overwrite: boolean
  /** The program and arguments, as the Jobs page shows them. */
  command: string | null
  space: string | null
  /** Why it cannot be queued; null when it can. */
  blocked: string | null
  canQueue: boolean
}

/** A target's Siril_Scripts v2 recipe (specs/015-tool-hub). */
export interface PostProcessView {
  /** Set when there is nothing to process yet, saying why. */
  message: string | null
  stacks: { path: string; label: string }[]
  stackPath: string | null
  profile: string
  profiles: string[]
  profileReason: string
  quality: string
  qualities: string[]
  /** The command to run; null while a required tool is missing. */
  command: string | null
  /** The job runner can queue it: every tool found where Siril_Scripts runs it, its catalogues installed, the stack outside the read-only folders, and room on the disk. */
  canQueue: boolean
  missing: string | null
  /** Names the catalogues the run needs that are not installed (specs/023-hub-syqon). */
  catalogues: string | null
  skipped: string[]
  warnings: string[]
  outputDir: string | null
  space: string | null
  verdict: 'fits' | 'short' | 'unknown'
  verdictText: string | null
  /** The palette chosen for the target, as a hint for Siril_Scripts (spec 025); null when none is chosen. */
  paletteHint: string | null
}

/** One job as the Jobs page shows it. */
export interface JobView {
  id: string
  /** The target the job works on, so its page can list it. */
  targetId: string
  title: string
  kind: 'stack' | 'post-process' | 'syqon' | 'solve'
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  stateLabel: string
  timing: 'window' | 'now'
  /** ISO instants; the renderer shows them in local time. */
  queuedAt: string
  startedAt: string | null
  finishedAt: string | null
  /** How long it ran, or has run so far. */
  duration: string | null
  /** How long it should take, and on what basis; null once it has finished. */
  estimate: string | null
  /** Why a queued job is not starting yet; null when it is about to. */
  waiting: string | null
  note: string | null
  /** The program and arguments it runs, as run (no shell). */
  command: string
  needed: string
  canCancel: boolean
  canRunNow: boolean
  /** For a stack run step by step: the step it is on, or how far it got (PRV-003). */
  progress: string | null
  /** Results it published, each with a manifest beside it (PRV-001). */
  outputs: { path: string; name: string; manifest: string }[]
  /** For one filter's stack, the filter it stacks (RIG-009); null for any other job. */
  filter: string | null
}

export interface JobsView {
  /** The rules, in one sentence. */
  rules: string
  /** Whether the window is open now, or when it next opens. */
  windowStatus: string
  /** What the PC is doing, as the idle rule sees it; null when unknown. */
  load: string | null
  running: JobView | null
  queue: JobView[]
  /** Finished jobs, newest first. */
  history: JobView[]
  settings: { windowStart: string; windowEnd: string; idleMinutes: number; maxCpuPercent: number }
}

/** One light's grade on a target's page (specs/019-frame-grading). */
export interface FrameGradeView {
  fileId: string
  fileName: string
  path: string
  /** ISO instant; the renderer shows it in local time. */
  capturedAt: string | null
  verdict: 'keep' | 'reject' | 'unmeasured'
  override: 'keep' | 'reject' | null
  fwhm: number | null
  eccentricity: number | null
  stars: number | null
  background: number | null
  snr: number | null
  weight: number | null
  reasons: string[]
}

/** One night and filter: its frames in capture order, for the trend. */
export interface NightGradeView {
  key: string
  label: string
  frames: number
  kept: number
  rejected: number
  medianFwhm: string | null
  medianStars: string | null
  trend: FrameGradeView[]
}

export interface GradeLimitsView {
  maxEccentricity: number
  maxFwhmRatio: number
  minStarRatio: number
  maxBackgroundRatio: number
  maxFwhmPixels: number | null
}

export interface GradesView {
  total: number
  kept: number
  rejected: number
  unmeasured: number
  /** One sentence for the top of the section. */
  summary: string
  limits: GradeLimitsView
  nights: NightGradeView[]
}

export interface MeasureBatchView {
  measured: number
  failed: number
  remaining: number
  /** The last light this batch tried; pass it back as retry_after to carry a retry on. */
  last: string | null
}

/** One folder of a target's work folder, in the archive preview (specs/022-archive). */
export interface ArchiveFolderView {
  /** The folder's name, or '' for the files in the work folder itself. */
  folder: string
  /** What it is, in the user's words. */
  label: string
  size: string
  /** What removing it gives back, with why when that is nothing. */
  frees: string
  freesBytes: number
  rebuildable: boolean
  /** Whether it can be rebuilt, or why it is kept or not. */
  rebuild: string
  intermediate: boolean
  /** The user may tick it for removal. */
  removable: boolean
  /** Ticked at the start: removable and rebuildable. */
  suggested: boolean
}

export interface ArchiveOptionView {
  mode: 'linked' | 'self-contained'
  label: string
  /** What this kind of archive copies, in one sentence. */
  text: string
  copies: string
  verdict: 'fits' | 'short' | 'unknown'
  verdictText: string
  /** Raw frames a manifest names that are gone, in one sentence; null when none are. */
  missing: string | null
}

export interface ArchivePreviewView {
  /** "Archived on 9 Oct 2026, linked, in D:\\Archive\\M 42 2026-10-09." when it was archived. */
  archived: string | null
  archivedPath: string | null
  workDir: string | null
  destination: string
  folders: ArchiveFolderView[]
  /** Bytes that only come back when every one of `folders` is removed (one file hard-linked from each). */
  shared: { folders: string[]; bytes: number }[]
  /** How many stack manifests the work folder holds, in one sentence. */
  manifests: string
  options: ArchiveOptionView[]
  /** Why it cannot be archived now; null when it can. */
  blocked: string | null
}

export type ArchiveRunResult = { ok: true; message: string } | { ok: false; error: string }
