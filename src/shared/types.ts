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
  status: 'running' | 'completed' | 'failed'
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

export interface HomeScanProgress {
  status: 'idle' | 'scanning' | 'done' | 'error'
  phases: HomeScanPhaseProgress[]
  currentPhaseIndex: number
  totalTargetsFound: number
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
  category: 'calibration' | 'integration' | 'equipment' | 'quality' | 'workflow'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  targetId: string | null
  targetName: string | null
  actionLabel: string | null
}
