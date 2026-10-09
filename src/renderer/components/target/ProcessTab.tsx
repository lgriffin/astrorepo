import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { invoke } from '../../hooks/useIPC'
import { useToast } from '../../contexts/ToastContext'
import { Card, EmptyState, LinkButton } from '../common/Card'
import { QueueJob, type QueueResult } from '../jobs/QueueJob'
import { FrameGrades } from './FrameGrades'
import { runLine, runsForTarget, type TargetRuns } from '@shared/navigation'
import type { JobsView, JobView, PostProcessView, SirilPlanView, SirilScriptView, SirilWorkspaceView, StackAdviceView } from '@shared/types'

/**
 * Stack and process (UX-010): the steps from a target's raw frames to a processed image, in
 * order (grading the lights first, GRD-009), with each step saying when its job is already queued or running (UX-011).
 */
export function ProcessTab({ targetId, rawPath }: { targetId: string; rawPath: string | null }): React.ReactElement {
  const [view, setView] = useState<JobsView | null>(null)
  const [unreadable, setUnreadable] = useState(false)
  const [prepKey, setPrepKey] = useState<string | null>(null)
  const [gradesKey, setGradesKey] = useState(0)
  // Only the newest poll may update the runs, so a slow old one never brings back a stale queue.
  const request = useRef(0)

  const loadRuns = useCallback((): void => {
    const id = ++request.current
    invoke<JobsView>('jobs:list', { target_id: targetId })
      .then(v => {
        if (id !== request.current) return
        setView(v)
        setUnreadable(false)
      })
      // A failed poll keeps the runs already shown, so a queued step never offers to queue again.
      .catch(() => id === request.current && setUnreadable(true))
  }, [targetId])
  useEffect(() => {
    loadRuns()
    const timer = setInterval(loadRuns, 10000)
    return () => clearInterval(timer)
  }, [loadRuns])

  const runs = runsForTarget(view, targetId)

  return (
    <div className="space-y-6">
      <Card title="1 · Grade the lights">
        <FrameGrades targetId={targetId} onChanged={() => setGradesKey(k => k + 1)} />
      </Card>

      <Card title="2 · Stack">
        {runs.stack && <RunBanner job={runs.stack} />}
        {rawPath ? (
          <>
            <PrepForSiril rawPath={rawPath} onPrepared={setPrepKey} />
            <StackingPlan targetId={targetId} rawPath={rawPath} refreshKey={prepKey === 'preparing' ? prepKey : `${prepKey ?? ''}|${gradesKey}`} onQueued={loadRuns} queued={runs.stack !== null || view === null} />
          </>
        ) : (
          <EmptyState>
            No raw frames folder is known for this target, so there is nothing to stack yet. Set your home folder in Settings and scan it on the{' '}
            <Link to="/library" className="text-astro-accent hover:underline">Library</Link> page.
          </EmptyState>
        )}
      </Card>

      <Card title="3 · Post-process">
        {runs.postProcess && <RunBanner job={runs.postProcess} />}
        <PostProcessing targetId={targetId} rawPath={rawPath} onQueued={loadRuns} queued={runs.postProcess !== null || view === null} />
      </Card>

      <TargetRunsCard runs={runs} unreadable={unreadable && view === null} />
    </div>
  )
}

/** A step's job, already on its way. */
function RunBanner({ job }: { job: JobView }): React.ReactElement {
  return (
    <p className="mb-3 px-3 py-2 rounded bg-astro-accent/10 border border-astro-accent/30 text-xs text-astro-accent">
      {runLine(job)} <Link to="/jobs" className="underline">Open Jobs</Link>
    </p>
  )
}

/** 4 · Runs: this target's queued, running and recent jobs. */
function TargetRunsCard({ runs, unreadable }: { runs: TargetRuns; unreadable: boolean }): React.ReactElement {
  const row = (job: JobView) => (
    <li key={job.id} className="flex items-baseline justify-between gap-3 py-1.5 border-t border-astro-border first:border-t-0">
      <span className="text-sm text-astro-text">{job.title}</span>
      <span className="text-xs text-astro-muted text-right">
        {[job.stateLabel, job.duration && `ran ${job.duration}`, job.state === 'queued' ? job.waiting : job.note].filter(Boolean).join(' · ')}
      </span>
    </li>
  )
  return (
    <Card title="4 · Runs" action={<Link to="/jobs" className="text-xs text-astro-accent hover:underline">Open Jobs</Link>}>
      {unreadable ? (
        <EmptyState>Could not read the job queue. This part tries again every few seconds.</EmptyState>
      ) : runs.active.length === 0 && runs.finished.length === 0 ? (
        <EmptyState>Nothing has been queued for this target yet. Queue a stack or post-processing run above and it appears here.</EmptyState>
      ) : (
        <ul>{[...runs.active, ...runs.finished].map(row)}</ul>
      )}
    </Card>
  )
}

/** Lays the frames out for Siril in the work area; the source folder is never changed. */
function PrepForSiril({ rawPath, onPrepared }: { rawPath: string; onPrepared: (key: string | null) => void }): React.ReactElement {
  const [status, setStatus] = useState<string | null>(null)
  const { addToast } = useToast()

  async function prep(): Promise<void> {
    setStatus('preparing')
    onPrepared('preparing')
    try {
      const result = await invoke<SirilWorkspaceView>('home:prep-siril', { raw_path: rawPath })
      const total = result.linked + result.copied + result.existing
      const parts = [`${result.byFolder.lights} lights`, `${result.byFolder.darks} darks`, `${result.byFolder.flats} flats`, `${result.byFolder.biases} biases`]
      const graded = result.rejected > 0 ? ` Frame grading left out ${result.rejected} ${result.rejected === 1 ? 'light' : 'lights'}${result.pruned > 0 ? ` and removed ${result.pruned} earlier ${result.pruned === 1 ? 'file' : 'files'} from the work area` : ''}.` : ''
      const done = `Siril folders ready in ${result.workDir}: ${parts.join(', ')}.${graded} Your source folder was not changed.`
      setStatus(done)
      onPrepared(done)
      addToast(`Siril work area ready with ${total} frames`, 'success')
      invoke('home:open-folder', { folder_path: result.workDir }).catch(() => undefined)
    } catch (e) {
      // Electron prefixes the main process's message; the user needs only the message itself.
      const reason = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '') : ''
      setStatus(reason ? `Failed: ${reason}` : 'Failed')
      onPrepared(null)
      addToast('Siril prep failed', 'error')
    }
  }

  return (
    <div className="mb-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => void prep()}
          disabled={status === 'preparing'}
          className="px-3 py-1.5 text-xs bg-astro-accent/10 text-astro-accent border border-astro-accent/30 rounded hover:bg-astro-accent/20 transition-colors disabled:opacity-50"
        >
          Prep for Siril
        </button>
        <span className="text-xs text-astro-muted">Only for running Siril yourself; a queued stack does this first on its own.</span>
      </div>
      {status && status !== 'preparing' && <p className="text-xs text-astro-muted mt-1.5">{status}</p>}
    </div>
  )
}

const VERDICT_TONE: Record<SirilScriptView['verdict'], string> = {
  fits: 'text-green-400',
  short: 'text-red-400',
  unknown: 'text-astro-muted'
}

const MEMORY_TONE: Record<NonNullable<SirilScriptView['memory']>['fit'], string> = {
  'one-pass': 'text-astro-muted',
  blocks: 'text-yellow-400',
  short: 'text-red-400',
  unknown: 'text-astro-muted'
}

const CALIBRATION_TONE: Record<StackAdviceView['calibration'][number]['status'], string> = {
  matches: 'text-astro-muted',
  'not-needed': 'text-astro-muted',
  none: 'text-astro-muted',
  mismatch: 'text-yellow-400'
}

/**
 * Advice beside the plan (specs/020-stacking-advice): image scale and drizzle, the rejection that
 * suits the lights, whether the calibration frames match, and each night with a way to leave it out.
 */
function StackAdvice({ rawPath, advice, onChanged }: { rawPath: string; advice: StackAdviceView; onChanged: () => void }): React.ReactElement {
  const { addToast } = useToast()
  async function setNight(night: string, leftOut: boolean): Promise<void> {
    try {
      await invoke('grades:leave-out-night', { raw_path: rawPath, night, left_out: leftOut })
    } catch {
      addToast('That night could not be changed. Open the page again and retry.', 'error')
    } finally {
      onChanged()
    }
  }
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-astro-accent">Stacking advice</summary>
      <div className="mt-2 space-y-1.5 pl-2">
        <p className={advice.drizzle.suggest ? 'text-astro-text' : 'text-astro-muted'}>
          {advice.scale && <>Image scale {advice.scale}. </>}
          {advice.drizzle.suggest ? 'Drizzle: ' : ''}
          {advice.drizzle.text}
        </p>
        <p className="text-astro-muted">
          Rejection: <span className="text-astro-text">{advice.rejection.method}</span> (<span className="font-mono">{advice.rejection.siril}</span>). {advice.rejection.text}
        </p>
        {advice.calibration.map(c => (
          <p key={c.kind} className={CALIBRATION_TONE[c.status]}>{c.text}</p>
        ))}
        {advice.nights && advice.nights.length > 0 && (
          <table className="text-astro-muted">
            <thead>
              <tr className="text-left">
                <th className="pr-3 font-normal">Night</th>
                <th className="pr-3 font-normal text-right">Lights</th>
                <th className="pr-3 font-normal text-right">Kept</th>
                <th className="pr-3 font-normal text-right">FWHM</th>
                <th className="pr-3 font-normal text-right">Flats</th>
                <th className="font-normal" />
              </tr>
            </thead>
            <tbody>
              {advice.nights.map(n => (
                <tr key={n.night}>
                  <td className="pr-3 text-astro-text">{n.label}</td>
                  <td className="pr-3 text-right tabular-nums">{n.lights}</td>
                  <td className="pr-3 text-right tabular-nums">{n.kept}</td>
                  <td className="pr-3 text-right tabular-nums">{n.medianFwhm ?? '–'}</td>
                  <td className="pr-3 text-right tabular-nums">{n.flats}</td>
                  <td>
                    {n.leftOut ? (
                      <LinkButton onClick={() => void setNight(n.night, false)}>Use again</LinkButton>
                    ) : (
                      <LinkButton onClick={() => void setNight(n.night, true)}>Leave out</LinkButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {advice.sharedFlatsNote && <p className="text-yellow-400">{advice.sharedFlatsNote}</p>}
      </div>
    </details>
  )
}

/** Which stock Siril script fits the frames and whether the disk has room, before anything is written. */
function StackingPlan({ targetId, rawPath, refreshKey, onQueued, queued }: { targetId: string; rawPath: string; refreshKey: string | null; onQueued: () => void; queued: boolean }): React.ReactElement | null {
  const [plan, setPlan] = useState<SirilPlanView | null>(null)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (refreshKey === 'preparing') return
    setFailed(false)
    invoke<SirilPlanView>('siril:estimate', { raw_path: rawPath })
      .then(setPlan)
      .catch(() => setFailed(true))
  }, [rawPath, refreshKey, reload])

  if (failed) return <EmptyState>The stacking plan could not be worked out for this folder.</EmptyState>
  if (!plan) return <EmptyState>Working out which Siril script fits and the space it needs…</EmptyState>
  const chosen = plan.scripts.find(s => s.recommended)

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-astro-text">
        {plan.recommended ? (
          <>
            Run <span className="font-mono">{plan.recommended}</span> in Siril. {plan.reason}
          </>
        ) : (
          plan.reason
        )}
      </p>
      <p className="text-xs text-astro-muted">{plan.frames}</p>
      {chosen && (
        <p className="text-xs">
          <span className="text-astro-text">Needs {chosen.needed}</span>
          {plan.freeSpace && <span className="text-astro-muted">; {plan.freeSpace}</span>}
          {'. '}
          <span className={VERDICT_TONE[chosen.verdict]}>{chosen.verdictText}.</span>
        </p>
      )}
      {chosen?.memory && <p className={`text-xs ${MEMORY_TONE[chosen.memory.fit]}`}>{chosen.memory.text}</p>}
      <p className="text-xs text-astro-muted">{plan.prepNote}</p>
      {/* A stack already on its way is not offered again; the banner above says where it is. */}
      {chosen?.canQueue && !queued && (
        <QueueJob
          label="Queue this stack"
          confirm={[
            `Siril runs ${chosen.file} (${chosen.label.toLowerCase()}).`,
            plan.frames,
            `Needs ${chosen.needed}: ${chosen.verdictText.toLowerCase()}.`,
            'Prep for Siril lays the frames out in the work area first; the source folder is never written to.'
          ]}
          onQueue={timing => invoke<QueueResult>('jobs:queue-stack', { target_id: targetId, script: chosen.script, timing })}
          onQueued={onQueued}
        />
      )}
      {plan.gradingNote && <p className="text-xs text-astro-muted">{plan.gradingNote}</p>}
      {plan.leftoverNote && <p className="text-xs text-astro-muted">{plan.leftoverNote}</p>}
      {plan.approximateNote && <p className="text-xs text-yellow-400">{plan.approximateNote}</p>}
      <StackAdvice rawPath={rawPath} advice={plan.advice} onChanged={() => setReload(n => n + 1)} />
      {plan.scripts.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-astro-accent">Every script and its stages</summary>
          <div className="mt-2 space-y-2">
            {plan.scripts.map(script => (
              <details key={script.file} className="pl-2">
                <summary className="cursor-pointer">
                  <span className="font-mono text-astro-text">{script.file}</span>
                  <span className="text-astro-muted"> ({script.label}): {script.needed}, </span>
                  <span className={VERDICT_TONE[script.verdict]}>{script.verdictText}</span>
                  {script.missing && <span className="text-yellow-400"> · {script.missing}</span>}
                </summary>
                {script.memory && <p className={`ml-2 mt-1 ${MEMORY_TONE[script.memory.fit]}`}>{script.memory.text}</p>}
                <table className="mt-1 ml-2 text-astro-muted">
                  <tbody>
                    {script.stages.map(stage => (
                      <tr key={stage.name}>
                        <td className="pr-3 text-astro-text">{stage.name}</td>
                        <td className="pr-3 text-right tabular-nums">{stage.size}</td>
                        <td className="pr-3 text-right tabular-nums">{stage.files} files</td>
                        <td className="text-right tabular-nums">{stage.cumulative} so far</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
          </div>
          <p className="mt-2 text-astro-muted">Sizes assume Siril keeps every intermediate file, as its stock scripts do.</p>
        </details>
      )}
    </div>
  )
}

/** The Siril_Scripts v2 command for this target's stack, with the profile from its object type (specs/015). */
function PostProcessing({ targetId, rawPath, onQueued, queued }: { targetId: string; rawPath: string | null; onQueued: () => void; queued: boolean }): React.ReactElement {
  const [view, setView] = useState<PostProcessView | null>(null)
  const [choice, setChoice] = useState<{ stack_path?: string; profile?: string; quality?: string }>({})
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // Only the latest request may land: an earlier one finishing late must not show an old command.
    let current = true
    setFailed(false)
    invoke<PostProcessView>('recipe:post-process', { target_id: targetId, ...(rawPath ? { raw_path: rawPath } : {}), ...choice })
      .then(v => {
        if (!current) return
        setView(v)
        setCopied(false)
      })
      .catch(() => {
        if (current) setFailed(true)
      })
    return () => {
      current = false
    }
  }, [targetId, rawPath, choice])

  if (failed) return <p className="text-xs text-astro-muted">The post-processing recipe could not be worked out.</p>
  if (!view) return <p className="text-xs text-astro-muted">Looking for a stack and the tools…</p>
  if (view.message) return <p className="text-sm text-astro-muted">{view.message}</p>

  const select = 'bg-astro-bg border border-astro-border rounded px-2 py-1 text-xs text-astro-text'
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center text-xs">
        {view.stacks.length > 1 && (
          <select className={select} value={view.stackPath ?? ''} onChange={e => setChoice(c => ({ ...c, stack_path: e.target.value }))}>
            {view.stacks.map(s => <option key={s.path} value={s.path}>{s.label}</option>)}
          </select>
        )}
        <select className={select} value={view.profile} onChange={e => setChoice(c => ({ ...c, profile: e.target.value }))}>
          {view.profiles.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className={select} value={view.quality} onChange={e => setChoice(c => ({ ...c, quality: e.target.value }))}>
          {view.qualities.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
      </div>
      <p className="text-xs text-astro-muted">{view.profileReason}</p>
      {view.missing && <p className="text-xs text-yellow-400">{view.missing}</p>}
      {view.command && (
        <div className="flex gap-2 items-start">
          <code className="flex-1 block bg-astro-bg border border-astro-border rounded px-2 py-1.5 text-[11px] text-astro-text break-all">{view.command}</code>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(view.command ?? '').then(() => setCopied(true))
            }}
            className="px-2 py-1 text-xs border border-astro-border rounded text-astro-muted hover:text-astro-text"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      {view.space && (
        <p className="text-xs">
          <span className="text-astro-text">{view.space}</span>{' '}
          {view.verdictText && <span className={VERDICT_TONE[view.verdict]}>{view.verdictText}.</span>}
        </p>
      )}
      {view.outputDir && <p className="text-xs text-astro-muted">Writes to <span className="font-mono">{view.outputDir}</span>.</p>}
      {view.skipped.map(s => <p key={s} className="text-xs text-astro-muted">Skips {s}</p>)}
      {view.warnings.map(w => <p key={w} className="text-xs text-yellow-400">{w}</p>)}
      {view.canQueue && view.stackPath && !queued && (
        <QueueJob
          label="Queue post-processing"
          confirm={[
            `Siril_Scripts v2 processes ${view.stacks.find(s => s.path === view.stackPath)?.label ?? view.stackPath} with the ${view.profile} profile at ${view.quality} quality.`,
            ...(view.space ? [`${view.space}${view.verdictText ? ` ${view.verdictText}.` : ''}`] : []),
            ...(view.outputDir ? [`Writes to ${view.outputDir}.`] : []),
            ...view.skipped.map(s => `Skips ${s}`)
          ]}
          onQueue={timing =>
            invoke<QueueResult>('jobs:queue-post-process', {
              target_id: targetId,
              stack_path: view.stackPath ?? undefined,
              profile: view.profile,
              quality: view.quality,
              timing
            })
          }
          onQueued={onQueued}
        />
      )}
      <p className="text-[10px] text-astro-muted">Queue it to run on this PC in the run window, or copy the command into Command Prompt.</p>
    </div>
  )
}
