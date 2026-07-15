import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { ZodError, type ZodType } from 'zod'
import { schemas, type Channel } from './schemas'
import { searchTargets, getTargetById, createTarget, updateTarget, getAliasesForTarget, getCatalogueEntriesForTarget, mergeTargets } from '../services/target'
import { createSession, updateSession, listSessions, getSessionById } from '../services/session'
import { createCollection, listCollections, getCollectionWithTargets, addTargetToCollection, removeTargetFromCollection } from '../services/collection'
import { advanceStage, getTransitionHistory, listStages } from '../services/workflow'
import { createEquipment, listEquipment, getUsageHistory } from '../services/equipment'
import { generateFolders, listTemplates, createTemplate } from '../services/folder'
import { createObservatory, listObservatories, setPrimaryObservatory } from '../services/observatory'
import { getVisibility, getTonightTargets } from '../services/ephemeris'
import { getDashboardStats, getCatalogueProgressStats } from '../services/dashboard'
import { createRelationship, listRelationships } from '../services/relationship'

type HandlerFn = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>

const registeredChannels: string[] = []

function validate<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data)
}

export function handle(channel: string, handler: HandlerFn): void {
  ipcMain.handle(channel, handler)
  registeredChannels.push(channel)
}

function validated<T>(channel: Channel, handler: (args: T) => unknown): HandlerFn {
  return async (_e: IpcMainInvokeEvent, rawArgs: unknown) => {
    const args = validate(schemas[channel] as ZodType, rawArgs)
    return handler(args as T)
  }
}

export function registerIpcHandlers(): void {
  handle('targets:search', validated('targets:search', (args) => {
    return searchTargets(args.query, args.limit, args.offset)
  }))

  handle('targets:get', validated('targets:get', (args) => {
    return getTargetById(args.id)
  }))

  handle('targets:create', validated('targets:create', (args) => {
    return createTarget({
      canonicalName: args.canonical_name,
      objectType: args.object_type,
      raHours: args.ra_hours,
      decDegrees: args.dec_degrees,
      description: args.description
    })
  }))

  handle('targets:update', validated('targets:update', (args) => {
    return updateTarget(args.id, args.fields)
  }))

  handle('targets:aliases', validated('targets:aliases', (args) => {
    return getAliasesForTarget(args.target_id)
  }))

  handle('targets:catalogue-entries', validated('targets:catalogue-entries', (args) => {
    return getCatalogueEntriesForTarget(args.target_id)
  }))

  handle('targets:merge', validated('targets:merge', (args) => {
    return mergeTargets(args.keep_id, args.merge_id)
  }))

  handle('sessions:list', validated('sessions:list', (args) => {
    return listSessions({
      targetId: args.target_id,
      fromDate: args.from_date,
      toDate: args.to_date,
      limit: args.limit,
      offset: args.offset
    })
  }))

  handle('sessions:get', validated('sessions:get', (args) => {
    return getSessionById(args.id)
  }))

  handle('sessions:create', validated('sessions:create', (args) => {
    return createSession({
      date: args.date,
      observatoryId: args.observatory_id,
      locationFreetext: args.location_freetext,
      skyQuality: args.sky_quality,
      weather: args.weather,
      seeing: args.seeing,
      transparency: args.transparency,
      moonPhase: args.moon_phase,
      moonDistance: args.moon_distance,
      guidingNotes: args.guiding_notes,
      exposureStrategy: args.exposure_strategy,
      totalFrames: args.total_frames,
      acceptedFrames: args.accepted_frames,
      rejectedFrames: args.rejected_frames,
      totalExposureSec: args.total_exposure_sec,
      notes: args.notes,
      targetIds: args.target_ids,
      equipmentIds: args.equipment_ids
    })
  }))

  handle('sessions:update', validated('sessions:update', (args) => {
    return updateSession(args.id, args.fields)
  }))

  handle('collections:list', async () => {
    return { collections: listCollections() }
  })

  handle('collections:get', validated('collections:get', (args) => {
    return getCollectionWithTargets(args.id, args.limit, args.offset)
  }))

  handle('collections:create', validated('collections:create', (args) => {
    return createCollection(args.name, args.description)
  }))

  handle('collections:add-target', validated('collections:add-target', (args) => {
    return { success: addTargetToCollection(args.collection_id, args.target_id) }
  }))

  handle('collections:remove-target', validated('collections:remove-target', (args) => {
    return { success: removeTargetFromCollection(args.collection_id, args.target_id) }
  }))

  handle('targets:advance-stage', validated('targets:advance-stage', (args) => {
    return advanceStage(args.id, args.to_stage, args.notes)
  }))

  handle('workflow:history', validated('workflow:history', (args) => {
    return getTransitionHistory(args.target_id)
  }))

  handle('workflow:stages', async () => {
    return listStages()
  })

  handle('equipment:list', async (_e, args?: { type?: string }) => {
    if (args) validate(schemas['equipment:list']!, args)
    return { equipment: listEquipment(args?.type) }
  })

  handle('equipment:create', validated('equipment:create', (args) => {
    return createEquipment({
      name: args.name,
      equipmentType: args.equipment_type,
      manufacturer: args.manufacturer,
      model: args.model,
      notes: args.notes
    })
  }))

  handle('equipment:usage-history', validated('equipment:usage-history', (args) => {
    return { sessions: getUsageHistory(args.id) }
  }))

  handle('folders:generate', validated('folders:generate', (args) => {
    return generateFolders(args.target_id, args.template_id)
  }))

  handle('folders:templates-list', async () => {
    return { templates: listTemplates() }
  })

  handle('folders:template-create', validated('folders:template-create', (args) => {
    return createTemplate(args.name, args.structure as Record<string, unknown>)
  }))

  handle('observatory:list', async () => {
    return { observatories: listObservatories() }
  })

  handle('observatory:create', validated('observatory:create', (args) => {
    return createObservatory({
      name: args.name,
      latitude: args.latitude,
      longitude: args.longitude,
      altitudeM: args.altitude_m,
      timezone: args.timezone
    })
  }))

  handle('observatory:set-primary', validated('observatory:set-primary', (args) => {
    return setPrimaryObservatory(args.id)
  }))

  handle('targets:visibility', validated('targets:visibility', (args) => {
    return getVisibility(args.target_id, args.observatory_id, args.date)
  }))

  handle('planning:tonight', validated('planning:tonight', (args) => {
    return { targets: getTonightTargets(args.observatory_id, args.date, args.min_altitude, args.min_hours) }
  }))

  handle('dashboard:stats', async () => {
    return getDashboardStats()
  })

  handle('dashboard:catalogue-progress', async () => {
    return { catalogues: getCatalogueProgressStats() }
  })

  handle('relationships:create', validated('relationships:create', (args) => {
    return createRelationship(args.source_target_id, args.related_target_id, args.relationship_type)
  }))

  handle('relationships:list', validated('relationships:list', (args) => {
    return { relationships: listRelationships(args.target_id) }
  }))
}

export function getRegisteredChannels(): string[] {
  return [...registeredChannels]
}
