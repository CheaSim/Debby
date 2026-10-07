import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const userData = await mkdtemp(resolve(tmpdir(), 'finpet-live-'))
let app
try {
  app = await _electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root,
    env: { ...process.env, FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: '', ELECTRON_RENDERER_URL: '' } })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.waitForSelector('[data-3d-ready="true"]', { timeout: 30_000 })
  await page.waitForFunction(async () => (await window.finpet.getSnapshot()).providerStatus === 'live', undefined, { timeout: 30_000 })
  const snapshot = await page.evaluate(() => window.finpet.getSnapshot())
  assert.equal(snapshot.provider, 'public')
  assert.match(snapshot.providerName, /腾讯|新浪/)
  const benchmark = snapshot.quotes.find((quote) => quote.symbol === '000001.SH')
  assert.equal(benchmark?.name, '上证指数')
  assert.ok(benchmark.price > 0 && benchmark.previousClose > 0 && benchmark.timestamp <= Date.now() + 60_000)
  assert.equal(snapshot.quotes.some((quote) => quote.symbol === 'AAPL'), false)
  assert.ok(snapshot.quotes.every((quote) => quote.sparkline.length === 1), 'Initial prices must not contain a fabricated historical curve')
  const bounds = await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0]
    const bounds = window.getBounds()
    const area = screen.getDisplayMatching(bounds).workArea
    if (!window.isVisible()) throw new Error('Pet window is hidden')
    assertBounds(bounds, area)
    return { bounds, area }
    function assertBounds(bounds, area) {
      if (bounds.x < area.x || bounds.y < area.y || bounds.x + bounds.width > area.x + area.width || bounds.y + bounds.height > area.y + area.height) throw new Error('Pet window extends outside the screen work area')
    }
  })
  await page.screenshot({ path: resolve(root, 'work', 'finpet-live-full.png') })
  await page.locator('[title="近景视图"]').click()
  await page.waitForSelector('[data-view="portrait"]')
  await page.screenshot({ path: resolve(root, 'work', 'finpet-live-portrait.png') })
  await page.locator('[title="打开行情面板"]').click()
  await page.waitForSelector('.dashboard-shell')
  assert.match(await page.locator('.connection-status').innerText(), /腾讯|新浪/)
  assert.match(await page.locator('.quote-meta').innerText(), /行情时间[\s\S]*\d{2}\/\d{2}/)
  assert.equal(await page.locator('select[aria-label="行情源"]').inputValue(), 'public')
  await page.screenshot({ path: resolve(root, 'work', 'finpet-live-dashboard.png') })
  assert.deepEqual(errors, [])
  const cache = JSON.parse(await readFile(resolve(userData, 'market-cache.json'), 'utf8'))
  assert.equal(cache.quotes.find((quote) => quote.symbol === '000001.SH').price, benchmark.price)
  console.log(JSON.stringify({ provider: snapshot.providerName, benchmark, bounds, rendererErrors: errors }, null, 2))
  console.log('Live QA passed: public A-share quotes, index mood, real Zome model, transparent window, source attribution, and cache.')
} finally {
  if (app) await app.close().catch(() => undefined)
  await rm(userData, { recursive: true, force: true })
}
