import { describe, expect, it } from 'vitest'
import { makeChooseLibraryLayout, makeDescribeLibraryLayout, makeReadLibraryLayout } from '../src'
import { InMemoryLibraryFolders, InMemoryLibraryLayoutStore } from '@astro/testkit'
import type { FolderSample } from '@astro/domain'

const HOME = 'D:/Astro'
const folder = (name: string, files: string[] = []): FolderSample => ({ name, path: `${HOME}/${name}`, files, objectFolders: 0, isObject: false })
const lights = ['Light_1.fit', 'Light_2.fit', 'Light_3.fit']

function setup(folders: FolderSample[], chosen = {}, elsewhere: string[] = [], home: string | null = HOME) {
  const store = new InMemoryLibraryLayoutStore(home, chosen)
  const deps = { store, folders: new InMemoryLibraryFolders({ [HOME]: folders }, elsewhere) }
  return { store, describe: makeDescribeLibraryLayout(deps), choose: makeChooseLibraryLayout(deps), read: makeReadLibraryLayout(deps) }
}

describe('describing the library layout', () => {
  it('[LAY-001] Given no home folder, When the layout is described or read, Then it says so', async () => {
    const s = setup([], {}, [], null)
    expect(await s.describe()).toEqual({ status: 'no-home' })
    expect(await s.read()).toBeNull()
  })

  it('[LAY-005] Given a home folder laid out its own way, When described, Then each part reads what is there now and the suggestion offers the better folders', async () => {
    const answer = await setup([folder('Lights', lights), folder('stacked', ['Stacked_1.fit']), folder('Final', ['m31.png'])]).describe()
    if (answer.status !== 'ok') throw new Error('expected a layout')
    expect(answer.home).toBe(HOME)
    expect(answer.current.raw).toEqual({ path: `${HOME}/raw`, source: 'missing' })
    expect(answer.current.stacked).toEqual({ path: `${HOME}/stacked`, source: 'named' })
    expect(answer.suggestion.roles.map(r => r.name)).toEqual(['Lights', 'stacked', 'Final'])
    expect(answer.changes.map(c => [c.role, c.path])).toEqual([['raw', `${HOME}/Lights`], ['images', `${HOME}/Final`]])
  })

  it('[LAY-005] Given a part the user chose, When described, Then the suggestion never offers to change it', async () => {
    const answer = await setup([folder('Lights', lights)], { raw: 'E:/Subs' }, ['E:/Subs']).describe()
    if (answer.status !== 'ok') throw new Error('expected a layout')
    expect(answer.current.raw).toEqual({ path: 'E:/Subs', source: 'chosen' })
    expect(answer.changes).toEqual([])
  })
})

describe('choosing the library layout', () => {
  it('[LAY-004] Given readable folders, When chosen, Then they are saved and read from then on', async () => {
    const s = setup([folder('Lights', lights), folder('Masters')], {}, ['E:/Final'])
    expect(await s.choose({ raw: `${HOME}/Lights`, images: ' E:/Final ' })).toEqual({ saved: true })
    expect(await s.store.chosen()).toEqual({ raw: `${HOME}/Lights`, stacked: null, tif: null, images: 'E:/Final' })
    expect((await s.read())!.layout.raw).toEqual({ path: `${HOME}/Lights`, source: 'chosen' })
  })

  it('[LAY-004] Given a chosen folder cleared, When saved, Then the part reads its conventional folder again', async () => {
    const s = setup([folder('Lights', lights), folder('raw')], { raw: `${HOME}/Lights` })
    expect(await s.choose({ raw: '' })).toEqual({ saved: true })
    expect((await s.read())!.layout.raw).toEqual({ path: `${HOME}/raw`, source: 'named' })
  })

  it('[LAY-006] Given a folder that is not there, When chosen, Then it is refused and nothing is saved', async () => {
    const s = setup([folder('Lights', lights)])
    expect(await s.choose({ raw: 'Z:/gone' })).toEqual({ saved: false, problems: ['Z:/gone is not a folder that can be read.'] })
    expect((await s.store.chosen()).raw).toBeNull()
  })

  it('[LAY-006] Given a part chosen inside a folder another part already reads, When chosen, Then it is refused', async () => {
    const s = setup([folder('raw'), folder('stacked')], {}, [`${HOME}/raw/stacks`])
    expect(await s.choose({ stacked: `${HOME}/raw/stacks` })).toEqual({ saved: false, problems: ['Stacked masters are inside the folder for raw frames.'] })
    expect((await s.store.chosen()).stacked).toBeNull()
  })

  it('[LAY-006] Given a chosen folder cleared back to a conventional folder another part reads, When saved, Then it is refused', async () => {
    const s = setup([folder('raw'), folder('Masters')], { stacked: `${HOME}/Masters` })
    await s.choose({ raw: `${HOME}/Masters`, stacked: null }).then(r => expect(r).toEqual({ saved: true }))
    expect(await s.choose({ raw: null, stacked: `${HOME}/raw` })).toEqual({ saved: false, problems: ['Raw frames and stacked masters are the same folder.'] })
  })

  it('[LAY-006] Given a part whose conventional folder is not there, When another part is chosen over it, Then nothing clashes with the missing folder', async () => {
    const s = setup([folder('Everything', lights)])
    expect(await s.choose({ raw: HOME })).toEqual({ saved: false, problems: [`${HOME} is not a folder that can be read.`] })
    const t = setup([folder('Everything', lights)], {}, [HOME])
    expect(await t.choose({ raw: HOME })).toEqual({ saved: true })
  })

  it('[LAY-006] Given no home folder, When a layout is chosen, Then it is refused', async () => {
    expect(await setup([], {}, [], null).choose({ raw: 'E:/x' })).toEqual({ saved: false, problems: ['Choose the home folder first.'] })
  })
})
