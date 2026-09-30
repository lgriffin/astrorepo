import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ToolHub } from '@astro/application'
import { SIRIL_SCRIPTS_ENTRY, TOOLS, type ToolSource, type ToolSpec, type ToolStatus } from '@astro/domain'

export interface NodeToolHubOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  home?: string
  /** The user's saved path for a setting key, or null. */
  setting: (key: string) => string | null
  exists?: (p: string) => boolean
}

const isFile = (p: string) => {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

/**
 * The tool hub on this machine. Each tool is looked for in the user's setting first, then on PATH,
 * then in its standard install folders. Only file existence is checked: nothing is run.
 */
export class NodeToolHub implements ToolHub {
  readonly windows: boolean
  private readonly p: path.PlatformPath
  private readonly env: NodeJS.ProcessEnv
  private readonly home: string
  private readonly exists: (p: string) => boolean

  constructor(private readonly options: NodeToolHubOptions) {
    const platform = options.platform ?? process.platform
    this.windows = platform === 'win32'
    this.p = this.windows ? path.win32 : path.posix
    this.env = options.env ?? process.env
    this.home = options.home ?? os.homedir()
    this.exists = options.exists ?? isFile
  }

  async locate(): Promise<ToolStatus[]> {
    return TOOLS.map(spec => this.find(spec))
  }

  /**
   * Siril installs its stock scripts under share/siril/scripts beside its bin folder (older
   * Windows builds put them in a scripts folder), or system-wide on Linux.
   */
  async stockScript(fileName: string): Promise<string | null> {
    const siril = this.find(TOOLS.find(t => t.id === 'siril') as ToolSpec).path
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

  private find(spec: ToolSpec): ToolStatus {
    const looked: string[] = []
    const tryAt = (candidates: string[]): string | null => {
      for (const c of candidates) {
        looked.push(c)
        if (this.exists(c)) return c
      }
      return null
    }
    const expand = (p: string) => this.p.normalize(p.startsWith('~') ? this.p.join(this.home, p.slice(1)) : p)
    // Siril_Scripts is a folder: accept the repo, its v2 folder or the entry script itself.
    const entries = (p: string) => {
      if (spec.id !== 'siril-scripts') return [expand(p)]
      const entry = this.windows ? SIRIL_SCRIPTS_ENTRY.windows : SIRIL_SCRIPTS_ENTRY.other
      const base = expand(p)
      return [this.p.join(base, entry), this.p.join(base, this.p.basename(entry)), ...(/postprocess\.(bat|sh)$/i.test(base) ? [base] : [])]
    }

    const setting = this.options.setting(spec.settingKey)?.trim() || null
    const attempts: [ToolSource, string[]][] = [
      ['setting', setting ? entries(setting) : []],
      [
        'path',
        (this.env.PATH ?? this.env.Path ?? '')
          .split(this.windows ? ';' : ':')
          .filter(Boolean)
          .flatMap(dir => (this.windows ? spec.onPath.windows : spec.onPath.other).map(name => this.p.join(dir, name)))
      ],
      ['standard', (this.windows ? spec.standard.windows : spec.standard.other).flatMap(entries)]
    ]
    let settingMissing = false
    for (const [source, candidates] of attempts) {
      const found = tryAt(candidates)
      if (found) return { id: spec.id, path: found, source, settingMissing, looked: [] }
      if (source === 'setting' && setting) settingMissing = true
    }
    return { id: spec.id, path: null, source: null, settingMissing, looked }
  }
}
