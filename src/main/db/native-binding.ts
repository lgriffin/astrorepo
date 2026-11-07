import fs from 'fs'
import path from 'path'

/**
 * Electron's own better-sqlite3 build (spec 045, DEV-001). npm builds better-sqlite3 for Node, which
 * the tests need; Electron cannot load that build, so scripts/native/electron-sqlite.mjs puts one made
 * for Electron in node_modules/.cache/astrorepo-native. The folder name here must match that script's
 * bindingFolder (a test keeps them equal).
 */
export interface BindingQuery {
  /** process.versions.electron: absent under plain Node (tests, the headless server). */
  electronVersion?: string
  sqliteVersion: string
  platform: string
  arch: string
  /** The folder holding node_modules. */
  root: string
  exists: (file: string) => boolean
}

export function electronSqliteBinding(q: BindingQuery): string | undefined {
  if (!q.electronVersion) return undefined
  const file = path.join(q.root, 'node_modules', '.cache', 'astrorepo-native',
    `better-sqlite3-${q.sqliteVersion}-electron-${q.electronVersion}-${q.platform}-${q.arch}`, 'better_sqlite3.node')
  // A packaged app's node_modules are rebuilt for Electron by Forge and sit in the asar archive,
  // which cannot hold a loadable native module: the default build is the right one there.
  if (/app\.asar/.test(file)) return undefined
  return q.exists(file) ? file : undefined
}

/** The nativeBinding option for opening the database in this process, when Electron's own build is there. */
export function sqliteNativeBinding(): string | undefined {
  const electronVersion = process.versions.electron
  if (!electronVersion) return undefined
  try {
    const pkg = require.resolve('better-sqlite3/package.json')
    const sqliteVersion = (JSON.parse(fs.readFileSync(pkg, 'utf8')) as { version: string }).version
    return electronSqliteBinding({
      electronVersion,
      sqliteVersion,
      platform: process.platform,
      arch: process.arch,
      root: path.resolve(path.dirname(pkg), '..', '..'),
      exists: file => fs.existsSync(file)
    })
  } catch {
    return undefined
  }
}

/** What the app says when the database will not open at start (DEV-007), rather than a blank window. */
export function databaseOpenFailure(error: unknown, packaged: boolean): { title: string; body: string } {
  const reason = error instanceof Error ? error.message : String(error)
  const native = /NODE_MODULE_VERSION|better_sqlite3\.node|was compiled against a different Node\.js version/.test(reason)
  const fix = packaged
    ? 'Reinstall AstroRepo; if it happens again, report it with the reason below.'
    : native
      ? 'better-sqlite3 has no build for this Electron. Run `npm run native:electron`, then `npm run dev` again. `npm run doctor` checks the whole set-up.'
      : 'Run `npm run doctor` to check the set-up.'
  return { title: 'AstroRepo could not open its database', body: `${fix}\n\n${reason.split(/\r?\n/).slice(0, 3).join('\n')}` }
}
