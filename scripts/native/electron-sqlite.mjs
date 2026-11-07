#!/usr/bin/env node
// Gives Electron its own better-sqlite3 build, beside the Node build the tests use (spec 045, DEV-002, DEV-003).
//
// npm builds better-sqlite3 for the Node that runs `npm install`. Electron embeds a different Node,
// so it cannot load that build. Rebuilding in place would break the tests instead, so this script
// puts an Electron build in node_modules/.cache/astrorepo-native/<versions>/, and the main process
// opens the database with it (src/main/db/native-binding.ts). electron-sqlite-cli.mjs runs it on install;
// `npm run native:electron` replaces the build even when one is there. It never fails the install.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

export const BINDING_FILE = 'better_sqlite3.node'
export const RETRY = 'npm run native:electron'

/** The folder for one better-sqlite3 version built for one Electron version, platform and architecture. */
export function bindingFolder(root, { sqliteVersion, electronVersion, platform, arch }) {
  return path.join(root, 'node_modules', '.cache', 'astrorepo-native',
    `better-sqlite3-${sqliteVersion}-electron-${electronVersion}-${platform}-${arch}`)
}

function versionOf(requireFrom, name) {
  try {
    return requireFrom(`${name}/package.json`).version
  } catch {
    return undefined
  }
}

/** Runs a command and reports whether it succeeded. */
function runCommand(command, args, cwd) {
  const r = spawnSync(command, args, { cwd, stdio: 'pipe', encoding: 'utf8' })
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}` }
}

/**
 * Fetches (or else compiles) better-sqlite3 for the installed Electron into its own folder.
 * `force` replaces a build already there, such as one Electron refuses to load.
 * Returns 'present', 'fetched', 'compiled', 'skipped' or 'failed'; never throws.
 */
export function fetchElectronSqlite({
  root,
  platform = process.platform,
  arch = process.arch,
  run = runCommand,
  log = console.log,
  env = process.env,
  force = false
}) {
  try {
    if (env.ASTROREPO_SKIP_ELECTRON_NATIVE) {
      log('astrorepo: ASTROREPO_SKIP_ELECTRON_NATIVE is set, so Electron\'s better-sqlite3 build was skipped.')
      return 'skipped'
    }
    const requireFrom = createRequire(path.join(root, 'package.json'))
    const electronVersion = versionOf(requireFrom, 'electron')
    const sqliteVersion = versionOf(requireFrom, 'better-sqlite3')
    if (!electronVersion || !sqliteVersion) {
      log('astrorepo: Electron or better-sqlite3 is not installed, so there is no Electron build to fetch.')
      return 'skipped'
    }
    const folder = bindingFolder(root, { sqliteVersion, electronVersion, platform, arch })
    const target = path.join(folder, BINDING_FILE)
    if (fs.existsSync(target)) {
      if (!force) return 'present'
      fs.rmSync(target, { force: true })
    }

    const sqliteRoot = path.dirname(requireFrom.resolve('better-sqlite3/package.json'))
    const work = path.join(folder, 'work')
    fs.rmSync(work, { recursive: true, force: true })
    fs.mkdirSync(work, { recursive: true })
    const built = path.join(work, 'build', 'Release', BINDING_FILE)
    const place = how => {
      fs.copyFileSync(built, target)
      fs.rmSync(work, { recursive: true, force: true })
      log(`astrorepo: better-sqlite3 ${sqliteVersion} ${how} for Electron ${electronVersion} (${platform}-${arch}).`)
    }

    // A prebuilt binary first: no compiler needed. prebuild-install installs into its working
    // folder's build/Release, so it works on a copy of package.json, never in node_modules/better-sqlite3.
    fs.copyFileSync(path.join(sqliteRoot, 'package.json'), path.join(work, 'package.json'))
    let prebuild
    try {
      prebuild = requireFrom.resolve('prebuild-install/bin.js')
    } catch {
      prebuild = undefined
    }
    if (prebuild) {
      const r = run(process.execPath, [prebuild, '--runtime', 'electron', '--target', electronVersion,
        '--platform', platform, '--arch', arch], work)
      if (r.ok && fs.existsSync(built)) {
        place('fetched')
        return 'fetched'
      }
    }

    // Else compile it against Electron's headers with the node-gyp npm ships.
    const nodeGyp = env.npm_config_node_gyp
    if (nodeGyp) {
      for (const part of ['binding.gyp', 'src', 'deps']) {
        const from = path.join(sqliteRoot, part)
        if (fs.existsSync(from)) fs.cpSync(from, path.join(work, part), { recursive: true })
      }
      const r = run(process.execPath, [nodeGyp, 'rebuild', '--release', `--target=${electronVersion}`,
        `--arch=${arch}`, '--dist-url=https://electronjs.org/headers'], work)
      if (r.ok && fs.existsSync(built)) {
        place('compiled')
        return 'compiled'
      }
    }

    fs.rmSync(work, { recursive: true, force: true })
    log(`astrorepo: could not fetch or compile better-sqlite3 for Electron ${electronVersion}. ` +
      `Tests still work; \`npm run dev\` will not open the database until you run \`${RETRY}\` ` +
      '(it needs the internet, or C++ build tools to compile). `npm run doctor` checks it.')
    return 'failed'
  } catch (e) {
    log(`astrorepo: Electron's better-sqlite3 build failed (${e instanceof Error ? e.message : String(e)}). Run \`${RETRY}\` to try again.`)
    return 'failed'
  }
}
