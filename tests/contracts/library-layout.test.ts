import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll } from 'vitest'
import { InMemoryLibraryFolders, InMemoryLibraryLayoutStore } from '@astro/testkit'
import { libraryFoldersContract, libraryLayoutStoreContract, type HomeSeed } from '@astro/testkit/contracts/library-layout.contract'
import { NodeLibraryFolders, SqliteLibraryLayoutStore } from '../../src/main/adapters/library-layout'
import { isAstronomicalName } from '../../src/main/services/astro-names'
import { setupTestDb, teardownTestDb } from '../helpers/setup'

const made: string[] = []
afterAll(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true })
  teardownTestDb()
})

const objectName = (name: string) => /^(M|NGC|IC)\s*\d+/i.test(name)

libraryFoldersContract('in-memory', seed => {
  const home = 'D:/Astro'
  const folders = Object.entries(seed.folders).map(([name, files]) => {
    const objects = new Set(files.filter(f => f.includes('/')).map(f => f.split('/')[0]).filter(objectName))
    return { name, path: `${home}/${name}`, files: files.map(f => f.split('/').pop()!), objectFolders: objects.size, isObject: objectName(name) }
  })
  const alias = `${home}/Lights/../Masters`
  return { folders: new InMemoryLibraryFolders({ [home]: folders }, undefined, { [alias]: `${home}/Masters` }), home, notAFolder: 'D:/Nowhere', alias }
})

libraryFoldersContract('file system', (seed: HomeSeed) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-layout-'))
  made.push(home)
  for (const [name, files] of Object.entries(seed.folders)) {
    fs.mkdirSync(path.join(home, name), { recursive: true })
    for (const f of files) {
      fs.mkdirSync(path.dirname(path.join(home, name, f)), { recursive: true })
      fs.writeFileSync(path.join(home, name, f), '')
    }
  }
  // Hidden folders are not part of the library.
  fs.mkdirSync(path.join(home, '.thumbnails'))
  // A file is not a folder, even though its path exists.
  const alias = `${home}${path.sep}Lights${path.sep}..${path.sep}Masters`
  return { folders: new NodeLibraryFolders(isAstronomicalName), home, notAFolder: path.join(home, 'Exports', 'M 31.tif'), alias }
})

libraryLayoutStoreContract('in-memory', home => new InMemoryLibraryLayoutStore(home))

libraryLayoutStoreContract('SQLite', home => {
  const db = setupTestDb()
  if (home) db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('home_folder_path', ?)").run(home)
  return new SqliteLibraryLayoutStore(db)
})
