/** FITS scans, files, quality and the home library. */

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
  /** The folder this part is read from, once the scan reaches it (specs/044-library-layout). */
  folder?: string
}

/** What a folder scan has done so far (ING-007). */
export interface ScanFileCounts {
  filesFound: number
  /** Files whose size and modified time have been looked at, to tell new and changed from unchanged. */
  filesChecked: number
  /** New or changed files that need their headers read. */
  filesToRead: number
  filesRead: number
  /** Unchanged since the last scan: kept as they are, not read again. */
  filesUnchanged: number
  quarantined: number
  /** About how long reading the rest will take at the pace so far, once it can be told (ING-016). */
  secondsLeft: number | null
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
