import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { Card, EmptyState } from '../components/common/Card'
import { Badge, Button, Stat, Table, Td, Th, Tr, Loading } from '../components/ui'
import { RuleEditor } from '../components/project/RuleEditor'
import { TargetPicker } from '../components/project/TargetPicker'
import { ForecastKind } from '../components/forecast/ForecastTable'
import { invoke } from '../hooks/useIPC'
import { useToast } from '../contexts/ToastContext'
import { targetLink, workspaceLink } from '@shared/navigation'
import type { ProjectChangeView, ProjectRuleView, ProjectStatusView, ProjectView } from '@shared/types'

const STATUS_TONE = { active: 'accent', paused: 'warning', archived: 'neutral' } as const
const STATUS_LABEL: Record<ProjectStatusView, string> = { active: 'Active', paused: 'Paused', archived: 'Archived' }

/** One project (specs/038-astronomy-projects): its tasks and their parts, the next steps, the rule and its targets. */
export function ProjectDetail(): React.ReactElement {
  const { id = '' } = useParams()
  const { addToast } = useToast()
  const [view, setView] = useState<ProjectView | null | undefined>(undefined)
  const [failed, setFailed] = useState<string | null>(null)
  const [rule, setRule] = useState<ProjectRuleView | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const loading = useRef(0)

  const load = useCallback(async () => {
    const mine = ++loading.current
    try {
      const v = await invoke<ProjectView | null>('project:get', { project_id: id })
      if (mine !== loading.current) return
      setView(v)
      setRule(v ? v.rule : null)
      setFailed(null)
    } catch (error) {
      if (mine === loading.current) setFailed(error instanceof Error ? error.message : String(error))
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  /** Runs a change and shows the project again, or what was wrong with the change. */
  const change = async (channel: string, args: Record<string, unknown>) => {
    const result = await invoke<ProjectChangeView>(channel, { project_id: id, ...args }).catch((error: unknown) => ({ ok: false as const, problems: [error instanceof Error ? error.message : String(error)] }))
    if (result.ok) {
      setProblems([])
      await load()
    } else setProblems(result.problems)
    return result.ok
  }

  const exportManifest = async (format: 'csv' | 'json') => {
    try {
      const result = await invoke<{ saved: boolean; path?: string }>('project:export', { project_id: id, format })
      if (result.saved) addToast(`Saved ${result.path ?? 'the manifest'}`, 'success')
    } catch (error) {
      addToast(`The manifest could not be saved: ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  if (failed && !view)
    return (
      <PageContainer title="Project">
        <div className="space-y-2 text-sm">
          <p className="text-astro-danger">The project could not be worked out: {failed}</p>
          <Button size="sm" onClick={() => load()}>
            Try again
          </Button>
        </div>
      </PageContainer>
    )
  if (view === undefined) return <PageContainer title="Project"><Loading label="Loading the project" rows={4} /></PageContainer>
  if (view === null)
    return (
      <PageContainer title="Project">
        <EmptyState>This project no longer exists.</EmptyState>
      </PageContainer>
    )

  const editsTargets = view.kind !== 'mosaic' && view.kind !== 'target-depth'
  const targetIds = view.tasks.filter(t => t.kind === 'target').map(t => t.id)

  return (
    <PageContainer title={view.name}>
      <div className="space-y-6">
        <Card title="Progress">
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{view.kindLabel}</Badge>
              <Badge tone={STATUS_TONE[view.status]}>{STATUS_LABEL[view.status]}</Badge>
              {view.complete && <Badge tone="success">Finished</Badge>}
              {view.window && <span className="text-xs text-astro-muted">{view.window.text}</span>}
              {view.mosaic && (
                <Link to={workspaceLink(view.mosaic.id)} className="text-xs text-astro-accent hover:underline">
                  {view.mosaic.name}, revision {view.mosaic.revision}
                </Link>
              )}
            </div>
            <p className="text-astro-text">{view.ruleText}</p>
            <div className="flex flex-wrap gap-8">
              <Stat label="Done" value={`${view.done} of ${view.total}`} />
              {view.tallies.map(t => (
                <Stat key={t.part} label={t.label} value={`${t.met} of ${t.of}`} />
              ))}
            </div>
            {failed && (
              <p className="text-xs text-astro-danger">
                This could not be brought up to date ({failed}); it shows what was worked out before.{' '}
                <Button size="sm" variant="ghost" onClick={() => load()}>
                  Try again
                </Button>
              </p>
            )}
            <p className="text-xs text-astro-muted">{view.checked} New files count as soon as they are scanned, graded or solved; nothing is imported twice and no file is changed.</p>
            {view.source && view.source.newMembers > 0 && (
              <p className="text-xs text-astro-text">
                {view.source.name} has {view.source.newMembers} {view.source.newMembers === 1 ? 'target' : 'targets'} not in this project.{' '}
                <Button size="sm" variant="secondary" onClick={() => change('project:add-new-members', {})}>
                  Add {view.source.newMembers === 1 ? 'it' : 'them'}
                </Button>
              </p>
            )}
          </div>
        </Card>

        <Card title="Next steps">
          {view.status !== 'active' ? (
            <p className="text-sm text-astro-muted">This project is {view.status}, so it suggests nothing. Its progress is still worked out.</p>
          ) : view.next.length === 0 ? (
            <p className="text-sm text-astro-muted">{view.total === 0 ? 'Add targets to see what to do next.' : 'Nothing left to do: every task is finished.'}</p>
          ) : (
            <ol className="text-sm list-decimal pl-5 space-y-1">
              {view.next.map(n => (
                <li key={`${n.taskId}-${n.kind}`} className="text-astro-text">
                  {n.text}
                </li>
              ))}
            </ol>
          )}
        </Card>

        {view.bottlenecks.length > 0 && (
          <Card title="What another hour buys">
            <div className="space-y-2 text-sm">
              <p className="text-xs text-astro-muted">Filters still short of their goals, by the signal to noise an hour more of capture is expected to add, most first.</p>
              <ol className="list-decimal pl-5 space-y-0.5">
                {view.bottlenecks.map(b => (
                  <li key={b.label} className="text-astro-text">
                    {b.label}: {b.gain ?? 'nothing accepted yet'}
                    {b.range ? <span className="text-astro-muted"> ({b.range})</span> : null} <ForecastKind kind={b.kind} />
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        )}

        <Card title={view.kind === 'mosaic' ? 'Panels and the target' : 'Targets'}>
          <div className="space-y-3">
            {view.tasks.length === 0 ? (
              <EmptyState>{view.kind === 'mosaic' ? 'The mosaic this project follows has gone.' : 'No targets yet.'}</EmptyState>
            ) : (
              <Table className="text-xs">
                <thead>
                  <tr>
                    <Th>{view.kind === 'mosaic' ? 'Panel or target' : 'Target'}</Th>
                    <Th>Stage</Th>
                    <Th>Parts</Th>
                    <Th>Per filter</Th>
                    <Th>Next</Th>
                    {editsTargets && <Th>{''}</Th>}
                  </tr>
                </thead>
                <tbody>
                  {view.tasks.map(t => (
                    <Tr key={t.id}>
                      <Td>
                        {t.kind === 'target' ? (
                          <Link to={targetLink(t.id)} className="text-astro-accent hover:underline">
                            {t.label}
                          </Link>
                        ) : (
                          t.label
                        )}
                      </Td>
                      <Td className={t.done ? 'text-astro-success' : 'text-astro-muted'}>{t.done ? 'Finished' : t.stage}</Td>
                      <Td>
                        {t.parts.map(p => (
                          <span key={p.part} className={`mr-3 ${p.met ? 'text-astro-success' : 'text-astro-text'}`}>
                            {p.label}: {p.detail}
                          </span>
                        ))}
                      </Td>
                      <Td className="text-astro-muted">
                        {t.filters.length === 0
                          ? ''
                          : t.filters.map(f => (
                              <span key={f.filter} className={`mr-2 ${f.met === true ? 'text-astro-success' : ''}`}>
                                {f.text}
                              </span>
                            ))}
                      </Td>
                      <Td className="text-astro-muted">{t.next ?? ''}</Td>
                      {editsTargets && (
                        <Td>
                          <Button size="sm" variant="ghost" onClick={() => change('project:remove-target', { target_id: t.id })}>
                            Take out
                          </Button>
                        </Td>
                      )}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
            {editsTargets && <TargetPicker label="Add a target" exclude={targetIds} onPick={t => change('project:add-targets', { target_ids: [t.id] })} />}
          </div>
        </Card>

        <Card title="What finished means">
          {rule && (
            <div className="space-y-3">
              <RuleEditor kind={view.kind} rule={rule} onChange={setRule} />
              <Button
                size="sm"
                onClick={async () => {
                  if (await change('project:rule', { rule })) addToast('The rule is saved and progress worked out again.', 'success')
                }}
              >
                Save the rule
              </Button>
            </div>
          )}
        </Card>

        {problems.length > 0 && (
          <ul className="text-sm text-astro-warning list-disc pl-5">
            {problems.map(p => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        <Card title="Keep or share">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => exportManifest('csv')}>
              Export manifest CSV
            </Button>
            <Button size="sm" variant="secondary" onClick={() => exportManifest('json')}>
              Export manifest JSON
            </Button>
            {view.status === 'active' ? (
              <Button size="sm" variant="secondary" onClick={() => change('project:update', { status: 'paused' })}>
                Pause
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => change('project:update', { status: 'active' })}>
                Make active again
              </Button>
            )}
            {view.status !== 'archived' && (
              <Button size="sm" variant="ghost" onClick={() => change('project:update', { status: 'archived' })}>
                Archive
              </Button>
            )}
          </div>
        </Card>
      </div>
    </PageContainer>
  )
}
