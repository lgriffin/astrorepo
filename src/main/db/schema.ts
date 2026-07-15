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
