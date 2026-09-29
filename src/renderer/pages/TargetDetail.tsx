import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { SessionList } from '../components/session/SessionList'
import { WorkflowStepper } from '../components/target/WorkflowStepper'
import { invoke } from '../hooks/useIPC'
import { useToast } from '../contexts/ToastContext'
import { formatExposure, formatSize } from '../utils/format'
import { TargetDiscoveryPanel } from '../components/cockpit/TargetDiscoveryPanel'
import type { SirilWorkspaceView, Target, TargetAlias, CatalogueEntry, TargetHomeData, TargetObservationData, TargetDiscoveryView } from '@shared/types'

export function TargetDetail(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const [target, setTarget] = useState<Target | null>(null)
  const [aliases, setAliases] = useState<TargetAlias[]>([])
  const [catalogueEntries, setCatalogueEntries] = useState<CatalogueEntry[]>([])
  const [homeData, setHomeData] = useState<TargetHomeData | null>(null)
  const [obsData, setObsData] = useState<TargetObservationData | null>(null)
  const [discovery, setDiscovery] = useState<TargetDiscoveryView | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    // A response for a target the user has already navigated away from must not land on this page.
    let current = true
    setLoading(true)
    setDiscovery(null)
    invoke<Target>('targets:get', { id })
      .then((t) => {
        if (!current) return null
        setTarget(t)
        return Promise.all([
          invoke<TargetAlias[]>('targets:aliases', { target_id: id }).catch(() => []),
          invoke<CatalogueEntry[]>('targets:catalogue-entries', { target_id: id }).catch(() => []),
          invoke<TargetHomeData | null>('home:target-data', { target_id: id }).catch(() => null),
          invoke<TargetObservationData | null>('targets:observation-data', { target_id: id }).catch(() => null),
          invoke<TargetDiscoveryView | null>('discovery:target', { target_id: id }).catch(() => null)
        ])
      })
      .then((results) => {
        if (!current || !results) return
        const [a, c, hd, od, disc] = results
        setDiscovery(disc)
        setAliases(a)
        setCatalogueEntries(c)
        setHomeData(hd)
        setObsData(od)
      })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [id])

  if (loading) {
    return (
      <PageContainer title="Loading...">
        <div className="text-astro-muted">Loading target details...</div>
      </PageContainer>
    )
  }

  if (!target) {
    return (
      <PageContainer title="Not Found">
        <div className="text-astro-muted">
          Target not found. <Link to="/targets" className="text-astro-accent hover:underline">Back to targets</Link>
        </div>
      </PageContainer>
    )
  }

  const typeLabel = target.objectType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <PageContainer
      title={target.canonicalName}
      subtitle={typeLabel}
      actions={
        <Link
          to="/targets"
          className="px-3 py-1.5 bg-astro-surface border border-astro-border rounded text-sm text-astro-muted hover:text-astro-text"
        >
          Back
        </Link>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {discovery && (
            <Section title="What the files say">
              <TargetDiscoveryPanel discovery={discovery} />
            </Section>
          )}

          <Section title="Workflow">
            <WorkflowStepper targetId={target.id} currentStage={target.workflowStage} onStageChanged={() => {
              invoke<Target>('targets:get', { id: target.id }).then((t) => { if (t) setTarget(t) })
            }} />
          </Section>

          {homeData && <HomeFolderSection homeData={homeData} onRefresh={() => {
            if (id) invoke<TargetHomeData | null>('home:target-data', { target_id: id }).then(setHomeData).catch(() => {})
          }} />}

          {obsData && <ObservationDataSection data={obsData} />}

          <Section title="Details">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Object Type" value={typeLabel} />
              <Field label="Workflow Stage" value={target.workflowStage.replace(/_/g, ' ')} />
              {target.constellation && <Field label="Constellation" value={target.constellation} />}
              {target.magnitude !== null && <Field label="Magnitude" value={target.magnitude.toFixed(1)} />}
              {target.raHours !== null && <Field label="RA (hours)" value={target.raHours.toFixed(4)} />}
              {target.decDegrees !== null && <Field label="Dec (degrees)" value={target.decDegrees.toFixed(4)} />}
              {target.angularSizeArcmin !== null && (
                <Field label="Angular Size" value={`${target.angularSizeArcmin.toFixed(1)} arcmin`} />
              )}
              {target.isCustom && <Field label="Custom Target" value="Yes" />}
            </div>
          </Section>

          <EditableTextSection
            title="Description"
            value={target.description}
            fieldName="description"
            targetId={target.id}
            onSaved={(v) => setTarget({ ...target, description: v })}
          />

          <EditableTextSection
            title="Notes"
            value={target.notes}
            fieldName="notes"
            targetId={target.id}
            onSaved={(v) => setTarget({ ...target, notes: v })}
          />

          <Section title="Observation Sessions">
            <SessionList targetId={target.id} />
          </Section>
        </div>

        <div className="space-y-6">
          <ThumbnailSection targetId={target.id} targetName={target.canonicalName} />

          {aliases.length > 0 && (
            <Section title="Also Known As">
              <ul className="space-y-1">
                {aliases.map((a) => (
                  <li key={a.id} className="text-sm text-astro-text flex items-center gap-2">
                    <span>{a.alias}</span>
                    {a.source && (
                      <span className="text-xs text-astro-muted">({a.source})</span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {catalogueEntries.length > 0 && (
            <Section title="Catalogue Designations">
              <ul className="space-y-1">
                {catalogueEntries.map((ce) => (
                  <li key={ce.id} className="text-sm text-astro-text">{ce.designation}</li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="External IDs">
            <div className="space-y-1 text-sm">
              {target.simbadId && <Field label="SIMBAD" value={target.simbadId} />}
              {target.nedId && <Field label="NED" value={target.nedId} />}
              {!target.simbadId && !target.nedId && (
                <span className="text-astro-muted">No external IDs</span>
              )}
            </div>
          </Section>
        </div>
      </div>
    </PageContainer>
  )
}

function ObservationDataSection({ data }: { data: TargetObservationData }): React.ReactElement {
  const imageTypes = data.filesByImageType ?? {}
  const lights = imageTypes['Light'] ?? imageTypes['light'] ?? imageTypes['LIGHT'] ?? 0
  const darks = imageTypes['Dark'] ?? imageTypes['dark'] ?? imageTypes['DARK'] ?? 0
  const flats = imageTypes['Flat'] ?? imageTypes['flat'] ?? imageTypes['FLAT'] ?? 0
  const biases = imageTypes['Bias'] ?? imageTypes['bias'] ?? imageTypes['BIAS'] ?? 0
  const folders = data.filesByFolder ?? {}

  return (
    <Section title="Observation Data">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-astro-bg border border-astro-border rounded p-2">
          <p className="text-xs text-astro-muted">FITS Files</p>
          <p className="text-sm font-bold text-astro-text">{data.totalFiles}</p>
        </div>
        <div className="bg-astro-bg border border-astro-border rounded p-2">
          <p className="text-xs text-astro-muted">Total Exposure</p>
          <p className="text-sm font-bold text-astro-text">{formatExposure(data.totalExposureSec)}</p>
        </div>
        <div className="bg-astro-bg border border-astro-border rounded p-2">
          <p className="text-xs text-astro-muted">Data Size</p>
          <p className="text-sm font-bold text-astro-text">{formatSize(data.totalSizeBytes)}</p>
        </div>
        <div className="bg-astro-bg border border-astro-border rounded p-2">
          <p className="text-xs text-astro-muted">Sessions</p>
          <p className="text-sm font-bold text-astro-text">{data.sessions.length}</p>
        </div>
      </div>

      <div className="mb-4">
        <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-1.5">Frame Breakdown</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="flex justify-between text-sm px-2 py-1 bg-astro-bg border border-astro-border rounded">
            <span className="text-astro-text">Lights</span>
            <span className="text-astro-muted font-medium">{lights}</span>
          </div>
          <div className="flex justify-between text-sm px-2 py-1 bg-astro-bg border border-astro-border rounded">
            <span className="text-astro-text">Darks</span>
            <span className="text-astro-muted font-medium">{darks}</span>
          </div>
          <div className="flex justify-between text-sm px-2 py-1 bg-astro-bg border border-astro-border rounded">
            <span className="text-astro-text">Flats</span>
            <span className="text-astro-muted font-medium">{flats}</span>
          </div>
          <div className="flex justify-between text-sm px-2 py-1 bg-astro-bg border border-astro-border rounded">
            <span className="text-astro-text">Biases</span>
            <span className="text-astro-muted font-medium">{biases}</span>
          </div>
        </div>
      </div>

      {Object.keys(folders).length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-1.5">Folders</h4>
          <div className="space-y-1">
            {Object.entries(folders)
              .sort(([, a], [, b]) => b - a)
              .map(([folder, count]) => (
                <div key={folder} className="flex justify-between text-sm">
                  <span className="text-astro-text font-mono">{folder}</span>
                  <span className="text-astro-muted">{count} files</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {data.firstObserved && (
        <div className="flex gap-4 text-xs text-astro-muted mb-3">
          <span>First: {data.firstObserved.split('T')[0]}</span>
          {data.lastObserved && <span>Last: {data.lastObserved.split('T')[0]}</span>}
        </div>
      )}

      {Object.keys(data.exposureByFilter).length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-1.5">Exposure by Filter</h4>
          <div className="space-y-1">
            {Object.entries(data.exposureByFilter)
              .sort(([, a], [, b]) => b - a)
              .map(([filter, secs]) => (
                <div key={filter} className="flex justify-between text-sm">
                  <span className="text-astro-text">{filter}</span>
                  <span className="text-astro-muted">{formatExposure(secs)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {data.stackedDetails && data.stackedDetails.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-1.5">
            Stacked / Processed ({data.stackedDetails.length})
          </h4>
          <div className="space-y-2">
            {data.stackedDetails.map((s, i) => (
              <div key={i} className="bg-astro-bg border border-astro-accent/20 rounded p-2">
                <p className="text-sm text-astro-text font-medium truncate">{s.fileName}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-astro-muted">
                  {s.filter && <span>Filter: {s.filter}</span>}
                  {s.ncombine && <span>{s.ncombine} frames combined</span>}
                  {s.totalExposureSec != null && <span>Integration: {formatExposure(s.totalExposureSec)}</span>}
                  {s.software && <span>Software: {s.software}</span>}
                  {s.dateObs && <span>Date: {s.dateObs.split('T')[0]}</span>}
                  <span>{formatSize(s.fileSizeBytes)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.sessions.length > 0 && (
        <div>
          <h4 className="text-xs text-astro-muted uppercase tracking-wider mb-1.5">Sessions</h4>
          <div className="space-y-1">
            {data.sessions.map((s) => (
              <div key={s} className="flex justify-between text-sm">
                <span className="text-astro-text">{s}</span>
                <span className="text-astro-muted">{data.filesBySession[s] ?? 0} files</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

function OpenFolderButton({ folderPath }: { folderPath: string | null }): React.ReactElement | null {
  if (!folderPath) return null
  return (
    <button
      onClick={() => invoke('home:open-folder', { folder_path: folderPath })}
      className="p-1 text-astro-muted hover:text-astro-accent transition-colors"
      title="Open in file explorer"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    </button>
  )
}

function HomeFolderSection({ homeData, onRefresh }: { homeData: TargetHomeData; onRefresh: () => void }): React.ReactElement {
  const [sirilStatus, setSirilStatus] = useState<string | null>(null)
  const { addToast } = useToast()

  async function handlePrepSiril(): Promise<void> {
    if (!homeData.rawPath) return
    setSirilStatus('preparing')
    try {
      const result = await invoke<SirilWorkspaceView>('home:prep-siril', { raw_path: homeData.rawPath })
      const total = result.linked + result.copied + result.existing
      const parts = [`${result.byFolder.lights} lights`, `${result.byFolder.darks} darks`, `${result.byFolder.flats} flats`, `${result.byFolder.biases} biases`]
      setSirilStatus(`Siril folders ready in ${result.workDir}: ${parts.join(', ')}. Your source folder was not changed.`)
      addToast(`Siril work area ready with ${total} frames`, 'success')
      invoke('home:open-folder', { folder_path: result.workDir }).catch(() => undefined)
      onRefresh()
    } catch {
      setSirilStatus('Failed')
      addToast('Siril prep failed', 'error')
    }
  }

  const breakdowns = homeData.folderBreakdowns ?? []
  const labelMap: Record<string, string> = { raw: 'RAW FITS', stacked: 'STACKED', tif: 'TIF', images: 'IMAGES' }

  const hasBreakdowns = breakdowns.length > 0
  const fallbackRows = !hasBreakdowns ? [
    { label: 'Raw FITS', count: homeData.rawFiles, path: homeData.rawPath },
    { label: 'Stacked', count: homeData.stackedFiles, path: homeData.stackedPath },
    { label: 'TIF', count: homeData.tifFiles, path: homeData.tifPath },
    { label: 'Images', count: homeData.imageFiles, path: homeData.imagesPath }
  ] : []

  return (
    <Section title="Home Folder">
      {hasBreakdowns ? (
        <div className="space-y-3">
          {breakdowns.map((bd) => (
            <div key={bd.folderType}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-astro-muted font-semibold uppercase tracking-wider">
                  {labelMap[bd.folderType] ?? bd.folderType} ({bd.totalFiles} files)
                </span>
                <OpenFolderButton folderPath={bd.folderPath} />
              </div>
              <div className="space-y-0.5 pl-2">
                {bd.subfolders.map((sf, i) => (
                  <div key={i} className="flex items-center justify-between py-0.5">
                    <span className="text-sm text-astro-text font-mono">{sf.name ?? '(root)'}/ </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-astro-muted tabular-nums">{sf.fileCount} files</span>
                      <OpenFolderButton folderPath={sf.path} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {fallbackRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between py-1">
              <span className="text-sm text-astro-muted">{row.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-astro-text tabular-nums">
                  {row.count > 0 ? `${row.count} files` : '—'}
                </span>
                <OpenFolderButton folderPath={row.path} />
              </div>
            </div>
          ))}
        </div>
      )}

      {homeData.rawPath && (
        <div className="mt-3 pt-3 border-t border-astro-border">
          <button
            onClick={handlePrepSiril}
            disabled={sirilStatus === 'preparing'}
            className="px-3 py-1.5 text-xs bg-astro-accent/10 text-astro-accent border border-astro-accent/30 rounded hover:bg-astro-accent/20 transition-colors disabled:opacity-50"
          >
            Prep for Siril
          </button>
          {sirilStatus && sirilStatus !== 'preparing' && (
            <p className="text-xs text-astro-muted mt-1.5">{sirilStatus}</p>
          )}
        </div>
      )}

      <p className="text-[10px] text-astro-muted mt-3">
        Last scanned: {new Date(homeData.scannedAt).toLocaleString()}
      </p>
    </Section>
  )
}

function ThumbnailSection({ targetId, targetName }: { targetId: string; targetName: string }): React.ReactElement | null {
  const [images, setImages] = useState<Array<{ path: string; data: string; mime: string }>>([])
  const [fallback, setFallback] = useState<{ data: string; mime: string } | null>(null)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    invoke<{ images: Array<{ path: string; data: string; mime: string }> }>('targets:images', { id: targetId })
      .then(r => {
        if (r.images.length > 0) {
          setImages(r.images)
        } else {
          invoke<{ data: string | null; mime?: string }>('targets:get-thumbnail', { id: targetId })
            .then(tr => { if (tr.data) setFallback({ data: tr.data, mime: tr.mime ?? 'image/jpeg' }) })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [targetId])

  if (images.length === 0 && !fallback) return null

  if (images.length === 0 && fallback) {
    return (
      <Section title="Image">
        <img src={`data:${fallback.mime};base64,${fallback.data}`} alt={targetName} className="w-full rounded-lg" />
      </Section>
    )
  }

  const img = images[current]
  const fileName = img.path.split(/[\\/]/).pop() ?? ''

  return (
    <Section title={`Images (${current + 1}/${images.length})`}>
      <div className="relative">
        <img src={`data:${img.mime};base64,${img.data}`} alt={targetName} className="w-full rounded-lg" />
        {images.length > 1 && (
          <>
            <button
              onClick={() => setCurrent((current - 1 + images.length) % images.length)}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 text-sm"
            >
              &lsaquo;
            </button>
            <button
              onClick={() => setCurrent((current + 1) % images.length)}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 text-sm"
            >
              &rsaquo;
            </button>
          </>
        )}
      </div>
      <p className="text-[10px] text-astro-muted mt-1.5 truncate">{fileName}</p>
      {images.length > 1 && (
        <div className="flex justify-center gap-1 mt-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === current ? 'bg-astro-accent' : 'bg-astro-border'}`}
            />
          ))}
        </div>
      )}
    </Section>
  )
}

function EditableTextSection({ title, value, fieldName, targetId, onSaved }: {
  title: string
  value: string | null
  fieldName: string
  targetId: string
  onSaved: (v: string | null) => void
}): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()

  const handleSave = async () => {
    setSaving(true)
    try {
      await invoke('targets:update', { id: targetId, fields: { [fieldName]: draft || null } })
      onSaved(draft || null)
      addToast(`${title} updated`, 'success')
      setEditing(false)
    } catch {
      addToast(`Failed to update ${title.toLowerCase()}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider">{title}</h2>
        {!editing && (
          <button
            onClick={() => { setDraft(value ?? ''); setEditing(true) }}
            className="text-xs text-astro-muted hover:text-astro-accent transition-colors"
          >
            {value ? 'Edit' : 'Add'}
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full px-3 py-2 bg-astro-bg border border-astro-border rounded text-sm text-astro-text h-28 resize-y focus:outline-none focus:border-astro-accent"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs bg-astro-accent text-white rounded hover:bg-astro-accent/80 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-xs text-astro-muted hover:text-astro-text"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : value ? (
        <p className="text-sm text-astro-text leading-relaxed whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-sm text-astro-muted italic">No {title.toLowerCase()} yet. Click Add to write one.</p>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
      <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-3">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <span className="text-xs text-astro-muted">{label}</span>
      <p className="text-sm text-astro-text capitalize">{value}</p>
    </div>
  )
}
