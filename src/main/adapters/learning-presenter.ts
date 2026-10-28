import { CONCEPTS, LEARNING_SOURCES, PRIMERS, lightYearsText, type Concept, type ExplainedHeaders, type LearningSource, type ObjectNumbers, type ObjectPrimer, type SetupNumbers } from '@astro/domain'
import type { ConceptView, FitsLearningView, FitsSetupView, LearningLibraryView, LearningSourceView, ObjectNumbersView, ObjectPrimerView } from '@shared/types'

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

/** A number with no more decimals than it needs: 400, 3.76, 0.5. */
const plain = (n: number, places: number): string => String(Number(n.toFixed(places)))

/** An angle in arcminutes as the sky is usually described: 48′ below two degrees, 2° 6′ above. */
export function angleText(arcmin: number): string {
  const whole = Math.round(arcmin)
  if (whole < 120) return `${whole}′`
  const degrees = Math.floor(whole / 60)
  const rest = whole % 60
  return rest === 0 ? `${degrees}°` : `${degrees}° ${rest}′`
}

const SAMPLING_TEXT: Record<SetupNumbers['sampling'], string> = {
  under: 'Under-sampled: fewer than two pixels span a star’s blur, so stars can look square and fine detail is lost.',
  matched: 'Well matched: two to three pixels span a star’s blur, enough to record what the air lets through.',
  over: 'Over-sampled: more than three pixels span a star’s blur, spreading its light thinner for no extra detail.'
}

function toSetupView(s: SetupNumbers): FitsSetupView {
  return {
    inputs: `${plain(s.focalMm, 1)} mm focal length, ${plain(s.pixelUm, 2)} µm pixels`,
    scale: `${s.scaleArcsec.toFixed(2)}″ per pixel`,
    field: s.fieldArcmin ? `${angleText(s.fieldArcmin.width)} × ${angleText(s.fieldArcmin.height)}` : null,
    sampling: s.sampling,
    samplingText: `${SAMPLING_TEXT[s.sampling]} (Against ${plain(s.seeingArcsec, 1)}″ seeing, typical at an amateur site.)`
  }
}

/** A file's header read for a learner, in words (LRN-011, LRN-012). */
export function toFitsLearningView(e: ExplainedHeaders): FitsLearningView {
  return {
    keywords: e.keywords.map(k => ({ keyword: k.keyword, meaning: k.entry.meaning, why: k.entry.why, concept: k.entry.concept, standard: k.entry.standard })),
    setup: e.setup ? toSetupView(e.setup) : null,
    solved: e.solvedScaleArcsec === null ? null : `A plate solve measured ${e.solvedScaleArcsec.toFixed(2)}″ per pixel.`
  }
}
