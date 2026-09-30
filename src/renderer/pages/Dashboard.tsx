import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { Card, EmptyState, LinkButton } from '../components/common/Card'
import { invoke } from '../hooks/useIPC'
import { ProgressStrip } from '../components/cockpit/ProgressStrip'
import { HiddenDataCard } from '../components/cockpit/HiddenDataCard'
import { ComingNightsCard } from '../components/cockpit/ComingNightsCard'
import { useToast } from '../contexts/ToastContext'
import type { Recommendation, CockpitOverview, ForwardPlanView } from '@shared/types'
import { splitRecommendations } from '@shared/recommendations'

/** A part of Home whose request failed, as opposed to one still loading (null). */
const FAILED = 'failed' as const
/** How often Home re-reads its suggestions, so a queued stack's line follows the job. */
const REFRESH_MS = 15_000

/**
 * Home (specs/017-unified-ux, UX-006): what to do next first, then the coming nights and what is
 * hiding in the files, then how far the targets have got. Totals live on Insights.
 */
export function Dashboard(): React.ReactElement {
  const navigate = useNavigate()
  // null while loading and FAILED when the request failed; each part loads on its own so a slow
  // or failing one never holds up the others.
  const [recommendations, setRecommendations] = useState<Recommendation[] | null | typeof FAILED>(null)
  const [cockpit, setCockpit] = useState<CockpitOverview | null | typeof FAILED>(null)
  const [plan, setPlan] = useState<ForwardPlanView | null | typeof FAILED>(null)
  const { addToast } = useToast()
  // Only the newest recommendations request may update the list, so a slow old one never wins.
  const recommendationsRequest = useRef(0)

  const loadRecommendations = (): Promise<void> => {
    const request = ++recommendationsRequest.current
    return invoke<{ recommendations: Recommendation[] }>('recommendations:list')
      .then(r => request === recommendationsRequest.current && setRecommendations(r.recommendations))
      // A refresh that fails keeps the list already shown; only a first load that fails says so.
      .catch(() => request === recommendationsRequest.current && setRecommendations(prev => (Array.isArray(prev) ? prev : FAILED)))
      .then(() => undefined)
  }
  const loadCockpit = (): Promise<void> =>
    invoke<CockpitOverview>('cockpit:overview')
      .then(setCockpit)
      .catch(() => setCockpit(FAILED))
  const loadPlan = (): Promise<void> =>
    invoke<ForwardPlanView>('planning:forward')
      .then(setPlan)
      .catch(() => setPlan(FAILED))

  useEffect(() => {
    void loadRecommendations()
    void loadCockpit()
    // Planning computes a year of nights, so it loads on its own and never holds up the page.
    void loadPlan()
    // A stack that starts, finishes or is cancelled changes what its suggestion says (UX-007).
    const timer = setInterval(() => void loadRecommendations(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [])


  const dismiss = (rec: Recommendation) => {
    invoke<{ dismissed: boolean }>('cockpit:dismiss', { suggestion_id: rec.id })
      .then(result => {
        if (result.dismissed) {
          setRecommendations(prev => (Array.isArray(prev) ? prev.filter(r => r.id !== rec.id) : prev))
          addToast(`Hidden until ${rec.targetName ?? 'the target'} gets new data`, 'success')
          return
        }
        // The data moved on since the list was loaded, so the suggestion it showed no longer exists.
        addToast('That suggestion has changed; the list is refreshed', 'info')
        return loadRecommendations()
      })
      .catch(() => addToast('Could not dismiss that suggestion', 'error'))
  }

  const { nextActions, otherChecks } = splitRecommendations(Array.isArray(recommendations) ? recommendations : [])

  const recommendationRow = (rec: Recommendation) => {
    const priorityColor = rec.priority === 'high' ? 'bg-red-500/20 text-red-400' : rec.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
    const to = rec.actionTo ?? (rec.targetId ? `/targets/${rec.targetId}` : null)
    return (
      <div key={rec.id} className="flex items-start gap-3 p-3 bg-astro-bg rounded-lg">
        <div className="flex flex-col gap-1 shrink-0 pt-0.5">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${priorityColor}`}>{rec.priority}</span>
          <span className="text-[10px] text-astro-muted capitalize">{rec.category}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-astro-text font-medium">{rec.title}</p>
          <p className="text-xs text-astro-muted mt-0.5">{rec.description}</p>
          {rec.queued && <p className="text-xs text-astro-accent mt-0.5">{rec.queued}</p>}
        </div>
        {rec.actionLabel && to && (
          <button onClick={() => navigate(to)} className="shrink-0 text-xs text-astro-accent hover:underline">
            {rec.actionLabel}
          </button>
        )}
        {rec.dismissible && !rec.queued && (
          <button
            onClick={() => dismiss(rec)}
            className="shrink-0 text-xs text-astro-muted hover:text-astro-text"
            title="Hide until this target gets new data"
          >
            Dismiss
          </button>
        )}
      </div>
    )
  }

  return (
    <PageContainer
      actions={
        <button onClick={() => navigate('/sessions/new')} className="px-3 py-1.5 bg-astro-surface border border-astro-border rounded text-sm text-astro-muted hover:text-astro-text">
          Log a night
        </button>
      }
    >
      <div className="space-y-4">
        <Card title="Next actions">
          {recommendations === null ? (
            <EmptyState>Working out tonight's sky and what your data is ready for…</EmptyState>
          ) : recommendations === FAILED ? (
            <EmptyState action={<LinkButton onClick={() => { setRecommendations(null); void loadRecommendations() }}>Try again</LinkButton>}>Could not work out the next actions.</EmptyState>
          ) : nextActions.length === 0 ? (
            <EmptyState action={<LinkButton onClick={() => navigate('/library')}>Scan your library</LinkButton>}>
              Nothing to do right now. Targets to shoot tonight and data ready to stack appear here as you capture.
            </EmptyState>
          ) : (
            <div className="space-y-3">{nextActions.slice(0, 8).map(recommendationRow)}</div>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {plan === null ? (
            <Card title="Coming nights"><EmptyState>Working out the coming nights…</EmptyState></Card>
          ) : plan === FAILED ? (
            <Card title="Coming nights">
              <EmptyState action={<LinkButton onClick={() => { setPlan(null); void loadPlan() }}>Try again</LinkButton>}>Could not work out the coming nights.</EmptyState>
            </Card>
          ) : (
            <ComingNightsCard plan={plan} />
          )}
          {cockpit === null ? (
            <Card title="Hidden in your files"><EmptyState>Looking through your files…</EmptyState></Card>
          ) : cockpit === FAILED ? (
            <Card title="Hidden in your files">
              <EmptyState action={<LinkButton onClick={() => { setCockpit(null); void loadCockpit() }}>Try again</LinkButton>}>Could not look through your files.</EmptyState>
            </Card>
          ) : (
            <HiddenDataCard items={cockpit.hidden} onChanged={() => void loadCockpit()} />
          )}
        </div>

        {cockpit !== null && cockpit !== FAILED && (
          <Card title="Where your targets are" action={<LinkButton onClick={() => navigate('/targets')}>Open Targets</LinkButton>}>
            <ProgressStrip progress={cockpit.progress} />
          </Card>
        )}

        {otherChecks.length > 0 && (
          <Card title="Other checks">
            <div className="space-y-3">{otherChecks.slice(0, 6).map(recommendationRow)}</div>
          </Card>
        )}

        <p className="text-xs text-astro-muted">
          Totals, catalogue progress and trends are on{' '}
          <button onClick={() => navigate('/insights')} className="text-astro-accent hover:underline">
            Insights
          </button>
          .
        </p>
      </div>
    </PageContainer>
  )
}
