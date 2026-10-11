import fs from 'fs'
import path from 'path'

/** A frame folder that is, or links to, a folder outside the work area. */
export class WorkFolderLinksOutError extends Error {
  constructor(readonly folder: string) {
    super(`The work area's ${path.basename(folder)} folder (${folder}) links to a folder outside the work area, and the app only writes inside its work area. Remove the link, then try again.`)
    this.name = 'WorkFolderLinksOutError'
  }
}

/**
 * A frame folder's path under the work area as given (so paths match the work folder the caller
 * knows, even where Windows hands out short names) when it is a plain folder inside the work area;
 * null when it does not exist. Throws when it is a link, or resolves outside the work area, so nothing the app
 * writes or removes can reach a source folder through it.
 */
export async function ownFolder(workDir: string, folder: string): Promise<string | null> {
  const dir = path.join(workDir, folder)
  const stat = await fs.promises.lstat(dir).catch(() => null)
  if (!stat) return null
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new WorkFolderLinksOutError(dir)
  const [real, root] = await Promise.all([fs.promises.realpath(dir), fs.promises.realpath(workDir)])
  const rel = path.relative(root, real)
  if ((process.platform === 'win32' ? rel.toLowerCase() : rel) !== (process.platform === 'win32' ? folder.toLowerCase() : folder).split('/').join(path.sep)) throw new WorkFolderLinksOutError(dir)
  return dir
}
