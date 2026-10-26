import React from 'react'
import { Button, Checkbox, Input, Select } from '../ui'
import type { ProjectKindView, ProjectRuleView } from '@shared/types'

/** The rule each kind starts with, as the core's DEFAULT_RULES, goals in hours. */
export const STARTING_RULES: Record<ProjectKindView, ProjectRuleView> = {
  catalogue: { integration: 'none', goals: [], coverage: false, stacked: false, processed: false, published: true },
  seasonal: { integration: 'target goals', goals: [], coverage: false, stacked: true, processed: false, published: false },
  'target-depth': { integration: 'target goals', goals: [], coverage: false, stacked: false, processed: true, published: false },
  mosaic: { integration: 'target goals', goals: [], coverage: true, stacked: false, processed: false, published: false },
  custom: { integration: 'none', goals: [], coverage: false, stacked: false, processed: false, published: true }
}

interface RuleEditorProps {
  kind: ProjectKindView
  rule: ProjectRuleView
  onChange: (rule: ProjectRuleView) => void
}

/**
 * What finished means for a project (AP-001): usable light per filter, coverage for a mosaic's
 * panels, and a stack, a processed file or a finished image, each a separate part.
 */
export function RuleEditor({ kind, rule, onChange }: RuleEditorProps): React.ReactElement {
  const set = (change: Partial<ProjectRuleView>) => onChange({ ...rule, ...change })
  const setGoal = (i: number, change: Partial<ProjectRuleView['goals'][number]>) => set({ goals: rule.goals.map((g, n) => (n === i ? { ...g, ...change } : g)) })
  return (
    <div className="space-y-3 text-sm">
      <label className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-astro-muted">Usable light</span>
        <Select
          value={rule.integration}
          onChange={e => {
            const integration = e.target.value as ProjectRuleView['integration']
            set({ integration, goals: integration === 'per filter' && rule.goals.length === 0 ? [{ filter: 'L', hours: 2 }] : rule.goals })
          }}
          className="w-auto"
        >
          <option value="none">Not asked</option>
          <option value="target goals">{kind === 'mosaic' ? "The target's goals, on every panel" : "Each target's own goals"}</option>
          <option value="per filter">The same goals for every {kind === 'mosaic' ? 'panel' : 'target'}</option>
        </Select>
      </label>
      {rule.integration === 'per filter' && (
        <div className="space-y-2 pl-4">
          {rule.goals.map((g, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label="Filter" value={g.filter} onChange={e => setGoal(i, { filter: e.target.value })} className="w-28" />
              <Input aria-label="Hours" type="number" min={0} step={0.5} value={g.hours} onChange={e => setGoal(i, { hours: Number(e.target.value) })} className="w-24" />
              <span className="text-xs text-astro-muted">hours</span>
              <Button size="sm" variant="ghost" onClick={() => set({ goals: rule.goals.filter((_, n) => n !== i) })}>
                Remove
              </Button>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={() => set({ goals: [...rule.goals, { filter: '', hours: 1 }] })}>
            Add a filter
          </Button>
          <p className="text-xs text-astro-muted">Use "No filter" for frames written without one.</p>
        </div>
      )}
      {kind === 'mosaic' && <Checkbox label="Every panel covered" hint="95% of a panel's area under counted captures" checked={rule.coverage} onChange={e => set({ coverage: e.target.checked })} />}
      <Checkbox label="A stack" checked={rule.stacked} onChange={e => set({ stacked: e.target.checked })} />
      <Checkbox label="A processed file" hint="Such as a TIFF out of Siril in the target's folder" checked={rule.processed} onChange={e => set({ processed: e.target.checked })} />
      <Checkbox label="A finished image" hint="A JPEG or PNG in the target's images folder" checked={rule.published} onChange={e => set({ published: e.target.checked })} />
    </div>
  )
}
