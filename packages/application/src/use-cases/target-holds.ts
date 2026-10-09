/**
 * Targets something is working on outside the job runner (an archive removing a work folder's
 * intermediates), so the runner leaves their jobs queued until the hold is let go (ARC-008).
 */
export interface TargetHolds {
  /** Holds the target; null when it is already held. The returned function lets it go. */
  hold(targetId: string): (() => void) | null
  held(targetId: string): boolean
}

export function makeTargetHolds(): TargetHolds {
  const holding = new Set<string>()
  return {
    hold(targetId) {
      if (holding.has(targetId)) return null
      holding.add(targetId)
      let released = false
      return () => {
        if (released) return
        released = true
        holding.delete(targetId)
      }
    },
    held: targetId => holding.has(targetId)
  }
}
