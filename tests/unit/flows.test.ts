import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { TOAST_MS } from '../../src/renderer/contexts/ToastContext'

const RENDERER = path.resolve(__dirname, '../../src/renderer')
const read = (rel: string) => fs.readFileSync(path.join(RENDERER, rel), 'utf8')

function tsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return tsxFiles(full)
    return e.name.endsWith('.tsx') ? [full] : []
  })
}

/**
 * A loading line drawn as plain text: "Loading..." anywhere, or a muted line or empty state whose
 * text starts with what is being fetched ("Reading the pixels…").
 */
const BARE_LOADING = /(>|['"`])\s*Loading(\.\.\.|…)|<(p|span|EmptyState)\b[^>]*>\s*\{?['"`]?(Loading|Reading|Looking|Measuring|Working out|Fetching)\b[^<]*…/

/** Lines of the renderer that draw a bare loading line as text, outside comments. */
function bareLoadingLines(): string[] {
  return tsxFiles(RENDERER).flatMap(file => fs.readFileSync(file, 'utf8').split('\n').flatMap((line, i) => {
    const code = line.trim()
    if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/*')) return []
    return BARE_LOADING.test(line) ? [`${path.relative(RENDERER, file)}:${i + 1}`] : []
  }))
}

describe('Flows (specs/041-look-and-feel V6)', () => {
  it('[LF-028] Given any page, When part of it loads, Then it uses the shared placeholder and the check fails on bare "Loading..." text', () => {
    expect(BARE_LOADING.test('<p className="text-sm text-astro-muted">Reading the pixels…</p>')).toBe(true)
    expect(BARE_LOADING.test("<EmptyState>Measuring the work folder…</EmptyState>")).toBe(true)
    expect(BARE_LOADING.test('<p>{view.status}</p>')).toBe(false)
    expect(bareLoadingLines()).toEqual([])
    const loading = read('components/ui/Loading.tsx')
    expect(loading).toContain('role="status" aria-label={label}')
    expect(read('components/ui/index.ts')).toContain('Loading')
    expect(read('pages/TargetDetail.tsx')).toContain('<Loading')
  })

  it('[LF-029] Given a message, When it is shown, Then it has theme colours, an icon and its kind in words, inside an announced region', () => {
    const toast = read('components/common/Toast.tsx')
    expect(toast).toContain('aria-live="polite"')
    expect(toast).toContain("role={toast.type === 'error' ? 'alert' : undefined}")
    expect(toast).toContain('<span className="sr-only">{word}: </span>')
    expect(toast).toContain('aria-label="Dismiss"')
    for (const tone of ['text-astro-success', 'text-astro-danger', 'text-astro-info']) expect(toast).toContain(tone)
  })

  it('[LF-029] Given a message, When five seconds pass, Then a success or note goes but a problem stays until dismissed', () => {
    expect(TOAST_MS).toBe(5000)
    expect(read('contexts/ToastContext.tsx')).toContain("if (type !== 'error') timers.current.set(")
  })

  it('[LF-030] Given no collections, When the page is shown, Then it fails over to the shared empty state and offers to make one there', () => {
    const page = read('pages/Collections.tsx')
    expect(page).toContain('<EmptyState>No collections yet.')
    expect(page).toContain("invoke<Collection>('collections:create', { name: name.trim() })")
    expect(page).toContain('void navigate(`/collections/${made.id}`)')
  })

  it('[LF-030] Given an empty collection, When it is shown, Then the empty state links to Targets, where targets are added to it', () => {
    expect(read('pages/CollectionDetail.tsx')).toMatch(/<EmptyState action={<Link to="\/targets"/)
  })
})
