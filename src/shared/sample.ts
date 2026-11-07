/**
 * Sample data on first run (specs/046-everyday-ux, U5): when the app offers it, and what it says
 * while it is on.
 */

/** Whether the desktop app is showing the sample rather than the person's own data. */
export interface SampleStatus {
  active: boolean
}

/**
 * Whether the Get set up card offers the sample (EUX-017): on the desktop app only, while no home
 * folder is chosen, and not while the sample is already on.
 */
export function offersSample(mode: string | undefined, active: boolean, homeFolder: string | null): boolean {
  return mode === 'desktop' && !active && (homeFolder === null || homeFolder.trim() === '')
}

export const SAMPLE_TRY_LABEL = 'Try it with sample data'
export const SAMPLE_TRY_WHY = 'A made-up library of six targets, so every page has something in it. Your own data is not touched, and the app restarts to open it.'
export const SAMPLE_BANNER = 'Sample data: a made-up library of six targets. Nothing here is yours, and leaving removes it.'
export const SAMPLE_LEAVE_LABEL = 'Use my own data'
