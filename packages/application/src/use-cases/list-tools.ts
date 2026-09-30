import { TOOLS, toolWarnings, type ToolSpec, type ToolStatus } from '@astro/domain'
import type { ToolHub } from '../ports/tool-hub'

export interface ListToolsDeps {
  tools: ToolHub
}

export interface ToolEntry extends ToolStatus {
  spec: ToolSpec
  /** Not needed on this platform (Git Bash off Windows). */
  notNeeded: boolean
  warning: string | null
}

export interface ToolsReport {
  windows: boolean
  tools: ToolEntry[]
}

export type ListTools = () => Promise<ToolsReport>

/** The tool hub as Settings shows it: every tool, where it was found or where the hub looked. */
export function makeListTools(deps: ListToolsDeps): ListTools {
  return async () => {
    const statuses = await deps.tools.locate()
    const warnings = toolWarnings(statuses, deps.tools.windows)
    return {
      windows: deps.tools.windows,
      tools: TOOLS.map(spec => {
        const status = statuses.find(s => s.id === spec.id) ?? { id: spec.id, path: null, source: null, settingMissing: false, looked: [] }
        return {
          ...status,
          spec,
          notNeeded: !!spec.windowsOnly && !deps.tools.windows,
          warning: warnings.find(w => w.id === spec.id)?.text ?? null
        }
      })
    }
  }
}
