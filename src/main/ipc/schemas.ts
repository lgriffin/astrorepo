import { z } from 'zod'
import { PALETTE_IDS } from '@astro/domain'

const objectTypes = [
  'galaxy', 'emission_nebula', 'reflection_nebula', 'planetary_nebula', 'dark_nebula',
  'open_cluster', 'globular_cluster', 'star_cluster', 'supernova_remnant', 'molecular_cloud',
  'galaxy_cluster', 'star', 'comet', 'asteroid', 'planet', 'moon', 'solar_object',
  'variable_star', 'widefield_region', 'constellation', 'custom', 'unknown'
] as const

const equipmentTypes = [
  'camera', 'telescope', 'reducer', 'barlow', 'mount', 'guide_camera', 'guide_scope',
  'filter_wheel', 'filter', 'rotator', 'dew_heater', 'power_supply', 'mini_pc', 'observatory_dome'
] as const

const relationshipTypes = [
  'contains', 'nearby', 'parent_region', 'satellite_galaxy', 'companion_galaxy',
  'neighbour', 'part_of_mosaic', 'captured_together'
] as const

const id = z.string().min(1)
/** A SyQon model id as `--list-models` prints it; never a flag or a path. */
const syqonModel = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)

/** A mosaic plan for a target: one panel's field in degrees, its rotation and the overlap (specs/024-sky-geometry). */
const mosaicRequest = z.object({
  target_id: id,
  field_width_deg: z.number().positive().max(60).optional(),
  field_height_deg: z.number().positive().max(60).optional(),
  rotation_deg: z.number().min(-360).max(360).optional(),
  overlap: z.number().min(0).max(0.5).optional()
})

export const schemas = {
  'targets:search': z.object({
    query: z.string(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
    object_type: z.string().optional(),
    workflow_stage: z.string().optional(),
    sort_by: z.enum(['name', 'magnitude', 'constellation', 'workflow_stage']).optional(),
    sort_dir: z.enum(['asc', 'desc']).optional()
  }),

  'targets:get': z.object({ id }),

  'targets:create': z.object({
    canonical_name: z.string().min(1),
    object_type: z.enum(objectTypes),
    ra_hours: z.number().min(0).max(24).optional(),
    dec_degrees: z.number().min(-90).max(90).optional(),
    description: z.string().optional()
  }),

  'targets:update': z.object({
    id,
    fields: z.record(z.unknown())
  }),

  'targets:aliases': z.object({ target_id: id }),

  'targets:catalogue-entries': z.object({ target_id: id }),

  'targets:merge': z.object({
    keep_id: id,
    merge_id: id
  }),

  'targets:advance-stage': z.object({
    id,
    to_stage: z.string().min(1),
    notes: z.string().optional()
  }),

  'sessions:list': z.object({
    target_id: z.string().optional(),
    from_date: z.string().optional(),
    to_date: z.string().optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional()
  }),

  'sessions:get': z.object({ id }),

  'sessions:create': z.object({
    date: z.string().min(1),
    observatory_id: z.string().nullable().optional(),
    location_freetext: z.string().nullable().optional(),
    sky_quality: z.number().nullable().optional(),
    weather: z.string().nullable().optional(),
    seeing: z.string().nullable().optional(),
    transparency: z.string().nullable().optional(),
    moon_phase: z.number().min(0).max(1).nullable().optional(),
    moon_distance: z.number().nullable().optional(),
    guiding_notes: z.string().nullable().optional(),
    exposure_strategy: z.string().nullable().optional(),
    total_frames: z.number().int().nonnegative().nullable().optional(),
    accepted_frames: z.number().int().nonnegative().nullable().optional(),
    rejected_frames: z.number().int().nonnegative().nullable().optional(),
    total_exposure_sec: z.number().nonnegative().nullable().optional(),
    notes: z.string().nullable().optional(),
    target_ids: z.array(z.string()).optional(),
    equipment_ids: z.array(z.string()).optional()
  }),

  'sessions:update': z.object({
    id,
    fields: z.record(z.unknown())
  }),

  'collections:create': z.object({
    name: z.string().min(1),
    description: z.string().optional()
  }),

  'collections:get': z.object({
    id,
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional()
  }),

  'collections:add-target': z.object({
    collection_id: id,
    target_id: id
  }),

  'collections:remove-target': z.object({
    collection_id: id,
    target_id: id
  }),

  'workflow:history': z.object({ target_id: id }),

  'equipment:list': z.object({
    type: z.enum(equipmentTypes).optional()
  }).optional(),

  'equipment:create': z.object({
    name: z.string().min(1),
    equipment_type: z.enum(equipmentTypes),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    notes: z.string().optional()
  }),

  'equipment:usage-history': z.object({ id }),

  'folders:generate': z.object({
    target_id: id,
    template_id: z.string().optional()
  }),

  'folders:template-create': z.object({
    name: z.string().min(1),
    structure: z.record(z.unknown())
  }),

  'images:scan': z.object({}).optional(),
  'images:read': z.object({ file_path: z.string().min(1) }),

  'relationships:create': z.object({
    source_target_id: id,
    related_target_id: id,
    relationship_type: z.enum(relationshipTypes)
  }),

  'relationships:list': z.object({ target_id: id }),

  'fits:pick-folder': z.object({}).optional(),

  'fits:start-scan': z.object({
    folder_path: z.string().min(1)
  }),

  'fits:list-scans': z.object({
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional()
  }).optional(),

  'fits:get-scan': z.object({ id }),

  'fits:delete-scan': z.object({ id }),

  'fits:list-files': z.object({
    scan_id: id,
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
    sort_by: z.string().optional(),
    sort_dir: z.enum(['asc', 'desc']).optional(),
    filter_object: z.string().optional(),
    filter_image_type: z.string().optional(),
    filter_filter: z.string().optional(),
    filter_stacked: z.boolean().optional(),
    filter_folder: z.string().optional()
  }),

  'fits:get-file': z.object({ id }),

  'fits:get-headers': z.object({ file_id: id }),

  'fits:get-thumbnail': z.object({ file_id: z.string().min(1) }),

  'fits:scan-aggregates': z.object({ scan_id: id }),

  'fits:target-summaries': z.object({ scan_id: id }),

  'settings:get': z.object({ key: z.string().min(1) }),

  'settings:set': z.object({
    key: z.string().min(1),
    value: z.string()
  }),

  'settings:list': z.object({}).optional(),

  'settings:pick-folder': z.object({}).optional(),

  'fits:link-files': z.object({ scan_id: z.string().optional() }),
  'fits:manual-link': z.object({ file_id: z.string().min(1), target_id: z.string().min(1) }),
  'fits:unlink-file': z.object({ file_id: z.string().min(1) }),
  'fits:linking-status': z.object({ scan_id: z.string().min(1) }),
  'fits:unlinked-files': z.object({ scan_id: z.string().min(1), limit: z.number().optional(), offset: z.number().optional() }),

  'sessions:preview-auto': z.object({ scan_id: z.string().min(1) }),
  'sessions:generate-auto': z.object({ scan_id: z.string().min(1), overwrite: z.boolean().optional() }),
  'sessions:auto-status': z.object({ scan_id: z.string().min(1) }),

  'quality:analyze-file': z.object({ file_id: z.string().min(1) }),
  'quality:analyze-scan': z.object({ scan_id: z.string().min(1) }),
  'quality:get-metrics': z.object({ file_id: z.string().min(1) }),
  'quality:session-report': z.object({ scan_id: z.string().min(1), folder_name: z.string().min(1) }),

  'storage:current': z.object({}).optional(),
  'storage:history': z.object({ limit: z.number().optional() }).optional(),
  'storage:snapshot': z.object({}).optional(),
  'storage:projection': z.object({}).optional(),
  'storage:by-target': z.object({}).optional(),
  'storage:by-filter': z.object({}).optional(),

  'calibration:library': z.object({
    type: z.string().optional(),
    gain: z.number().optional(),
    temp: z.number().optional(),
    binning: z.string().optional()
  }).optional(),
  'calibration:match-lights': z.object({
    scan_id: z.string().optional()
  }).optional(),
  'calibration:file-status': z.object({
    file_id: z.string().min(1)
  }),
  'calibration:summary': z.object({}).optional(),

  'fits:compute-stats': z.object({ file_id: z.string().min(1) }),

  'home:scan-start': z.object({}).optional(),
  'home:scan-progress': z.object({}).optional(),
  'home:scan-cancel': z.object({}).optional(),
  'home:prep-siril': z.object({ raw_path: z.string().min(1) }),
  'siril:estimate': z.object({ raw_path: z.string().min(1) }),
  'grades:target': z.object({ target_id: id }),
  'grades:limits': z.object({}).optional(),
  'grades:measure': z.object({ target_id: id, retry: z.boolean().optional(), retry_after: id.nullable().optional() }),
  'grades:override': z.object({ file_id: id, override: z.enum(['keep', 'reject']).nullable() }),
  'grades:export': z.object({ target_id: id }),
  'grades:leave-out-night': z.object({ raw_path: z.string().min(1).max(4096), night: z.string().min(1).max(40), left_out: z.boolean() }),
  'inspect:file': z.object({ file_id: id }),
  'gallery:images': z.object({ target_id: id }),
  'gallery:preview': z.object({ target_id: id, path: z.string().min(1).max(4096) }),
  'gallery:palettes': z.object({ target_id: id }),
  'gallery:palette-preview': z.object({ target_id: id, palette: z.enum(PALETTE_IDS) }),
  'gallery:choose-palette': z.object({ target_id: id, palette: z.enum(PALETTE_IDS).nullable() }),
  'recipe:post-process': z.object({
    target_id: id,
    raw_path: z.string().min(1).optional(),
    stack_path: z.string().min(1).optional(),
    profile: z.enum(['galaxy', 'nebula', 'cluster', 'stellar', 'broadband', 'minimal']).optional(),
    quality: z.enum(['light', 'normal', 'strong']).optional()
  }),
  'recipe:syqon': z.object({
    target_id: id,
    raw_path: z.string().min(1).optional(),
    stack_path: z.string().min(1).optional(),
    step: z.enum(['star-separation', 'sharpen', 'denoise', 'gradient']).optional(),
    model: syqonModel.optional(),
    overwrite: z.boolean().optional()
  }),
  'jobs:list': z.object({ target_id: id.optional() }).optional(),
  'jobs:queue-stack': z.object({
    target_id: id,
    script: z.enum(['OSC_Preprocessing', 'OSC_Preprocessing_WithoutFlat', 'OSC_Preprocessing_WithoutDBF', 'OSC_Preprocessing_BayerDrizzle', 'OSC_Extract_Ha', 'OSC_Extract_HaOIII', 'Mono_Preprocessing']),
    timing: z.enum(['window', 'now']),
    filter: z.string().trim().min(1).max(40).optional()
  }),
  'comet:plan': z.object({ target_id: id }),
  'comet:set-orbit': z.object({ target_id: id, line: z.string().max(400).nullable() }),
  'comet:write-positions': z.object({ target_id: id }),
  'jobs:queue-post-process': z.object({
    target_id: id,
    stack_path: z.string().min(1).optional(),
    profile: z.enum(['galaxy', 'nebula', 'cluster', 'stellar', 'broadband', 'minimal']).optional(),
    quality: z.enum(['light', 'normal', 'strong']).optional(),
    timing: z.enum(['window', 'now'])
  }),
  'archive:preview': z.object({ target_id: id }),
  'archive:run': z.object({
    target_id: id,
    mode: z.enum(['linked', 'self-contained']),
    remove: z.array(z.enum(['lights', 'darks', 'flats', 'biases', 'process', 'failed', '.astrorepo'])).max(7)
  }),
  'jobs:queue-syqon': z.object({
    target_id: id,
    stack_path: z.string().min(1).optional(),
    step: z.enum(['star-separation', 'sharpen', 'denoise', 'gradient']),
    model: syqonModel,
    overwrite: z.boolean(),
    timing: z.enum(['window', 'now'])
  }),
  'jobs:cancel': z.object({ job_id: z.string().regex(/^[A-Za-z0-9_-]+$/) }),
  'jobs:run-now': z.object({ job_id: z.string().regex(/^[A-Za-z0-9_-]+$/) }),
  'jobs:log': z.object({ job_id: z.string().regex(/^[A-Za-z0-9_-]+$/) }),
  'home:open-folder': z.object({ folder_path: z.string().min(1) }),
  'home:target-data': z.object({ target_id: z.string().min(1) }),
  'targets:observation-data': z.object({ target_id: z.string().min(1) }),
  'targets:get-thumbnail': z.object({ id: z.string().min(1) }),
  'targets:images': z.object({ id: z.string().min(1) }),
  'stacking:summary': z.object({}).optional(),
  'stacking:sub-frames': z.object({ stacked_file_id: z.string().min(1) }),
  'stacking:integration-progress': z.object({}).optional(),
  'stacking:goals': z.object({ target_id: z.string().min(1) }),
  'stacking:set-goal': z.object({
    target_id: z.string().min(1),
    filter: z.string().min(1),
    goal_hours: z.number().positive()
  }),
  'stacking:delete-goal': z.object({ id: z.string().min(1) }),

  'equipment:update': z.object({ id, fields: z.record(z.unknown()) }),
  'equipment:delete': z.object({ id }),
  'equipment:calculate-fov': z.object({ telescope_id: id, camera_id: id, reducer_id: z.string().optional() }),
  'equipment:calculate-image-scale': z.object({ telescope_id: id, camera_id: id }),

  'sky:altitude-curve': z.object({ target_id: id, date: z.string(), lat: z.number(), lon: z.number(), elevation: z.number().optional() }),
  'sky:best-tonight': z.object({ lat: z.number(), lon: z.number(), elevation: z.number().optional() }),
  'sky:moon-info': z.object({ date: z.string() }),
  'sky:twilight': z.object({ date: z.string(), lat: z.number(), lon: z.number(), elevation: z.number().optional() }),
  'sky:target-visibility': z.object({ target_id: id, lat: z.number(), lon: z.number(), elevation: z.number().optional() }),

  'targets:batch-advance-stage': z.object({ target_ids: z.array(z.string().min(1)), to_stage: z.string().min(1), notes: z.string().optional() }),
  'targets:batch-add-collection': z.object({ target_ids: z.array(z.string().min(1)), collection_id: z.string().min(1) }),
  'targets:batch-delete': z.object({ target_ids: z.array(z.string().min(1)) }),

  'export:targets-csv': z.object({}).optional(),
  'export:sessions-csv': z.object({}).optional(),
  'export:fits-csv': z.object({}).optional(),
  'import:nina-sequence': z.object({ file_path: z.string().min(1) }),
  'import:pick-file': z.object({}).optional(),

  'timeline:calendar': z.object({ year: z.number().int(), month: z.number().int().min(1).max(12).optional() }),
  'timeline:year-summary': z.object({ year: z.number().int() }),

  'recommendations:list': z.object({}).optional(),
  'cockpit:overview': z.object({}).optional(),
  'ingest:find-duplicates': z.object({}).optional(),
  'cockpit:dismiss': z.object({ suggestion_id: id }),
  'discovery:target': z.object({ target_id: id }),
  'planning:forward': z.object({}).optional(),
  'sky:solve-target': z.object({ target_id: id, timing: z.enum(['window', 'now']).optional() }),
  'sky:target-geometry': z.object({ target_id: id }),
  'mosaic:plan': mosaicRequest,
  'mosaic:save': mosaicRequest.extend({ field_width_deg: z.number().positive().max(60), field_height_deg: z.number().positive().max(60), rotation_deg: z.number().min(-360).max(360), overlap: z.number().min(0).max(0.5) }),
  'mosaic:export': mosaicRequest,

  'db:reset': z.object({}).optional(),

  'insights:summary': z.object({}).optional(),
  'insights:monthly-activity': z.object({ months: z.number().int().positive().optional() }),
  'insights:best-nights': z.object({ limit: z.number().int().positive().optional() }),
  'insights:equipment-effectiveness': z.object({}).optional(),
  'insights:quality-trends': z.object({ months: z.number().int().positive().optional() }),
  'insights:filter-usage': z.object({}).optional(),
  'insights:target-progress': z.object({ limit: z.number().int().positive().optional() })
} as const

export type SchemaMap = typeof schemas
export type Channel = keyof SchemaMap
