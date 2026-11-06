import { describe, expect, it } from 'vitest'
import type { LibraryFolders, LibraryLayoutStore } from '@astro/application'

/** A home folder for the LibraryFolders contract: a few folders with files, nested at any depth. */
export interface HomeSeed {
  /** Folder name under the home folder → file paths inside it, relative to that folder. */
  folders: Record<string, string[]>
}

export const HOME_SEED: HomeSeed = {
  folders: {
    Lights: ['M 31/2026-09-01/Light_M 31_10.0s_001.fit', 'M 31/2026-09-01/Light_M 31_10.0s_002.fit', 'NGC 7000/Light_1.fit'],
    Masters: ['M 31/Stacked_120_M 31.fit'],
    Exports: ['M 31.tif'],
    empty: []
  }
}

/**
 * Every LibraryFolders adapter must pass this suite. `make` returns the adapter and the home path
 * holding `HOME_SEED`, plus a path that is not a folder.
 */
export function libraryFoldersContract(adapterName: string, make: (seed: HomeSeed) => { folders: LibraryFolders; home: string; notAFolder: string }): void {
  describe(`LibraryFolders contract: ${adapterName}`, () => {
    it('[LAY-002] Given a home folder, When it is surveyed, Then each folder under it comes back with the names of files inside it at any depth', async () => {
      const { folders, home } = make(HOME_SEED)
      const survey = await folders.survey(home)
      expect(survey.map(f => f.name).sort()).toEqual(['Exports', 'Lights', 'Masters', 'empty'])
      const lights = survey.find(f => f.name === 'Lights')!
      expect([...lights.files].sort()).toEqual(['Light_1.fit', 'Light_M 31_10.0s_001.fit', 'Light_M 31_10.0s_002.fit'])
      expect(lights.objectFolders).toBe(2)
      expect(lights.isObject).toBe(false)
      expect(lights.path).toBe(folders.join(home, 'Lights'))
      expect(survey.find(f => f.name === 'empty')!.files).toEqual([])
    })

    it('[LAY-001] Given a home folder, When its names are listed, Then each folder under it is named', async () => {
      const { folders, home } = make(HOME_SEED)
      expect((await folders.names(home)).sort()).toEqual(['Exports', 'Lights', 'Masters', 'empty'])
    })

    it('[LAY-002] Given a home folder that is not there, When it is surveyed, Then nothing is found and nothing fails', async () => {
      const { folders, notAFolder } = make(HOME_SEED)
      expect(await folders.survey(notAFolder)).toEqual([])
      expect(await folders.names(notAFolder)).toEqual([])
    })

    it('[LAY-006] Given paths, When asked whether each is a folder, Then only a readable folder is', async () => {
      const { folders, home, notAFolder } = make(HOME_SEED)
      expect(await folders.isFolder(folders.join(home, 'Masters'))).toBe(true)
      expect(await folders.isFolder(notAFolder)).toBe(false)
    })
  })
}

/** Every LibraryLayoutStore adapter must pass this suite. `make` returns a store with the home folder set. */
export function libraryLayoutStoreContract(adapterName: string, make: (home: string | null) => LibraryLayoutStore): void {
  describe(`LibraryLayoutStore contract: ${adapterName}`, () => {
    it('[LAY-001] Given nothing chosen, When the layout is read, Then every part is null and the home folder comes back', async () => {
      const store = make('D:/Astro')
      expect(await store.home()).toBe('D:/Astro')
      expect(await store.chosen()).toEqual({ raw: null, stacked: null, tif: null, images: null })
    })

    it('[LAY-004] Given folders chosen, When the layout is read, Then they come back and a part left out keeps its folder', async () => {
      const store = make('D:/Astro')
      await store.choose({ raw: 'D:/Astro/Lights', stacked: 'E:/Masters' })
      await store.choose({ stacked: 'E:/Stacks' })
      expect(await store.chosen()).toEqual({ raw: 'D:/Astro/Lights', stacked: 'E:/Stacks', tif: null, images: null })
    })

    it('[LAY-004] Given a chosen folder cleared, When the layout is read, Then that part is null again', async () => {
      const store = make('D:/Astro')
      await store.choose({ raw: 'D:/Astro/Lights' })
      await store.choose({ raw: null })
      expect((await store.chosen()).raw).toBeNull()
    })

    it('[LAY-001] Given no home folder, When it is read, Then it is null', async () => {
      expect(await make(null).home()).toBeNull()
    })
  })
}
