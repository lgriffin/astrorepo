import type { AppPathsRegistry, ProbeResult, StackCatalogue, StackFile, ToolHub, ToolProbe } from '@astro/application'
import { TOOLS, type CatalogueFolder, type CatalogueId, type RecipeTarget, type ToolId, type ToolStatus } from '@astro/domain'

/** File names that make each catalogue present. */
export const CATALOGUE_SAMPLES: Record<CatalogueId, string[]> = {
  'astap-stars': ['d50_0101.1476', 'd50_0102.1476', 'h18_0101.1476'],
  'siril-spcc': ['siril_cat1_healpix8_xpsamp_1.dat', 'siril_cat1_healpix8_xpsamp_2.dat'],
  'rc-astro-models': ['BlurXTerminator.4.pb', 'NoiseXTerminator.3.pb', 'StarXTerminator.11.pb']
}

/**
 * A tool hub that finds what it is told to; every other tool is missing. A found tool's
 * catalogues are installed beside it unless `removeCatalogue` says otherwise.
 */
export class FakeToolHub implements ToolHub {
  readonly found = new Map<ToolId, string>()
  /** Catalogues that are not installed. */
  readonly missing = new Set<CatalogueId>()
  /** Folders and their file names, for listFolder. */
  readonly folders = new Map<string, string[]>()
  /** Stock Siril scripts present beside siril-cli, by file name. */
  readonly scripts = new Set<string>(['OSC_Preprocessing.ssf', 'OSC_Preprocessing_WithoutDBF.ssf', 'OSC_Preprocessing_WithoutFlat.ssf', 'Mono_Preprocessing.ssf'])
  constructor(readonly windows = true) {}

  install(id: ToolId, path: string): this {
    this.found.set(id, path)
    return this
  }

  /** Siril, Siril_Scripts, RC Astro and Git Bash where Siril_Scripts v2 expects them, and ASTAP. */
  installAll(): this {
    return this.install('siril', 'C:/Program Files/Siril/bin/siril-cli.exe')
      .install('siril-scripts', 'C:/Users/leigh/Siril_Scripts/v2/postprocess.bat')
      .install('rc-astro', 'C:/Program Files/RC-Astro/CLI/rc-astro.exe')
      .install('bash', 'C:/Program Files/Git/bin/bash.exe')
      .install('astap', 'C:/Program Files/astap/astap_cli.exe')
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

  removeCatalogue(id: CatalogueId): this {
    this.missing.add(id)
    return this
  }

  async catalogueFolders(id: CatalogueId, toolPath: string | null): Promise<CatalogueFolder[]> {
    if (!toolPath) return []
    const dir = toolPath.replace(/[\\/][^\\/]*$/, '')
    return [{ dir, names: this.missing.has(id) ? [] : CATALOGUE_SAMPLES[id] }]
  }

  async listFolder(dir: string): Promise<string[] | null> {
    return this.folders.get(dir) ?? null
  }
}

/** The App Paths key with whatever programs the test registers. */
export class FakeAppPathsRegistry implements AppPathsRegistry {
  readonly entries = new Map<string, string[]>()
  register(exeName: string, ...paths: string[]): this {
    this.entries.set(exeName.toLowerCase(), paths)
    return this
  }
  async lookup(exeName: string): Promise<string[]> {
    return this.entries.get(exeName.toLowerCase()) ?? []
  }
}

/** Answers each program and argument list with what the test set; anything else could not start. */
export class FakeToolProbe implements ToolProbe {
  readonly answers = new Map<string, ProbeResult>()
  readonly calls: { program: string; args: string[] }[] = []

  answer(program: string, args: readonly string[], result: Partial<ProbeResult>): this {
    this.answers.set(`${program}\0${args.join('\0')}`, { exitCode: 0, stdout: '', stderr: '', error: null, ...result })
    return this
  }

  async run(program: string, args: readonly string[]): Promise<ProbeResult> {
    this.calls.push({ program, args: [...args] })
    return this.answers.get(`${program}\0${args.join('\0')}`) ?? { exitCode: null, stdout: '', stderr: '', error: 'It could not start (ENOENT).' }
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
