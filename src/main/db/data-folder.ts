import path from 'path'

/**
 * The data folder a development run of the desktop app uses instead of its own (DEV-016): the one
 * named by ASTRO_DATA, as the headless server reads it, so `npm run dev:demo` opens the demo library.
 * A packaged app always keeps its own folder, so a stray variable cannot point it elsewhere.
 */
export function dataFolderOverride(env: Record<string, string | undefined>, packaged: boolean): string | null {
  const named = env.ASTRO_DATA?.trim()
  if (packaged || !named) return null
  return path.resolve(named)
}
