import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { NAV_GROUPS, NAV_ITEMS, SETTINGS_SECTIONS, jobsStatus, locate, settingsLink, settingsSectionFrom } from '../../src/shared/navigation'
import type { JobView } from '../../src/shared/types'

const renderer = path.resolve(__dirname, '../../src/renderer')
const read = (rel: string) => fs.readFileSync(path.join(renderer, rel), 'utf8')

const job = (over: Partial<JobView> = {}): JobView => ({
  id: 'j1',
  title: 'Stack M 31 with OSC_Preprocessing',
  kind: 'stack',
  state: 'queued',
  stateLabel: 'Queued',
  timing: 'window',
  queuedAt: '2026-09-30T20:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  duration: null,
  estimate: null,
  waiting: null,
  note: null,
  command: 'siril-cli',
  needed: '4 GB',
  canCancel: true,
  canRunNow: true,
  ...over
})

describe('navigation', () => {
  it('[UX-001] Given the sidebar, When it is drawn, Then the four daily places lead, the rest sit under Files, Review, Collections and Setup, and each place appears once', () => {
    expect(NAV_GROUPS.map(g => g.label)).toEqual([null, 'Files', 'Review', 'Collections', 'Setup'])
    expect(NAV_GROUPS[0].items.map(i => i.label)).toEqual(['Home', 'Targets', 'Sky planner', 'Jobs'])
    expect(new Set(NAV_ITEMS.map(i => i.to)).size).toBe(NAV_ITEMS.length)
    expect(new Set(NAV_ITEMS.map(i => i.label)).size).toBe(NAV_ITEMS.length)
    // Every place has a route, so no sidebar link lands on a blank page.
    const app = read('App.tsx')
    for (const item of NAV_ITEMS) expect(app).toContain(`path="${item.to}"`)
  })

  it('[UX-001] Given logging a night, When the sidebar is drawn, Then it is not a place but an action on Home and Nights', () => {
    expect(NAV_ITEMS.some(i => i.to.startsWith('/sessions'))).toBe(false)
    expect(read('pages/Dashboard.tsx')).toContain("navigate('/sessions/new')")
    expect(read('pages/SessionTimeline.tsx')).toContain("navigate('/sessions/new')")
  })

  it('[UX-002] Given a place, When its page opens, Then its title is its sidebar label and its subtitle says what it answers', () => {
    const here = locate('/sky-planner')
    expect(here?.item.label).toBe('Sky planner')
    expect(here?.item.hint).toMatch(/\w/)
    for (const item of NAV_ITEMS) expect(item.hint.length).toBeGreaterThan(10)
    // No place's page names itself: the title comes from the sidebar, so the two never drift.
    const detailPages = new Set(['TargetDetail.tsx', 'CollectionDetail.tsx', 'SessionForm.tsx'])
    for (const file of fs.readdirSync(path.join(renderer, 'pages')).filter(f => !detailPages.has(f))) {
      expect(read(`pages/${file}`), file).not.toMatch(/<PageContainer[^>]*\btitle=/)
    }
  })

  it('[UX-003] Given a page below a place, When it is located, Then that place stays lit and the page links back to it', () => {
    expect(locate('/targets/01ABC')).toMatchObject({ item: { id: 'targets' }, detail: true })
    expect(locate('/collections/messier')).toMatchObject({ item: { id: 'collections' }, detail: true })
    expect(locate('/sessions/new')).toMatchObject({ item: { id: 'nights' }, detail: true })
    expect(locate('/sessions/01ABC/edit')).toMatchObject({ item: { id: 'nights' }, detail: true })
    expect(locate('/targets')).toMatchObject({ item: { id: 'targets' }, detail: false })
    expect(locate('/targets/')).toMatchObject({ item: { id: 'targets' }, detail: false })
    expect(locate('/')).toMatchObject({ item: { id: 'home' }, detail: false })
    // A prefix of another word is not below the place.
    expect(locate('/targetsx')).toBeNull()
    expect(locate('/nowhere')).toBeNull()
  })

  it('[UX-004] Given a running job, When the sidebar status is worked out, Then it names the job', () => {
    const running = job({ state: 'running', title: 'Post-process M 31 (auto, high)' })
    expect(jobsStatus({ running, queue: [job()], windowStatus: 'The run window is open until 03:00.' })).toEqual({
      text: 'Running: Post-process M 31 (auto, high)',
      busy: true
    })
  })

  it('[UX-004] Given jobs waiting for the window, When the sidebar status is worked out, Then it says how many and when the window opens', () => {
    const windowStatus = 'The next run window opens at 02:00 tomorrow.'
    expect(jobsStatus({ running: null, queue: [job()], windowStatus })).toEqual({
      text: '1 job queued. The next run window opens at 02:00 tomorrow.',
      busy: false
    })
    expect(jobsStatus({ running: null, queue: [job(), job({ id: 'j2', timing: 'now' })], windowStatus })?.text).toBe(
      '2 jobs queued. Starting as soon as it can.'
    )
  })

  it('[UX-004] Given an empty queue or no answer from the job runner, When the sidebar status is worked out, Then nothing is shown', () => {
    expect(jobsStatus({ running: null, queue: [], windowStatus: 'The run window is open all day.' })).toBeNull()
    expect(jobsStatus(null)).toBeNull()
  })

  it('[UX-005] Given a link to a Settings section, When Settings reads it, Then it opens at that section, and an unknown section opens the top', () => {
    for (const s of SETTINGS_SECTIONS) {
      const link = settingsLink(s.id)
      expect(settingsSectionFrom(link.slice(link.indexOf('?')))).toBe(s.id)
      expect(read('pages/Settings.tsx') + read('components/jobs/RunWindowSettings.tsx')).toContain(`settings-${s.id}`)
    }
    expect(settingsSectionFrom('?section=nope')).toBeNull()
    expect(settingsSectionFrom('')).toBeNull()
    expect(read('pages/Jobs.tsx')).toContain("settingsLink('run-window')")
    expect(read('components/cockpit/ComingNightsCard.tsx')).toContain("settingsLink('location')")
  })
})
