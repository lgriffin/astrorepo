/**
 * Which cards Home shows (specs/046-everyday-ux, EUX-001). Until the site is set, the cards worked
 * out from it (Tonight with its sky, Shoot tonight, Clear skies, Coming nights) would each say
 * "set your site"; Home leaves them out and asks once, in Get set up, or in a prompt of its own
 * when the checklist is hidden.
 */
export type HomeCard = 'site-prompt' | 'tonight' | 'shoot' | 'clear-skies' | 'coming-nights'

/** The parts of Home that need a site. */
export const SITE_CARDS: HomeCard[] = ['tonight', 'shoot', 'clear-skies', 'coming-nights']

/**
 * Whether the site is missing, from the answers Home reads: any one that says no site is enough,
 * any one worked out for a site rules it out, and null while none has answered.
 */
export function siteMissing(statuses: (string | null | undefined)[]): boolean | null {
  if (statuses.includes('no-site')) return true
  if (statuses.includes('ok')) return false
  return null
}

/**
 * The site-dependent cards Home shows. `missing` null (still loading) keeps them, so their loading
 * placeholders show; `setupShown` null (the checklist not read yet) shows no prompt rather than two.
 */
export function homeCards(missing: boolean | null, setupShown: boolean | null): HomeCard[] {
  if (missing !== true) return SITE_CARDS
  return setupShown === false ? ['site-prompt'] : []
}

/**
 * The cards Home folds behind its More line (EUX-020): the ones Leigh rarely uses, below what to
 * do tonight and what is ready to process. Hidden in your files stays out, since finding what the
 * files hold is what Home is for.
 */
export type FoldableCard = 'coming-nights' | 'plan-ahead' | 'targets' | 'other-checks'

/** In the order Home draws them, with the name each card goes by. */
export const FOLDABLE_CARDS: Array<{ card: FoldableCard; title: string }> = [
  { card: 'coming-nights', title: 'Coming nights' },
  { card: 'plan-ahead', title: 'Plan ahead' },
  { card: 'targets', title: 'Where your targets are' },
  { card: 'other-checks', title: 'Other checks' }
]

/** Where Home remembers, on this screen, that its More line is open. */
export const HOME_MORE_KEY = 'astrorepo.home.more'

/** Reads the remembered choice: folded unless this screen chose to show every card. */
export function moreOpen(saved: string | null): boolean {
  return saved === '1'
}

/**
 * Which of the cards Home has to show go behind the More line (EUX-020, EUX-021). `present` is
 * the foldable cards with something to show; `urgent` those holding a high-priority item, which
 * stay out so nothing urgent is folded away. Open, nothing is folded.
 */
export function foldedCards(open: boolean, present: FoldableCard[], urgent: FoldableCard[]): FoldableCard[] {
  if (open) return []
  return FOLDABLE_CARDS.map(c => c.card).filter(c => present.includes(c) && !urgent.includes(c))
}

/**
 * What the More line says, or null when there is nothing to fold or unfold. Folded, it names the
 * cards behind it; open, it offers to fold them again.
 */
export function moreLine(open: boolean, present: FoldableCard[], urgent: FoldableCard[]): string | null {
  const foldable = foldedCards(false, present, urgent)
  if (foldable.length === 0) return null
  if (open) return 'Show fewer cards'
  const names = foldable.map(c => FOLDABLE_CARDS.find(f => f.card === c)?.title ?? c)
  return `More: ${names.join(', ')}`
}
