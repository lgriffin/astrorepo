import { searchTargets, getTargetById, createTarget, updateTarget, getAliasesForTarget, getCatalogueEntriesForTarget, mergeTargets, getTargetThumbnail } from '../../services/target'
import { createCollection, listCollections, getCollectionWithTargets, addTargetToCollection, removeTargetFromCollection } from '../../services/collection'
import { advanceStage, getTransitionHistory, listStages } from '../../services/workflow'
import { createRelationship, listRelationships } from '../../services/relationship'
import { getTargetObservationData } from '../../services/fits-analyzer'
import { getTargetImages } from '../../services/home-scanner'
import { getSqlite } from '../../db/connection'
import { composeCore } from '../../composition'
import { toNextActionRecommendation, withQueuedJobs } from '../../adapters/stacking-suggestion-presenter'
import { toTargetDiscoveryView } from '../../adapters/discovery-presenter'
import { jobs } from '../../jobs-host'
import { batchAdvanceStage, batchAddToCollection, batchDeleteTargets } from '../../services/batch'
import { getRecommendations } from '../../services/recommendations'
import { validated, type Handle } from './validated'

/** Targets, collections, their workflow and relationships. */
export function registerTargetsChannels(handle: Handle): void {
  handle('targets:search', validated('targets:search', (args) => {
    return searchTargets(args.query, args.limit, args.offset, {
      scope: args.scope,
      objectType: args.object_type,
      workflowStage: args.workflow_stage,
      sortBy: args.sort_by,
      sortDir: args.sort_dir
    })
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

  handle('relationships:create', validated('relationships:create', (args) => {
    return createRelationship(args.source_target_id, args.related_target_id, args.relationship_type)
  }))

  handle('relationships:list', validated('relationships:list', (args) => {
    return { relationships: listRelationships(args.target_id) }
  }))

  handle('targets:observation-data', validated('targets:observation-data', (args) => {
    return getTargetObservationData(args.target_id)
  }))

  handle('targets:get-thumbnail', validated('targets:get-thumbnail', (args) => {
    return getTargetThumbnail(args.id)
  }))

  handle('targets:images', validated('targets:images', (args) => {
    return { images: getTargetImages(args.id) }
  }))

  handle('targets:batch-advance-stage', validated('targets:batch-advance-stage', (args) => {
    return batchAdvanceStage(args.target_ids, args.to_stage, args.notes)
  }))

  handle('targets:batch-add-collection', validated('targets:batch-add-collection', (args) => {
    return batchAddToCollection(args.target_ids, args.collection_id)
  }))

  handle('targets:batch-delete', validated('targets:batch-delete', (args) => {
    return batchDeleteTargets(args.target_ids)
  }))

  handle('recommendations:list', async () => {
    // Strangler seam: ranked captures and stacking come from the hexagonal core, the rest from the legacy service.
    const [actions, queue] = await Promise.all([
      composeCore(getSqlite()).listNextActions(),
      // Without the job runner the list still loads; it just cannot say what is queued.
      // list() reads the store only, so Home never samples the machine the runner's idle check relies on.
      Promise.resolve()
        .then(() => jobs().list())
        .catch(() => [])
    ])
    return { recommendations: withQueuedJobs([...actions.map(toNextActionRecommendation), ...getRecommendations()], queue) }
  })

  handle('discovery:target', validated('discovery:target', async (args) => {
    const d = await composeCore(getSqlite()).discoverTarget(args.target_id)
    return d ? toTargetDiscoveryView(d) : null
  }))
}
