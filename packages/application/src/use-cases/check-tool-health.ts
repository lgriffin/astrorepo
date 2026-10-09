import {
  CATALOGUES,
  catalogueStatus,
  interpretExit,
  parseSyqonModels,
  parseToolVersion,
  SYQON_LIST_MODELS_ARGS,
  TOOLS,
  type CatalogueStatus,
  type SyqonModel,
  type ToolId,
  type ToolStatus
} from '@astro/domain'
import type { ToolHub } from '../ports/tool-hub'
import type { ToolProbe } from '../ports/tool-probe'

export interface CheckCataloguesDeps {
  tools: ToolHub
}

export type CheckCatalogues = (statuses?: ToolStatus[]) => Promise<CatalogueStatus[]>

/**
 * Whether the catalogues each found tool needs are installed (HUB-009). Only lists folders: runs
 * nothing and writes nothing. A catalogue whose tool is not found is not checked.
 */
export function makeCheckCatalogues(deps: CheckCataloguesDeps): CheckCatalogues {
  return async statuses => {
    const found = statuses ?? (await deps.tools.locate())
    return Promise.all(
      CATALOGUES.map(async spec => {
        const tool = found.find(t => t.id === spec.tool) ?? null
        const folders = tool?.path ? await deps.tools.catalogueFolders(spec.id, tool.path) : []
        return catalogueStatus(spec, tool, folders)
      })
    )
  }
}

export interface SyqonModels {
  /** The syqon-cli found; null when it is not. */
  program: string | null
  /** Every model it listed; null when it could not be asked. */
  models: SyqonModel[] | null
  /** Why the models could not be listed, in the user's words. */
  error: string | null
}

export type ListSyqonModels = (statuses?: ToolStatus[]) => Promise<SyqonModels>

/** The models `syqon-cli --list-models` reports, with whether the account may use each (HUB-007). */
export function makeListSyqonModels(deps: { tools: ToolHub; probe: ToolProbe }): ListSyqonModels {
  return async statuses => {
    const program = (statuses ?? (await deps.tools.locate())).find(t => t.id === 'syqon')?.path ?? null
    if (!program) return { program: null, models: null, error: 'The SyQon CLI was not found. Set where syqon-cli is in Settings, under Tools.' }
    const result = await deps.probe.run(program, SYQON_LIST_MODELS_ARGS)
    if (result.error) return { program, models: null, error: `The SyQon CLI could not list its models. ${result.error}` }
    const verdict = interpretExit('syqon', result.exitCode, { cancelled: false })
    if (verdict.outcome !== 'succeeded') return { program, models: null, error: `The SyQon CLI could not list its models. ${verdict.message}` }
    return { program, models: parseSyqonModels(result.stdout), error: null }
  }
}

export interface ToolHealth {
  /** Each tool's version, by catalogue order; null when found but it printed none, or it has no version flag. */
  versions: { id: ToolId; found: boolean; version: string | null }[]
  catalogues: CatalogueStatus[]
  syqon: SyqonModels
}

export type CheckToolHealth = () => Promise<ToolHealth>

/**
 * Tool health for Settings > Tools (HUB-008 to HUB-010): each found tool's version from its own
 * version flag, the catalogues each needs, and SyQon's models. It runs each tool only with its
 * version or model-list flag, and writes nothing (NFR-017).
 */
export function makeCheckToolHealth(deps: { tools: ToolHub; probe: ToolProbe }): CheckToolHealth {
  const catalogues = makeCheckCatalogues(deps)
  const syqon = makeListSyqonModels(deps)
  return async () => {
    const statuses = await deps.tools.locate()
    const versions = await Promise.all(
      TOOLS.map(async spec => {
        const path = statuses.find(s => s.id === spec.id)?.path ?? null
        if (!path || !spec.versionArgs) return { id: spec.id, found: path !== null, version: null }
        const result = await deps.probe.run(path, spec.versionArgs)
        return { id: spec.id, found: true, version: result.error ? null : parseToolVersion(`${result.stdout}\n${result.stderr}`) }
      })
    )
    const [cats, models] = await Promise.all([catalogues(statuses), syqon(statuses)])
    return { versions, catalogues: cats, syqon: models }
  }
}
