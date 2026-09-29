import type { LightSub, StackedImage, TargetFrames } from '@astro/domain'

export interface SubOptions {
  filter?: string | null
  scope?: string | null
  rejected?: boolean
}

/** `count` subs of `exposureSec`, one every exposure, starting at `from`. */
export function subs(count: number, exposureSec: number, from: string, options: SubOptions = {}): LightSub[] {
  const start = new Date(from).getTime()
  return Array.from({ length: count }, (_, i) => ({
    exposureSec,
    capturedAt: new Date(start + i * exposureSec * 1000),
    filter: options.filter ?? null,
    scope: options.scope ?? null,
    rejected: options.rejected ?? false
  }))
}

export function stackAt(producedAt: string): StackedImage {
  return { producedAt: new Date(producedAt) }
}

export function target(name: string, frames: Partial<Omit<TargetFrames, 'targetId' | 'targetName'>> = {}): TargetFrames {
  return {
    targetId: `target-${name.replace(/\s+/g, '-').toLowerCase()}`,
    targetName: name,
    subs: frames.subs ?? [],
    stacks: frames.stacks ?? [],
    goalSec: frames.goalSec ?? null,
    processedCount: frames.processedCount ?? 0,
    finalCount: frames.finalCount ?? 0
  }
}
