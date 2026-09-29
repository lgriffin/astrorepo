import type { CalibrationFrame, LightSetting, TargetFrames, UnassignedLight } from '@astro/domain'
import type { FrameCatalogue } from '@astro/application'

const hasAnything = (t: TargetFrames) =>
  t.subs.length > 0 || t.stacks.length > 0 || t.processedCount > 0 || t.finalCount > 0 || t.goalSec !== null

export class InMemoryFrameCatalogue implements FrameCatalogue {
  private readonly targets = new Map<string, TargetFrames>()
  private unassigned: UnassignedLight[] = []
  private calibration: CalibrationFrame[] = []
  private lightSettings: LightSetting[] = []

  add(target: TargetFrames): this {
    this.targets.set(target.targetId, structuredClone(target))
    return this
  }

  addUnassigned(...lights: UnassignedLight[]): this {
    this.unassigned.push(...structuredClone(lights))
    return this
  }

  addCalibration(...frames: CalibrationFrame[]): this {
    this.calibration.push(...structuredClone(frames))
    return this
  }

  /** Light settings are what the SQLite adapter groups from its rows; tests state them directly. */
  addLightSettings(...settings: LightSetting[]): this {
    this.lightSettings.push(...structuredClone(settings))
    return this
  }

  async listTargetFrames(): Promise<TargetFrames[]> {
    return [...this.targets.values()].filter(hasAnything).map(t => structuredClone(t))
  }

  async listUnassignedLights(): Promise<UnassignedLight[]> {
    return structuredClone(this.unassigned)
  }

  async listCalibrationFrames(): Promise<CalibrationFrame[]> {
    return structuredClone(this.calibration)
  }

  async listLightSettings(): Promise<LightSetting[]> {
    return structuredClone(this.lightSettings)
  }
}
