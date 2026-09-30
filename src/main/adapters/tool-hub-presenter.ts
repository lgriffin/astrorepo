import type { PostProcessingPlan, ToolsReport } from '@astro/application'
import { PROFILES, QUALITIES, toolSpec, type ToolSource } from '@astro/domain'
import type { PostProcessView, ToolsView } from '@shared/types'
import { formatBytes } from './discovery-presenter'

const HOW: Record<ToolSource, string> = { setting: 'Your setting', path: 'On PATH', standard: 'Standard install folder' }

const LIST = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/** Settings > Tools. */
export function toToolsView(r: ToolsReport): ToolsView {
  const needed = r.tools.filter(t => !t.notNeeded)
  const missing = needed.filter(t => !t.path).map(t => t.spec.label)
  return {
    windows: r.windows,
    summary: missing.length === 0 ? 'Every tool was found.' : `Not found: ${LIST(missing)}.`,
    tools: r.tools.map(t => ({
      id: t.id,
      label: t.spec.label,
      purpose: t.spec.purpose,
      settingKey: t.spec.settingKey,
      found: t.path !== null,
      path: t.path,
      how: t.source ? HOW[t.source] : null,
      settingNote: t.settingMissing ? 'Your saved path does not exist, so the usual places were searched instead.' : null,
      looked: t.looked,
      warning: t.warning,
      notNeeded: t.notNeeded
    }))
  }
}

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p

/** The target page's post-processing panel. */
export function toPostProcessView(plan: PostProcessingPlan): PostProcessView {
  const base = {
    stacks: plan.stacks.map(s => ({
      path: s.path,
      label: `${fileName(s.path)}${s.modifiedAt ? `, ${s.modifiedAt.toISOString().slice(0, 10)}` : ''}`
    })),
    profiles: [...PROFILES],
    qualities: [...QUALITIES]
  }
  const r = plan.recipe
  if (!r || !plan.stack) {
    return {
      ...base,
      message: plan.target
        ? 'No stack yet. Stack this target in Siril (see the stacking plan), or scan the folder holding its stack, and the recipe appears here.'
        : 'This target is not in the catalogue.',
      stackPath: null,
      profile: 'broadband',
      profileReason: '',
      quality: 'normal',
      command: null,
      missing: null,
      skipped: [],
      warnings: [],
      outputDir: null,
      space: null,
      verdict: 'unknown',
      verdictText: null
    }
  }
  const about = r.sizeApproximate ? 'about ' : ''
  return {
    ...base,
    message: null,
    stackPath: plan.stack.path,
    profile: r.profile,
    profileReason: r.profileReason,
    quality: r.quality,
    command: r.command,
    missing:
      r.missing.length > 0
        ? `Needs ${LIST(r.missing.map(id => toolSpec(id).label))}, which the tool hub did not find. Set ${r.missing.length === 1 ? 'its path' : 'their paths'} in Settings, under Tools.`
        : null,
    skipped: r.skipped,
    warnings: r.warnings,
    outputDir: r.outputDir,
    space: `Needs ${about}${formatBytes(r.peakBytes)} while it runs and keeps ${about}${formatBytes(r.keptBytes)}.`,
    verdict: r.space.headroomBytes === null && r.space.shortBytes === null ? 'unknown' : r.space.fits ? 'fits' : 'short',
    verdictText:
      r.space.shortBytes !== null
        ? `Short by ${formatBytes(r.space.shortBytes)} on the stack's disk`
        : r.space.headroomBytes !== null
          ? `Fits, ${formatBytes(r.space.headroomBytes)} to spare on the stack's disk`
          : "Free space on the stack's disk unknown"
  }
}
