import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeMachine, FixedJobSettings, InMemoryJobLogs, InMemoryJobStore } from '@astro/testkit'
import { jobLogsContract, jobSettingsSourceContract, jobStoreContract, machineMonitorContract } from '@astro/testkit/contracts/jobs.contract'
import { DEFAULT_JOB_SETTINGS, JOB_SETTING_KEYS, type JobSettings } from '@astro/domain'
import { SqliteJobSettings, SqliteJobStore } from '../../src/main/adapters/sqlite-jobs'
import { FileJobLogs } from '../../src/main/adapters/file-job-logs'
import { NodeMachineMonitor } from '../../src/main/adapters/node-machine-monitor'
import { setupTestDb, teardownTestDb } from '../helpers/setup'

afterEach(() => teardownTestDb())

jobStoreContract('in-memory', () => new InMemoryJobStore())
jobStoreContract('SQLite', () => new SqliteJobStore(setupTestDb()))

jobSettingsSourceContract('fixed', () => {
  const source = new FixedJobSettings()
  return { source, save: async settings => void (source.settings = { ...source.settings, ...settings }) }
})

/** The Settings page's format: times as HH:MM, numbers as text. */
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

jobSettingsSourceContract('SQLite', () => {
  const db = setupTestDb()
  const put = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
  return {
    source: new SqliteJobSettings(db),
    save: async settings => {
      for (const [key, value] of Object.entries(settings) as [keyof JobSettings, number][]) {
        put.run(JOB_SETTING_KEYS[key], key === 'windowStart' || key === 'windowEnd' ? hhmm(value) : String(value))
      }
    }
  }
})

describe('SqliteJobSettings', () => {
  it('[JOB-012] Given settings saved out of range or unreadable, When read, Then the defaults stand in for them', async () => {
    const db = setupTestDb()
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(JOB_SETTING_KEYS.windowStart, '25:00')
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(JOB_SETTING_KEYS.maxCpuPercent, 'lots')
    expect(await new SqliteJobSettings(db).read()).toEqual(DEFAULT_JOB_SETTINGS)
  })
})

const cpu = (busy: number, idle: number) => [{ model: 'x', speed: 1, times: { user: busy, nice: 0, sys: 0, idle, irq: 0 } }]

machineMonitorContract('fake', {
  scripted: load => {
    const monitor = new FakeMachine(load)
    return { monitor, set: next => void (monitor.load = next) }
  },
  live: () => new FakeMachine()
})

machineMonitorContract('Node', {
  scripted: first => {
    // CPU times that advance by 1000 ticks a reading, busy for the share the load says; still when it is unknown.
    let load = first
    let busy = 0
    let idle = 0
    const monitor = new NodeMachineMonitor({
      cpus: () => {
        if (load.cpuPercent !== null) {
          busy += load.cpuPercent * 10
          idle += 1000 - load.cpuPercent * 10
        }
        return cpu(busy, idle)
      },
      userIdleSeconds: () => load.userIdleSeconds,
      wait: async () => {}
    })
    return { monitor, set: next => void (load = next) }
  },
  live: () => new NodeMachineMonitor({ wait: ms => new Promise(resolve => setTimeout(resolve, Math.min(ms, 50))) })
})

describe('NodeMachineMonitor', () => {
  it('[JOB-003] Given its first sample, When taken, Then CPU use is measured over half a second, and later samples measure since the one before', async () => {
    const readings = [cpu(100, 900), cpu(400, 1000), cpu(400, 1000)]
    let waited = 0
    const monitor = new NodeMachineMonitor({ cpus: () => readings.shift() ?? cpu(0, 0), userIdleSeconds: () => 700, wait: async ms => void (waited = ms) })
    expect(await monitor.sample()).toEqual({ userIdleSeconds: 700, cpuPercent: 75 })
    expect(waited).toBe(500)
    expect(await monitor.sample()).toEqual({ userIdleSeconds: 700, cpuPercent: null })
  })
})

jobLogsContract('in-memory', () => new InMemoryJobLogs())

const logDirs: string[] = []
afterEach(() => {
  for (const d of logDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

jobLogsContract('file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-logs-'))
  logDirs.push(dir)
  return new FileJobLogs(path.join(dir, 'jobs'))
})

