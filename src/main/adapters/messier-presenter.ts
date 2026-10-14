import type { MessierMonth, MessierMosaic, MessierTile, TileDrawing } from '@astro/application'
import { MESSIER_FILTERS, showsUnder, type MessierOutlook, type MessierState } from '@astro/domain'
import type { MessierMonthView, MessierMosaicView, MessierOutlookView, MessierPictureView, MessierTileView } from '@shared/types'
import { formatDuration, plural } from './stacking-suggestion-presenter'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "March" from "2027-03". */
export const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? month

const STATE_LABEL: Record<MessierState, string> = {
  imaged: 'Imaged',
  stacked: 'Stacked, not finished',
  captured: 'Captured, not stacked',
  gap: 'Not captured yet'
}

/** "Globular cluster" from "globular_cluster". */
export function objectTypeLabel(type: string): string {
  const words = type.replace(/[_-]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1).toLowerCase() : 'Unknown type'
}

const hours = (h: number) => formatDuration(Math.round(h * 3600))

/** The words for when an object can be shot (MES-005). */
export function toOutlookView(o: MessierOutlook): MessierOutlookView {
  switch (o.kind) {
    case 'tonight': {
      const parts = [`Up for ${hours(o.hours)} above 30° tonight.`]
      parts.push(o.moonSeparationDeg === null ? 'The moon is down while it is up.' : `The moon comes within ${o.moonSeparationDeg}°.`)
      if (o.closesInDays !== null) parts.push(`Its season closes in ${plural(o.closesInDays, 'day')}.`)
      return { kind: 'tonight', short: `Up tonight · ${hours(o.hours)}`, long: parts.join(' ') }
    }
    case 'moon':
      return {
        kind: 'moon',
        short: 'Up tonight, moon too bright',
        long: `Up for ${hours(o.hours)} above 30° tonight, but the moon is too bright for it. A dark night suits it better, or a dual-band filter for a nebula.`
      }
    case 'later':
      return {
        kind: 'later',
        short: o.fromMonth === o.bestMonth ? `Best in ${monthName(o.bestMonth).slice(0, 3)}` : `From ${monthName(o.fromMonth).slice(0, 3)}, best ${monthName(o.bestMonth).slice(0, 3)}`,
        long: o.fromMonth === o.bestMonth ? `In season in ${monthName(o.bestMonth)}.` : `In season from ${monthName(o.fromMonth)}, best in ${monthName(o.bestMonth)}.`
      }
    default:
      return { kind: 'never', short: 'Too low from your site', long: 'It never clears 30° for an hour of darkness from your site in the next 12 months.' }
  }
}

function toMonthView(m: MessierMonth): MessierMonthView {
  return { month: m.month, label: monthName(m.month).slice(0, 3), hoursPerNight: m.hoursPerNight, inSeason: m.inSeason }
}

export function toMessierTileView(t: MessierTile): MessierTileView {
  return {
    number: t.number,
    designation: t.designation,
    name: t.name,
    targetId: t.targetId,
    objectType: objectTypeLabel(t.objectType),
    constellation: t.constellation,
    magnitude: t.magnitude,
    state: t.state,
    stateLabel: STATE_LABEL[t.state],
    integration: t.integrationSec > 0 ? formatDuration(t.integrationSec) : null,
    picture: t.picture,
    outlook: t.outlook ? toOutlookView(t.outlook) : null,
    months: t.months.map(toMonthView),
    shows: MESSIER_FILTERS.filter(f => showsUnder(f, t))
  }
}

export function toMessierMosaicView(m: MessierMosaic): MessierMosaicView {
  return { night: m.night, siteSet: m.siteSet, catalogued: m.catalogued, summary: m.summary, tiles: m.tiles.map(toMessierTileView) }
}

/** A drawn picture as a data URL the window shows as it is. */
export function toMessierPictureView(d: TileDrawing | null): MessierPictureView {
  if (!d) return null
  if (!d.ok) return { ok: false, error: d.error }
  return { ok: true, src: `data:${d.mime};base64,${Buffer.from(d.data).toString('base64')}`, width: d.width, height: d.height, name: d.name, kind: d.kind }
}
