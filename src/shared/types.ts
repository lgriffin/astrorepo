export type ObjectType =
  | 'galaxy'
  | 'emission_nebula'
  | 'reflection_nebula'
  | 'planetary_nebula'
  | 'dark_nebula'
  | 'open_cluster'
  | 'globular_cluster'
  | 'star_cluster'
  | 'supernova_remnant'
  | 'molecular_cloud'
  | 'galaxy_cluster'
  | 'star'
  | 'comet'
  | 'asteroid'
  | 'planet'
  | 'moon'
  | 'solar_object'
  | 'variable_star'
  | 'widefield_region'
  | 'constellation'
  | 'custom'
  | 'unknown'

export type EquipmentType =
  | 'camera'
  | 'telescope'
  | 'reducer'
  | 'barlow'
  | 'mount'
  | 'guide_camera'
  | 'guide_scope'
  | 'filter_wheel'
  | 'filter'
  | 'rotator'
  | 'dew_heater'
  | 'power_supply'
  | 'mini_pc'
  | 'observatory_dome'

export type RelationshipType =
  | 'contains'
  | 'nearby'
  | 'parent_region'
  | 'satellite_galaxy'
  | 'companion_galaxy'
  | 'neighbour'
  | 'part_of_mosaic'
  | 'captured_together'

export interface Target {
  id: string
  canonicalName: string
  objectType: ObjectType
  raHours: number | null
  decDegrees: number | null
  magnitude: number | null
  angularSizeArcmin: number | null
  constellation: string | null
  description: string | null
  simbadId: string | null
  nedId: string | null
  workflowStage: string
  isCustom: boolean
  folderPath: string | null
  thumbnailPath: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface TargetSummary {
  id: string
  canonicalName: string
  objectType: ObjectType
  constellation: string | null
  magnitude: number | null
  workflowStage: string
  isCustom: boolean
  aliases: string[]
}

export interface TargetAlias {
  id: string
  targetId: string
  alias: string
  source: string | null
}

export interface Catalogue {
  id: string
  name: string
  abbreviation: string
  description: string | null
  totalObjects: number | null
  isBuiltin: boolean
  createdAt: string
}

export interface CatalogueEntry {
  id: string
  catalogueId: string
  targetId: string
  designation: string
}

export interface Collection {
  id: string
  name: string
  description: string | null
  isAuto: boolean
  sourceCatalogueId: string | null
  createdAt: string
  updatedAt: string
}

export interface CollectionWithStats extends Collection {
  observed: number
  completed: number
  total: number
}

export interface CollectionMembership {
  collectionId: string
  targetId: string
  addedAt: string
}

export interface ObservationSession {
  id: string
  date: string
  observatoryId: string | null
  locationFreetext: string | null
  skyQuality: number | null
  weather: string | null
  seeing: string | null
  transparency: string | null
  moonPhase: number | null
  moonDistance: number | null
  guidingNotes: string | null
  exposureStrategy: string | null
  totalFrames: number | null
  acceptedFrames: number | null
  rejectedFrames: number | null
  totalExposureSec: number | null
  notes: string | null
  source?: string
  sessionFolder?: string | null
  createdAt: string
  updatedAt: string
}

export interface SessionSummary {
  id: string
  date: string
  locationName: string | null
  totalFrames: number | null
  totalExposureSec: number | null
  targetCount: number
}

export interface SessionTarget {
  sessionId: string
  targetId: string
  isPrimary: boolean
}

export interface Equipment {
  id: string
  name: string
  equipmentType: EquipmentType
  manufacturer: string | null
  model: string | null
  serialNumber: string | null
  notes: string | null
  isActive: boolean
  focalLengthMm: number | null
  apertureMm: number | null
  sensorWidthMm: number | null
  sensorHeightMm: number | null
  pixelSizeUm: number | null
  sensorWidthPx: number | null
  sensorHeightPx: number | null
  reducerFactor: number | null
  createdAt: string
}

export interface SessionEquipment {
  sessionId: string
  equipmentId: string
  role: string | null
}

export interface WorkflowStage {
  id: string
  name: string
  sortOrder: number
  isDefault: boolean
}

export interface WorkflowTransition {
  id: string
  targetId: string
  fromStage: string | null
  toStage: string
  transitionedAt: string
  notes: string | null
}

export interface TargetRelationship {
  id: string
  sourceTargetId: string
  relatedTargetId: string
  relationshipType: RelationshipType
  createdAt: string
}

export interface RelationshipWithTarget extends TargetRelationship {
  relatedTarget: TargetSummary
  displayType: string
}

export interface FolderTemplate {
  id: string
  name: string
  structure: Record<string, unknown>
  isBuiltin: boolean
  createdAt: string
}

export interface AppSetting {
  key: string
  value: string
}

export interface DashboardStats {
  totalTargets: number
  completedTargets: number
  inProgressTargets: number
  plannedTargets: number
  objectsByType: Record<string, number>
  objectsByCatalogue: Record<string, { completed: number; total: number }>
  observationNights: number
  totalFitsFiles: number
  totalExposureSec: number
  storageBytes: number
  averageIntegrationSec: number
  mostUsedEquipment: { name: string; sessionCount: number }[]
  largestDataset: { targetName: string; frameCount: number } | null
  deepestIntegration: { targetName: string; exposureSec: number } | null
  longestProject: { targetName: string; days: number } | null
  oldestUnfinished: { targetName: string; createdAt: string } | null
  targetsWithRawData: number
  targetsWithStackedData: number
  targetsWithTifData: number
  targetsWithImageData: number
}

export interface CatalogueProgress {
  catalogueId: string
  catalogueName: string
  abbreviation: string
  observed: number
  completed: number
  total: number
}

export interface FitsScan {
  id: string
  folderPath: string
  fileCount: number
  totalSizeBytes: number
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  errorMessage: string | null
  startedAt: string
  completedAt: string | null
  createdAt: string
}

export interface FitsScanSummary {
  id: string
  folderPath: string
  fileCount: number
  totalSizeBytes: number
  status: string
  startedAt: string
}

export interface FitsFileSummary {
  id: string
  fileName: string
  folderName: string | null
  sessionFolder: string | null
  objectName: string | null
  exposureSec: number | null
  dateObs: string | null
  filter: string | null
  imageType: string | null
  isStacked: boolean
  fileSizeBytes: number
  targetId: string | null
  targetName: string | null
}

export interface FitsLinkingStatus {
  linked: number
  unlinked: number
  byTarget: Record<string, number>
}

export interface FitsFileDetail {
  id: string
  scanId: string
  filePath: string
  fileName: string
  fileSizeBytes: number
  fileModifiedAt: string | null
  folderName: string | null
  sessionFolder: string | null
  objectName: string | null
  targetId: string | null
  telescope: string | null
  instrument: string | null
  observer: string | null
  exposureSec: number | null
  dateObs: string | null
  filter: string | null
  gain: number | null
  offsetVal: number | null
  ccdTemp: number | null
  xpixsz: number | null
  ypixsz: number | null
  xbinning: number | null
  ybinning: number | null
  ra: string | null
  dec: string | null
  airmass: number | null
  bitpix: number | null
  naxis1: number | null
  naxis2: number | null
  bscale: number | null
  bzero: number | null
  imageType: string | null
  software: string | null
  isStacked: boolean
  ncombine: number | null
  totalExposure: number | null
  calstat: string | null
  pixelMin: number | null
  pixelMax: number | null
  pixelMean: number | null
  pixelStddev: number | null
  fwhmEstimate: number | null
  backgroundLevel: number | null
  starCountEstimate: number | null
  noiseLevel: number | null
  qualityScore: number | null
  qualityFlag: string | null
  createdAt: string
}

export interface FitsThumbnail {
  fileId: string
  width: number
  height: number
  dataBase64: string
}

export interface FitsHeaderRow {
  id: string
  fileId: string
  keyword: string
  value: string | null
  comment: string | null
  ordinal: number
}

export interface FitsScanAggregates {
  totalFiles: number
  totalSizeBytes: number
  totalExposureSec: number
  uniqueObjects: string[]
  uniqueFilters: string[]
  uniqueTelescopes: string[]
  uniqueInstruments: string[]
  uniqueFolders: string[]
  dateRange: { earliest: string | null; latest: string | null }
  filesByImageType: Record<string, number>
  filesByFilter: Record<string, number>
  filesByObject: Record<string, number>
  filesByFolder: Record<string, number>
  filesBySessionFolder: Record<string, number>
  nightsPerObject: Record<string, string[]>
  stackedCount: number
  individualCount: number
  avgExposureSec: number
  avgCcdTemp: number | null
  exposureByFilter: Record<string, number>
}

export interface FitsTargetSummary {
  folderName: string
  targetId: string | null
  targetName: string | null
  totalFiles: number
  totalSizeBytes: number
  totalExposureSec: number
  sessions: string[]
  filters: string[]
  imageTypes: string[]
  stackedCount: number
  individualCount: number
  exposureByFilter: Record<string, number>
  filesBySession: Record<string, number>
}

export interface AutoSessionPreview {
  folderName: string
  sessionFolder: string
  date: string
  targetName: string | null
  targetId: string | null
  lightCount: number
  totalExposureSec: number
  filters: string[]
  existingSessionId: string | null
}

export interface GeneratedSessionResult {
  created: number
  skipped: number
  sessions: Array<{ id: string; date: string; folderName: string }>
}

export interface QualityMetrics {
  fileId: string
  fwhmEstimate: number | null
  backgroundLevel: number | null
  starCountEstimate: number | null
  noiseLevel: number | null
  qualityScore: number | null
  qualityFlag: 'good' | 'warning' | 'reject' | null
}

export interface SessionQualityReport {
  folderName: string
  sessionFolder: string | null
  totalFiles: number
  analyzedFiles: number
  medianFwhm: number | null
  medianBackground: number | null
  medianNoise: number | null
  medianStarCount: number | null
  outlierCount: number
  files: QualityMetrics[]
}

export interface StorageSnapshot {
  id: string
  snapshotDate: string
  totalFiles: number
  totalSizeBytes: number
  lightsSizeBytes: number
  darksSizeBytes: number
  flatsSizeBytes: number
  biasSizeBytes: number
  otherSizeBytes: number
}

export interface StorageCurrentStats {
  totalSizeBytes: number
  totalFiles: number
  byImageType: Array<{ type: string; sizeBytes: number; count: number }>
  byTarget: Array<{ name: string; sizeBytes: number; count: number }>
  byFilter: Array<{ filter: string; sizeBytes: number; count: number }>
}

export interface StorageGrowthProjection {
  dailyGrowthBytes: number
  weeklyGrowthBytes: number
  monthlyGrowthBytes: number
  projectedFullDate: string | null
  dataPoints: number
}

export interface TargetSubfolderDetail {
  name: string | null
  path: string
  fileCount: number
  totalSizeBytes: number
}

export interface TargetFolderBreakdown {
  folderType: 'raw' | 'stacked' | 'tif' | 'images'
  folderPath: string
  totalFiles: number
  totalSizeBytes: number
  subfolders: TargetSubfolderDetail[]
}

export interface HomeFolderTarget {
  targetName: string
  targetId: string | null
  rawFiles: number
  stackedFiles: number
  tifFiles: number
  imageFiles: number
  rawSubfolders: TargetSubfolderDetail[]
  stackedSubfolders: TargetSubfolderDetail[]
  tifSubfolders: TargetSubfolderDetail[]
  imageSubfolders: TargetSubfolderDetail[]
  rawPath: string | null
  stackedPath: string | null
  tifPath: string | null
  imagesPath: string | null
  currentStage: string
  suggestedStage: string
  thumbnailPath: string | null
}

export interface HomeScanResult {
  homePath: string
  targets: HomeFolderTarget[]
  rawScanned: boolean
  created: number
  advanced: number
}

export interface TargetHomeData {
  targetId: string
  rawFiles: number
  stackedFiles: number
  tifFiles: number
  imageFiles: number
  rawPath: string | null
  stackedPath: string | null
  tifPath: string | null
  imagesPath: string | null
  suggestedStage: string
  scannedAt: string
  folderBreakdowns: TargetFolderBreakdown[]
}

export interface StackedFileDetail {
  fileName: string
  filter: string | null
  totalExposureSec: number | null
  ncombine: number | null
  software: string | null
  dateObs: string | null
  fileSizeBytes: number
  sessionFolder: string | null
}

export interface TargetObservationData {
  totalFiles: number
  totalExposureSec: number
  totalSizeBytes: number
  filters: string[]
  sessions: string[]
  stackedCount: number
  individualCount: number
  exposureByFilter: Record<string, number>
  filesBySession: Record<string, number>
  filesByImageType: Record<string, number>
  filesByFolder: Record<string, number>
  stackedDetails: StackedFileDetail[]
  firstObserved: string | null
  lastObserved: string | null
}

export interface HomeScanPhaseProgress {
  name: 'raw' | 'stacked' | 'tif' | 'images'
  status: 'pending' | 'discovering' | 'scanning_fits' | 'complete'
  foldersFound: number
}

/** What a folder scan has done so far (ING-007). */
export interface ScanFileCounts {
  filesFound: number
  /** New or changed files that need their headers read. */
  filesToRead: number
  filesRead: number
  /** Unchanged since the last scan: kept as they are, not read again. */
  filesUnchanged: number
  quarantined: number
}

export interface HomeScanProgress {
  /** 'cancelling' until the scan reaches its next checkpoint; 'cancelled' keeps what was read. */
  status: 'idle' | 'scanning' | 'cancelling' | 'cancelled' | 'done' | 'error'
  phases: HomeScanPhaseProgress[]
  currentPhaseIndex: number
  totalTargetsFound: number
  /** Live counts for the FITS files of the phase being scanned. */
  files: ScanFileCounts | null
  result: HomeScanResult | null
  error: string | null
}

export interface CalibrationGroup {
  type: 'dark' | 'flat' | 'bias'
  exposureSec: number | null
  filter: string | null
  gain: number | null
  ccdTemp: number | null
  binning: string | null
  fileCount: number
  totalSizeBytes: number
  dateRange: { earliest: string | null; latest: string | null }
}

// Stacking Analysis types

export interface StackingSummaryRow {
  fileId: string
  fileName: string
  targetId: string | null
  targetName: string | null
  filter: string | null
  ncombine: number | null
  totalExposureSec: number | null
  software: string | null
  calstat: string | null
  sessionFolder: string | null
  dateObs: string | null
  fileSizeBytes: number
}

export interface StackingSummary {
  totalStacked: number
  totalNcombine: number
  totalIntegrationSec: number
  softwareUsed: string[]
  filtersUsed: string[]
  rows: StackingSummaryRow[]
}

export interface SubFrameInfo {
  fileId: string
  fileName: string
  exposureSec: number | null
  dateObs: string | null
  qualityScore: number | null
  qualityFlag: string | null
  fwhmEstimate: number | null
  noiseLevel: number | null
}

export interface StackedWithSubFrames {
  stackedFileId: string
  stackedFileName: string
  targetId: string | null
  targetName: string | null
  filter: string | null
  sessionFolder: string | null
  ncombine: number | null
  totalExposureSec: number | null
  subFrames: SubFrameInfo[]
  matchedCount: number
}

export interface FilterProgress {
  filter: string
  integrationSec: number
  goalSec: number | null
  frameCount: number
  stackedCount: number
  percentComplete: number | null
}

export interface TargetIntegrationProgress {
  targetId: string
  targetName: string
  totalIntegrationSec: number
  filters: FilterProgress[]
  sessionCount: number
}

export interface IntegrationGoal {
  id: string
  targetId: string
  filter: string
  goalSeconds: number
  createdAt: string
  updatedAt: string
}

export interface CalibrationMatch {
  type: 'dark' | 'flat' | 'bias'
  status: 'matched' | 'close' | 'missing'
  matchCount: number
}

export interface CalibrationCoverage {
  totalLights: number
  fullyCalibrated: number
  partiallyCalibrated: number
  uncalibrated: number
  darksCoverage: number
  flatsCoverage: number
  biasCoverage: number
}

export interface MonthlyActivity {
  month: string
  totalFiles: number
  totalExposureSec: number
  uniqueTargets: number
  sessions: number
}

export interface BestNight {
  date: string
  totalExposureSec: number
  fileCount: number
  targets: string[]
  filters: string[]
  avgQuality: number | null
}

export interface EquipmentEffectiveness {
  equipmentName: string
  equipmentType: string
  sessionCount: number
  totalExposureSec: number
  avgFwhm: number | null
  avgQuality: number | null
}

export interface QualityTrendPoint {
  month: string
  medianFwhm: number | null
  medianNoise: number | null
  avgStarCount: number | null
  totalFiles: number
}

export interface FilterUsage {
  filter: string
  fileCount: number
  totalExposureSec: number
  avgExposureSec: number
  targets: number
}

export interface TargetProgress {
  targetId: string
  targetName: string
  workflowStage: string
  totalExposureSec: number
  fileCount: number
  filterBreakdown: Record<string, number>
  firstImaged: string | null
  lastImaged: string | null
}

export interface InsightsSummary {
  totalImagingHours: number
  totalFiles: number
  totalTargets: number
  totalSessions: number
  activeSinceDate: string | null
  mostImagedTarget: string | null
  mostUsedFilter: string | null
  bestNightDate: string | null
}

// Sky Planning types

export interface AltitudePoint {
  time: string
  altitude: number
  azimuth: number
}

export interface BestTargetTonight {
  targetId: string
  targetName: string
  objectType: string
  maxAltitude: number
  transitTime: string | null
  hoursAbove30: number
}

export interface MoonInfo {
  phase: number
  illumination: number
  phaseName: string
}

export interface TwilightTimes {
  sunset: string | null
  sunrise: string | null
  civilDusk: string | null
  civilDawn: string | null
  nauticalDusk: string | null
  nauticalDawn: string | null
  astronomicalDusk: string | null
  astronomicalDawn: string | null
}

export interface MonthlyVisibility {
  month: string
  maxAltitude: number
  isVisible: boolean
}

// Equipment calculation types

export interface FOVResult {
  widthArcmin: number
  heightArcmin: number
  widthDeg: number
  heightDeg: number
  effectiveFocalLength: number
  focalRatio: number | null
}

export interface ImageScaleResult {
  arcsecondsPerPixel: number
  effectiveFocalLength: number
}

// Timeline/Calendar types

export interface CalendarDay {
  date: string
  totalExposureSec: number
  fileCount: number
  targets: string[]
  filters: string[]
  sessionIds: string[]
}

export interface CalendarMonth {
  month: string
  days: CalendarDay[]
  totalExposureSec: number
  activeDays: number
}

export interface YearSummaryMonth {
  month: string
  activeDays: number
  totalExposureSec: number
}

export interface Recommendation {
  id: string
  category: 'calibration' | 'integration' | 'equipment' | 'quality' | 'workflow' | 'stacking' | 'capture'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  targetId: string | null
  targetName: string | null
  actionLabel: string | null
  /** Where the action goes, when not the target's page. */
  actionTo?: string
  /** Core suggestions can be set aside until the target's data changes. */
  dismissible?: boolean
  /** A job already doing what the suggestion asks, in words, so Home never asks twice. */
  queued?: string
}

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

// Sky geometry (specs/024-sky-geometry)

/** One solved or failed file on a target's page. */
export interface SolveRowView {
  path: string
  name: string
  kind: 'light' | 'master'
  night: string | null
  solved: boolean
  /** "00:42:44 +41:16:09" */
  centre: string | null
  /** '2.39"/px' */
  scale: string | null
  rotation: string | null
  /** "43′ × 76′" */
  field: string | null
  /** "ASTAP", "Siril" or "its own headers". */
  source: string
  error: string | null
}

export interface PanelView {
  id: number
  centre: string
  integration: string
  lights: number
  nights: number
  /** Other targets whose lights make up this panel. */
  otherTargets: string[]
  tile: number | null
  inMosaic: boolean
}

export interface TargetGeometryView {
  targetId: string
  /** What the solves come to, in a sentence. */
  summary: string
  /** Files still to solve (one light per folder per night, and masters). */
  unsolved: number
  solves: SolveRowView[]
  /** "May be filed under the wrong name" and why; null when the solves agree with the name. */
  misfiled: string | null
  rotation: { nights: { night: string; rotation: string }[]; note: string | null }
  panels: PanelView[]
  /** Panels of one mosaic, in a sentence; null with fewer than two. */
  mosaic: string | null
  linkedTargetIds: string[]
}

export interface SolveQueuedView {
  message: string
  queued: boolean
}

export interface MosaicTileRowView {
  tile: number
  row: number
  column: number
  /** "05:35:17" */
  ra: string
  /** "+05:23:28" */
  dec: string
  captured: string
  lights: number
  /** "6 h" still needed for the goal; null with no goal. */
  needed: string | null
}

export interface MosaicPlanView {
  status: 'ok' | 'no-target' | 'no-position' | 'no-size' | 'no-field'
  /** What is missing, when the plan cannot be drawn. */
  message: string | null
  targetId: string | null
  targetName: string | null
  /** "3 × 2 panels at 20% overlap, turned 0°, covering 2.1° × 1.6°." */
  summary: string | null
  fitsOneField: boolean
  fieldFrom: string | null
  field: { widthDeg: number; heightDeg: number } | null
  rotationDeg: number
  overlap: number
  saved: boolean
  tiles: MosaicTileRowView[]
  goalNote: string | null
  /** Null without a site. */
  nights: { summary: string; ranges: string[]; clear: number; of: number } | null
}

// ── Mosaic workspace (spec 037) ───────────────────────────────────────────

/** A workspace grid as the editor holds it and sends it back; snake case, as IPC arguments are. */
export interface WorkspaceGridInput {
  ra_deg: number
  dec_deg: number
  position_angle_deg: number
  rows: number
  columns: number
  overlap_x: number
  overlap_y: number
  field_width_deg: number
  field_height_deg: number
  field_source: 'equipment' | 'manual' | 'solve' | 'target-plan'
  field_label?: string | null
}

export interface WorkspacePanelView {
  id: string
  row: number
  column: number
  ra: string
  dec: string
  raDeg: number
  decDeg: number
  /** "+12.3°" */
  positionAngle: string
  /** The footprint on the drawing (x west, y north, degrees about the grid's centre). */
  outline: { x: number; y: number }[]
  /** "Clear on 12 of the next 30 nights, from 2026-10-26"; null without a site. */
  outlook: string | null
  clearNights: number | null
}

export interface WorkspaceDrawingView {
  ok: boolean
  /** What is wrong with the grid, when it cannot be drawn. */
  problems: string[]
  /** The grid as laid out (after a drag, its new centre). */
  grid: WorkspaceGridInput
  centre: string
  /** "3 × 4 panels, 15% overlap across and down, up axis at 0° east of north, covering 2.1° × 4.3°." */
  summary: string | null
  panels: WorkspacePanelView[]
  /** Half the drawing's width and height, in degrees, with a margin. */
  bounds: { x: number; y: number } | null
}

export interface WorkspaceSummaryView {
  id: string
  name: string
  targetId: string | null
  archived: boolean
  createdAt: string
  revision: number
  /** "3 × 4 panels" */
  size: string
}

export interface WorkspaceView {
  id: string
  name: string
  targetId: string | null
  archived: boolean
  revision: number
  latestRevision: number
  savedAt: string
  note: string | null
  /** "Field from Seestar S50 (equipment)" */
  fieldFrom: string
  drawing: WorkspaceDrawingView
  revisions: { revision: number; savedAt: string; note: string | null; size: string }[]
  /** Null with a site set; else says to set one for panel visibility. */
  outlookNote: string | null
}

export interface WorkspaceSaveView {
  ok: boolean
  /** The workspace to open (a new one after create). */
  workspaceId: string | null
  revision: number | null
  message: string
  problems: string[]
}

/** A capture placed on a mosaic revision (specs/037-mosaic-workspace, X2). */
export interface WorkspaceCaptureView {
  id: string
  /** "48 lights, 2026-10-01, M31/panel2" or "master stack.fit". */
  label: string
  kind: 'lights' | 'master'
  targetId: string
  night: string | null
  files: number
  /** "4 h 10 min" of exposure, or null when no file says. */
  exposure: string | null
  filters: string[]
  /** For its thumbnail (fits:get-thumbnail). */
  fileId: string | null
  /** Its solved footprint on the drawing, in the image's own corner order: top left, top right, bottom right, bottom left. */
  outline: { x: number; y: number }[]
  /** Every panel it meets: how much of the capture falls there and how much of the panel it covers. */
  panels: { panelId: string; share: string; coverage: string }[]
  primary: string | null
  /** The panel it counts toward, computed or the user's. */
  panelId: string | null
  source: 'computed' | 'user-override'
  state: 'accepted' | 'needs-review' | 'excluded' | 'conflict'
  note: string | null
  /** Why the user put it there or left it out. */
  reason: string | null
}

export interface WorkspaceUnsolvedView {
  id: string
  label: string
  targetId: string
  /** Why the last solve failed; null when it was never tried. */
  solveError: string | null
}

export interface WorkspaceMissingView {
  captureId: string
  label: string
  /** "Put on R1C2" or "Left out". */
  said: string
  reason: string | null
  /** Where it last pointed, or null. */
  lastCentre: string | null
}

export interface WorkspaceCapturesView {
  revision: number
  latestRevision: number
  placed: WorkspaceCaptureView[]
  outside: WorkspaceCaptureView[]
  unsolved: WorkspaceUnsolvedView[]
  missing: WorkspaceMissingView[]
  /** The targets whose unsolved files are listed, to plate solve. */
  targetIds: string[]
  /** "12 captures on 6 panels; 2 to review, 1 conflict." */
  summary: string
}

/** A capture whose panel would change if the edited grid were saved. */
export interface WorkspaceChangeView {
  captureId: string
  label: string
  from: string | null
  to: string | null
  /** The user put it on a panel; that choice stays and is shown for review. */
  overridden: boolean
  /** The panel they put it on. */
  overridePanel: string | null
}

/** One patch of sky on a mosaic's heat map (X3): its middle on the drawing and the exposure over it. */
export interface WorkspaceCoverageCellView {
  x: number
  y: number
  seconds: number
  /** Per filter, in the order of the coverage view's `filters`. */
  byFilter: number[]
  captures: number
}

export interface WorkspaceFilterProgressView {
  filter: string
  /** "3 h 20 min" */
  have: string
  goal: string | null
  need: string | null
  /** Its goal met; null with no goal. */
  met: boolean | null
}

export interface WorkspacePanelCoverageView {
  panelId: string
  state: 'not started' | 'partly covered' | 'covered'
  /** "87%" */
  coverage: string
  fraction: number
  covered: boolean
  /** "1 h to 4 h 30 min" over the panel; "none" when nothing covers it. */
  depth: string
  gaps: { where: string; share: string; centre: string }[]
  filters: WorkspaceFilterProgressView[]
  goalsMet: boolean | null
  captures: number
}

export interface WorkspaceCountedCaptureView {
  id: string
  label: string
  kind: 'lights' | 'master'
  panelId: string | null
  /** "Ha 2 h, OIII 1 h 30 min", or null when it adds none. */
  exposure: string | null
  counted: number
  note: string | null
}

/** How a mosaic revision is covered (specs/037-mosaic-workspace, X3). */
export interface WorkspaceCoverageView {
  revision: number
  /** A heat map cell's side on the drawing, in degrees. */
  cellDeg: number
  filters: string[]
  cells: WorkspaceCoverageCellView[]
  /** The deepest cell's exposure, all filters, to scale the heat map. */
  maxSeconds: number
  panels: WorkspacePanelCoverageView[]
  /** Usable exposure per filter over the mosaic, each frame once. */
  totals: { filter: string; exposure: string }[]
  captures: WorkspaceCountedCaptureView[]
  /** The panels to shoot next, most needed first. */
  next: { panelId: string; aim: string; reason: string }[]
  /** "3 of 4 panels covered; 1 meets its goals." */
  summary: string
  /** Captures not solved yet, which add no coverage. */
  unsolved: number
}

// ── Gallery inspector (spec 025) ──────────────────────────────────────────

export interface ChannelStatsView {
  channel: 'L' | 'R' | 'G' | 'B'
  /** "Luminance", "Red", "Green", "Blue". */
  label: string
  median: string
  noise: string
  saturated: string
  black: string
  histogram: { min: string; max: string; counts: number[] }
}

/** What the inspector shows for one file on the FITS files page. */
export interface InspectionView {
  /** Set when the file could not be read, saying why and what to do. */
  error: string | null
  /** "A colour sensor's raw frame, 4144 × 2822. Figures from 1,000,000 pixels per channel." */
  summary: string | null
  channels: ChannelStatsView[]
  star: { fwhm: string; peak: string; position: string; profile: number[] } | null
  /** Why there is no star profile, when there is none. */
  starNote: string | null
  /** Clipping worth knowing about, in plain sentences. */
  warnings: string[]
}

/** A coordinate grid and catalogue labels, in the preview's pixels. */
export interface OverlayView {
  lines: { kind: 'ra' | 'dec'; label: string; points: [number, number][] }[]
  objects: { label: string; x: number; y: number; radius: number | null }[]
}

/** A small auto-stretched preview, its pixels base64-encoded row by row from the top. */
export interface PreviewView {
  error: string | null
  width: number
  height: number
  channels: 1 | 3
  pixelsBase64: string
  /** The image's own size, which the preview is a reduction of. */
  sourceSize: string | null
  /** Null when the image's header carries no world coordinate system. */
  overlay: OverlayView | null
  /** "Centred on 5h 35m, −5° 23′ at 1.24″ per pixel, north turned 12°." */
  fieldText: string | null
}

/** A file opened in the inspector: its figures, and its preview when it could be read. */
export interface OpenedFileView {
  inspection: InspectionView
  preview: PreviewView | null
}

export interface GalleryImageView {
  path: string
  /** "master_Ha.fit (Ha master, 2026-02-01)". */
  label: string
  kind: 'master' | 'finished'
}

export interface PaletteOptionView {
  id: string
  possible: boolean
  /** "SII as red, Ha as green, OIII as blue." */
  mapping: string
  /** What stands in the way of the palette or its preview; null when it can be previewed. */
  note: string | null
  canPreview: boolean
}

export interface PalettesView {
  options: PaletteOptionView[]
  chosen: string | null
  /** Set when the target has no filters a palette can use yet. */
  message: string | null
}

export interface PalettePreviewView {
  error: string | null
  red: string
  green: string
  blue: string
  luminance: string | null
  /** Each channel as a grey preview, by channel name. */
  channels: Record<string, { width: number; height: number; pixelsBase64: string }>
}

/** The Vespera's connection settings as the control page shows them (spec 033). */
export interface VesperaSettingsView {
  /** "10.0.0.1", with ":port" when it is not 21. */
  address: string
  /** Where copies land; null when neither it nor the home folder is set. */
  landingRoot: string | null
  /** The landing folder comes from the home folder, not a setting of its own. */
  landingIsDefault: boolean
  formats: Array<'fits' | 'tiff' | 'jpeg' | 'json'>
  /** Saved settings that could not be read, and what is used instead. */
  notes: string[]
}

// ── Vespera ingest (spec 034) ──────────────────────────────────────────

export type IngestKindView = 'fits' | 'tiff' | 'jpeg' | 'json'

export interface IngestFindingView {
  level: 'info' | 'warn' | 'error'
  code: string
  message: string
}

/** One session on the scope, as the review table shows it. */
export interface IngestSessionView {
  id: string
  kind: string
  /** "15 Jun 2024, 21:00", or null when the folder has no date. */
  when: string | null
  date: string | null
  label: string | null
  target: { name: string; confidence: string; review: boolean; evidence: string[] }
  counts: { fits: number; tiff: number; jpeg: number; json: number; other: number }
  runs: { folder: string; fits: number; tiff: number; jpeg: number; json: number; other: number }[]
  size: string
  /** The bytes a transfer copies, of the kinds chosen in Settings. */
  transferBytes: number
  transferSize: string
  worst: 'info' | 'warn' | 'error' | null
  findings: IngestFindingView[]
  /** Transfer is on: no error finding and a named target. */
  transferable: boolean
  /** Only observations are offered for transfer by default; the rest are shown folded. */
  deepSky: boolean
  /** The latest transfer of this session, when there is one. */
  job: IngestJobView | null
}

export type IngestScanView =
  | { ok: true; address: string; destinationRoot: string | null; freeBytes: number | null; expertMode: boolean; sessions: IngestSessionView[]; summary: string }
  | { ok: false; error: string }

export interface IngestJobView {
  id: string
  sessionId: string
  folder: string
  state: 'planned' | 'running' | 'paused' | 'verifying' | 'done' | 'failed'
  /** "12 of 400 files, 50.4 MB of 1.7 GB". */
  headline: string
  fraction: number
  current: string | null
  reason: string | null
  findings: IngestFindingView[]
  manifestPath: string | null
}

export type IngestPlanView = { status: 'started' } | { status: 'blocked'; reason: string }

/** What became of one session of a copy. `refused`: its folder name is taken by another session. */
export interface IngestOutcomeView {
  sessionId: string
  level: 'info' | 'warn' | 'error'
  refused: boolean
  message: string
}

/** The copy under way or last run: one session after another. */
export interface IngestProgressView {
  running: boolean
  /** "Copying session 2 of 3: M31_2026-10-14_FIT=400_TIF=1". */
  headline: string
  /** "12 of 400 files, 50.4 MB of 1.7 GB, 3.1 MB/s, about 9 min left". */
  detail: string | null
  fraction: number
  current: string | null
  outcomes: IngestOutcomeView[]
  /** How indexing the copies is going, once the queue ends. */
  indexing: string | null
}
// ── Gallery (spec 031) ─────────────────────────────────────────────────────

/** A picture in the gallery's grid. */
export interface GalleryPictureView {
  path: string
  name: string
  /** The folders between the images folder and the picture, joined with " / "; empty in the images folder itself. */
  folder: string
  /** The folder the picture is in, for Open folder. */
  folderPath: string
  /** "2.4 MB". */
  size: string
  /** ISO time it was saved; null when unknown. */
  savedAt: string | null
  /** "1 Oct 2026". */
  saved: string | null
  /** The objects its name names, as captions: "M31 · Andromeda Galaxy". */
  objects: { id: string; label: string }[]
}

export interface GalleryView {
  /** The images folder shown; null when no home folder is set or it has no images folder. */
  root: string | null
  pictures: GalleryPictureView[]
}

/** One catalogue object in a picture's side panel. */
export interface GalleryObjectView {
  id: string
  name: string
  /** "M31, NGC 224". */
  designations: string
  /** What in the picture's name found it. */
  matched: string
  /** "A galaxy in Andromeda, magnitude 3.4, 3°, about 6 full moons across." */
  summary: string
  description: string | null
  facts: { label: string; value: string }[]
  /** "Highest at midnight in late September." Null without coordinates. */
  bestPlaced: string | null
  /** "Climbs to 78° from your site." or "Never rises from your site."; null without a site or coordinates. */
  fromSite: string | null
  /** True when the user has not set a site, so the panel can link to it. */
  needsSite: boolean
  /** "Emission nebula: a dual-band or narrowband filter suits it." or null. */
  filterHint: string | null
  /** What the user has of it, as label and value rows. */
  data: { label: string; value: string }[]
  /** True when the user has no frames of it. */
  noData: boolean
  hasMosaicPlan: boolean
  collections: { id: string; name: string }[]
}

export interface GalleryDetailsView {
  picture: GalleryPictureView
  /** "Read from the file name." / "Read from the folder M42." / null */
  readFrom: string | null
  objects: GalleryObjectView[]
  /** Designations in the name the catalogues do not hold. */
  unknown: string[]
}

/** A picture to draw, or why it cannot be. */
export type GalleryPictureData = { ok: true; src: string; width: number | null; height: number | null } | { ok: false; error: string }

// Messier mosaic (specs/032-messier-mosaic)

export type MessierStateView = 'imaged' | 'stacked' | 'captured' | 'gap'

export interface MessierOutlookView {
  kind: 'tonight' | 'moon' | 'later' | 'never'
  /** A few words for the tile: "Up tonight · 5 h 10 m". */
  short: string
  /** A sentence or two for the tile's details. */
  long: string
}

export interface MessierMonthView {
  /** YYYY-MM */
  month: string
  /** "Mar" */
  label: string
  hoursPerNight: number
  inSeason: boolean
}

export interface MessierTileView {
  number: number
  designation: string
  name: string | null
  targetId: string
  /** "Globular cluster" */
  objectType: string
  constellation: string | null
  magnitude: number | null
  state: MessierStateView
  /** "Imaged", "Stacked, not finished", "Captured, not stacked" or "Not captured yet". */
  stateLabel: string
  /** Usable light integration so far, or null when there is none. */
  integration: string | null
  /** The image the tile shows first, by file name. */
  picture: { name: string; kind: 'finished' | 'master' } | null
  outlook: MessierOutlookView | null
  months: MessierMonthView[]
  /** The filters the tile shows under (MES-006). */
  shows: MessierFilterView[]
}

export type MessierFilterView = 'all' | 'missing' | 'gaps' | 'tonight'

export interface MessierMosaicView {
  night: string | null
  siteSet: boolean
  catalogued: number
  summary: { total: number; imaged: number; stacked: number; captured: number; gaps: number; missingUpTonight: number }
  tiles: MessierTileView[]
}

/** A tile's picture as a data URL, why it could not be drawn, or null when the object has no image. */
export type MessierPictureView =
  | { ok: true; src: string; width: number; height: number; name: string; kind: 'finished' | 'master' }
  | { ok: false; error: string }
  | { refused: string }
  | null

// ── Astronomy projects (specs/038-astronomy-projects) ──────────────────

export type ProjectKindView = 'catalogue' | 'seasonal' | 'target-depth' | 'mosaic' | 'custom'
export type ProjectStatusView = 'active' | 'paused' | 'archived'

/** A completion rule as the window edits it; goals in hours. */
export interface ProjectRuleView {
  integration: 'none' | 'target goals' | 'per filter'
  goals: { filter: string; hours: number }[]
  coverage: boolean
  stacked: boolean
  processed: boolean
  published: boolean
}

export interface ProjectSummaryView {
  id: string
  name: string
  kind: ProjectKindView
  /** "Catalogue campaign" */
  kindLabel: string
  status: ProjectStatusView
  done: number
  total: number
  complete: boolean
  /** "Open, 34 days left", or null when it has no window. */
  window: string | null
}

export interface ProjectSourcesView {
  catalogues: { id: string; name: string; size: number }[]
  collections: { id: string; name: string; size: number }[]
}

export interface ProjectPartView {
  part: 'coverage' | 'integration' | 'stacked' | 'processed' | 'published'
  /** "Covered", "Integrated", … */
  label: string
  met: boolean
  detail: string
}

export interface ProjectTaskView {
  id: string
  kind: 'target' | 'panel'
  label: string
  stage: string
  done: boolean
  parts: ProjectPartView[]
  /** "Ha 1 h 30 min of 3 h" per filter, when integration is asked. */
  filters: { filter: string; text: string; met: boolean | null }[]
  next: string | null
}

export interface ProjectActionView {
  taskId: string
  kind: 'set goals' | 'capture' | 'cover' | 'stack' | 'process' | 'publish'
  text: string
}

export interface ProjectView {
  id: string
  name: string
  kind: ProjectKindView
  kindLabel: string
  status: ProjectStatusView
  rule: ProjectRuleView
  /** In words: "Finished means: every goal met per filter and a finished image." */
  ruleText: string
  window: { start: string; end: string; text: string } | null
  done: number
  total: number
  complete: boolean
  /** Each asked part on its own: "Integrated 3 of 5". */
  tallies: { part: ProjectPartView['part']; label: string; met: number; of: number }[]
  tasks: ProjectTaskView[]
  next: ProjectActionView[]
  mosaic: { id: string; name: string; revision: number } | null
  source: { kind: 'catalogue' | 'collection'; name: string; newMembers: number } | null
  /** Filters short of their goals by what the next hour buys, most first (spec 039). */
  bottlenecks: { label: string; gain: string | null; range: string | null; kind: ForecastKindView }[]
  /** "Worked out from the index at 21:04." */
  checked: string
}

/** What a change to a project gave back. */
export type ProjectChangeView = { ok: true; id: string } | { ok: false; problems: string[] }

// ── Integration forecasts (specs/039-integration-forecasts) ─────────────

export type ForecastKindView = 'insufficient data' | 'theoretical' | 'measured'

export interface ForecastView {
  /** "30 min", "1 h" */
  added: string
  /** "+8%" better signal to noise, or null with insufficient data. */
  gain: string | null
  /** "+5% to +10%" */
  range: string | null
  kind: ForecastKindView
  /** Its model, the frames it rests on and its assumptions, in the user's words. */
  evidence: string
}

export interface IntegrationFilterView {
  filter: string
  /** "48 frames, 6 rejected" */
  frames: string
  acquired: string
  accepted: string
  /** "13% rejected", or null with no frames. */
  rejection: string | null
  goal: string | null
  /** "About 2 h 30 min more capture (2 h to 3 h 10 min)", "Goal met", or null with no goal. */
  toGoal: string | null
  forecasts: ForecastView[]
}

export interface IntegrationView {
  /** Every filter together. */
  total: IntegrationFilterView
  /** "Equivalent to 3 h 40 min of the median frame", once enough frames are measured. */
  weighted: string | null
  filters: IntegrationFilterView[]
  /** Filters by what the next hour buys, most first. */
  best: { label: string; gain: string | null; kind: ForecastKindView }[]
  /** What the numbers rest on, from the forecast for an hour on every filter together. */
  assumptions: string[]
  /** "Model sqrt-v1, from 48 frames (30 measured)." */
  basis: string
}

export interface PanelIntegrationView {
  panelId: string
  filters: IntegrationFilterView[]
}

export interface MosaicIntegrationView {
  panels: PanelIntegrationView[]
  best: { label: string; gain: string | null; kind: ForecastKindView }[]
  assumptions: string[]
  basis: string
}

// ── Experiment lab (specs/040-experiment-lab) ─────────────────────────────

export interface ExperimentVariantView {
  id: string
  letter: string
  profile: string
  quality: string
  /** "Galaxy profile, normal quality" */
  settings: string
  state: 'not run' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'job missing'
  /** "Finished", "Failed (exit code 1)" … */
  stateText: string
  outputDir: string
  /** "3 files, 1.2 GB"; null until a successful run's files are recorded. */
  outputs: string | null
  outputsMissing: boolean
  /** Finished after the stack changed, so its files are not taken as this experiment's. */
  inputChanged: boolean
  preferred: boolean
  canPrefer: boolean
}

export interface ExperimentView {
  id: string
  name: string
  objective: string
  /** "Experiment 2 on result.fit (1.2 GB), made 26 Oct 2026" */
  summary: string
  inputPath: string
  /** The first 12 hex characters of the input's SHA-256. */
  inputHash: string
  variants: ExperimentVariantView[]
  /** Some variant has not run, or its run failed or was cancelled. */
  canRun: boolean
  /** At least two variants succeeded, so there is something to compare. */
  canCompare: boolean
}

export interface ComparedVariantView {
  letter: string
  settings: string
  preferred: boolean
  /** The final image's name, when there is one. */
  file: string | null
  preview: PreviewView | null
  error: string | null
  figures: { label: string; value: string }[] | null
}

export interface ExperimentComparisonView {
  variants: ComparedVariantView[]
  notes: string[]
}

export type ExperimentChangeView = { ok: true; id: string } | { ok: false; problems: string[] }
export type ExperimentRunView = { ok: true; queued: string } | { ok: false; problems: string[] }

/** One source of a fact (specs/042-learning). */
export interface LearningSourceView {
  id: string
  title: string
  publisher: string
}

export interface ConceptView {
  id: string
  title: string
  short: string
  detail: string
  formula: string | null
  related: string[]
  sources: string[]
}

export interface ObjectPrimerView {
  kind: string
  title: string
  summary: string
  shines: string
  life: string
  inPicture: string
  imaging: string
  caution: string | null
  concepts: string[]
  sources: string[]
}

/** The whole knowledge base, read once per screen. */
export interface LearningLibraryView {
  concepts: ConceptView[]
  primers: ObjectPrimerView[]
  sources: LearningSourceView[]
}

/** A target in numbers (specs/042-learning, L2), in words ready to show. */
export interface ObjectNumbersView {
  designation: string
  /** "about 2.5 million light years" */
  distance: string
  /** "2.4 to 2.7 million light years", when the source gives a range. */
  range: string | null
  approx: boolean
  /** "2.5 million years" */
  travel: string
  /** "about 190,000 light years across", when the catalogue gives an angular size. */
  size: string | null
  /** When the light set out, against a milestone or a calendar year. */
  lookback: string
  sources: string[]
}

/** One header keyword explained (specs/042-learning, L3, LRN-011). */
export interface FitsKeywordView {
  /** The keyword as the file writes it. */
  keyword: string
  meaning: string
  why: string
  concept: string | null
  /** True when the FITS standard defines it; false for a capture-software convention. */
  standard: boolean
}

/** The optics in a file's header, worked out (LRN-012), in words ready to show. */
export interface FitsSetupView {
  /** "400 mm focal length, 3.76 µm pixels" */
  inputs: string
  /** "1.94″ per pixel" */
  scale: string
  /** "1° 39′ × 1° 6′", when the frame's size is known. */
  field: string | null
  sampling: 'under' | 'matched' | 'over'
  /** What the sampling means against the seeing assumed. */
  samplingText: string
}

/** A file's header read for a learner (`learning:fits`). */
export interface FitsLearningView {
  keywords: FitsKeywordView[]
  setup: FitsSetupView | null
  /** "A plate solve measured 1.95″ per pixel.", when the file is solved. */
  solved: string | null
}

/** Why tonight is as dark as it is (specs/042-learning, L4), in words ready to show. */
export interface TonightSkyView {
  darkness: 'full' | 'nautical' | 'civil' | 'none'
  /** "At 53.3° N on 28 Oct, the Sun sinks to about 50° below your horizon at its lowest, …" */
  text: string
  /** When that changes: "Fully dark nights return around 12 Aug.", or null. */
  change: string | null
}

/** What one filter catches (specs/042-learning, L5), in words ready to show. */
export interface FilterLightView {
  filter: string
  kind: 'narrowband' | 'dual-band' | 'luminance' | 'colour' | 'uv-ir-cut' | 'light-pollution'
  passes: string
  /** Each emission line it passes: "Hydrogen alpha (Hα), 656.3 nm, deep red". */
  lines: { name: string; nm: number; colour: string; concept: string }[]
  concept: string | null
}

