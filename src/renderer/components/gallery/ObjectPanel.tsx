import React from 'react'
import { Link } from 'react-router-dom'
import { mosaicPlannerLink, settingsLink, targetLink, TARGET_TABS } from '@shared/navigation'
import type { GalleryObjectView } from '@shared/types'
import { invoke } from '../../hooks/useIPC'

function Rows({ rows }: { rows: { label: string; value: string }[] }): React.ReactElement {
  return (
    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map(r => (
        <React.Fragment key={r.label}>
          <dt className="text-astro-muted">{r.label}</dt>
          <dd className="text-astro-text">{r.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-semibold text-astro-muted uppercase tracking-wider">{title}</h4>
      {children}
    </div>
  )
}

const linkClass = 'text-xs text-astro-accent hover:underline'

/**
 * One catalogue object in a picture's side panel (GAL-005 to GAL-008): what it is, when it is best
 * placed, what the user has of it, and where to go next.
 */
export function ObjectPanel({ object, onLeave }: { object: GalleryObjectView; onLeave: () => void }): React.ReactElement {
  const openReference = (site: 'simbad' | 'wikipedia') => void invoke('gallery:open-reference', { object_id: object.id, site })
  const tabLabel = (id: (typeof TARGET_TABS)[number]['id']) => TARGET_TABS.find(t => t.id === id)?.label ?? id

  return (
    <article className="space-y-4">
      <header>
        <h3 className="text-lg font-semibold text-astro-text">{object.name}</h3>
        {object.designations && object.designations !== object.name && <p className="text-xs text-astro-muted">{object.designations}</p>}
        <p className="mt-2 text-sm text-astro-text">{object.summary}</p>
        {object.description && <p className="mt-1 text-sm text-astro-muted">{object.description}</p>}
      </header>

      <Section title="About">
        <Rows rows={object.facts} />
      </Section>

      <Section title="When to image it">
        <ul className="text-xs text-astro-text space-y-1">
          {object.bestPlaced && <li>{object.bestPlaced}</li>}
          {object.fromSite && <li>{object.fromSite}</li>}
          {object.needsSite && (
            <li>
              <Link to={settingsLink('location')} onClick={onLeave} className={linkClass}>
                Set your site
              </Link>{' '}
              <span className="text-astro-muted">to see how high it climbs from where you image.</span>
            </li>
          )}
          {object.filterHint && <li>{object.filterHint}</li>}
          {!object.bestPlaced && !object.fromSite && !object.needsSite && !object.filterHint && <li className="text-astro-muted">The catalogue has no position for it.</li>}
        </ul>
      </Section>

      <Section title="Your data">
        {object.noData && <p className="text-xs text-astro-muted">No light frames of it are in the library yet.</p>}
        <Rows rows={object.data} />
      </Section>

      <Section title="Explore">
        <div className="flex flex-col items-start gap-1">
          <Link to={targetLink(object.id)} onClick={onLeave} className={linkClass}>
            Open {object.name}
          </Link>
          <Link to={targetLink(object.id, 'files')} onClick={onLeave} className={linkClass}>
            {tabLabel('files')}: masters, finished images and compare
          </Link>
          <Link to={targetLink(object.id, 'process')} onClick={onLeave} className={linkClass}>
            {tabLabel('process')}
          </Link>
          <Link to={targetLink(object.id, 'notes')} onClick={onLeave} className={linkClass}>
            {tabLabel('notes')}
          </Link>
          <Link to={mosaicPlannerLink(object.id)} onClick={onLeave} className={linkClass}>
            {object.hasMosaicPlan ? 'Its mosaic plan' : 'Plan a mosaic of it'}
          </Link>
          {object.collections.map(c => (
            <Link key={c.id} to={`/collections/${encodeURIComponent(c.id)}`} onClick={onLeave} className={linkClass}>
              In the {c.name} collection
            </Link>
          ))}
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={() => openReference('wikipedia')} className={linkClass}>
            Read about it on Wikipedia ↗
          </button>
          <button onClick={() => openReference('simbad')} className={linkClass}>
            Look it up on SIMBAD ↗
          </button>
        </div>
      </Section>
    </article>
  )
}
