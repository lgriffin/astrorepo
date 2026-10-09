import { execFile as nodeExecFile } from 'child_process'
import type { ProbeResult, ToolProbe } from '@astro/application'

type ExecFileLike = typeof nodeExecFile

/**
 * Asks a tool about itself with child_process.execFile: an argument array, never a shell, hidden
 * on Windows, stopped after a few seconds, with its output capped (NFR-017). Nothing is written.
 */
export class NodeToolProbe implements ToolProbe {
  constructor(
    private readonly timeoutMs = 10_000,
    private readonly execFile: ExecFileLike = nodeExecFile
  ) {}

  run(program: string, args: readonly string[]): Promise<ProbeResult> {
    return new Promise(resolve => {
      this.execFile(
        program,
        [...args],
        { windowsHide: true, shell: false, timeout: this.timeoutMs, maxBuffer: 1024 * 1024, encoding: 'utf8' },
        (error, stdout, stderr) => {
          const out = { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }
          if (!error) return resolve({ exitCode: 0, ...out, error: null })
          const e = error as NodeJS.ErrnoException & { code?: number | string; killed?: boolean; signal?: string | null }
          if (typeof e.code === 'number') return resolve({ exitCode: e.code, ...out, error: null })
          const seconds = Math.ceil(this.timeoutMs / 1000)
          const why = e.killed || e.signal ? `it did not answer within ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.` : `it could not start (${e.code ?? e.message}).`
          resolve({ exitCode: null, ...out, error: why.charAt(0).toUpperCase() + why.slice(1) })
        }
      )
    })
  }
}
