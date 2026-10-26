import type { ClearSkiesView, ForwardPlanView, NightSkyView, PlanTargetView, Recommendation } from './types'

/** What Home leads with (specs/041-look-and-feel V3, LF-016): tonight's sky, dark and moon in one place. */
export interface TonightSummary {
  /** 'no-site' until the site is set; 'unknown' while neither the forecast nor the plan could be read. */
  state: 'no-site' | 'unknown' | 'ok'
  /** "Clear skies tonight", "Clear spells tonight", "Cloudy tonight", "No dark window tonight", else "Tonight". */
  headline: string
  verdict: NightSkyView['verdict'] | null
  /** How dark is known only from the plan; with the forecast alone it is null. */
  dark: { start: string; end: string; darkness: 'astronomical' | 'nautical' | null } | null
  /** The longest clear stretch, when the night has clear spells. */
  spell: { start: string; end: string } | null
  moonPercent: number | null
  moon: string | null
  /** Why the night is short, bright or empty, as the plan says it. */
  notes: string[]
  /** The best targets to shoot, best first. */
  picks: PlanTargetView[]
}

const HEADLINE: Record<NightSkyView['verdict'], string> = {
  clear: 'Clear skies tonight',
  'clear-spells': 'Clear spells tonight',
  cloudy: 'Cloudy tonight',
  'no-forecast': 'Tonight',
  'no-darkness': 'No dark window tonight'
}

/**
 * Tonight from the two answers Home already reads: the forecast's first night says whether it is
 * clear, the forward plan says when it is dark, how bright the moon is and what to shoot. Either may
 * be missing (still loading, failed, or the forecast switched off); the summary says what it can.
 */
export function tonightSummary(skies: ClearSkiesView | null, plan: ForwardPlanView | null, picks = 3): TonightSummary {
  if (skies?.status === 'no-site' || plan?.status === 'no-site') {
    return { state: 'no-site', headline: 'Set your site to see tonight', verdict: null, dark: null, spell: null, moonPercent: null, moon: null, notes: [], picks: [] }
  }
  const tonight = plan?.status === 'ok' ? plan.tonight : null
  const planned = plan?.status === 'ok'
  // The two answers each work out tonight from their own clock, so near dawn they can name different
  // nights; only the forecast for the plan's night is read with it, never another night's sky.
  const nights = skies?.status === 'ok' ? skies.nights : []
  const night = tonight ? nights.find(n => n.night === tonight.night) ?? null : planned ? null : nights[0] ?? null

  if (!night && !planned) {
    return { state: 'unknown', headline: 'Tonight', verdict: null, dark: null, spell: null, moonPercent: null, moon: null, notes: [], picks: [] }
  }

  // The plan knows the dark window even with the forecast off; with no dark window the sky does not matter.
  const verdict: NightSkyView['verdict'] | null = planned && !tonight ? 'no-darkness' : night?.verdict ?? null
  const dark = tonight
    ? { start: tonight.darkStart, end: tonight.darkEnd, darkness: tonight.darkness }
    : !planned && night?.darkStart && night.darkEnd
      ? { start: night.darkStart, end: night.darkEnd, darkness: null }
      : null
  return {
    state: 'ok',
    headline: verdict ? HEADLINE[verdict] : 'Tonight',
    verdict,
    dark,
    spell: night?.spellStart && night.spellEnd && verdict === 'clear-spells' ? { start: night.spellStart, end: night.spellEnd } : null,
    moonPercent: tonight?.moonPercent ?? null,
    moon: tonight ? tonight.moonSummary.charAt(0).toUpperCase() + tonight.moonSummary.slice(1) : null,
    notes: [
      planned && !tonight ? 'The sun does not get 12° below the horizon tonight, so there is no dark window.' : null,
      tonight?.darknessNote,
      tonight?.moonNote,
      tonight && tonight.choices.length === 0 && !tonight.moonNote ? 'None of your targets with work left is up for an hour tonight.' : null,
      verdict === 'no-forecast' ? 'There is no forecast for tonight yet, so the sky is not judged.' : null
    ].filter((n): n is string => !!n),
    picks: verdict === 'cloudy' || verdict === 'no-darkness' ? [] : (tonight?.choices ?? []).slice(0, picks)
  }
}

/**
 * The lit part of the moon's disc as an SVG path in a box of `r` radius centred on (r, r): the
 * outer limb a half circle, the terminator a half ellipse whose width follows the lit fraction.
 * Waxing or waning is not known here, so the lit side is always drawn on the right.
 */
export function moonPath(percent: number, r: number): string {
  const lit = Math.min(100, Math.max(0, percent)) / 100
  if (lit <= 0) return ''
  const rx = Math.abs(1 - 2 * lit) * r
  // Back up from the bottom: through the right (a crescent) under half lit, through the left over half.
  const sweep = lit > 0.5 ? 1 : 0
  const fmt = (n: number) => Number(n.toFixed(3))
  return `M ${r} 0 A ${r} ${r} 0 0 1 ${r} ${fmt(2 * r)} A ${fmt(rx)} ${r} 0 0 ${sweep} ${r} 0 Z`
}

/**
 * Home's next actions in its two lists (LF-017): captures for tonight under Shoot tonight, the rest
 * under Ready to process. A mosaic tile without lights is planned for whichever coming night it is
 * up, not known to be up tonight, so it waits under Plan ahead.
 */
export function splitHomeActions(actions: Recommendation[]): { shoot: Recommendation[]; ahead: Recommendation[]; process: Recommendation[] } {
  const capture = actions.filter(r => r.category === 'capture')
  const later = (r: Recommendation) => r.id.startsWith('mosaic-tile:')
  return {
    shoot: capture.filter(r => !later(r)),
    ahead: capture.filter(later),
    process: actions.filter(r => r.category !== 'capture')
  }
}
