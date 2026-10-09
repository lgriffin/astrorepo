/** What a tool printed when asked about itself. */
export interface ProbeResult {
  /** Null when it was stopped or never started. */
  exitCode: number | null
  stdout: string
  stderr: string
  /** Why it could not be asked (not started, timed out); null when it ran. */
  error: string | null
}

/**
 * Driven port: asks a tool about itself (its version, or SyQon's models) by running it with an
 * argument array, never through a shell, for a few seconds at most. It writes nothing
 * (specs/023-hub-syqon, NFR-017).
 */
export interface ToolProbe {
  run(program: string, args: readonly string[]): Promise<ProbeResult>
}
