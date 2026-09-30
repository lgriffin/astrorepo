import type { ToolStatus } from '@astro/domain'

/**
 * Driven port: the tool hub. Finds the external programs the app hands work to (Siril,
 * Siril_Scripts, RC Astro, Git Bash) from the user's setting, PATH and standard install folders.
 * It only looks: it never runs a tool or writes a file.
 */
export interface ToolHub {
  /** True on Windows, where Siril_Scripts runs through its .bat and Git Bash. */
  readonly windows: boolean
  /** One status per tool in the catalogue, in catalogue order. */
  locate(): Promise<ToolStatus[]>
  /** One of the stock scripts Siril installs beside siril-cli (such as OSC_Preprocessing.ssf); null when Siril or the script is not found. */
  stockScript(fileName: string): Promise<string | null>
}
