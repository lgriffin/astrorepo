import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { invoke } from '../../hooks/useIPC'
import { EmptyState } from '../common/Card'
import { Badge, Button, Field, Input, Select, Table, Td, Th, type BadgeTone, Loading } from '../ui'
import { ExperimentCompare } from './ExperimentCompare'
import type { ExperimentChangeView, ExperimentRunView, ExperimentVariantView, ExperimentView, PostProcessView } from '@shared/types'

const PROFILES = ['galaxy', 'nebula', 'cluster', 'stellar', 'broadband', 'minimal']
const QUALITIES = ['light', 'normal', 'strong']
const MAX_VARIANTS = 4

const TONE: Record<ExperimentVariantView['state'], BadgeTone> = {
  'not run': 'neutral',
  queued: 'info',
  running: 'accent',
  succeeded: 'success',
  failed: 'danger',
  cancelled: 'warning',
  'job missing': 'warning'
}

interface Draft {
  name: string
  objective: string
  stackPath: string
  variants: { profile: string; quality: string }[]
}

/**
 * The experiment lab (specs/040-experiment-lab): one stack processed two to four ways, each into its
 * own folder by the job runner, then compared and one preferred, with a report of what ran. The
 * stack is never changed and no output is ever deleted here.
 */
export function ExperimentLab({ targetId, rawPath, onQueued }: { targetId: string; rawPath: string | null; onQueued: () => void }): React.ReactElement {
  const [experiments, setExperiments] = useState<ExperimentView[] | null>(null)
  const [stacks, setStacks] = useState<{ path: string; label: string }[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)

  // Only the newest request's answer is shown, so a slow poll never puts back an older state.
  const loading = useRef(0)
  const load = useCallback(() => {
    const mine = ++loading.current
    invoke<ExperimentView[]>('experiment:list', { target_id: targetId })
      .then(list => {
        if (mine !== loading.current) return
        setExperiments(list)
        setFailed(null)
      })
      .catch(error => mine === loading.current && setFailed(error instanceof Error ? error.message : String(error)))
  }, [targetId])

  useEffect(() => {
    load()
    invoke<PostProcessView>('recipe:post-process', { target_id: targetId, ...(rawPath ? { raw_path: rawPath } : {}) })
      .then(v => setStacks(v.stacks))
      .catch(() => setStacks([]))
  }, [load, targetId, rawPath])

  // While a variant is queued or running, look again now and then.
  const busy = experiments?.some(e => e.variants.some(v => v.state === 'queued' || v.state === 'running')) ?? false
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [busy, load])

  if (failed && !experiments) return <p className="text-sm text-astro-danger">The experiments could not be read: {failed}</p>
  if (!experiments || !stacks) return <Loading label="Loading the experiments" />

  return (
    <div className="space-y-4 text-sm">
      <p className="text-astro-muted">
        Try Siril_Scripts two to four ways on one stack and compare the results. Each variant writes to its own folder, the stack is checked unchanged by its SHA-256 before every run, and nothing is overwritten or deleted.
      </p>
      {experiments.map(e => <Experiment key={e.id} experiment={e} onChanged={load} onQueued={() => { load(); onQueued() }} />)}
      {stacks.length === 0 ? (
        <EmptyState>An experiment starts from a stack, and this target has none yet.</EmptyState>
      ) : drafting ? (
        <NewExperiment
          targetId={targetId}
          stacks={stacks}
          onCancel={() => setDrafting(false)}
          onMade={() => {
            setDrafting(false)
            load()
          }}
        />
      ) : (
        <Button size="sm" onClick={() => setDrafting(true)}>New experiment</Button>
      )}
    </div>
  )
}

function NewExperiment({ targetId, stacks, onCancel, onMade }: { targetId: string; stacks: { path: string; label: string }[]; onCancel: () => void; onMade: () => void }): React.ReactElement {
  const [draft, setDraft] = useState<Draft>({
    name: '',
    objective: '',
    stackPath: stacks[0]?.path ?? '',
    variants: [
      { profile: 'broadband', quality: 'normal' },
      { profile: 'broadband', quality: 'strong' }
    ]
  })
  const [problems, setProblems] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const setVariant = (i: number, change: Partial<Draft['variants'][number]>) => setDraft(d => ({ ...d, variants: d.variants.map((v, k) => (k === i ? { ...v, ...change } : v)) }))

  async function make(): Promise<void> {
    setSaving(true)
    try {
      const r = await invoke<ExperimentChangeView>('experiment:create', { target_id: targetId, name: draft.name, objective: draft.objective, stack_path: draft.stackPath, variants: draft.variants })
      if (r.ok) onMade()
      else setProblems(r.problems)
    } catch (error) {
      setProblems([error instanceof Error ? error.message : String(error)])
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-astro-border p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name">{f => <Input id={f.id} aria-describedby={f.describedBy} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Stretch test" />}</Field>
        <Field label="Stack">
          {f => (
            <Select id={f.id} aria-describedby={f.describedBy} value={draft.stackPath} onChange={e => setDraft(d => ({ ...d, stackPath: e.target.value }))}>
              {stacks.map(s => <option key={s.path} value={s.path}>{s.label}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <Field label="What you want to find out" hint="Optional; it goes in the report.">
        {f => <Input id={f.id} aria-describedby={f.describedBy} value={draft.objective} onChange={e => setDraft(d => ({ ...d, objective: e.target.value }))} placeholder="Does the strong stretch lose the outer arms?" />}
      </Field>
      <div className="space-y-2">
        {draft.variants.map((v, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <span className="w-20 pb-2 text-xs text-astro-muted">Variant {'ABCD'[i]}</span>
            <Field label="Profile" className="w-36">
              {f => (
                <Select id={f.id} value={v.profile} onChange={e => setVariant(i, { profile: e.target.value })}>
                  {PROFILES.map(p => <option key={p} value={p}>{p}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Quality" className="w-32">
              {f => (
                <Select id={f.id} value={v.quality} onChange={e => setVariant(i, { quality: e.target.value })}>
                  {QUALITIES.map(q => <option key={q} value={q}>{q}</option>)}
                </Select>
              )}
            </Field>
            {draft.variants.length > 2 && (
              <Button size="sm" variant="ghost" onClick={() => setDraft(d => ({ ...d, variants: d.variants.filter((_, k) => k !== i) }))}>
                Remove
              </Button>
            )}
          </div>
        ))}
        {draft.variants.length < MAX_VARIANTS && (
          <Button size="sm" variant="ghost" onClick={() => setDraft(d => ({ ...d, variants: [...d.variants, { profile: 'minimal', quality: 'normal' }] }))}>
            Add a variant
          </Button>
        )}
      </div>
      {problems.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-astro-danger">
          {problems.map(p => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" busy={saving} onClick={() => void make()}>Make the experiment</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function Experiment({ experiment: e, onChanged, onQueued }: { experiment: ExperimentView; onChanged: () => void; onQueued: () => void }): React.ReactElement {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [comparing, setComparing] = useState(false)

  async function act(work: () => Promise<{ ok: boolean; text: string }>): Promise<void> {
    setBusy(true)
    try {
      setMessage(await work())
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  const run = (timing: 'window' | 'now') =>
    act(async () => {
      const r = await invoke<ExperimentRunView>('experiment:run', { experiment_id: e.id, timing })
      if (r.ok) onQueued()
      return r.ok ? { ok: true, text: r.queued } : { ok: false, text: r.problems.join(' ') }
    })
  const prefer = (variantId: string | null) =>
    act(async () => {
      const r = await invoke<ExperimentChangeView>('experiment:prefer', { experiment_id: e.id, variant_id: variantId })
      onChanged()
      return r.ok ? { ok: true, text: variantId ? 'Preferred. The other variants are kept.' : 'No variant is preferred now.' } : { ok: false, text: r.problems.join(' ') }
    })
  const exportReport = (format: 'json' | 'md') =>
    act(async () => {
      const r = await invoke<{ saved: boolean; path?: string }>('experiment:export', { experiment_id: e.id, format })
      return r.saved ? { ok: true, text: `Saved${r.path ? ` to ${r.path}` : ''}.` } : { ok: false, text: 'The report was not saved.' }
    })

  return (
    <section className="space-y-2 rounded-md border border-astro-border p-3">
      <div>
        <h3 className="font-semibold text-astro-text">{e.name}</h3>
        <p className="text-xs text-astro-muted">
          {e.summary}. SHA-256 {e.inputHash}…{e.objective ? ` ${e.objective}` : ''}
        </p>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Variant</Th>
            <Th>Settings</Th>
            <Th>State</Th>
            <Th>Output</Th>
            <Th align="right">Preferred</Th>
          </tr>
        </thead>
        <tbody>
          {e.variants.map(v => (
            <tr key={v.id}>
              <Td>{v.letter}</Td>
              <Td>{v.settings}</Td>
              <Td>
                <Badge tone={TONE[v.state]}>{v.stateText}</Badge>
              </Td>
              <Td className="text-xs text-astro-muted break-all">
                {v.outputs
                  ? `${v.outputs} in ${v.outputDir}`
                  : v.inputChanged
                    ? `Finished after the stack changed, so ${v.outputDir} is not counted`
                    : v.outputsMissing
                      ? `Finished, but ${v.outputDir} is not there`
                      : v.outputDir}
              </Td>
              <Td align="right">
                {v.preferred ? (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void prefer(null)}>Preferred · clear</Button>
                ) : v.canPrefer ? (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void prefer(v.id)}>Prefer</Button>
                ) : null}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="flex flex-wrap gap-2">
        {e.canRun && (
          <>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void run('window')}>Queue for the run window</Button>
            <Button size="sm" disabled={busy} onClick={() => void run('now')}>Run as soon as possible</Button>
          </>
        )}
        {e.canCompare && <Button size="sm" disabled={busy} onClick={() => setComparing(c => !c)}>{comparing ? 'Hide the comparison' : 'Compare'}</Button>}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void exportReport('md')}>Export report</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void exportReport('json')}>Export JSON</Button>
      </div>
      {message && (
        <p className={`text-xs ${message.ok ? 'text-astro-success' : 'text-astro-danger'}`}>
          {message.text} {message.ok && message.text.includes('queued') && <Link to="/jobs" className="text-astro-accent hover:underline">See Jobs</Link>}
        </p>
      )}
      {comparing && <ExperimentCompare experimentId={e.id} version={e.variants.map(v => `${v.state}${v.preferred}`).join('|')} />}
    </section>
  )
}
