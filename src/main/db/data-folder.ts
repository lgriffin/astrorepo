import path from 'path'

/**
 * The data folder a development run of the desktop app uses instead of its own (DEV-016): the one
 * named by ASTRO_DEV_DATA, so `npm run dev:demo` opens the demo library. It is not the server's
 * ASTRO_DATA, so a variable set for a running server never makes a desktop run share its database
 * and job queue. A packaged app always keeps its own folder.
 */
export const DEV_DATA_VARIABLE = 'ASTRO_DEV_DATA'

export function dataFolderOverride(env: Record<string, string | undefined>, packaged: boolean): string | null {
  const named = env[DEV_DATA_VARIABLE]?.trim()
  if (packaged || !named) return null
  return path.resolve(named)
}
