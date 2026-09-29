/** The user set a suggestion aside while the target's data looked like `fingerprint`. */
export interface Dismissal {
  suggestionId: string
  targetId: string
  fingerprint: string
  dismissedAt: Date
}

/** A dismissal holds only until the target's data changes; then the suggestion may return. */
export function isDismissed(dismissal: Dismissal | undefined, currentFingerprint: string): boolean {
  return dismissal !== undefined && dismissal.fingerprint === currentFingerprint
}
