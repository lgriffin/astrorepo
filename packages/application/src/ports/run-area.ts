import type { StackManifest } from '@astro/domain'

/**
 * Driven port: the files a stack run keeps beside Siril's in the work area: the steps it runs, a
 * manifest beside each published result, and the folder a run that did not finish leaves its
 * partial results in. Writes only inside the work folder it is given.
 */
export interface RunArea {
  /** A script's text, such as Siril's stock script the job names. */
  readText(path: string): Promise<string>
  /** Saves one step as a script in the work folder's own subfolder, and returns its path. */
  writeStep(workDir: string, name: string, text: string): Promise<string>
  /** Moves these files of the work folder into failed/<run>, and returns where each went. */
  setAside(workDir: string, run: string, paths: string[]): Promise<string[]>
  /** Writes the manifest beside the result, and returns its path. */
  writeManifest(resultPath: string, manifest: StackManifest): Promise<string>
}
