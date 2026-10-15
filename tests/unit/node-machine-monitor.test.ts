import type os from 'os'
import { describe, expect, it } from 'vitest'
import { NodeMachineMonitor } from '../../src/main/adapters/node-machine-monitor'

const cpus = () => [{ model: 'x', speed: 1, times: { user: 10, nice: 0, sys: 0, idle: 90, irq: 0 } }] as os.CpuInfo[]

describe('The machine monitor on the headless server (specs/035-pi-variant)', () => {
  it('[PI-013] Given a machine that never starts window jobs, When it is sampled, Then the load says so', async () => {
    const monitor = new NodeMachineMonitor({ cpus, wait: async () => {}, userIdleSeconds: () => 0, windowJobs: false })
    expect(await monitor.sample()).toEqual({ userIdleSeconds: 0, cpuPercent: null, windowJobs: false })
  })

  it('[PI-013] Given the desktop app\'s monitor, When it is sampled, Then the load does not mention window jobs', async () => {
    const monitor = new NodeMachineMonitor({ cpus, wait: async () => {}, userIdleSeconds: () => 30 })
    expect(await monitor.sample()).toEqual({ userIdleSeconds: 30, cpuPercent: null })
  })
})
