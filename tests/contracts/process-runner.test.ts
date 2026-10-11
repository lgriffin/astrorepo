import os from 'os'
import path from 'path'
import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'
import { describe, expect, it } from 'vitest'
import { FakeProcessRunner } from '@astro/testkit'
import { processRunnerContract, type ProgramScript } from '@astro/testkit/contracts/process-runner.contract'
import { NodeProcessRunner } from '../../src/main/adapters/node-process-runner'

const MISSING = 'no-such-siril-cli'

/** The fake plays each program's script itself, as the program would, once it has started. */
processRunnerContract('fake', () => ({
  runner: new FakeProcessRunner(run => {
    if (run.command.program === MISSING) return run.exit(null, `${MISSING} could not start: not found`)
    const [spec, ...extra] = run.command.args
    const script = JSON.parse(spec) as ProgramScript
    setTimeout(() => {
      if (script.stdout) run.output(script.stdout, 'stdout')
      if (script.echoArgs) run.output(extra.join('\n'), 'stdout')
      if (script.stderr) run.output(script.stderr, 'stderr')
      if (!script.hang) run.exit(script.exitCode ?? 0)
    }, 1)
  }),
  program: (script, extra = []) => ({ program: 'fake-program', args: [JSON.stringify(script), ...extra], cwd: '/work' }),
  missing: () => ({ program: MISSING, args: [], cwd: '/work' })
}))

/** A tiny Node program standing in for Siril or SyQon: the same on Linux and Windows. */
const STAND_IN = [
  'const s = JSON.parse(process.argv[1])',
  "if (s.stdout) process.stdout.write(s.stdout)",
  "if (s.echoArgs) process.stdout.write(process.argv.slice(2).join('\\n'))",
  'if (s.stderr) process.stderr.write(s.stderr)',
  'if (s.hang) setInterval(() => {}, 1000)',
  'else process.exitCode = s.exitCode ?? 0'
].join('\n')

processRunnerContract('Node', () => ({
  runner: new NodeProcessRunner(),
  program: (script, extra = []) => ({ program: process.execPath, args: ['-e', STAND_IN, JSON.stringify(script), ...extra], cwd: os.tmpdir() }),
  missing: () => ({ program: path.join(os.tmpdir(), MISSING), args: [], cwd: os.tmpdir() })
}))

describe('NodeProcessRunner', () => {
  it('[JOB-004] Given a program, When run, Then it starts at below-normal priority, and a priority the system refuses does not stop it', async () => {
    const priorities: number[] = []
    const run = new NodeProcessRunner({ setPriority: (_pid, p) => priorities.push(p) }).run({ program: process.execPath, args: ['-e', ''], cwd: os.tmpdir() }, () => {})
    expect((await run.done).exitCode).toBe(0)
    expect(priorities).toEqual([os.constants.priority.PRIORITY_BELOW_NORMAL])
    const refused = new NodeProcessRunner({ setPriority: () => { throw new Error('not allowed') } }).run({ program: process.execPath, args: ['-e', ''], cwd: os.tmpdir() }, () => {})
    expect((await refused.done).exitCode).toBe(0)
  })

  it('[JOB-010] Given Windows, When a job is cancelled, Then taskkill stops its whole process tree', () => {
    const calls: { program: string; args: string[] }[] = []
    const fake = () => {
      const child = new EventEmitter() as ChildProcess
      Object.assign(child, { pid: 4242, exitCode: null, signalCode: null, stdout: null, stderr: null })
      return child
    }
    const runner = new NodeProcessRunner({
      platform: 'win32',
      setPriority: () => {},
      spawn: (program, args) => {
        calls.push({ program, args })
        return fake()
      }
    })
    runner.run({ program: 'C:/Git/bin/bash.exe', args: ['postprocess.sh'], cwd: 'D:/m42' }, () => {}).cancel()
    expect(calls[1]).toEqual({ program: 'taskkill', args: ['/pid', '4242', '/T', '/F'] })
  })

  it('[JOB-010] Given the tree cannot be signalled, When cancelled, Then the program itself is killed', () => {
    let killed = false
    const runner = new NodeProcessRunner({
      platform: 'linux',
      setPriority: () => {},
      spawn: () => {
        const child = new EventEmitter() as ChildProcess
        Object.assign(child, { pid: 999_999_999, exitCode: null, signalCode: null, stdout: null, stderr: null, kill: () => (killed = true) })
        return child
      }
    })
    runner.run({ program: 'siril-cli', args: [], cwd: '/' }, () => {}).cancel()
    expect(killed).toBe(true)
  })
})
