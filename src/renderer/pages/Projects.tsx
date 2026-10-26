import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { Card, EmptyState } from '../components/common/Card'
import { Badge, Button, Field, Input, Select, Loading } from '../components/ui'
import { RuleEditor, STARTING_RULES } from '../components/project/RuleEditor'
import { TargetPicker } from '../components/project/TargetPicker'
import { invoke } from '../hooks/useIPC'
import { useToast } from '../contexts/ToastContext'
import { projectLink } from '@shared/navigation'
import type { ProjectChangeView, ProjectKindView, ProjectRuleView, ProjectSourcesView, ProjectSummaryView, WorkspaceSummaryView } from '@shared/types'

const KINDS: { kind: ProjectKindView; label: string; hint: string }[] = [
  { kind: 'catalogue', label: 'Catalogue campaign', hint: 'Work through a catalogue such as Messier or Caldwell; its targets come in, linked to it.' },
  { kind: 'seasonal', label: 'Seasonal campaign', hint: 'Targets to shoot between two dates, such as this winter.' },
  { kind: 'target-depth', label: 'Target depth', hint: 'One target, taken deep, with goals per filter.' },
  { kind: 'mosaic', label: 'Mosaic campaign', hint: 'One of your mosaics, panel by panel, over as many nights as it takes.' },
  { kind: 'custom', label: 'Personal collection', hint: 'Targets you pick, or one of your collections, with what finished means to you.' }
]

const STATUS_TONE = { active: 'accent', paused: 'warning', archived: 'neutral' } as const

/** Projects (specs/038-astronomy-projects): every campaign with how far it has come, and a new one. */
export function Projects(): React.ReactElement {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [list, setList] = useState<ProjectSummaryView[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [sources, setSources] = useState<ProjectSourcesView>({ catalogues: [], collections: [] })
  const [mosaics, setMosaics] = useState<WorkspaceSummaryView[]>([])
  const [kind, setKind] = useState<ProjectKindView>('catalogue')
  const [name, setName] = useState('')
  const [rule, setRule] = useState<ProjectRuleView>(STARTING_RULES.catalogue)
  const [catalogueId, setCatalogueId] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [targets, setTargets] = useState<{ id: string; name: string }[]>([])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [problems, setProblems] = useState<string[]>([])

  useEffect(() => {
    invoke<ProjectSummaryView[]>('project:list')
      .then(setList)
      .catch(() => {
        setFailed(true)
        setList([])
      })
    invoke<ProjectSourcesView>('project:sources')
      .then(setSources)
      .catch(() => undefined)
    invoke<WorkspaceSummaryView[]>('workspace:list')
      .then(w => setMosaics(w.filter(m => !m.archived)))
      .catch(() => undefined)
  }, [])

  const chooseKind = (k: ProjectKindView) => {
    setKind(k)
    setRule(STARTING_RULES[k])
    setProblems([])
    if (k === 'target-depth') setTargets(t => t.slice(0, 1))
  }

  const create = async () => {
    const result = await invoke<ProjectChangeView>('project:create', {
      name,
      kind,
      rule,
      window: kind === 'seasonal' ? { start, end } : null,
      target_ids: kind === 'catalogue' || kind === 'mosaic' ? [] : targets.map(t => t.id),
      catalogue_id: kind === 'catalogue' ? catalogueId || null : null,
      collection_id: kind === 'custom' ? collectionId || null : null,
      workspace_id: kind === 'mosaic' ? workspaceId || null : null
    }).catch(() => null)
    if (!result) addToast('The project could not be saved.', 'error')
    else if (result.ok) navigate(projectLink(result.id))
    else setProblems(result.problems)
  }

  const picksTargets = kind === 'seasonal' || kind === 'custom' || (kind === 'target-depth' && targets.length === 0)

  return (
    <PageContainer>
      <div className="space-y-6">
        <Card title="Your projects">
          {list === null ? (
            <Loading label="Loading your projects" />
          ) : failed ? (
            <p className="text-sm text-astro-danger">Your projects could not be read. Try opening this page again.</p>
          ) : list.length === 0 ? (
            <EmptyState>No project yet. Start one below: it keeps track of itself as new files are scanned, graded, solved and stacked.</EmptyState>
          ) : (
            <ul className="divide-y divide-astro-border/50 text-sm">
              {list.map(p => (
                <li key={p.id} className="py-2 flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <Link to={projectLink(p.id)} className="text-astro-accent hover:underline">
                      {p.name}
                    </Link>
                    <Badge>{p.kindLabel}</Badge>
                    {p.status !== 'active' && <Badge tone={STATUS_TONE[p.status]}>{p.status === 'paused' ? 'Paused' : 'Archived'}</Badge>}
                  </span>
                  <span className={`text-xs ${p.complete ? 'text-astro-success' : 'text-astro-muted'}`}>
                    {p.total === 0 ? 'No targets yet' : `${p.done} of ${p.total} done`}
                    {p.window ? `, ${p.window.toLowerCase()}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="New project">
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind of project">
              {KINDS.map(k => (
                <Button key={k.kind} size="sm" variant={k.kind === kind ? 'primary' : 'secondary'} aria-checked={k.kind === kind} role="radio" onClick={() => chooseKind(k.kind)}>
                  {k.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-astro-muted">{KINDS.find(k => k.kind === kind)?.hint}</p>

            <Field label="Name">
              {f => (
                <Input id={f.id} aria-describedby={f.describedBy} value={name} onChange={e => setName(e.target.value)} placeholder="Messier marathon" className="w-64" />
              )}
            </Field>

            {kind === 'catalogue' && (
              <Field label="Catalogue" hint={sources.catalogues.length === 0 ? 'No catalogue is loaded yet.' : undefined}>
                {f => (
                  <Select id={f.id} aria-describedby={f.describedBy} value={catalogueId} onChange={e => setCatalogueId(e.target.value)} className="w-64">
                    <option value="">Choose a catalogue</option>
                    {sources.catalogues.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.size})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}

            {kind === 'custom' && sources.collections.length > 0 && (
              <Field label="Start from a collection" hint="Its targets come in; the collection itself is not changed.">
                {f => (
                  <Select id={f.id} aria-describedby={f.describedBy} value={collectionId} onChange={e => setCollectionId(e.target.value)} className="w-64">
                    <option value="">None</option>
                    {sources.collections.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.size})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}

            {kind === 'mosaic' && (
              <Field label="Mosaic" hint={mosaics.length === 0 ? 'Draw a mosaic under Mosaics first.' : undefined}>
                {f => (
                  <Select id={f.id} aria-describedby={f.describedBy} value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} className="w-64">
                    <option value="">Choose a mosaic</option>
                    {mosaics.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.size})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}

            {kind === 'seasonal' && (
              <div className="flex flex-wrap gap-3">
                <Field label="From">
                  {f => (
                    <Input id={f.id} aria-describedby={f.describedBy} type="date" value={start} onChange={e => setStart(e.target.value)} />
                  )}
                </Field>
                <Field label="To">
                  {f => (
                    <Input id={f.id} aria-describedby={f.describedBy} type="date" value={end} onChange={e => setEnd(e.target.value)} />
                  )}
                </Field>
              </div>
            )}

            {(kind === 'seasonal' || kind === 'custom' || kind === 'target-depth') && (
              <div className="space-y-2">
                {targets.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {targets.map(t => (
                      <Button key={t.id} size="sm" variant="ghost" onClick={() => setTargets(list => list.filter(x => x.id !== t.id))} title="Take it out">
                        {t.name} ×
                      </Button>
                    ))}
                  </div>
                )}
                {picksTargets && (
                  <TargetPicker
                    label={kind === 'target-depth' ? 'Find the target' : 'Add a target'}
                    exclude={targets.map(t => t.id)}
                    onPick={t => {
                      setTargets(list => [...list, t])
                      if (!name && kind === 'target-depth') setName(`${t.name} deep`)
                    }}
                  />
                )}
              </div>
            )}

            <div className="border-t border-astro-border pt-3">
              <h3 className="text-sm font-medium text-astro-text mb-2">What finished means</h3>
              <RuleEditor kind={kind} rule={rule} onChange={setRule} />
            </div>

            {problems.length > 0 && (
              <ul className="text-sm text-astro-warning list-disc pl-5">
                {problems.map(p => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <Button variant="primary" onClick={create}>Start the project</Button>
          </div>
        </Card>
      </div>
    </PageContainer>
  )
}
