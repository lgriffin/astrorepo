import { CONCEPTS, LEARNING_SOURCES, PRIMERS, type Concept, type LearningSource, type ObjectPrimer } from '@astro/domain'
import type { ConceptView, LearningLibraryView, LearningSourceView, ObjectPrimerView } from '@shared/types'

/** A source as the page names it; its address stays here and is opened by id (LRN-005). */
const toSourceView = (s: LearningSource): LearningSourceView => ({ id: s.id, title: s.title, publisher: s.publisher })

const toConceptView = (c: Concept): ConceptView => ({ ...c, related: [...c.related], sources: [...c.sources] })

const toPrimerView = (p: ObjectPrimer): ObjectPrimerView => ({ ...p, concepts: [...p.concepts], sources: [...p.sources] })

/** The knowledge base for `learning:library` (specs/042-learning). */
export function toLearningLibraryView(
  concepts: readonly Concept[] = CONCEPTS,
  primers: Readonly<Record<string, ObjectPrimer>> = PRIMERS,
  sources: readonly LearningSource[] = LEARNING_SOURCES
): LearningLibraryView {
  return {
    concepts: concepts.map(toConceptView),
    primers: Object.values(primers).map(toPrimerView),
    sources: sources.map(toSourceView)
  }
}
