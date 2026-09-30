import type { StackCatalogue, StackFile, ToolHub } from '@astro/application'
import { TOOLS, type RecipeTarget, type ToolId, type ToolStatus } from '@astro/domain'

/** A tool hub that finds what it is told to; every other tool is missing. */
export class FakeToolHub implements ToolHub {
  readonly found = new Map<ToolId, string>()
  /** Stock Siril scripts present beside siril-cli, by file name. */
  readonly scripts = new Set<string>(['OSC_Preprocessing.ssf', 'OSC_Preprocessing_WithoutDBF.ssf', 'OSC_Preprocessing_WithoutFlat.ssf', 'Mono_Preprocessing.ssf'])
  constructor(readonly windows = true) {}

  install(id: ToolId, path: string): this {
    this.found.set(id, path)
    return this
  }

  /** Siril, Siril_Scripts, RC Astro and Git Bash where Siril_Scripts v2 expects them. */
  installAll(): this {
    return this.install('siril', 'C:/Program Files/Siril/bin/siril-cli.exe')
      .install('siril-scripts', 'C:/Users/leigh/Siril_Scripts/v2/postprocess.bat')
      .install('rc-astro', 'C:/Program Files/RC-Astro/CLI/rc-astro.exe')
      .install('bash', 'C:/Program Files/Git/bin/bash.exe')
  }

  async locate(): Promise<ToolStatus[]> {
    return TOOLS.map(t => {
      const path = this.found.get(t.id) ?? null
      return { id: t.id, path, source: path ? 'standard' : null, settingMissing: false, looked: path ? [] : t.standard.windows }
    })
  }

  async stockScript(fileName: string): Promise<string | null> {
    const siril = this.found.get('siril')
    return siril && this.scripts.has(fileName) ? `${siril.replace(/\/bin\/[^/]*$/, '')}/share/siril/scripts/${fileName}` : null
  }
}

export class InMemoryStackCatalogue implements StackCatalogue {
  readonly targets = new Map<string, RecipeTarget>()
  readonly stacks = new Map<string, StackFile[]>()
  readonly optics = new Map<string, { focalMm: number; pixelUm: number }>()

  addTarget(id: string, target: Partial<RecipeTarget> & { name: string }): this {
    this.targets.set(id, { objectType: null, raHours: null, decDeg: null, ...target })
    return this
  }

  addStack(targetId: string, stack: Partial<StackFile> & { path: string }): this {
    const full: StackFile = { sizeBytes: 0, width: null, height: null, colour: true, focalMm: null, pixelUm: null, modifiedAt: null, ...stack }
    this.stacks.set(targetId, [...(this.stacks.get(targetId) ?? []), full])
    return this
  }

  async describeTarget(targetId: string): Promise<RecipeTarget | null> {
    return this.targets.get(targetId) ?? null
  }

  async listStacks(targetId: string): Promise<StackFile[]> {
    return [...(this.stacks.get(targetId) ?? [])].sort((a, b) => (b.modifiedAt?.getTime() ?? 0) - (a.modifiedAt?.getTime() ?? 0))
  }

  async targetOptics(targetId: string) {
    return this.optics.get(targetId) ?? null
  }
}
