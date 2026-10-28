import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { Card, EmptyState, LinkButton } from '../components/common/Card'
import { invoke } from '../hooks/useIPC'
import { ProgressStrip } from '../components/cockpit/ProgressStrip'
import { HiddenDataCard } from '../components/cockpit/HiddenDataCard'
import { ComingNightsCard } from '../components/cockpit/ComingNightsCard'
import { ClearSkiesCard } from '../components/cockpit/ClearSkiesCard'
import { SetupCard } from '../components/cockpit/SetupCard'
import { TonightHero } from '../components/cockpit/TonightHero'
import { Button, Skeleton } from '../components/ui'
import { useToast } from '../contexts/ToastContext'
import type { Recommendation, CockpitOverview, ForwardPlanView, ClearSkiesView } from '@shared/types'
import { splitRecommendations } from '@shared/recommendations'
import { messierLink } from '@shared/navigation'
import { splitHomeActions, tonightSummary } from '@shared/tonight'

/** A part of Home whose request failed, as opposed to one still loading (null). */
const FAILED = 'failed' as const
const PRIORITY_WORDS: Record<Recommendation['priority'], string> = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' }
const PRIORITY_DOT: Record<Recommendation['priority'], string> = { high: 'bg-astro-danger', medium: 'bg-astro-warning', low: 'bg-astro-success' }
/** How often Home re-reads its suggestions, so a queued stack's line follows the job. */
const REFRESH_MS = 15_000

/**
 * Home (specs/017-unified-ux, UX-006; led by Tonight since specs/041-look-and-feel V3): tonight's
 * sky, dark window, moon and best targets; what to shoot tonight and what is ready to process; the
 * next three nights' skies (specs/036-clear-skies); the coming nights and what is hiding in the
 * files; then how far the targets have got. Totals live on Insights.
 */
export function Dashboard(): React.ReactElement {
  const navigate = useNavigate()
  // null while loading and FAILED when the request failed; each part loads on its own so a slow
  // or failing one never holds up the others.
  const [recommendations, setRecommendations] = useState<Recommendation[] | null | typeof FAILED>(null)
  const [cockpit, setCockpit] = useState<CockpitOverview | null | typeof FAILED>(null)
  const [plan, setPlan] = useState<ForwardPlanView | null | typeof FAILED>(null)
  const [skies, setSkies] = useState<ClearSkiesView | null | typeof FAILED>(null)
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

  const loadSkies = (): Promise<void> =>
    invoke<ClearSkiesView>('weather:outlook')
      .then(setSkies)
      .catch(() => setSkies(FAILED))

  useEffect(() => {
    // The forecast asks services on the network, so it loads on its own like the plan.
    void loadSkies()
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
    const to = rec.actionTo ?? (rec.targetId ? `/targets/${rec.targetId}` : null)
    return (
      <li key={rec.id} className="flex items-start gap-3 py-3">
        <span
          role="img"
          aria-label={PRIORITY_WORDS[rec.priority]}
          title={PRIORITY_WORDS[rec.priority]}
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[rec.priority]}`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-astro-text font-medium">{rec.title}</p>
          {rec.description && <p className="text-xs text-astro-muted mt-0.5">{rec.description}</p>}
          {rec.queued && <p className="text-xs text-astro-accent mt-0.5">{rec.queued}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {rec.actionLabel && to && (
            <Button size="sm" onClick={() => navigate(to)}>
              {rec.actionLabel}
            </Button>
          )}
          {rec.dismissible && !rec.queued && (
            <Button size="sm" variant="ghost" onClick={() => dismiss(rec)} title="Hide until this target gets new data">
              Dismiss
            </Button>
          )}
        </div>
      </li>
    )
  }

  const actionsCard = (title: string, items: Recommendation[], empty: React.ReactNode) => (
    <Card title={title}>
      {recommendations === null ? (
        <div className="space-y-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /></div>
      ) : recommendations === FAILED ? (
        <EmptyState action={<LinkButton onClick={() => { setRecommendations(null); void loadRecommendations() }}>Try again</LinkButton>}>Could not work out the next actions.</EmptyState>
      ) : items.length === 0 ? (
        empty
      ) : (
        <ul className="divide-y divide-astro-border -my-3">{items.slice(0, 6).map(recommendationRow)}</ul>
      )}
    </Card>
  )

  const { shoot, ahead, process } = splitHomeActions(nextActions)
  const summary = tonightSummary(skies === FAILED ? null : skies, plan === FAILED ? null : plan)
  // Tonight's darkness is worked out for the site the plan uses, on the plan's night or else today.
  const tonightSite = plan && plan !== FAILED && plan.status === 'ok'
    ? { latitudeDeg: plan.site.latitudeDeg, night: plan.tonight?.night ?? new Date().toLocaleDateString('en-CA') }
    : null

  return (
    <PageContainer
      actions={
        <Button onClick={() => navigate('/sessions/new')}>Log a night</Button>
      }
    >
      <div className="space-y-4">
        <SetupCard />

        <TonightHero summary={summary} loading={skies === null || plan === null} site={tonightSite} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {actionsCard(
            'Shoot tonight',
            shoot,
            <EmptyState>Nothing of yours is waiting on tonight's sky. Targets with work left appear here when they are up.</EmptyState>
          )}
          {actionsCard(
            'Ready to process',
            process,
            <EmptyState action={<LinkButton onClick={() => navigate('/library')}>Scan your library</LinkButton>}>
              Nothing to stack right now. Data ready to stack appears here as you capture.
            </EmptyState>
          )}
        </div>

        {skies === null ? (
          <Card title="Clear skies"><Skeleton className="h-24 w-full" label="Looking at the forecast for the next three nights" /></Card>
        ) : skies === FAILED ? (
          <Card title="Clear skies">
            <EmptyState action={<LinkButton onClick={() => { setSkies(null); void loadSkies() }}>Try again</LinkButton>}>Could not read the forecast.</EmptyState>
          </Card>
        ) : (
          <ClearSkiesCard outlook={skies} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {plan === null ? (
            <Card title="Coming nights"><Skeleton className="h-16 w-full" label="Working out the coming nights" /></Card>
          ) : plan === FAILED ? (
            <Card title="Coming nights">
              <EmptyState action={<LinkButton onClick={() => { setPlan(null); void loadPlan() }}>Try again</LinkButton>}>Could not work out the coming nights.</EmptyState>
            </Card>
          ) : (
            <ComingNightsCard plan={plan} />
          )}
          {ahead.length > 0 && (
            <Card title="Plan ahead">
              <ul className="divide-y divide-astro-border -my-3">{ahead.slice(0, 6).map(recommendationRow)}</ul>
            </Card>
          )}
          {cockpit === null ? (
            <Card title="Hidden in your files"><Skeleton className="h-16 w-full" label="Looking through your files" /></Card>
          ) : cockpit === FAILED ? (
            <Card title="Hidden in your files">
              <EmptyState action={<LinkButton onClick={() => { setCockpit(null); void loadCockpit() }}>Try again</LinkButton>}>Could not look through your files.</EmptyState>
            </Card>
          ) : (
            <HiddenDataCard items={cockpit.hidden} onChanged={() => void loadCockpit()} />
          )}
        </div>

        {cockpit !== null && cockpit !== FAILED && (
          <Card
            title="Where your targets are"
            action={
              <div className="flex gap-3">
                <LinkButton onClick={() => navigate(messierLink())}>View the Messier mosaic</LinkButton>
                <LinkButton onClick={() => navigate('/targets')}>Open Targets</LinkButton>
              </div>
            }
          >
            <ProgressStrip progress={cockpit.progress} />
          </Card>
        )}

        {otherChecks.length > 0 && (
          <Card title="Other checks">
            <ul className="divide-y divide-astro-border -my-3">{otherChecks.slice(0, 6).map(recommendationRow)}</ul>
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
