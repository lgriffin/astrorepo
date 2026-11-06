import {
  LIBRARY_ROLES,
  layoutProblems,
  resolveLayout,
  suggestLayout,
  suggestedChanges,
  type FolderSource,
  type LayoutSuggestion,
  type LibraryRole,
  type RoleSuggestion
} from '@astro/domain'
import type { LibraryFolders, LibraryLayoutStore } from '../ports/library-layout'

export interface LibraryLayoutDeps {
  store: LibraryLayoutStore
  folders: LibraryFolders
}

export type LibraryLayout = Record<LibraryRole, { path: string; source: FolderSource }>

export type LibraryLayoutAnswer =
  | { status: 'no-home' }
  | {
      status: 'ok'
      home: string
      /** The folder each part reads now. */
      current: LibraryLayout
      suggestion: LayoutSuggestion
      /** The parts the suggestion would change; never one the user chose (LAY-005). */
      changes: RoleSuggestion[]
    }

/** Which folder each part reads now (LAY-001, LAY-004). Null when no home folder is set. */
export function makeReadLibraryLayout(deps: LibraryLayoutDeps): () => Promise<{ home: string; layout: LibraryLayout } | null> {
  return async () => {
    const home = await deps.store.home()
    if (!home) return null
    const [chosen, names] = await Promise.all([deps.store.chosen(), deps.folders.names(home)])
    return { home, layout: resolveLayout(chosen, names, name => deps.folders.join(home, name)) }
  }
}

/**
 * The library layout and a suggestion for it (LAY-002 to LAY-005): what each part reads now, and
 * which folder under the home folder looks like each part, by its name and the files inside it.
 */
export function makeDescribeLibraryLayout(deps: LibraryLayoutDeps): () => Promise<LibraryLayoutAnswer> {
  const read = makeReadLibraryLayout(deps)
  return async () => {
    const now = await read()
    if (!now) return { status: 'no-home' }
    const suggestion = suggestLayout(await deps.folders.survey(now.home))
    return { status: 'ok', home: now.home, current: now.layout, suggestion, changes: suggestedChanges(now.layout, suggestion) }
  }
}

export type ChooseLayoutAnswer = { saved: true } | { saved: false; problems: string[] }

/**
 * Saves the folders the user chose (LAY-006): each must be a folder that can be read, and no two
 * parts may share a folder or sit one inside the other, counting the parts left as they are.
 */
export function makeChooseLibraryLayout(deps: LibraryLayoutDeps): (layout: Partial<Record<LibraryRole, string | null>>) => Promise<ChooseLayoutAnswer> {
  const read = makeReadLibraryLayout(deps)
  return async layout => {
    const now = await read()
    if (!now) return { saved: false, problems: ['Choose the home folder first.'] }
    const problems: string[] = []
    const conventional = resolveLayout({}, await deps.folders.names(now.home), name => deps.folders.join(now.home, name))
    const after: Partial<Record<LibraryRole, string | null>> = {}
    const saving: Partial<Record<LibraryRole, string | null>> = {}
    for (const role of LIBRARY_ROLES) {
      const given = layout[role]
      const typed = typeof given === 'string' ? given.trim() : given
      // Saved as the folder's one true path, so two spellings of one folder are seen to clash.
      const real = typed ? await deps.folders.folderAt(typed) : null
      if (typed && !real) problems.push(`${typed} is not a folder that can be read.`)
      const picked = typed ? real ?? typed : typed
      if (given !== undefined) saving[role] = picked || null
      // A part left out keeps its folder; a cleared one goes back to its conventional folder.
      // A folder that does not exist yet reads nothing, so it cannot clash.
      const kept = picked === undefined ? now.layout[role] : picked ? null : conventional[role]
      after[role] = picked || (kept && kept.source !== 'missing' ? kept.path : null)
    }
    problems.push(...layoutProblems(after))
    if (problems.length > 0) return { saved: false, problems }
    await deps.store.choose(saving)
    return { saved: true }
  }
}
