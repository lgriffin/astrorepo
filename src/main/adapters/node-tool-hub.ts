import fs from 'fs'
import os from 'os'
import path from 'path'
import type { AppPathsRegistry, ToolHub } from '@astro/application'
import {
  catalogueSpec,
  DEFAULT_TOOL_ORDER,
  SIRIL_SCRIPTS_ENTRY,
  TOOLS,
  type CatalogueFolder,
  type CatalogueId,
  type ToolSource,
  type ToolSpec,
  type ToolStatus
} from '@astro/domain'

export interface NodeToolHubOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  home?: string
  /** The user's saved path for a setting key, or null. */
  setting: (key: string) => string | null
  exists?: (p: string) => boolean
  /** The file names in a folder; null when it is not there or cannot be read. */
  listDir?: (dir: string) => string[] | null
  /** The Windows App Paths key (SyQon registers syqon-cli.exe there); none off Windows. */
  registry?: AppPathsRegistry
}

const isFile = (p: string) => {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

const readDir = (dir: string) => {
  try {
    return fs.readdirSync(dir)
  } catch {
    return null
  }
}

/** Where Windows keeps these when the environment does not say. */
const WINDOWS_FALLBACKS: Record<string, (home: string) => string> = {
  localappdata: home => `${home}\\AppData\\Local`,
  programfiles: () => 'C:\\Program Files'
}

/**
 * The tool hub on this machine. Each tool is looked for in the places its spec names, in its
 * order: the user's setting first, then PATH and its standard install folders, or for SyQon its
 * environment variable, install folders and the Windows App Paths key. Only file existence is
 * checked, and folders listed for catalogues: nothing is run.
 */
export class NodeToolHub implements ToolHub {
  readonly windows: boolean
  private readonly p: path.PlatformPath
  private readonly env: NodeJS.ProcessEnv
  private readonly home: string
  private readonly exists: (p: string) => boolean
  private readonly listDir: (dir: string) => string[] | null

  constructor(private readonly options: NodeToolHubOptions) {
    const platform = options.platform ?? process.platform
    this.windows = platform === 'win32'
    this.p = this.windows ? path.win32 : path.posix
    this.env = options.env ?? process.env
    this.home = options.home ?? os.homedir()
    this.exists = options.exists ?? isFile
    this.listDir = options.listDir ?? readDir
  }

  async locate(): Promise<ToolStatus[]> {
    return Promise.all(TOOLS.map(spec => this.find(spec)))
  }

  /**
   * Siril installs its stock scripts under share/siril/scripts beside its bin folder (older
   * Windows builds put them in a scripts folder), or system-wide on Linux.
   */
  async stockScript(fileName: string): Promise<string | null> {
    const siril = (await this.find(TOOLS.find(t => t.id === 'siril') as ToolSpec)).path
    if (!siril) return null
    const root = this.p.dirname(this.p.dirname(siril))
    const candidates = [
      this.p.join(root, 'share', 'siril', 'scripts', fileName),
      this.p.join(root, 'scripts', fileName),
      this.p.join(this.p.dirname(siril), 'scripts', fileName),
      ...(this.windows ? [] : [`/usr/share/siril/scripts/${fileName}`, `/usr/local/share/siril/scripts/${fileName}`])
    ]
    return candidates.find(c => this.exists(c)) ?? null
  }

  async catalogueFolders(id: CatalogueId, toolPath: string | null): Promise<CatalogueFolder[]> {
    const spec = catalogueSpec(id)
    const setting = this.options.setting(spec.settingKey)?.trim() || null
    const dirs = [
      ...(setting ? [this.expand(setting)] : []),
      ...(toolPath ? spec.nearTool.map(rel => this.p.normalize(this.p.join(this.p.dirname(toolPath), rel))) : []),
      ...(this.windows ? spec.standard.windows : spec.standard.other).map(d => this.expand(d))
    ]
    const key = (d: string) => (this.windows ? d.toLowerCase() : d).replace(/[\\/]+$/, '')
    const unique = dirs.filter((d, i) => dirs.findIndex(x => key(x) === key(d)) === i)
    return unique.map(dir => ({ dir, names: this.listDir(dir) }))
  }

  async listFolder(dir: string): Promise<string[] | null> {
    return this.listDir(dir)
  }

  /** `~` and Windows `%VAR%` expanded, normalised for the platform. */
  private expand(p: string): string {
    const withVars = p.replace(/%([^%]+)%/g, (whole, name: string) => {
      const key = Object.keys(this.env).find(k => k.toLowerCase() === name.toLowerCase())
      return (key ? this.env[key] : undefined) ?? WINDOWS_FALLBACKS[name.toLowerCase()]?.(this.home) ?? whole
    })
    return this.p.normalize(withVars.startsWith('~') ? this.p.join(this.home, withVars.slice(1)) : withVars)
  }

  private async find(spec: ToolSpec): Promise<ToolStatus> {
    const looked: string[] = []
    // On Windows the runner starts postprocess.sh beside the .bat, so both must be there.
    const usable = (c: string) =>
      this.exists(c) && (spec.id !== 'siril-scripts' || !this.windows || !/\.bat$/i.test(c) || this.exists(c.replace(/\.bat$/i, '.sh')))
    const tryAt = (candidates: string[]): string | null => {
      for (const c of candidates) {
        looked.push(c)
        if (usable(c)) return c
      }
      return null
    }
    // Siril_Scripts is a folder: accept the repo, its v2 folder or the entry script itself.
    const entries = (p: string) => {
      if (spec.id !== 'siril-scripts') return [this.expand(p)]
      const entry = this.windows ? SIRIL_SCRIPTS_ENTRY.windows : SIRIL_SCRIPTS_ENTRY.other
      const base = this.expand(p)
      return [this.p.join(base, entry), this.p.join(base, this.p.basename(entry)), ...(/postprocess\.(bat|sh)$/i.test(base) ? [base] : [])]
    }

    const setting = this.options.setting(spec.settingKey)?.trim() || null
    const candidates = async (source: ToolSource): Promise<string[]> => {
      switch (source) {
        case 'setting':
          return setting ? entries(setting) : []
        case 'env': {
          const value = spec.envVar ? this.env[spec.envVar]?.trim().replace(/^"(.*)"$/, '$1') : undefined
          return value ? [this.expand(value)] : []
        }
        case 'path':
          return (this.env.PATH ?? this.env.Path ?? '')
            .split(this.windows ? ';' : ':')
            .filter(Boolean)
            .flatMap(dir => (this.windows ? spec.onPath.windows : spec.onPath.other).map(name => this.p.join(dir, name)))
        case 'standard':
          return (this.windows ? spec.standard.windows : spec.standard.other).flatMap(entries)
        case 'registry':
          if (!this.windows || !spec.appPaths) return []
          looked.push(`App Paths\\${spec.appPaths} in the registry`)
          return this.options.registry ? (await this.options.registry.lookup(spec.appPaths)).map(p => this.expand(p)) : []
      }
    }

    let settingMissing = false
    for (const source of spec.order ?? DEFAULT_TOOL_ORDER) {
      const found = tryAt(await candidates(source))
      if (found) return { id: spec.id, path: found, source, settingMissing, looked: [] }
      if (source === 'setting' && setting) settingMissing = true
    }
    return { id: spec.id, path: null, source: null, settingMissing, looked }
  }
}
