import { describe, expect, it } from 'vitest'
import type { LibraryLayoutAnswer } from '@astro/application'
import { LIBRARY_ROLES, LIBRARY_ROLE_LABELS, LIBRARY_ROLE_NAMES, resolveLayout, suggestLayout, suggestedChanges, type FolderSample } from '@astro/domain'
import { toLibraryLayoutView } from '../../src/main/adapters/library-layout-presenter'
import { LIBRARY_PARTS, LIBRARY_PART_HINTS, LIBRARY_PART_LABELS, LIBRARY_PART_NAMES, suggestedLayout } from '../../src/shared/library-layout'

const HOME = 'D:/Astro'
const folder = (name: string, files: string[] = [], isObject = false): FolderSample => ({ name, path: `${HOME}/${name}`, files, objectFolders: 0, isObject })

function answer(folders: FolderSample[], chosen = {}): LibraryLayoutAnswer {
  const current = resolveLayout(chosen, folders.map(f => f.name), n => `${HOME}/${n}`)
  const suggestion = suggestLayout(folders)
  return { status: 'ok', home: HOME, current, suggestion, changes: suggestedChanges(current, suggestion) }
}

describe('library layout view', () => {
  it('[LAY-001] Given the parts, When the window lists them, Then they match the domain', () => {
    expect([...LIBRARY_PARTS]).toEqual([...LIBRARY_ROLES])
    expect(LIBRARY_PART_LABELS).toEqual(LIBRARY_ROLE_LABELS)
    expect(LIBRARY_PART_NAMES).toEqual(LIBRARY_ROLE_NAMES)
    expect(Object.keys(LIBRARY_PART_HINTS)).toEqual([...LIBRARY_ROLES])
  })

  it('[LAY-001] Given no home folder, When shown, Then it says so', () => {
    expect(toLibraryLayoutView({ status: 'no-home' })).toEqual({ status: 'no-home' })
  })

  it('[LAY-005] Given a layout the suggestion would change, When shown, Then each part says what it reads, the suggestion and its reasons, and taking it changes only those parts', () => {
    const view = toLibraryLayoutView(answer([folder('Lights', ['Light_1.fit', 'Light_2.fit']), folder('stacked'), folder('Final', ['a.png']), folder('Darks')]))
    if (view.status !== 'ok') throw new Error('expected a layout')
    expect(view.parts.map(p => [p.part, p.source, p.change])).toEqual([['raw', 'missing', true], ['stacked', 'named', false], ['tif', 'missing', false], ['images', 'missing', true]])
    expect(view.parts[0]).toMatchObject({ label: 'Raw frames', hint: LIBRARY_PART_HINTS.raw, path: `${HOME}/raw`, suggestion: { path: `${HOME}/Lights`, name: 'Lights', basis: 'name' } })
    expect(view.parts[0].suggestion!.reasons).toEqual(['It is called Lights.', 'Light frames: 2 of 2 files looked at.'])
    expect(view.parts[2].suggestion).toBeNull()
    expect(view.changes).toBe(2)
    expect(view.summary).toBe('2 parts of your library would be better read from another folder. The reasons are below.')
    expect(view.unused).toEqual(['Darks'])
    expect(suggestedLayout(view)).toEqual({ raw: `${HOME}/Lights`, images: `${HOME}/Final` })
  })

  it('[LAY-005] Given one change, When summed up, Then it says one part', () => {
    const view = toLibraryLayoutView(answer([folder('Lights', ['Light_1.fit']), folder('stacked'), folder('tif'), folder('images')]))
    expect(view.status === 'ok' && view.summary).toBe('One part of your library would be better read from another folder. The reasons are below.')
  })

  it('[LAY-005] Given parts nothing looks like, When summed up, Then it names them', () => {
    const view = toLibraryLayoutView(answer([folder('raw'), folder('stacked')]))
    expect(view.status === 'ok' && view.summary).toBe('Nothing in your home folder looks like TIFF exports or finished pictures.')
  })

  it('[LAY-005] Given every part in its folder, When summed up, Then it says so', () => {
    const view = toLibraryLayoutView(answer([folder('raw'), folder('stacked'), folder('tif'), folder('images')]))
    expect(view.status === 'ok' && [view.summary, view.changes]).toEqual(['Every part of your library has its folder.', 0])
  })

  it('[LAY-007] Given a home folder filed by target, When shown, Then it says so', () => {
    const view = toLibraryLayoutView(answer([folder('M 31', [], true), folder('M 42', [], true), folder('raw')]))
    expect(view.status === 'ok' && view.byTarget).toBe(true)
  })
})
