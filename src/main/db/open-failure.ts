/**
 * What the app says when the database will not open at start (spec 045, DEV-007), rather than a
 * blank window. better-sqlite3 is one Node-API build that Electron and Node both load (DEV-001),
 * so a build that will not load is a broken install, which `npm rebuild better-sqlite3` repairs.
 */
export function databaseOpenFailure(error: unknown, packaged: boolean): { title: string; body: string } {
  const reason = error instanceof Error ? error.message : String(error)
  const native = /NODE_MODULE_VERSION|better_sqlite3\.node|was compiled against a different Node\.js version|Could not locate the bindings file/.test(reason)
  const fix = packaged
    ? 'Reinstall AstroRepo; if it happens again, report it with the reason below.'
    : native
      ? 'better-sqlite3 did not load. Run `npm rebuild better-sqlite3`, then `npm run dev` again. `npm run doctor` checks the whole set-up.'
      : 'Run `npm run doctor` to check the set-up.'
  return { title: 'AstroRepo could not open its database', body: `${fix}\n\n${reason.split(/\r?\n/).slice(0, 3).join('\n')}` }
}
