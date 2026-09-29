import type { LightSub, StackedImage, TargetFrames } from '@astro/domain'

/** `count` subs of `exposureSec`, one every exposure, starting at `from`. */
export function subs(count: number, exposureSec: number, from: string): LightSub[] {
  const start = new Date(from).getTime()
  return Array.from({ length: count }, (_, i) => ({
    exposureSec,
    capturedAt: new Date(start + i * exposureSec * 1000)
  }))
}

export function stackAt(producedAt: string): StackedImage {
  return { producedAt: new Date(producedAt) }
}

export function target(
  name: string,
  frames: Partial<Pick<TargetFrames, 'subs' | 'stacks'>> = {}
): TargetFrames {
  return {
    targetId: `target-${name.replace(/\s+/g, '-').toLowerCase()}`,
    targetName: name,
    subs: frames.subs ?? [],
    stacks: frames.stacks ?? []
  }
}
