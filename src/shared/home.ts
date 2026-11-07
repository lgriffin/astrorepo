/**
 * Which cards Home shows (specs/046-everyday-ux, EUX-001). Until the site is set, the cards worked
 * out from it (Tonight, Tonight's sky, Shoot tonight, Clear skies, Coming nights) would each say
 * "set your site"; Home leaves them out and asks once, in Get set up, or in a prompt of its own
 * when the checklist is hidden.
 */
export type HomeCard = 'site-prompt' | 'tonight' | 'sky' | 'shoot' | 'clear-skies' | 'coming-nights'

/** The parts of Home that need a site. */
export const SITE_CARDS: HomeCard[] = ['tonight', 'sky', 'shoot', 'clear-skies', 'coming-nights']

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
