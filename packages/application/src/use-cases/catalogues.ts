import { planCatalogueRepair, seedTargets } from '@astro/domain'
import type { CatalogueSeeds, CatalogueStore } from '../ports/catalogues'

export interface CatalogueRepair {
  /** False when the install already matches these catalogues. */
  ran: boolean
  version: string
  created: number
  removed: number
  framesMoved: number
  foldersMoved: number
  /** Targets that held more than one object, and the objects given their own target. */
  split: Array<{ canonicalName: string; into: string[] }>
}

export type RepairCatalogues = () => Promise<CatalogueRepair>

/**
 * Seeds the built-in catalogues on a new install and repairs an existing one once each time the
 * catalogues change (specs/047-catalogue-names, CAT-003 to CAT-006): the same plan does both, since a
 * new install is one with no targets yet.
 */
export function makeRepairCatalogues(deps: { seeds: CatalogueSeeds; store: CatalogueStore; newId: () => string }): RepairCatalogues {
  return async () => {
    const { version, catalogues } = await deps.seeds.read()
    const none = { ran: false, version, created: 0, removed: 0, framesMoved: 0, foldersMoved: 0, split: [] }
    if (catalogues.length === 0 || (await deps.store.version()) === version) return none
    const installed = await deps.store.installed()
    const linked = await deps.store.linked(installed.filter(t => !t.isCustom).map(t => t.id))
    const plan = planCatalogueRepair(installed, seedTargets(catalogues), linked, deps.newId)
    await deps.store.apply(plan, catalogues.map(({ objects: _objects, ...meta }) => meta), version)
    return {
      ran: true,
      version,
      created: plan.create.length,
      removed: plan.remove.length,
      framesMoved: plan.frames.length,
      foldersMoved: plan.folders.length,
      split: plan.split.map(({ canonicalName, into }) => ({ canonicalName, into }))
    }
  }
}
