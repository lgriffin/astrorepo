import React, { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { Card, EmptyState, LinkButton } from '../components/common/Card'
import { MosaicTile } from '../components/messier/MosaicTile'
import { TileDetails } from '../components/messier/TileDetails'
import { TILE_WIDTH, forgetPictures, pictureSources } from '../components/messier/pictures'
import { download, mosaicPng } from '../components/messier/save-mosaic'
import { invoke } from '../hooks/useIPC'
import { useToast } from '../contexts/ToastContext'
import { messierLink, messierNumberFrom, settingsLink } from '@shared/navigation'
import type { MessierFilterView, MessierMosaicView } from '@shared/types'

const FILTERS: { id: MessierFilterView; label: string }[] = [
  { id: 'all', label: 'All 110' },
  { id: 'missing', label: 'Not imaged' },
  { id: 'gaps', label: 'Not captured' },
  { id: 'tonight', label: 'Missing and up tonight' }
]

/**
 * The Messier mosaic (specs/032-messier-mosaic): all 110 objects, each tile showing the user's own
 * image of it, with the gaps and when each is up from the site.
 */
export function MessierMosaic(): React.ReactElement {
  const location = useLocation()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [view, setView] = useState<MessierMosaicView | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<MessierFilterView>('all')
  const [saving, setSaving] = useState(false)
  const selected = messierNumberFrom(location.search)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setView(await invoke<MessierMosaicView>('messier:mosaic'))
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const open = (n: number | null) => navigate(n === null ? messierLink() : messierLink(n), { replace: true })

  const save = async () => {
    if (!view) return
    setSaving(true)
    try {
      const pictures = await pictureSources(view.tiles.filter(t => t.picture).map(t => t.number), TILE_WIDTH)
      download(await mosaicPng(view.tiles, pictures), 'messier-mosaic.png')
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'The mosaic could not be saved.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const tile = view?.tiles.find(t => t.number === selected) ?? null
  const s = view?.summary
  return (
    <PageContainer
      subtitle={s ? `${s.imaged} of ${s.total} imaged` : undefined}
      actions={
        view && (
          <>
            <button
              onClick={() => {
                forgetPictures()
                setView(null)
                void load()
              }}
              className="px-3 py-1.5 text-sm rounded border border-astro-border text-astro-muted hover:text-astro-text"
            >
              Refresh
            </button>
            <button onClick={() => void save()} disabled={saving} className="px-3 py-1.5 text-sm rounded bg-astro-accent text-astro-on-accent disabled:opacity-50">
              {saving ? 'Saving…' : 'Save as image'}
            </button>
          </>
        )
      }
    >
      {failed ? (
        <Card title="Messier mosaic">
          <EmptyState action={<LinkButton onClick={() => void load()}>Try again</LinkButton>}>Could not put the mosaic together.</EmptyState>
        </Card>
      ) : !view ? (
        <p className="text-sm text-astro-muted">Putting the mosaic together and working out when each gap is up…</p>
      ) : view.catalogued === 0 ? (
        <Card title="Messier mosaic">
          <EmptyState>The Messier catalogue is not loaded yet. Restart the app to load the built-in catalogues.</EmptyState>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mb-3">
            <span className="text-astro-success">{s!.imaged} imaged</span>
            <span className="text-astro-accent">{s!.stacked} stacked, not finished</span>
            <span className="text-astro-warning">{s!.captured} captured, not stacked</span>
            <span className="text-astro-muted">{s!.gaps} not captured yet</span>
            {view.siteSet && <span className="text-astro-text">{s!.missingUpTonight} missing and up tonight</span>}
          </div>
          <div className="h-1.5 rounded bg-astro-border overflow-hidden mb-4 flex">
            <div className="bg-astro-success" style={{ width: `${(s!.imaged / s!.total) * 100}%` }} />
            <div className="bg-astro-accent" style={{ width: `${(s!.stacked / s!.total) * 100}%` }} />
            <div className="bg-astro-warning" style={{ width: `${(s!.captured / s!.total) * 100}%` }} />
          </div>
          {!view.siteSet && (
            <p className="text-sm text-astro-muted mb-3">
              Set your site to see when each gap is up.{' '}
              <LinkButton onClick={() => navigate(settingsLink('location'))}>Open Settings</LinkButton>
            </p>
          )}
          {view.catalogued < s!.total && <p className="text-sm text-astro-warning mb-3">Only {view.catalogued} of the {s!.total} Messier objects are in the catalogue.</p>}
          <div className="flex flex-wrap gap-2 mb-4">
            {FILTERS.filter(f => f.id !== 'tonight' || view.siteSet).map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1 text-xs rounded-full border ${filter === f.id ? 'border-astro-accent text-astro-accent bg-astro-accent/10' : 'border-astro-border text-astro-muted hover:text-astro-text'}`}
              >
                {f.label} ({view.tiles.filter(t => t.shows.includes(f.id)).length})
              </button>
            ))}
          </div>
          <div className="flex flex-col xl:flex-row gap-4 items-start">
            <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-11 gap-1 flex-1 w-full">
              {view.tiles.map(t => (
                <MosaicTile key={t.number} tile={t} dimmed={!t.shows.includes(filter)} selected={t.number === selected} onOpen={() => open(t.number === selected ? null : t.number)} />
              ))}
            </div>
            {tile && (
              <div className="w-full xl:w-80 shrink-0">
                <TileDetails tile={tile} onClose={() => open(null)} />
              </div>
            )}
          </div>
        </>
      )}
    </PageContainer>
  )
}
