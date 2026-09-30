import os from 'os'
import type { MachineMonitor } from '@astro/application'
import type { MachineLoad } from '@astro/domain'

type CpuTimes = { idle: number; total: number }

export interface NodeMachineMonitorOptions {
  /** Seconds since the last keyboard or mouse input (Electron's powerMonitor); null when unknown. */
  userIdleSeconds?: () => number | null
  cpus?: () => os.CpuInfo[]
  wait?: (ms: number) => Promise<void>
}

const totals = (cpus: os.CpuInfo[]): CpuTimes =>
  cpus.reduce(
    (t, c) => ({ idle: t.idle + c.times.idle, total: t.total + c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq }),
    { idle: 0, total: 0 }
  )

/**
 * CPU use across all cores since the last sample (os.loadavg is always zero on Windows), and how
 * long the user has been away. The first sample measures over half a second.
 */
export class NodeMachineMonitor implements MachineMonitor {
  private last: CpuTimes | null = null
  private readonly cpus: () => os.CpuInfo[]
  private readonly wait: (ms: number) => Promise<void>

  constructor(private readonly options: NodeMachineMonitorOptions = {}) {
    this.cpus = options.cpus ?? os.cpus
    this.wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  }

  async sample(): Promise<MachineLoad> {
    if (!this.last) {
      this.last = totals(this.cpus())
      await this.wait(500)
    }
    const now = totals(this.cpus())
    const busy = now.total - this.last.total
    const cpuPercent = busy > 0 ? Math.round((100 * (busy - (now.idle - this.last.idle))) / busy) : null
    this.last = now
    return { userIdleSeconds: this.options.userIdleSeconds?.() ?? null, cpuPercent }
  }
}
