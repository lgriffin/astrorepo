import type { ArchiveOption, ArchiveOutcome, ArchivePreview, ArchiveRecord } from '@astro/application'
import type { ArchiveMode, WorkEntryKind, WorkFolderSummary } from '@astro/domain'
import type { ArchiveFolderView, ArchiveOptionView, ArchivePreviewView } from '@shared/types'
import { formatBytes } from './discovery-presenter'
import { plural } from './stacking-suggestion-presenter'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A local date as "9 Oct 2026". */
export function longDate(at: Date): string {
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`
}

const MODE_LABEL: Record<ArchiveMode, string> = { linked: 'Linked', 'self-contained': 'Self-contained' }

const KIND_LABEL: Record<Exclude<WorkEntryKind, 'other'>, string> = {
  lights: 'Lights laid out for Siril',
  darks: 'Darks laid out for Siril',
  flats: 'Flats laid out for Siril',
  biases: 'Biases laid out for Siril',
  process: 'Siril’s working files',
  failed: 'Runs that did not finish',
  steps: 'Step scripts',
  masters: 'Master calibration frames',
  results: 'Stacks and their manifests',
  processed: 'Finished images'
}

function rebuildText(f: WorkFolderSummary): string {
  switch (f.reason) {
    case 'kept':
      return 'Kept in the archive'
    case 'from-manifest':
      return 'Yes, from the stack manifest'
    case 'rewritten-each-run':
      return 'Yes, each stack writes them again'
    case 'unfinished-runs':
      return 'No, and nothing needs them; kept only to look into a failed run'
    case 'no-manifest':
      return 'No: no stack manifest says what made them'
    case 'not-in-manifest':
      return `No: ${plural(f.count, 'file is', 'files are')} not named in a stack manifest`
    case 'missing-sources':
      return `No: ${plural(f.count, 'source frame', 'source frames')} the manifest names ${f.count === 1 ? 'is' : 'are'} gone`
  }
}

function freesText(f: WorkFolderSummary): string {
  if (!f.intermediate) return 'Kept'
  if (f.linkedFiles > 0 && f.freesBytes === 0) return '0 B: hard links to your frames'
  if (f.linkedFiles > 0 && f.freesBytes < f.sizeBytes) return `${formatBytes(f.freesBytes)}; hard links free nothing`
  return formatBytes(f.freesBytes)
}

export function toArchiveFolderView(f: WorkFolderSummary): ArchiveFolderView {
  return {
    folder: f.folder,
    label: f.kind === 'other' ? `Other files in ${f.folder}` : KIND_LABEL[f.kind],
    size: formatBytes(f.sizeBytes),
    frees: freesText(f),
    freesBytes: f.freesBytes,
    rebuildable: f.rebuildable,
    rebuild: rebuildText(f),
    intermediate: f.intermediate,
    removable: f.removable,
    suggested: f.removable && f.rebuildable
  }
}

function toOptionView(o: ArchiveOption, destination: string): ArchiveOptionView {
  const p = o.plan
  const kept = `the stacks, manifests, masters and finished images (${formatBytes(p.keptBytes)})`
  const text =
    o.mode === 'linked'
      ? `Copies ${kept} to ${destination}. The raw frames stay where they are, and the archive lists where each one is.`
      : `Copies ${kept} and ${plural(p.bundledFrames, 'raw frame')} the manifests name to ${destination}, so the archive needs nothing else.`
  const verdictText =
    o.space.verdict === 'fits' ? 'Fits on that disk' : o.space.verdict === 'short' ? `Short by ${formatBytes(o.space.shortBytes)} on that disk` : 'That disk does not report its free space'
  return {
    mode: o.mode,
    label: MODE_LABEL[o.mode],
    text,
    copies: formatBytes(p.copyBytes),
    verdict: o.space.verdict,
    verdictText,
    missing:
      o.mode === 'self-contained' && p.missingFrames > 0
        ? `${plural(p.missingFrames, 'raw frame')} the manifests name ${p.missingFrames === 1 ? 'is' : 'are'} gone from ${p.missingFrames === 1 ? 'its' : 'their'} folder, so the archive cannot hold ${p.missingFrames === 1 ? 'it' : 'them'}.`
        : null
  }
}

/** "Archived on 9 Oct 2026, linked." with what removing intermediates freed. */
export function archivedLine(r: ArchiveRecord): string {
  const freed = r.removed.length > 0 ? ` Removing ${r.removed.join(', ')} freed ${formatBytes(r.freedBytes)}.` : ''
  return `Archived on ${longDate(r.archivedAt)}, ${MODE_LABEL[r.mode].toLowerCase()}.${freed}`
}

export function toArchivePreviewView(p: ArchivePreview): ArchivePreviewView {
  return {
    archived: p.record ? archivedLine(p.record) : null,
    archivedPath: p.record?.path ?? null,
    workDir: p.workDir,
    destination: p.destination,
    folders: p.folders.map(toArchiveFolderView),
    manifests:
      p.manifests === 0
        ? 'The work folder holds no stack manifest, so Siril’s working files and the laid-out frames cannot be rebuilt from it. Stacks queued from this app write one.'
        : `The work folder holds ${plural(p.manifests, 'stack manifest')}, which ${p.manifests === 1 ? 'says' : 'say'} how to rebuild what can be removed.`,
    options: p.options.map(o => toOptionView(o, p.destination)),
    blocked: p.blocked
  }
}

/** The result line after archiving. */
export function archiveResultMessage(out: ArchiveOutcome): string {
  const r = out.record
  const copied = `Archived to ${r.path}, ${MODE_LABEL[r.mode].toLowerCase()}: copied ${formatBytes(r.copiedBytes)}.`
  const removed = r.removed.length > 0 ? ` Removed ${r.removed.join(', ')} from the work folder and freed ${formatBytes(r.freedBytes)}.` : ' Nothing was removed from the work folder.'
  return `${copied}${removed}`
}
