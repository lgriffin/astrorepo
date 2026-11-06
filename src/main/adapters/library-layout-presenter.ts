import type { LibraryLayoutAnswer } from '@astro/application'
import { LIBRARY_ROLES, LIBRARY_ROLE_LABELS, LIBRARY_ROLE_NAMES } from '@astro/domain'
import { LIBRARY_PART_HINTS, type LibraryLayoutView } from '@shared/library-layout'

/** The layout and its suggestion for Settings → Folders and Library (specs/044-library-layout). */
export function toLibraryLayoutView(answer: LibraryLayoutAnswer): LibraryLayoutView {
  if (answer.status === 'no-home') return { status: 'no-home' }
  const changed = new Set(answer.changes.map(c => c.role))
  const parts = LIBRARY_ROLES.map(role => {
    const s = answer.suggestion.roles.find(r => r.role === role) ?? null
    return {
      part: role,
      label: LIBRARY_ROLE_LABELS[role],
      hint: LIBRARY_PART_HINTS[role],
      path: answer.current[role].path,
      source: answer.current[role].source,
      suggestion: s && { path: s.path, name: s.name, basis: s.basis, reasons: s.reasons },
      change: changed.has(role)
    }
  })
  const missing = parts.filter(p => p.source === 'missing' && !p.change).map(p => LIBRARY_ROLE_NAMES[p.part])
  const summary = answer.changes.length > 0
    ? `${answer.changes.length === 1 ? 'One part' : `${answer.changes.length} parts`} of your library would be better read from another folder. The reasons are below.`
    : missing.length > 0
      ? `Nothing in your home folder looks like ${missing.join(' or ')}.`
      : 'Every part of your library has its folder.'
  return { status: 'ok', home: answer.home, parts, changes: answer.changes.length, unused: answer.suggestion.unused, byTarget: answer.suggestion.byTarget, summary }
}
