import { schemas } from '../schemas'
import { autoGenerateCatalogueCollections } from '../../services/collection'
import { createEquipment, listEquipment, getUsageHistory, updateEquipment, deleteEquipment, calculateFOV, calculateImageScale } from '../../services/equipment'
import { generateFolders, listTemplates, createTemplate } from '../../services/folder'
import { getSetting, setSetting, listSettings } from '../../services/settings'
import { getSqlite, resetDatabase } from '../../db/connection'
import { composeCatalogues, composeCore } from '../../composition'
import { toPostProcessView, toSyqonView, toToolHealthView, toToolsView } from '../../adapters/tool-hub-presenter'
import { jobs } from '../../jobs-host'
import type { Desktop } from '../../transport/desktop'
import { validated, type Handle } from './validated'
import { core, sirilWorkDir, readOnlyDirs, gallery } from './shared'

/** Equipment, folders, settings, the tool hub and resetting the database. */
export function registerSettingsChannels(handle: Handle, desktop: Desktop): void {
  handle('equipment:list', async (rawArgs: unknown) => {
    const args = rawArgs ? schemas['equipment:list']!.parse(rawArgs) as { type?: string } : undefined
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

  handle('settings:get', validated('settings:get', (args) => {
    return { value: getSetting(args.key) }
  }))

  handle('settings:set', validated('settings:set', (args) => {
    setSetting(args.key, args.value)
    return { success: true }
  }))

  handle('settings:set-site', validated('settings:set-site', async (args) => {
    return core().saveSite(args.latitude, args.longitude)
  }))

  handle('settings:list', async () => {
    return { settings: listSettings() }
  })

  handle('settings:pick-folder', async () => {
    return { path: await desktop.pickFolder('Select Folder') }
  })

  handle('tools:list', async () => toToolsView(await composeCore(getSqlite()).listTools()))

  // Runs each tool only with its version flag, and SyQon with --list-models (NFR-017).
  handle('tools:health', async () => toToolHealthView(await composeCore(getSqlite()).checkToolHealth()))

  handle('recipe:syqon', validated('recipe:syqon', async (args) => {
    const core = composeCore(getSqlite())
    const plan = await core.planSyqon(args.target_id, {
      workDir: args.raw_path ? sirilWorkDir(args.raw_path) : undefined,
      readOnlyDirs: readOnlyDirs(),
      stackPath: args.stack_path,
      step: args.step,
      model: args.model,
      overwrite: args.overwrite
    })
    return toSyqonView(plan, core.windows)
  }))

  handle('recipe:post-process', validated('recipe:post-process', async (args) => {
    // Finds tools and reads the index only (NFR-011): nothing is run or written.
    const plan = await composeCore(getSqlite()).planPostProcessing(args.target_id, {
      workDir: args.raw_path ? sirilWorkDir(args.raw_path) : undefined,
      readOnlyDirs: readOnlyDirs(),
      stackPath: args.stack_path,
      profile: args.profile,
      quality: args.quality
    })
    return toPostProcessView(plan, await gallery().chosenPalette(args.target_id))
  }))

  handle('equipment:update', validated('equipment:update', (args) => {
    return updateEquipment(args.id, args.fields)
  }))

  handle('equipment:delete', validated('equipment:delete', (args) => {
    return { success: deleteEquipment(args.id) }
  }))

  handle('equipment:calculate-fov', validated('equipment:calculate-fov', (args) => {
    return calculateFOV(args.telescope_id, args.camera_id, args.reducer_id)
  }))

  handle('equipment:calculate-image-scale', validated('equipment:calculate-image-scale', (args) => {
    return calculateImageScale(args.telescope_id, args.camera_id)
  }))

  handle('db:reset', async () => {
    // Queued and running jobs refer to the targets and folders being cleared, so they go too.
    await jobs().clear()
    const result = resetDatabase()
    try {
      await composeCatalogues(getSqlite()).repair()
      autoGenerateCatalogueCollections()
    } catch (err) {
      console.error('Re-seed after reset failed:', err)
    }
    return result
  })
}
