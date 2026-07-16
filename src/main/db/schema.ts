import { sqliteTable, text, real, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

export const targets = sqliteTable('targets', {
  id: text('id').primaryKey(),
  canonicalName: text('canonical_name').notNull().unique(),
  objectType: text('object_type').notNull(),
  raHours: real('ra_hours'),
  decDegrees: real('dec_degrees'),
  magnitude: real('magnitude'),
  angularSizeArcmin: real('angular_size_arcmin'),
  constellation: text('constellation'),
  description: text('description'),
  simbadId: text('simbad_id'),
  nedId: text('ned_id'),
  workflowStage: text('workflow_stage').notNull().default('planned'),
  isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
  folderPath: text('folder_path'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
}, (table) => [
  index('idx_target_type').on(table.objectType),
  index('idx_target_stage').on(table.workflowStage)
])

export const targetAliases = sqliteTable('target_aliases', {
  id: text('id').primaryKey(),
  targetId: text('target_id').notNull().references(() => targets.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull().unique(),
  source: text('source')
}, (table) => [
  index('idx_target_alias_alias').on(table.alias)
])

export const catalogues = sqliteTable('catalogues', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  abbreviation: text('abbreviation').notNull().unique(),
  description: text('description'),
  totalObjects: integer('total_objects'),
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull()
})

export const catalogueEntries = sqliteTable('catalogue_entries', {
  id: text('id').primaryKey(),
  catalogueId: text('catalogue_id').notNull().references(() => catalogues.id, { onDelete: 'cascade' }),
  targetId: text('target_id').notNull().references(() => targets.id, { onDelete: 'cascade' }),
  designation: text('designation').notNull()
}, (table) => [
  uniqueIndex('idx_cat_entry_unique_designation').on(table.catalogueId, table.designation),
  uniqueIndex('idx_cat_entry_unique_target').on(table.catalogueId, table.targetId),
  index('idx_catalogue_entry_designation').on(table.designation),
  index('idx_catalogue_entry_target').on(table.targetId)
])

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  isAuto: integer('is_auto', { mode: 'boolean' }).notNull().default(false),
  sourceCatalogueId: text('source_catalogue_id').references(() => catalogues.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const collectionMemberships = sqliteTable('collection_memberships', {
  collectionId: text('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  targetId: text('target_id').notNull().references(() => targets.id, { onDelete: 'cascade' }),
  addedAt: text('added_at').notNull()
}, (table) => [
  primaryKey({ columns: [table.collectionId, table.targetId] }),
  index('idx_collection_membership_target').on(table.targetId)
])

export const observationSessions = sqliteTable('observation_sessions', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  observatoryId: text('observatory_id').references(() => observatories.id),
  locationFreetext: text('location_freetext'),
  skyQuality: real('sky_quality'),
  weather: text('weather'),
  seeing: text('seeing'),
  transparency: text('transparency'),
  moonPhase: real('moon_phase'),
  moonDistance: real('moon_distance'),
  guidingNotes: text('guiding_notes'),
  exposureStrategy: text('exposure_strategy'),
  totalFrames: integer('total_frames'),
  acceptedFrames: integer('accepted_frames'),
  rejectedFrames: integer('rejected_frames'),
  totalExposureSec: real('total_exposure_sec'),
  notes: text('notes'),
  source: text('source').default('manual'),
  sessionFolder: text('session_folder'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
}, (table) => [
  index('idx_session_date').on(table.date),
  index('idx_session_observatory').on(table.observatoryId)
])

export const sessionTargets = sqliteTable('session_targets', {
  sessionId: text('session_id').notNull().references(() => observationSessions.id, { onDelete: 'cascade' }),
  targetId: text('target_id').notNull().references(() => targets.id, { onDelete: 'cascade' }),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(true)
}, (table) => [
  primaryKey({ columns: [table.sessionId, table.targetId] })
])

export const equipment = sqliteTable('equipment', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  equipmentType: text('equipment_type').notNull(),
  manufacturer: text('manufacturer'),
  model: text('model'),
  serialNumber: text('serial_number'),
  notes: text('notes'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull()
})

export const sessionEquipment = sqliteTable('session_equipment', {
  sessionId: text('session_id').notNull().references(() => observationSessions.id, { onDelete: 'cascade' }),
  equipmentId: text('equipment_id').notNull().references(() => equipment.id, { onDelete: 'cascade' }),
  role: text('role')
}, (table) => [
  primaryKey({ columns: [table.sessionId, table.equipmentId] })
])

export const observatories = sqliteTable('observatories', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  altitudeM: real('altitude_m').notNull().default(0),
  timezone: text('timezone'),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
  createdAt: text('created_at').notNull()
})

export const workflowStages = sqliteTable('workflow_stages', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(true)
})

export const workflowTransitions = sqliteTable('workflow_transitions', {
  id: text('id').primaryKey(),
  targetId: text('target_id').notNull().references(() => targets.id, { onDelete: 'cascade' }),
  fromStage: text('from_stage'),
  toStage: text('to_stage').notNull(),
  transitionedAt: text('transitioned_at').notNull(),
  notes: text('notes')
}, (table) => [
  index('idx_workflow_transition_target').on(table.targetId)
])

export const targetRelationships = sqliteTable('target_relationships', {
  id: text('id').primaryKey(),
  sourceTargetId: text('source_target_id').notNull().references(() => targets.id, { onDelete: 'cascade' }),
  relatedTargetId: text('related_target_id').notNull().references(() => targets.id, { onDelete: 'cascade' }),
  relationshipType: text('relationship_type').notNull(),
  createdAt: text('created_at').notNull()
}, (table) => [
  uniqueIndex('idx_relationship_unique').on(table.sourceTargetId, table.relatedTargetId, table.relationshipType),
  index('idx_relationship_source').on(table.sourceTargetId),
  index('idx_relationship_related').on(table.relatedTargetId)
])

export const folderTemplates = sqliteTable('folder_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  structure: text('structure').notNull(),
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull()
})

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const fitsScans = sqliteTable('fits_scans', {
  id: text('id').primaryKey(),
  folderPath: text('folder_path').notNull(),
  fileCount: integer('file_count').notNull().default(0),
  totalSizeBytes: integer('total_size_bytes').notNull().default(0),
  status: text('status').notNull().default('running'),
  errorMessage: text('error_message'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull()
}, (table) => [
  index('idx_fits_scan_status').on(table.status),
  index('idx_fits_scan_started').on(table.startedAt)
])

export const fitsFiles = sqliteTable('fits_files', {
  id: text('id').primaryKey(),
  scanId: text('scan_id').notNull().references(() => fitsScans.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull().unique(),
  fileName: text('file_name').notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  fileModifiedAt: text('file_modified_at'),
  folderName: text('folder_name'),
  sessionFolder: text('session_folder'),
  objectName: text('object_name'),
  telescope: text('telescope'),
  instrument: text('instrument'),
  observer: text('observer'),
  exposureSec: real('exposure_sec'),
  dateObs: text('date_obs'),
  filter: text('filter'),
  gain: real('gain'),
  offsetVal: real('offset_val'),
  ccdTemp: real('ccd_temp'),
  xpixsz: real('xpixsz'),
  ypixsz: real('ypixsz'),
  xbinning: integer('xbinning'),
  ybinning: integer('ybinning'),
  ra: text('ra'),
  dec: text('dec'),
  airmass: real('airmass'),
  bitpix: integer('bitpix'),
  naxis1: integer('naxis1'),
  naxis2: integer('naxis2'),
  bscale: real('bscale'),
  bzero: real('bzero'),
  imageType: text('image_type'),
  software: text('software'),
  isStacked: integer('is_stacked', { mode: 'boolean' }).notNull().default(false),
  ncombine: integer('ncombine'),
  totalExposure: real('total_exposure'),
  calstat: text('calstat'),
  pixelMin: real('pixel_min'),
  pixelMax: real('pixel_max'),
  pixelMean: real('pixel_mean'),
  pixelStddev: real('pixel_stddev'),
  targetId: text('target_id').references(() => targets.id, { onDelete: 'set null' }),
  fwhmEstimate: real('fwhm_estimate'),
  backgroundLevel: real('background_level'),
  starCountEstimate: integer('star_count_estimate'),
  noiseLevel: real('noise_level'),
  qualityScore: real('quality_score'),
  qualityFlag: text('quality_flag'),
  createdAt: text('created_at').notNull()
}, (table) => [
  index('idx_fits_file_target').on(table.targetId),
  index('idx_fits_file_scan').on(table.scanId),
  index('idx_fits_file_object').on(table.objectName),
  index('idx_fits_file_filter').on(table.filter),
  index('idx_fits_file_date_obs').on(table.dateObs),
  index('idx_fits_file_image_type').on(table.imageType),
  index('idx_fits_file_is_stacked').on(table.isStacked),
  index('idx_fits_file_folder').on(table.folderName),
  index('idx_fits_file_session_folder').on(table.sessionFolder)
])

export const storageSnapshots = sqliteTable('storage_snapshots', {
  id: text('id').primaryKey(),
  snapshotDate: text('snapshot_date').notNull(),
  totalFiles: integer('total_files').notNull(),
  totalSizeBytes: integer('total_size_bytes').notNull(),
  lightsSizeBytes: integer('lights_size_bytes').notNull().default(0),
  darksSizeBytes: integer('darks_size_bytes').notNull().default(0),
  flatsSizeBytes: integer('flats_size_bytes').notNull().default(0),
  biasSizeBytes: integer('bias_size_bytes').notNull().default(0),
  otherSizeBytes: integer('other_size_bytes').notNull().default(0),
  createdAt: text('created_at').notNull()
}, (table) => [
  index('idx_storage_snapshot_date').on(table.snapshotDate)
])

export const fitsThumbnails = sqliteTable('fits_thumbnails', {
  fileId: text('file_id').primaryKey().references(() => fitsFiles.id, { onDelete: 'cascade' }),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  dataBase64: text('data_base64').notNull(),
  createdAt: text('created_at').notNull()
})

export const fitsHeaders = sqliteTable('fits_headers', {
  id: text('id').primaryKey(),
  fileId: text('file_id').notNull().references(() => fitsFiles.id, { onDelete: 'cascade' }),
  keyword: text('keyword').notNull(),
  value: text('value'),
  comment: text('comment'),
  ordinal: integer('ordinal').notNull()
}, (table) => [
  index('idx_fits_header_file').on(table.fileId),
  index('idx_fits_header_keyword').on(table.keyword)
])
