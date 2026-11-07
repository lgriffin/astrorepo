/**
 * `npm run smoke`: opens every page of the built app in each theme on a fresh data folder, through
 * the headless server, and fails on an error, a blank page or a new accessibility finding
 * (specs/045-developer-experience, D3). Screenshots and a report go to reports/smoke/.
 * `npm run smoke -- --demo` does the same over a copy of the demo library (npm run demo).
 * `npm run smoke -- --update-baseline` cuts the accessibility baseline down to what still fails (it
 * never grows it); `--accept-findings` writes every finding of the run into it, on purpose.
 * Needs `npm run build` first, and Chromium for Playwright (`npx playwright install chromium`).
 */
import type { ChildProcess } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { chromium, type Browser, type Page } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { freePort, root, serve } from '../shared/served-app'
import { SMOKE_THEMES, baselineOf, fixedFindings, pageProblems, shrunkBaseline, smokePages, type AxeBaseline, type PageResult, type SmokeTheme } from './rules'

// `--demo` runs over a copy of the demo library's data folder (npm run demo), with its own
// screenshots and accessibility baseline, since pages with data show more than empty ones (DEV-017).
const demo = process.argv.includes('--demo')
const demoData = path.join(root, '.demo', 'data')
const out = path.join(root, 'reports', demo ? 'smoke-demo' : 'smoke')
const baselineFile = path.join(__dirname, demo ? 'axe-baseline.demo.json' : 'axe-baseline.json')
const update = process.argv.includes('--update-baseline')
const accept = process.argv.includes('--accept-findings')

async function invoke(page: Page, channel: string, args: unknown): Promise<void> {
  await page.evaluate(async ([c, a]) => {
    const token = document.querySelector('meta[name="astrorepo-token"]')?.getAttribute('content') ?? ''
    const r = await fetch(`/api/invoke/${c}`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Astrorepo-Token': token }, body: JSON.stringify({ args: [a] }) })
    if (!r.ok) throw new Error(`${c}: ${r.status} ${await r.text()}`)
  }, [channel, args] as const)
}

/**
 * Waits until a page has drawn: main is on screen and its
 * loading placeholders (a <Loading> holding pulsing lines, or a pulsing <Skeleton>) have given
 * way, capped, since some parts wait on slow sources such as the weather. The app polls, so the
 * network is never idle and cannot be the signal.
 */
async function settle(page: Page): Promise<void> {
  await page.locator('main').waitFor({ state: 'visible', timeout: 15_000 })
  await page
    .waitForFunction(() => !document.querySelector('main [role="status"].animate-pulse, main [role="status"] .animate-pulse'), undefined, { timeout: 8_000 })
    .catch(() => undefined)
  await page.waitForTimeout(250)
}

async function main(): Promise<void> {
  if (!fs.existsSync(path.join(root, 'out', 'renderer', 'index.html'))) {
    console.error('Build the app first: npm run build')
    process.exit(1)
  }
  const baseline: AxeBaseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : {}
  const port = await freePort()
  if (demo && !fs.existsSync(demoData)) {
    console.error('Build the demo library first: npm run demo')
    process.exit(1)
  }
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'astrorepo-smoke-'))
  if (demo) fs.cpSync(demoData, data, { recursive: true })
  const base = `http://127.0.0.1:${port}`
  const results: PageResult[] = []
  let server: ChildProcess | undefined
  let browser: Browser | undefined
  try {
    server = await serve(port, data)
    browser = await chromium.launch()
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    await page.goto(`${base}/`)
    let visit = 0
    for (const theme of SMOKE_THEMES as readonly SmokeTheme[]) {
      await invoke(page, 'settings:set', { key: 'ui_theme', value: theme })
      fs.mkdirSync(path.join(out, theme), { recursive: true })
      for (const { route, name } of smokePages()) {
        // A fresh load per page (the query changes each time), so nothing of the page before is
        // measured, and the theme and any error from starting up belong to this page.
        errors.length = 0
        await page.goto(`${base}/?visit=${++visit}#${route}`)
        await settle(page)
        const drawn = await page.evaluate(() => document.documentElement.dataset.theme ?? '')
        if (drawn !== theme) errors.push(`asked for the ${theme} theme but the app drew ${drawn || 'none'}`)
        const shown = await page.evaluate(() => location.hash.slice(1))
        if (shown !== route) errors.push(`asked for ${route} but the app shows ${shown}`)
        const body = page.locator('main [data-page-body]')
        const textLength = (await ((await body.count()) ? body.first() : page.locator('main')).innerText().catch(() => '')).trim().length
        const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
        const violations = Object.fromEntries(
          axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => [v.id, v.nodes.length] as const)
        )
        await page.screenshot({ path: path.join(out, theme, `${name}.png`), fullPage: true })
        results.push({ route, theme, errors: [...errors], textLength, violations })
        const found = Object.entries(violations).map(([rule, n]) => `${rule} x${n}`)
        console.log(`  ${theme.padEnd(5)} ${route}${found.length ? `  (${found.join(', ')})` : ''}`)
      }
    }
  } finally {
    await browser?.close()
    server?.kill()
    fs.rmSync(data, { recursive: true, force: true })
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(results, null, 2))
  const writeBaseline = (next: AxeBaseline, what: string) => {
    fs.writeFileSync(baselineFile, JSON.stringify(next, null, 2) + '\n')
    console.log(`\n${what} ${path.relative(root, baselineFile)}.`)
  }
  if (accept) writeBaseline(baselineOf(results), 'Wrote every finding of this run to')
  else if (update) writeBaseline(shrunkBaseline(results, baseline), 'Cut down')
  const held = accept ? baselineOf(results) : baseline
  const problems = results.flatMap(r => pageProblems(r, held))
  const fixed = fixedFindings(results, held)
  console.log(`\n${results.length} page views, screenshots in ${path.relative(root, out)}`)
  if (fixed.length && !update) console.log(`Fixed since the baseline (run with --update-baseline to drop them): ${fixed.join('; ')}`)
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.map(p => `  ${p}`).join('\n')}`)
    process.exitCode = 1
  } else console.log('No errors, no blank pages, no new accessibility findings.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
