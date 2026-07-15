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
  createdAt: string
}

export interface SessionEquipment {
  sessionId: string
  equipmentId: string
  role: string | null
}

export interface Observatory {
  id: string
  name: string
  latitude: number
  longitude: number
  altitudeM: number
  timezone: string | null
  isPrimary: boolean
  notes: string | null
  createdAt: string
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

export interface VisibilityData {
  rise: string | null
  set: string | null
  transit: string | null
  transitAltitude: number | null
  currentAltitude: number
  currentAzimuth: number
  bestWindowStart: string | null
  bestWindowEnd: string | null
  hoursAboveHorizon: number
  moonSeparation: number
  available: boolean
}

export interface PlannedTarget {
  target: TargetSummary
  visibility: VisibilityData
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
}

export interface CatalogueProgress {
  catalogueId: string
  catalogueName: string
  abbreviation: string
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
