import { describe, expect, it } from 'vitest'
import type { ProcessRunner } from '@astro/application'
import type { JobCommand } from '@astro/domain'

/** What the stand-in program does: writes to each stream, then exits with the code, or runs until stopped. */
export interface ProgramScript {
  stdout?: string
  stderr?: string
  /** Writes each extra argument it was given to stdout, one per line, after `stdout`. */
  echoArgs?: boolean
  exitCode?: number
  /** Keeps running until cancelled. */
  hang?: boolean
}

export interface ProcessRunnerHarness {
  runner: ProcessRunner
  /** A command for a program that behaves as the script says, given these extra arguments. */
  program(script: ProgramScript, extraArgs?: string[]): JobCommand
  /** A command naming a program that is not there. */
  missing(): JobCommand
}

type Output = { text: string; stream?: 'stdout' | 'stderr' }

/**
 * Every ProcessRunner adapter must pass this suite. The job scheduler relies on: `run` never
 * throwing (a program that cannot start settles `done` with a reason), all output arriving before
 * `done` settles (SyQon's output path is read after it), `done` settling once cancel is called
 * however early, and cancel being safe to call again or after the program ended.
 */
export function processRunnerContract(adapterName: string, setup: () => ProcessRunnerHarness): void {
  const collect = () => {
    const seen: Output[] = []
    return { seen, onOutput: (text: string, stream?: 'stdout' | 'stderr') => void seen.push({ text, stream }), text: (s?: 'stdout' | 'stderr') => seen.filter(o => !s || o.stream === s).map(o => o.text).join('') }
  }

  describe(`ProcessRunner contract: ${adapterName}`, () => {
    it('[NFR-006] [JOB-009] Given a program that writes and exits, When run, Then all its output arrives before it settles with its exit code', async () => {
      const h = setup()
      const out = collect()
      const run = h.runner.run(h.program({ stdout: 'stacking\n', stderr: 'warn\n', exitCode: 3 }), out.onOutput)
      expect(await run.done).toEqual({ exitCode: 3, error: null })
      expect(out.text()).toContain('stacking\n')
      expect(out.text()).toContain('warn\n')
      run.cancel() // already ended: nothing to stop
      expect(await run.done).toEqual({ exitCode: 3, error: null })
    })

    it('[NFR-006] [JOB-009] Given a program that succeeds, When run, Then it settles with exit code 0 and no error', async () => {
      const h = setup()
      const run = h.runner.run(h.program({}), () => {})
      expect(await run.done).toEqual({ exitCode: 0, error: null })
    })

    it('[NFR-006] [HUB-011] Given a program writing to both streams, When run, Then each piece of output says which stream it came from', async () => {
      const h = setup()
      const out = collect()
      const run = h.runner.run(h.program({ stdout: 'D:/out.fit', stderr: '50%' }), out.onOutput)
      expect((await run.done).exitCode).toBe(0)
      expect(out.text('stdout')).toBe('D:/out.fit')
      expect(out.text('stderr')).toBe('50%')
    })

    it('[NFR-006] [NFR-012] Given arguments holding shell characters, When run, Then the program receives them literally', async () => {
      const h = setup()
      const out = collect()
      const odd = ['D:/100% M42 & "x"/$(echo hi);`id`.fit', "it's | > < *"]
      const run = h.runner.run(h.program({ echoArgs: true }, odd), out.onOutput)
      expect((await run.done).exitCode).toBe(0)
      expect(out.text('stdout')).toBe(odd.join('\n'))
    })

    it('[NFR-006] [JOB-009] Given a program that does not exist, When run, Then run does not throw and it settles with no exit code and the reason it could not start', async () => {
      const h = setup()
      const command = h.missing()
      const run = h.runner.run(command, () => {})
      const result = await run.done
      expect(result.exitCode).toBeNull()
      expect(result.error).toContain(command.program)
      expect(result.error).toMatch(/could not start/)
      run.cancel()
    })

    it('[NFR-006] [JOB-010] Given a long-running program, When cancelled, Then it settles without succeeding, and cancelling again does nothing', async () => {
      const h = setup()
      const run = h.runner.run(h.program({ stdout: 'working\n', hang: true }), () => {})
      await new Promise(resolve => setTimeout(resolve, 100))
      run.cancel()
      const result = await run.done
      expect(result.exitCode).not.toBe(0)
      run.cancel()
    })

    it('[NFR-006] [JOB-010] Given a job cancelled the moment its program was started, When cancelled, Then it still settles without succeeding', async () => {
      const h = setup()
      const run = h.runner.run(h.program({ hang: true }), () => {})
      run.cancel()
      expect((await run.done).exitCode).not.toBe(0)
    })

    it('[NFR-006] [JOB-009] Given two programs running at once, When each ends, Then each settles with its own exit code and output', async () => {
      const h = setup()
      const a = collect()
      const b = collect()
      const first = h.runner.run(h.program({ stdout: 'first', exitCode: 1 }), a.onOutput)
      const second = h.runner.run(h.program({ stdout: 'second', exitCode: 2 }), b.onOutput)
      expect([(await first.done).exitCode, (await second.done).exitCode]).toEqual([1, 2])
      expect([a.text(), b.text()]).toEqual(['first', 'second'])
    })
  })
}
