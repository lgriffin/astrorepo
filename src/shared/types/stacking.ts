/** Stacking analysis. */

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
  /** Nights imaged: logged nights and the nights of your light frames, each once (EUX-008). */
  totalNights: number
  activeSinceDate: string | null
  mostImagedTarget: string | null
  mostUsedFilter: string | null
  bestNightDate: string | null
}
