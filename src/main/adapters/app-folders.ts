import path from 'path'
import type Database from 'better-sqlite3'
import { parseVesperaSettings, solveFolderName, workFolderName, type VesperaSettings } from '@astro/domain'
import { settingReader, type SettingReader } from './shared/app-settings'

/**
 * Where the app reads and writes on this PC: the folders it only reads, and the work area and
 * archive with their defaults under the app's data folder. One place for these, so the IPC
 * handlers, the job runner and the core all agree on them.
 */
export class AppFolders {
  private readonly setting: SettingReader

  constructor(private readonly db: Database.Database, private readonly appDataDir: string) {
    this.setting = settingReader(db)
  }

  /** Folders the app only reads: the home and FITS master folders and every scanned folder. */
  readOnlyDirs(): string[] {
    const scanned = (this.db.prepare('SELECT DISTINCT folder_path FROM fits_scans').all() as { folder_path: string }[]).map(r => r.folder_path)
    return [this.setting('home_folder_path'), this.setting('fits_master_folder'), ...scanned].filter((d): d is string => !!d)
  }

  /** The work area: the user's setting, else the app's data folder. */
  workArea(): string {
    return this.setting('work_area_path') || path.join(this.appDataDir, 'work')
  }

  /** Where Prep for Siril lays out a source folder. */
  sirilWorkDir(sourceDir: string): string {
    return path.join(this.workArea(), 'siril', workFolderName(path.resolve(sourceDir)))
  }

  /** Where a target's plate solves run (NFR-018). */
  solveWorkDir(targetId: string): string {
    return path.join(this.workArea(), 'solve', solveFolderName(targetId))
  }

  /** Where archives go: the archive folder setting, else the work area's archive folder (ARC-012). */
  archiveRoot(): string {
    return this.setting('archive_root') || path.join(this.workArea(), 'archive')
  }

  /** The home folder, where the library lives; null when it is not set. */
  homeFolder(): string | null {
    return this.setting('home_folder_path') || null
  }

  /**
   * Where the Vespera is and where its copies land (spec 033): the Vespera settings, landing in
   * the home folder's `raw` folder when no other folder is set, so the home scan finds them.
   */
  vesperaSettings(): VesperaSettings {
    const home = this.homeFolder()
    return parseVesperaSettings(
      { vespera_host: this.setting('vespera_host'), vespera_landing: this.setting('vespera_landing'), vespera_formats: this.setting('vespera_formats') },
      home ? path.join(home, 'raw') : null
    )
  }
}
