import path from 'path'
import type { GalleryEntry, GalleryListing, ObjectPanel, PictureDetails, PictureRead } from '@astro/application'
import { formatDec, formatRa, MONTH_NAMES, objectTypeLabel } from '@astro/domain'
import type { GalleryDetailsView, GalleryObjectView, GalleryPictureData, GalleryPictureView, GalleryView } from '@shared/types'
import { formatBytes } from './discovery-presenter'
import { formatDuration } from './stacking-suggestion-presenter'

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "1 Oct 2026", by the calendar of the PC the app runs on. */
export function savedDay(at: Date): string {
  return `${at.getDate()} ${SHORT_MONTHS[at.getMonth()]} ${at.getFullYear()}`
}

export function toPictureView(p: GalleryEntry): GalleryPictureView {
  return {
    path: p.path,
    name: p.name,
    folder: p.folders.join(' / '),
    folderPath: path.dirname(p.path),
    size: formatBytes(p.sizeBytes),
    savedAt: p.modifiedAt?.toISOString() ?? null,
    saved: p.modifiedAt ? savedDay(p.modifiedAt) : null,
    objects: p.objects.map(o => ({ id: o.objectId, label: o.label, designations: [...o.designations] }))
  }
}

export function toGalleryView(listing: GalleryListing): GalleryView {
  return { root: listing.root, pictures: listing.pictures.map(toPictureView) }
}

/** "Highest at midnight in September." (GAL-007) */
export function bestPlacedText(month: number | null): string | null {
  return month === null ? null : `Highest at midnight in ${MONTH_NAMES[month]}.`
}

/** "Climbs to 78° from your site." or "Never rises from your site." (GAL-007) */
export function fromSiteText(altitudeDeg: number | null): string | null {
  if (altitudeDeg === null) return null
  if (altitudeDeg <= 0) return 'Never rises from your site.'
  if (altitudeDeg < 20) return `Climbs only to ${Math.round(altitudeDeg)}° from your site, low in the murk.`
  return `Climbs to ${Math.round(altitudeDeg)}° from your site.`
}

function toObjectView(o: ObjectPanel, hasSite: boolean): GalleryObjectView {
  const f = o.facts
  const facts: { label: string; value: string }[] = [{ label: 'Type', value: objectTypeLabel(f.objectType) }]
  if (f.constellation) facts.push({ label: 'Constellation', value: f.constellation })
  if (f.magnitude !== null) facts.push({ label: 'Magnitude', value: String(Number(f.magnitude.toFixed(1))) })
  if (f.sizeArcmin !== null && f.sizeArcmin > 0) facts.push({ label: 'Size', value: f.sizeArcmin >= 60 ? `${Number((f.sizeArcmin / 60).toFixed(1))}°` : `${Number(f.sizeArcmin.toFixed(1))}′` })
  if (f.raHours !== null && f.decDeg !== null) facts.push({ label: 'Position', value: `${formatRa(f.raHours * 15)}, ${formatDec(f.decDeg)}` })
  if (f.aliases.length > 0) facts.push({ label: 'Also known as', value: f.aliases.join(', ') })
  const d = f.data
  const data =
    d.lightFrames === 0
      ? [{ label: 'Stage', value: objectTypeLabel(f.stage) }, ...(d.masters > 0 ? [{ label: 'Masters', value: String(d.masters) }] : [])]
      : [
          { label: 'Light frames', value: d.lightFrames.toLocaleString('en-GB') },
          { label: 'Integration', value: formatDuration(d.integrationSec) },
          { label: 'Nights', value: d.lastNight ? `${d.nights}, last on ${d.lastNight}` : String(d.nights) },
          { label: 'Masters', value: String(d.masters) },
          { label: 'Stage', value: objectTypeLabel(f.stage) }
        ]
  return {
    id: f.id,
    name: f.name,
    designations: f.designations.join(', '),
    matched: o.matched,
    summary: o.summary,
    description: f.description,
    facts,
    bestPlaced: bestPlacedText(o.bestMonth),
    fromSite: fromSiteText(o.highestAltitudeDeg),
    needsSite: !hasSite && f.decDeg !== null,
    filterHint: o.narrowband ? `${objectTypeLabel(f.objectType)}: a dual-band or narrowband filter suits it, even under a bright moon.` : null,
    data,
    noData: d.lightFrames === 0,
    hasMosaicPlan: d.hasMosaicPlan,
    collections: f.collections
  }
}

/** The side panel (GAL-005 to GAL-010). */
export function toDetailsView(details: PictureDetails): GalleryDetailsView {
  const picture = toPictureView(details.picture)
  const nearest = details.picture.folders[details.picture.folders.length - 1]
  const readFrom =
    details.readFrom === 'file' ? 'Read from the file name.' : details.readFrom === 'folder' ? `Read from the folder it is in${nearest ? `, ${details.picture.folders.join(' / ')}` : ''}.` : null
  return { picture, readFrom, objects: details.objects.map(o => toObjectView(o, details.hasSite)), unknown: details.unknown }
}

/** A picture as a data URL the window can draw, or why it cannot be read (GAL-013). */
export function toPictureData(read: PictureRead): GalleryPictureData {
  return read.ok ? { ok: true, src: `data:${read.mime};base64,${read.data}`, width: read.width, height: read.height } : { ok: false, error: read.error }
}
