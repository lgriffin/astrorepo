import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'child_process'
import os from 'os'
import type { ProcessRunner, RunningProcess } from '@astro/application'
import type { JobCommand } from '@astro/domain'

export interface NodeProcessRunnerOptions {
  platform?: NodeJS.Platform
  spawn?: (program: string, args: string[], options: SpawnOptions) => ChildProcess
  setPriority?: (pid: number, priority: number) => void
}

/**
 * Runs a job's program with child_process.spawn: no shell, so nothing in a path is interpreted;
 * below-normal priority, which the programs it starts inherit, so the PC stays usable; and on
 * cancel the whole process tree is stopped (Siril_Scripts runs Siril and RC Astro as children).
 */
export class NodeProcessRunner implements ProcessRunner {
  private readonly windows: boolean
  private readonly spawn: NonNullable<NodeProcessRunnerOptions['spawn']>
  private readonly setPriority: NonNullable<NodeProcessRunnerOptions['setPriority']>

  constructor(options: NodeProcessRunnerOptions = {}) {
    this.windows = (options.platform ?? process.platform) === 'win32'
    this.spawn = options.spawn ?? nodeSpawn
    this.setPriority = options.setPriority ?? ((pid, priority) => os.setPriority(pid, priority))
  }

  run(command: JobCommand, onOutput: (text: string, stream?: 'stdout' | 'stderr') => void): RunningProcess {
    const child = this.spawn(command.program, command.args, {
      cwd: command.cwd,
      shell: false,
      windowsHide: true,
      // Its own process group off Windows, so cancel can stop the programs it starts too.
      detached: !this.windows,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const done = new Promise<{ exitCode: number | null; error: string | null }>(resolve => {
      child.once('error', error => resolve({ exitCode: null, error: `${command.program} could not start: ${error.message}` }))
      child.once('close', (code, signal) => resolve({ exitCode: code, error: code === null ? `${command.program} was stopped (${signal ?? 'killed'}).` : null }))
    })
    for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]] as const) {
      stream?.setEncoding('utf8')
      stream?.on('data', (text: string) => onOutput(text, name))
    }
    if (child.pid) {
      try {
        this.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL)
      } catch {
        // A lower priority is a courtesy; the job runs either way.
      }
    }
    return { done, cancel: () => this.stop(child) }
  }

  private stop(child: ChildProcess): void {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
    try {
      if (this.windows) this.spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      else process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill()
    }
  }
}
