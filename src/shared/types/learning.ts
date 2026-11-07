/** Learning astrophysics (spec 042). */
import type { LearningSourceView } from './experiments'

export interface ConceptView {
  id: string
  title: string
  short: string
  detail: string
  formula: string | null
  related: string[]
  sources: string[]
}

export interface ObjectPrimerView {
  kind: string
  title: string
  summary: string
  shines: string
  life: string
  inPicture: string
  imaging: string
  caution: string | null
  concepts: string[]
  sources: string[]
}

/** The whole knowledge base, read once per screen. */
export interface LearningLibraryView {
  concepts: ConceptView[]
  /** The Learn page's themes, each with its concepts in order (LRN-024). */
  themes: { id: string; title: string; concepts: string[] }[]
  primers: ObjectPrimerView[]
  sources: LearningSourceView[]
}

/** A target in numbers (specs/042-learning, L2), in words ready to show. */
export interface ObjectNumbersView {
  designation: string
  /** "about 2.5 million light years" */
  distance: string
  /** "2.4 to 2.7 million light years", when the source gives a range. */
  range: string | null
  approx: boolean
  /** "2.5 million years" */
  travel: string
  /** "about 190,000 light years across", when the catalogue gives an angular size. */
  size: string | null
  /** When the light set out, against a milestone or a calendar year. */
  lookback: string
  sources: string[]
}

/** One header keyword explained (specs/042-learning, L3, LRN-011). */
export interface FitsKeywordView {
  /** The keyword as the file writes it. */
  keyword: string
  meaning: string
  why: string
  concept: string | null
  /** True when the FITS standard defines it; false for a capture-software convention. */
  standard: boolean
}

/** The optics in a file's header, worked out (LRN-012), in words ready to show. */
export interface FitsSetupView {
  /** "400 mm focal length, 3.76 µm pixels" */
  inputs: string
  /** "1.94″ per pixel" */
  scale: string
  /** "1° 39′ × 1° 6′", when the frame's size is known. */
  field: string | null
  sampling: 'under' | 'matched' | 'over'
  /** What the sampling means against the seeing assumed. */
  samplingText: string
}

/** A file's header read for a learner (`learning:fits`). */
export interface FitsLearningView {
  keywords: FitsKeywordView[]
  setup: FitsSetupView | null
  /** "A plate solve measured 1.95″ per pixel.", when the file is solved. */
  solved: string | null
}

/** Why tonight is as dark as it is (specs/042-learning, L4), in words ready to show. */
export interface TonightSkyView {
  darkness: 'full' | 'nautical' | 'civil' | 'none'
  /** "At 53.3° N on 28 Oct, the Sun sinks to about 50° below your horizon at its lowest, …" */
  text: string
  /** When that changes: "Fully dark nights return around 12 Aug.", or null. */
  change: string | null
}

/** One object on the gallery's lookback strip (LRN-021). */
export interface LookbackStopView {
  designation: string
  /** "about 2.5 million light years" */
  distance: string
  /** "2.5 million years" */
  travel: string
  /** When the light set out, against a milestone or a calendar year. */
  lookback: string
  /** The pictures of it. */
  paths: string[]
  sources: string[]
}

/** What one filter catches (specs/042-learning, L5), in words ready to show. */
export interface FilterLightView {
  filter: string
  kind: 'narrowband' | 'dual-band' | 'luminance' | 'colour' | 'uv-ir-cut' | 'light-pollution'
  passes: string
  /** Each emission line it passes: "Hydrogen alpha (Hα), 656.3 nm, deep red". */
  lines: { name: string; nm: number; colour: string; origin: string; concept: string }[]
  concept: string | null
}
