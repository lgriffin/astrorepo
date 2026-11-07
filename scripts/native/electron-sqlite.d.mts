export declare const BINDING_FILE: string
export declare const RETRY: string
export interface BindingVersions { sqliteVersion: string; electronVersion: string; platform: string; arch: string }
export declare function bindingFolder(root: string, versions: BindingVersions): string
export type FetchOutcome = 'present' | 'fetched' | 'compiled' | 'skipped' | 'failed'
export interface FetchOptions {
  root: string
  platform?: string
  arch?: string
  run?: (command: string, args: string[], cwd: string) => { ok: boolean; output: string }
  log?: (line: string) => void
  env?: Record<string, string | undefined>
}
export declare function fetchElectronSqlite(options: FetchOptions): FetchOutcome
