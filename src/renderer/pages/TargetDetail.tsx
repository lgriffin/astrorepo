import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { SessionList } from '../components/session/SessionList'
import { WorkflowStepper } from '../components/target/WorkflowStepper'
import { invoke } from '../hooks/useIPC'
import type { Target, TargetAlias, CatalogueEntry } from '@shared/types'

export function TargetDetail(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const [target, setTarget] = useState<Target | null>(null)
  const [aliases, setAliases] = useState<TargetAlias[]>([])
  const [catalogueEntries, setCatalogueEntries] = useState<CatalogueEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    invoke<Target>('targets:get', { id })
      .then((t) => {
        setTarget(t)
        return Promise.all([
          invoke<TargetAlias[]>('targets:aliases', { target_id: id }).catch(() => []),
          invoke<CatalogueEntry[]>('targets:catalogue-entries', { target_id: id }).catch(() => [])
        ])
      })
      .then(([a, c]) => {
        setAliases(a)
        setCatalogueEntries(c)
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
