import fs from 'fs'
import os from 'os'
import path from 'path'
import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryJobStore } from '@astro/testkit'
import { jobStoreContract } from '@astro/testkit/contracts/jobs.contract'
import { DEFAULT_JOB_SETTINGS, JOB_SETTING_KEYS } from '@astro/domain'
import { SqliteJobSettings, SqliteJobStore } from '../../src/main/adapters/sqlite-jobs'
import { NodeProcessRunner } from '../../src/main/adapters/node-process-runner'
import { FileJobLogs } from '../../src/main/adapters/file-job-logs'
import { NodeMachineMonitor } from '../../src/main/adapters/node-machine-monitor'
import { setupTestDb, teardownTestDb } from '../helpers/setup'

afterEach(() => teardownTestDb())

jobStoreContract('in-memory', () => new InMemoryJobStore())
jobStoreContract('SQLite', () => new SqliteJobStore(setupTestDb()))

describe('SqliteJobSettings', () => {
  it('[JOB-012] Given run-window settings saved in app_settings, When read, Then they are used, with defaults for the rest', async () => {
    const db = setupTestDb()
    expect(await new SqliteJobSettings(db).read()).toEqual(DEFAULT_JOB_SETTINGS)
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(JOB_SETTING_KEYS.windowStart, '23:30')
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(JOB_SETTING_KEYS.maxCpuPercent, '50')
    expect(await new SqliteJobSettings(db).read()).toEqual({ ...DEFAULT_JOB_SETTINGS, windowStart: 23 * 60 + 30, maxCpuPercent: 50 })
  })
})

const node = (script: string) => ({ program: process.execPath, args: ['-e', script], cwd: os.tmpdir() })

describe('NodeProcessRunner', () => {
  it('[JOB-009] Given a program that writes and exits, When run, Then its output streams and its exit code comes back', async () => {
    let out = ''
    const priorities: number[] = []
    const runner = new NodeProcessRunner({ setPriority: (_pid, p) => priorities.push(p) })
    const run = runner.run(node("process.stdout.write('stacking\\n'); process.stderr.write('warn\\n'); process.exit(3)"), t => (out += t))
    expect(await run.done).toEqual({ exitCode: 3, error: null })
    expect(out).toContain('stacking')
    expect(out).toContain('warn')
    expect(priorities).toEqual([os.constants.priority.PRIORITY_BELOW_NORMAL])
  })

  it('[HUB-011] Given a program writing to both streams, When run, Then each piece of output says which stream it came from', async () => {
    const seen: [string, string | undefined][] = []
    const run = new NodeProcessRunner().run(node("process.stdout.write('D:/out.fit'); process.stderr.write('50%')"), (t, stream) => seen.push([t, stream]))
    expect((await run.done).exitCode).toBe(0)
    expect(seen).toContainEqual(['D:/out.fit', 'stdout'])
    expect(seen).toContainEqual(['50%', 'stderr'])
  })

  it('[NFR-012] Given arguments holding shell characters, When run, Then the program receives them literally', async () => {
    let out = ''
    const odd = 'D:/100% M42 & "x"/$(echo hi);`id`.fit'
    const run = new NodeProcessRunner().run({ ...node('process.stdout.write(process.argv[1])'), args: ['-e', 'process.stdout.write(process.argv[1])', odd] }, t => (out += t))
    expect((await run.done).exitCode).toBe(0)
    expect(out).toBe(odd)
  })

  it('[JOB-009] Given a program that does not exist, When run, Then the job gets an error instead of hanging', async () => {
    const run = new NodeProcessRunner().run({ program: path.join(os.tmpdir(), 'no-such-siril-cli'), args: [], cwd: os.tmpdir() }, () => {})
    const result = await run.done
    expect(result.exitCode).toBeNull()
    expect(result.error).toMatch(/could not start/)
  })

  it('[JOB-010] Given a long-running program, When cancelled, Then it stops', async () => {
    const run = new NodeProcessRunner({ setPriority: () => { throw new Error('not allowed') } }).run(node('setTimeout(() => {}, 60000)'), () => {})
    await new Promise(resolve => setTimeout(resolve, 200))
    run.cancel()
    const result = await run.done
    expect(result.exitCode === null || result.exitCode !== 0).toBe(true)
    run.cancel() // already stopped: nothing to do
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

describe('FileJobLogs', () => {
  it('[JOB-009] Given output appended to a job log, When read, Then the end of it comes back, and a job with no log reads empty', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-logs-'))
    const logs = new FileJobLogs(path.join(dir, 'jobs'))
    expect(await logs.read('01J0000000', 100)).toBe('')
    logs.append('01J0000000', 'first line\n')
    logs.append('01J0000000', 'second line\n')
    expect(await logs.read('01J0000000', 1000)).toBe('first line\nsecond line\n')
    expect(await logs.read('01J0000000', 12)).toBe('second line\n')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('[JOB-009] Given a job id that is a path, When used, Then no file is touched', async () => {
    const logs = new FileJobLogs(os.tmpdir())
    expect(() => logs.append('../escape', 'x')).toThrow('Not a job id')
    await expect(logs.read('..\\escape', 10)).rejects.toThrow('Not a job id')
  })
})

describe('NodeMachineMonitor', () => {
  const cpu = (busy: number, idle: number) => [{ model: 'x', speed: 1, times: { user: busy, nice: 0, sys: 0, idle, irq: 0 } }]

  it('[JOB-003] Given CPU times and idle input, When sampled twice, Then CPU use is measured between samples', async () => {
    const readings = [cpu(100, 900), cpu(400, 1000), cpu(400, 1000)]
    let waited = 0
    const monitor = new NodeMachineMonitor({ cpus: () => readings.shift() ?? cpu(0, 0), userIdleSeconds: () => 700, wait: async ms => void (waited = ms) })
    expect(await monitor.sample()).toEqual({ userIdleSeconds: 700, cpuPercent: 75 })
    expect(waited).toBe(500)
    expect(await monitor.sample()).toEqual({ userIdleSeconds: 700, cpuPercent: null })
  })

  it('[JOB-003] Given no idle source, When sampled, Then idle time is unknown', async () => {
    const monitor = new NodeMachineMonitor({ wait: async () => {} })
    const load = await monitor.sample()
    expect(load.userIdleSeconds).toBeNull()
  })
})
