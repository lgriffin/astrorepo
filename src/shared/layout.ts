/** Below this width the sidebar starts as a rail, so the 800×480 Pi kiosk keeps its page (LF-032). */
export const RAIL_BELOW_PX = 1024

/**
 * Whether the sidebar starts as a rail of icons: as it was last left on this screen, or, before it
 * has been folded or opened here, on a narrow screen.
 */
export function startsAsRail(saved: string | null, width: number): boolean {
  if (saved === '1') return true
  if (saved === '0') return false
  return width < RAIL_BELOW_PX
}

/** The window's (or browser tab's) title for a page, so the taskbar and history name it (LF-033). */
export function windowTitle(heading: string): string {
  return heading ? `${heading} · AstroRepo` : 'AstroRepo'
}
