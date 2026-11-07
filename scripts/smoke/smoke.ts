/**
 * `npm run smoke`: opens every page of the built app in each theme on a fresh data folder, through
 * the headless server, and fails on an error, a blank page or a new accessibility finding
 * (specs/045-developer-experience, D3). Screenshots and a report go to reports/smoke/.
 * `npm run smoke -- --update-baseline` rewrites the accessibility baseline from this run.
 * Needs `npm run build` first, and Chromium for Playwright (`npx playwright install chromium`).
 */
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { chromium, type Page } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { SMOKE_THEMES, baselineOf, fixedFindings, pageProblems, smokePages, type AxeBaseline, type PageResult, type SmokeTheme } from './rules'

const root = path.resolve(__dirname, '..', '..')
const out = path.join(root, 'reports', 'smoke')
const baselineFile = path.join(__dirname, 'axe-baseline.json')
const update = process.argv.includes('--update-baseline')

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port
      s.close(() => resolve(port))
    })
    s.on('error', reject)
  })
}

/** Starts the headless server on a fresh data folder and resolves once it is listening. */
function serve(port: number, data: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/server/main.ts'], {
      cwd: root,
      env: { ...process.env, ASTRO_DATA: data, ASTRO_PORT: String(port), ASTRO_BIND: '127.0.0.1' }
    })
    let log = ''
    const timer = setTimeout(() => reject(new Error(`The server did not start:\n${log}`)), 60_000)
    const listen = (d: Buffer) => {
      log += d
      if (log.includes('astrorepo is serving')) {
        clearTimeout(timer)
        resolve(child)
      }
    }
    child.stdout?.on('data', listen)
    child.stderr?.on('data', d => { log += d })
    child.on('exit', code => reject(new Error(`The server stopped (${code}):\n${log}`)))
  })
}

async function invoke(page: Page, channel: string, args: unknown): Promise<void> {
  await page.evaluate(async ([c, a]) => {
    const token = document.querySelector('meta[name="astrorepo-token"]')?.getAttribute('content') ?? ''
    const r = await fetch(`/api/invoke/${c}`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Astrorepo-Token': token }, body: JSON.stringify({ args: [a] }) })
    if (!r.ok) throw new Error(`${c}: ${r.status} ${await r.text()}`)
  }, [channel, args] as const)
}

/**
 * Waits until a page has drawn: main is on screen and its loading placeholders have given way
 * (capped, since some parts wait on slow sources such as the weather). The app polls, so
 * the network is never idle and cannot be the signal.
 */
async function settle(page: import('playwright').Page): Promise<void> {
  await page.locator('main').waitFor({ state: 'visible', timeout: 15_000 })
  await page
    .waitForFunction(() => !document.querySelector('main [role="status"] .animate-pulse'), undefined, { timeout: 8_000 })
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
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'astrorepo-smoke-'))
  const server = await serve(port, data)
  const browser = await chromium.launch()
  const base = `http://127.0.0.1:${port}`
  const results: PageResult[] = []
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    await page.goto(`${base}/`)
    for (const theme of SMOKE_THEMES as readonly SmokeTheme[]) {
      await invoke(page, 'settings:set', { key: 'ui_theme', value: theme })
      // The theme is read when the app starts, and a hash change does not restart it.
      await page.reload()
      await settle(page)
      const drawn = await page.evaluate(() => document.documentElement.dataset.theme ?? '')
      if (drawn && drawn !== theme) throw new Error(`Asked for the ${theme} theme but the app drew ${drawn}`)
      fs.mkdirSync(path.join(out, theme), { recursive: true })
      for (const { route, name } of smokePages()) {
        errors.length = 0
        await page.goto(`${base}/#${route}`)
        await settle(page)
        const textLength = (await page.locator('main').innerText().catch(() => '')).trim().length
        const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
        const violations = [...new Set(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id))].sort()
        await page.screenshot({ path: path.join(out, theme, `${name}.png`), fullPage: true })
        results.push({ route, theme, errors: [...errors], textLength, violations })
        console.log(`  ${theme.padEnd(5)} ${route}${violations.length ? `  (${violations.join(', ')})` : ''}`)
      }
    }
  } finally {
    await browser.close()
    server.kill()
    fs.rmSync(data, { recursive: true, force: true })
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(results, null, 2))
  if (update) {
    fs.writeFileSync(baselineFile, JSON.stringify(baselineOf(results), null, 2) + '\n')
    console.log(`\nWrote the accessibility baseline to ${path.relative(root, baselineFile)}.`)
    return
  }
  const problems = results.flatMap(r => pageProblems(r, baseline))
  const fixed = fixedFindings(results, baseline)
  console.log(`\n${results.length} page views, screenshots in ${path.relative(root, out)}`)
  if (fixed.length) console.log(`Fixed since the baseline (run with --update-baseline to drop them): ${fixed.join('; ')}`)
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.map(p => `  ${p}`).join('\n')}`)
    process.exitCode = 1
  } else console.log('No errors, no blank pages, no new accessibility findings.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
