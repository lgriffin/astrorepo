import React, { useState, useEffect } from 'react'
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { Card, EmptyState } from '../components/common/Card'
import { WorkflowStepper } from '../components/target/WorkflowStepper'
import { TargetDiscoveryPanel } from '../components/cockpit/TargetDiscoveryPanel'
import { ProcessTab } from '../components/target/ProcessTab'
import { FilesTab } from '../components/target/FilesTab'
import { NotesTab } from '../components/target/NotesTab'
import { TargetAside } from '../components/target/TargetAside'
import { invoke } from '../hooks/useIPC'
import { TARGET_TABS, targetLink, targetTabFrom, type TargetTab } from '@shared/navigation'
import type { Target, TargetAlias, CatalogueEntry, TargetHomeData, TargetObservationData, TargetDiscoveryView } from '@shared/types'

/**
 * A target's page (specs/017-unified-ux, UX-009): Overview, Stack and process, Files, and Notes and
 * nights, with its image and other names beside every part. A link can open any part.
 */
export function TargetDetail(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const tab = targetTabFrom(useLocation().search)
  const navigate = useNavigate()
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
      .then(t => {
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
      .then(results => {
        if (!current || !results) return
        const [a, c, hd, od, disc] = results
        setDiscovery(disc)
        setAliases(a)
        setCatalogueEntries(c)
        setHomeData(hd)
        setObsData(od)
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [id])

  if (loading) {
    return (
      <PageContainer title="Loading…">
        <EmptyState>Loading the target…</EmptyState>
      </PageContainer>
    )
  }

  if (!target) {
    return (
      <PageContainer title="Not found">
        <EmptyState>
          That target is not in the index. <Link to="/targets" className="text-astro-accent hover:underline">Back to Targets</Link>
        </EmptyState>
      </PageContainer>
    )
  }

  const typeLabel = target.objectType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const open = (t: TargetTab) => navigate(targetLink(target.id, t), { replace: true })

  return (
    <PageContainer title={target.canonicalName} subtitle={[typeLabel, target.constellation].filter(Boolean).join(' in ')}>
      <nav className="flex gap-1 border-b border-astro-border mb-6" aria-label="Parts of this target">
        {TARGET_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => open(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${
              tab === t.id ? 'border-astro-accent text-astro-accent' : 'border-transparent text-astro-muted hover:text-astro-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {tab === 'overview' && (
            <>
              <Card title="What the files say">
                {discovery ? (
                  <TargetDiscoveryPanel discovery={discovery} />
                ) : (
                  <EmptyState>No FITS files are linked to this target yet, so there is nothing to add up.</EmptyState>
                )}
              </Card>
              <Card
                title="Next step"
                action={
                  <button onClick={() => open('process')} className="text-xs text-astro-accent hover:underline">
                    Open Stack and process
                  </button>
                }
              >
                <p className="text-sm text-astro-text">{nextStep(discovery)}</p>
              </Card>
              <Card title="Workflow">
                <WorkflowStepper
                  targetId={target.id}
                  currentStage={target.workflowStage}
                  onStageChanged={() => {
                    invoke<Target>('targets:get', { id: target.id }).then(t => {
                      if (t) setTarget(t)
                    })
                  }}
                />
              </Card>
            </>
          )}
          {tab === 'process' && <ProcessTab targetId={target.id} rawPath={homeData?.rawPath ?? null} />}
          {tab === 'files' && <FilesTab homeData={homeData} obsData={obsData} />}
          {tab === 'notes' && <NotesTab target={target} onChange={setTarget} />}
        </div>

        <TargetAside target={target} aliases={aliases} catalogueEntries={catalogueEntries} />
      </div>
    </PageContainer>
  )
}

/** What the target is ready for, from its files, in one sentence. */
function nextStep(d: TargetDiscoveryView | null): string {
  if (!d) return 'Capture it: nothing has been linked to this target yet.'
  switch (d.progress) {
    case 'planned':
      return 'Capture it: no subs yet.'
    case 'capturing':
      return 'Keep capturing, or stack what you have to check it.'
    case 'enough-data':
      return 'Stack it: there is enough data and no stack yet.'
    case 'stacked':
      return d.unstackedNights.length > 0 ? 'Restack it to include the nights captured since the last stack, or post-process the stack.' : 'Post-process the stack.'
    case 'processed':
      return 'Finish it: pick the processed image to keep as final.'
    case 'final':
      return 'Done. Capture more only if you want to go deeper.'
  }
}
