import { CONCEPTS, LEARNING_SOURCES, PRIMERS, lightYearsText, type Concept, type LearningSource, type ObjectNumbers, type ObjectPrimer } from '@astro/domain'
import type { ConceptView, LearningLibraryView, LearningSourceView, ObjectNumbersView, ObjectPrimerView } from '@shared/types'

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

/** "2.4 million" before "2.6 million" reads "2.4": the scale word is said once, at the end. */
function sharedScale(low: string, high: string): string {
  const scale = /\s(million|billion)$/.exec(low)?.[1]
  return scale && high.endsWith(` ${scale}`) ? low.slice(0, -scale.length - 1) : low
}

/** A target in numbers, in words (LRN-008 to LRN-010); null when no published distance is held for it. */
export function toObjectNumbersView(n: ObjectNumbers | null): ObjectNumbersView | null {
  if (!n) return null
  const low = lightYearsText(n.lowLy)
  const high = lightYearsText(n.highLy)
  return {
    designation: n.designation,
    distance: `about ${lightYearsText(n.distanceLy)} light years`,
    range: low === high ? null : `${sharedScale(low, high)} to ${high} light years`,
    approx: n.approx,
    travel: `${lightYearsText(n.travelYears)} years`,
    size: n.sizeLy === null ? null : `about ${lightYearsText(n.sizeLy)} light years across`,
    lookback: n.lookback.text,
    sources: [...n.sources]
  }
}
