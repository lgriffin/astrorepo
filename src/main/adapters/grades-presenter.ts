import type { TargetGrades } from '@astro/application'
import type { FrameGrade } from '@astro/domain'
import type { FrameGradeView, GradesView } from '@shared/types'
import { plural } from './stacking-suggestion-presenter'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const round = (n: number | null | undefined, places: number) => (n === null || n === undefined ? null : Math.round(n * 10 ** places) / 10 ** places)

/** "2026-01-10" as "10 Jan 2026"; anything else as it is. */
export function nightLabel(night: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(night)
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : night
}

function toFrame(g: FrameGrade): FrameGradeView {
  const m = g.measurement
  return {
    fileId: g.fileId,
    fileName: g.path.split(/[\\/]/).pop() ?? g.path,
    path: g.path,
    capturedAt: g.capturedAt?.toISOString() ?? null,
    verdict: g.verdict,
    override: g.override,
    fwhm: round(m?.fwhm, 2),
    eccentricity: round(m?.eccentricity, 2),
    stars: m ? m.starCount : null,
    background: round(m?.background, 1),
    snr: round(m?.snr, 1),
    weight: g.weight,
    reasons: g.reasons
  }
}

export function toGradesView(report: TargetGrades): GradesView {
  const total = report.grades.length
  const summary =
    total === 0
      ? 'No light frames are indexed for this target yet.'
      : report.unmeasured === total
        ? `${plural(total, 'light')} not measured yet. Measure them to grade each one before stacking.`
        : `${plural(report.kept, 'light')} kept, ${report.rejected} rejected` +
          (report.unmeasured > 0 ? `, ${report.unmeasured} not measured (kept until they are)` : '') +
          '. Only kept lights go to Siril.'
  return {
    total,
    kept: report.kept,
    rejected: report.rejected,
    unmeasured: report.unmeasured,
    summary,
    limits: { ...report.limits },
    nights: report.nights.map(n => {
      const trend = report.grades
        .filter(g => (g.night ?? 'Unknown date') === n.night && g.filter === n.filter)
        .sort((a, b) => (a.capturedAt?.getTime() ?? 0) - (b.capturedAt?.getTime() ?? 0))
        .map(toFrame)
      return {
        key: `${n.night}|${n.filter ?? ''}`,
        label: [nightLabel(n.night), n.filter].filter(Boolean).join(' · '),
        frames: n.frames,
        kept: n.kept,
        rejected: n.rejected,
        medianFwhm: n.medianFwhm === null ? null : `${round(n.medianFwhm, 1)} px`,
        medianStars: n.medianStars === null ? null : String(Math.round(n.medianStars)),
        trend
      }
    })
  }
}
