import type { PostProcessingPlan, SyqonPlan, ToolHealth, ToolsReport } from '@astro/application'
import { blockingMissing, catalogueSpec, commandLine, PROFILES, QUALITIES, SYQON_STEP_INFO, SYQON_STEPS, toolSpec, type CatalogueStatus, type PaletteId, type ToolSource } from '@astro/domain'
import type { CatalogueView, PostProcessView, SyqonView, ToolHealthView, ToolsView } from '@shared/types'
import { formatBytes } from './discovery-presenter'
import { paletteHint } from './gallery-presenter'

const HOW: Record<ToolSource, string> = {
  setting: 'Your setting',
  env: 'Environment variable',
  path: 'On PATH',
  standard: 'Standard install folder',
  registry: 'Windows App Paths'
}

/** A catalogue as Settings > Tools shows it (HUB-009). */
export function toCatalogueView(c: CatalogueStatus): CatalogueView {
  const spec = catalogueSpec(c.id)
  const text =
    c.state === 'present'
      ? `Installed in ${c.dir}: ${c.found}.`
      : c.state === 'missing'
        ? `Not installed. ${spec.why}`
        : `Checked once ${toolSpec(c.tool).label} is found.`
  return { id: c.id, label: c.label, state: c.state, text, looked: c.looked, settingKey: spec.settingKey }
}

const LIST = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/** Settings > Tools. */
export function toToolsView(r: ToolsReport): ToolsView {
  const needed = r.tools.filter(t => !t.notNeeded && !t.spec.optional)
  const missing = needed.filter(t => !t.path).map(t => t.spec.label)
  // An optional catalogue shows under its tool but is not asked for in the summary or Get set up.
  const lacking = blockingMissing(r.catalogues).map(c => c.label)
  const found = missing.length === 0 ? 'Every tool was found.' : `Not found: ${LIST(missing)}.`
  return {
    windows: r.windows,
    summary: lacking.length === 0 ? found : `${found} Not installed: ${LIST(lacking)}.`,
    missingCatalogues: lacking,
    tools: r.tools.map(t => ({
      id: t.id,
      label: t.spec.label,
      purpose: t.spec.purpose,
      settingKey: t.spec.settingKey,
      found: t.path !== null,
      path: t.path,
      how: t.source === 'env' && t.spec.envVar ? `The ${t.spec.envVar} environment variable` : t.source ? HOW[t.source] : null,
      settingNote: t.settingMissing ? 'Your saved path does not exist, so the usual places were searched instead.' : null,
      looked: t.looked,
      warning: t.warning,
      notNeeded: t.notNeeded,
      optional: !!t.spec.optional,
      catalogues: r.catalogues.filter(c => c.tool === t.id).map(toCatalogueView)
    }))
  }
}

/** Each tool's version and SyQon's models (HUB-007, HUB-008). */
export function toToolHealthView(h: ToolHealth): ToolHealthView {
  return {
    versions: Object.fromEntries(h.versions.filter(v => v.found).map(v => [v.id, v.version ?? 'Unknown'])),
    models: h.syqon.models?.map(m => ({ id: m.id, step: m.step ? SYQON_STEP_INFO[m.step].label : 'Other', available: m.available, status: m.status })) ?? null,
    modelsNote: h.syqon.program ? h.syqon.error : null
  }
}

/** A SyQon step on the target page (HUB-011). */
export function toSyqonView(plan: SyqonPlan, windows: boolean): SyqonView {
  const stacks = plan.stacks.map(s => ({ path: s.path, label: `${fileName(s.path)}${s.modifiedAt ? `, ${s.modifiedAt.toISOString().slice(0, 10)}` : ''}` }))
  const noStack = !plan.target || !plan.stack
  return {
    message: noStack ? plan.blocked : null,
    stacks,
    stackPath: plan.stack?.path ?? null,
    steps: SYQON_STEPS.map(id => ({ id, label: SYQON_STEP_INFO[id].label })),
    step: plan.step,
    models: plan.models?.map(m => m.id) ?? [],
    model: plan.model,
    output: plan.output,
    outputExists: plan.outputExists,
    overwrite: plan.overwrite,
    command: plan.command ? commandLine(plan.command.program, plan.command.args, windows) : null,
    space: noStack ? null : `Needs about ${formatBytes(plan.neededBytes)} beside the stack.`,
    blocked: noStack ? null : plan.blocked,
    canQueue: !noStack && plan.blocked === null && plan.command !== null
  }
}

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p

/** The target page's post-processing panel. */
export function toPostProcessView(plan: PostProcessingPlan, palette: PaletteId | null = null): PostProcessView {
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
      canQueue: false,
      missing: null,
      catalogues: null,
      skipped: [],
      warnings: [],
      outputDir: null,
      space: null,
      verdict: 'unknown',
      verdictText: null,
      paletteHint: null
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
    canQueue: r.missing.length === 0 && r.misplaced.length === 0 && !r.missingCatalogues && !r.inReadOnlyFolder && r.space.fits && (r.space.headroomBytes !== null || r.space.shortBytes !== null),
    missing:
      r.missing.length > 0
        ? `Needs ${LIST(r.missing.map(id => toolSpec(id).label))}, which the tool hub did not find. Set ${r.missing.length === 1 ? 'its path' : 'their paths'} in Settings, under Tools.`
        : null,
    catalogues: r.missingCatalogues,
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
          : "Free space on the stack's disk unknown",
    paletteHint: palette ? paletteHint(palette) : null
  }
}
