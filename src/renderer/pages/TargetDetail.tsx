import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { SessionList } from '../components/session/SessionList'
import { WorkflowStepper } from '../components/target/WorkflowStepper'
import { invoke } from '../hooks/useIPC'
import type { Target, TargetAlias, CatalogueEntry, TargetHomeData } from '@shared/types'

export function TargetDetail(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const [target, setTarget] = useState<Target | null>(null)
  const [aliases, setAliases] = useState<TargetAlias[]>([])
  const [catalogueEntries, setCatalogueEntries] = useState<CatalogueEntry[]>([])
  const [homeData, setHomeData] = useState<TargetHomeData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    invoke<Target>('targets:get', { id })
      .then((t) => {
        setTarget(t)
        return Promise.all([
          invoke<TargetAlias[]>('targets:aliases', { target_id: id }).catch(() => []),
          invoke<CatalogueEntry[]>('targets:catalogue-entries', { target_id: id }).catch(() => []),
          invoke<TargetHomeData | null>('home:target-data', { target_id: id }).catch(() => null)
        ])
      })
      .then(([a, c, hd]) => {
        setAliases(a)
        setCatalogueEntries(c)
        setHomeData(hd)
      })
      .finally(() => setLoading(false))
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
          <Section title="Workflow">
            <WorkflowStepper targetId={target.id} currentStage={target.workflowStage} onStageChanged={() => {
              invoke<Target>('targets:get', { id: target.id }).then((t) => { if (t) setTarget(t) })
            }} />
          </Section>

          {homeData && <HomeFolderSection homeData={homeData} onRefresh={() => {
            if (id) invoke<TargetHomeData | null>('home:target-data', { target_id: id }).then(setHomeData).catch(() => {})
          }} />}

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

          {target.description && (
            <Section title="Description">
              <p className="text-sm text-astro-text leading-relaxed">{target.description}</p>
            </Section>
          )}

          {target.notes && (
            <Section title="Notes">
              <p className="text-sm text-astro-text leading-relaxed whitespace-pre-wrap">{target.notes}</p>
            </Section>
          )}

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

  async function handlePrepSiril(): Promise<void> {
    if (!homeData.rawPath) return
    setSirilStatus('preparing')
    try {
      const result = await invoke<{ moved: number; created: string[]; skipped: boolean }>('home:prep-siril', { raw_path: homeData.rawPath })
      if (result.skipped) {
        setSirilStatus('Skipped — lights/ already exists')
      } else {
        setSirilStatus(`Moved ${result.moved} files, created ${result.created.join(', ')}`)
      }
      onRefresh()
    } catch {
      setSirilStatus('Failed')
    }
  }

  const rows = [
    { label: 'Raw FITS', count: homeData.rawFiles, path: homeData.rawPath },
    { label: 'Stacked', count: homeData.stackedFiles, path: homeData.stackedPath },
    { label: 'TIF', count: homeData.tifFiles, path: homeData.tifPath },
    { label: 'Images', count: homeData.imageFiles, path: homeData.imagesPath }
  ]

  return (
    <Section title="Home Folder">
      <div className="space-y-2">
        {rows.map((row) => (
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
  const [thumbnail, setThumbnail] = useState<{ data: string; mime: string } | null>(null)

  useEffect(() => {
    invoke<{ data: string | null; mime?: string }>('targets:get-thumbnail', { id: targetId })
      .then(r => {
        if (r.data) setThumbnail({ data: r.data, mime: r.mime ?? 'image/jpeg' })
      })
      .catch(() => {})
  }, [targetId])

  if (!thumbnail) return null

  return (
    <Section title="Image">
      <img
        src={`data:${thumbnail.mime};base64,${thumbnail.data}`}
        alt={targetName}
        className="w-full rounded-lg"
      />
    </Section>
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
