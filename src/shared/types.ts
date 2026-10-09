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

export interface ImageFileInfo {
  path: string
  filename: string
  folder: string
}

export interface ImageTargetGroup {
  name: string
  normalizedName: string
  folderPath: string
  images: ImageFileInfo[]
}

export interface ImageScanResult {
  targets: ImageTargetGroup[]
  unmatched: ImageFileInfo[]
  totalImages: number
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
      /** Null when the sun never gets 12° below the horizon tonight. */
      tonight: TonightView | null
      closing: PlanTargetView[]
      windows: DarkWindowView[]
      seasons: TargetSeasonView[]
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
}

export interface ToolsView {
  windows: boolean
  summary: string
  tools: ToolView[]
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
  /** The job runner can queue it: every tool found where Siril_Scripts runs it, the stack outside the read-only folders, and room on the disk. */
  canQueue: boolean
  missing: string | null
  skipped: string[]
  warnings: string[]
  outputDir: string | null
  space: string | null
  verdict: 'fits' | 'short' | 'unknown'
  verdictText: string | null
}

/** One job as the Jobs page shows it. */
export interface JobView {
  id: string
  /** The target the job works on, so its page can list it. */
  targetId: string
  title: string
  kind: 'stack' | 'post-process'
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
  /** How many stack manifests the work folder holds, in one sentence. */
  manifests: string
  options: ArchiveOptionView[]
  /** Why it cannot be archived now; null when it can. */
  blocked: string | null
}

export type ArchiveRunResult = { ok: true; message: string } | { ok: false; error: string }
