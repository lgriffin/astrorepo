import { CONCEPTS, CONCEPT_THEMES, LEARNING_SOURCES, PRIMERS, lightYearsText, type Concept, type ConceptTheme, type ExplainedHeaders, type LearningSource, type ObjectNumbers, type ObjectPrimer, type FilterLight, type LookbackStop, type SetupNumbers, type TonightSky } from '@astro/domain'
import type { ConceptView, FilterLightView, LookbackStopView, FitsLearningView, FitsSetupView, TonightSkyView, LearningLibraryView, LearningSourceView, ObjectNumbersView, ObjectPrimerView } from '@shared/types'

/** A source as the page names it; its address stays here and is opened by id (LRN-005). */
const toSourceView = (s: LearningSource): LearningSourceView => ({ id: s.id, title: s.title, publisher: s.publisher })

const toConceptView = (c: Concept): ConceptView => ({ ...c, related: [...c.related], sources: [...c.sources] })

const toPrimerView = (p: ObjectPrimer): ObjectPrimerView => ({ ...p, concepts: [...p.concepts], sources: [...p.sources] })

/** The knowledge base for `learning:library` (specs/042-learning). */
export function toLearningLibraryView(
  concepts: readonly Concept[] = CONCEPTS,
  primers: Readonly<Record<string, ObjectPrimer>> = PRIMERS,
  sources: readonly LearningSource[] = LEARNING_SOURCES,
  themes: readonly ConceptTheme[] = CONCEPT_THEMES
): LearningLibraryView {
  return {
    concepts: concepts.map(toConceptView),
    themes: themes.map(t => ({ id: t.id, title: t.title, concepts: [...t.concepts] })),
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

/** One stop on the gallery's lookback strip (LRN-021). */
export function toLookbackStopView(stop: LookbackStop): LookbackStopView {
  const n = stop.numbers
  return {
    designation: n.designation,
    distance: `about ${lightYearsText(n.distanceLy)} light years`,
    travel: `${lightYearsText(n.travelYears)} years`,
    lookback: n.lookback.text,
    paths: [...stop.paths],
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

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-28" as "28 Oct". */
const dayText = (date: string): string => {
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MONTH_NAMES[m - 1]}`
}

/** "53.3° N", "33.9° S". */
export const latitudeText = (deg: number): string => `${Math.abs(deg).toFixed(1)}° ${deg < 0 ? 'S' : 'N'}`

/** Why tonight is as dark as it is, in words (LRN-015, LRN-016). */
export function toTonightSkyView(t: TonightSky): TonightSkyView {
  const where = `At ${latitudeText(t.latitudeDeg)} on ${dayText(t.night)}`
  // Short of full darkness the depth is rounded down, so 17.7° never reads as the 18° it falls short of.
  const depth = t.darkness === 'full' ? Math.round(t.lowestSunDeg) : Math.floor(t.lowestSunDeg)
  const text =
    t.lowestSunDeg < 0
      ? `${where}, the Sun stays above your horizon all night: the midnight sun.`
      : t.darkness === 'full'
        ? `${where}, the Sun sinks to about ${depth}° below your horizon at its lowest, past the 18° that full darkness needs.`
        : t.darkness === 'nautical'
          ? `${where}, the Sun gets only about ${depth}° below your horizon at its lowest, short of the 18° that full darkness needs: the sky reaches astronomical twilight but never full darkness.`
          : t.darkness === 'civil'
            ? `${where}, the Sun gets only about ${depth}° below your horizon at its lowest, so the sky gets no darker than nautical twilight.`
            : `${where}, the Sun gets only about ${depth}° below your horizon at its lowest, so civil twilight lasts all night.`
  const change = t.fullDarkReturns
    ? `Fully dark nights return around ${dayText(t.fullDarkReturns)}.`
    : t.fullDarkEnds
      ? `Nights stay fully dark until around ${dayText(t.fullDarkEnds)}.`
      : null
  return { darkness: t.darkness, text, change }
}

/** What one filter catches, for `learning:filters` (LRN-018); unknown filters never reach here. */
export function toFilterLightView(f: FilterLight): FilterLightView {
  return {
    filter: f.filter,
    kind: f.kind as FilterLightView['kind'],
    passes: f.passes,
    lines: f.lines.map(l => ({ name: l.name, nm: l.nm, colour: l.colour, origin: l.origin, concept: l.concept })),
    concept: f.concept
  }
}

