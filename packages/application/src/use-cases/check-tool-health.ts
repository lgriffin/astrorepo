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

/** The last model list per program, for a short while, so opening a target's page does not start syqon-cli each time. */
export interface SyqonModelCache {
  get(program: string): SyqonModels | null
  set(program: string, models: SyqonModels): void
  clear(): void
}

export function makeSyqonModelCache(now: () => number, lifetimeMs: number): SyqonModelCache {
  const entries = new Map<string, { at: number; models: SyqonModels }>()
  return {
    get: program => {
      const entry = entries.get(program)
      return entry && now() - entry.at < lifetimeMs ? entry.models : null
    },
    set: (program, models) => void entries.set(program, { at: now(), models }),
    clear: () => entries.clear()
  }
}

export interface ListSyqonModelsDeps {
  tools: ToolHub
  probe: ToolProbe
  /** Kept per program, so a new syqon-cli path is listed afresh. */
  cache?: SyqonModelCache
}

/** The models `syqon-cli --list-models` reports, with whether the account may use each (HUB-007). */
export function makeListSyqonModels(deps: ListSyqonModelsDeps): ListSyqonModels {
  return async statuses => {
    const program = (statuses ?? (await deps.tools.locate())).find(t => t.id === 'syqon')?.path ?? null
    if (!program) return { program: null, models: null, error: 'The SyQon CLI was not found. Set where syqon-cli is in Settings, under Tools.' }
    const cached = deps.cache?.get(program)
    if (cached) return cached
    const result = await deps.probe.run(program, SYQON_LIST_MODELS_ARGS)
    if (result.error) return { program, models: null, error: `The SyQon CLI could not list its models. ${result.error}` }
    const verdict = interpretExit('syqon', result.exitCode, { cancelled: false })
    if (verdict.outcome !== 'succeeded') return { program, models: null, error: `The SyQon CLI could not list its models. ${verdict.message}` }
    const listed = { program, models: parseSyqonModels(result.stdout), error: null }
    deps.cache?.set(program, listed)
    return listed
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
export function makeCheckToolHealth(deps: ListSyqonModelsDeps): CheckToolHealth {
  const catalogues = makeCheckCatalogues(deps)
  const syqon = makeListSyqonModels(deps)
  return async () => {
    // A check asked for in Settings always lists afresh, and what it finds is what pages reuse.
    deps.cache?.clear()
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
