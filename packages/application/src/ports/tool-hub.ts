import type { CatalogueFolder, CatalogueId, ToolStatus } from '@astro/domain'

/**
 * Driven port: the tool hub. Finds the external programs the app hands work to (Siril,
 * Siril_Scripts, RC Astro, Git Bash, SyQon CLI, ASTAP) from the user's setting, PATH, standard
 * install folders and, for SyQon, its environment variable and the Windows App Paths key, and the
 * catalogues they need. It only looks: it never runs a tool or writes a file.
 */
export interface ToolHub {
  /** True on Windows, where Siril_Scripts runs through its .bat and Git Bash. */
  readonly windows: boolean
  /** One status per tool in the catalogue, in catalogue order. */
  locate(): Promise<ToolStatus[]>
  /** One of the stock scripts Siril installs beside siril-cli (such as OSC_Preprocessing.ssf); null when Siril or the script is not found. */
  stockScript(fileName: string): Promise<string | null>
  /**
   * The folders a catalogue may be in, in the order looked (the user's folder, beside the tool,
   * then standard folders), each with the names of the files in it (specs/023-hub-syqon).
   */
  catalogueFolders(id: CatalogueId, toolPath: string | null): Promise<CatalogueFolder[]>
  /** The names of the files in a folder; null when it is not there or cannot be read. */
  listFolder(dir: string): Promise<string[] | null>
}

/**
 * Driven port: the Windows App Paths registry key, where installers register a program
 * (`HKLM` and `HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\<exe>`). Read only.
 */
export interface AppPathsRegistry {
  /** The paths registered for the program, HKLM first; empty when none (or off Windows). */
  lookup(exeName: string): Promise<string[]>
}
