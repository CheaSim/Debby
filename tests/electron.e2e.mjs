import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const packagedExecutable = process.env.FINPET_E2E_EXECUTABLE
const executablePath = packagedExecutable || require('electron')
const userData = await mkdtemp(resolve(tmpdir(), 'finpet-e2e-'))
let electronApp

try {
  electronApp = await electron.launch({
    executablePath,
    args: packagedExecutable ? [] : ['.'],
    cwd: root,
    env: { ...process.env, FINPET_E2E_USER_DATA: userData }
  })
  const page = await electronApp.firstWindow()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })
  try {
    await page.waitForSelector('.mascot-stage', { timeout: 30_000 })
  } catch (error) {
    await page.screenshot({ path: resolve(root, 'work', 'electron-e2e-failure.png') })
    const body = await page.locator('body').innerText().catch(() => '')
    throw new Error(`Renderer did not reach mascot state. Body: ${body}. Errors: ${pageErrors.join(' | ')}`, { cause: error })
  }
  await page.waitForSelector('[data-live2d-ready="true"]', { timeout: 30_000 })

  const preloadApi = await page.evaluate(() => typeof window.finpet?.getSnapshot)
  assert.equal(preloadApi, 'function', 'contextBridge API was not injected')

  const snapshot = await page.evaluate(() => window.finpet.getSnapshot())
  assert.equal(snapshot.provider, 'demo')
  assert.equal(snapshot.providerStatus, 'demo')
  assert.equal(snapshot.quotes.length, 4)

  const windowState = await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return {
      bounds: window.getBounds(),
      visible: window.isVisible(),
      alwaysOnTop: window.isAlwaysOnTop()
    }
  })
  assert.deepEqual([windowState.bounds.width, windowState.bounds.height], [360, 440])
  assert.equal(windowState.alwaysOnTop, true)
  assert.equal(windowState.visible, true)
  if (process.env.FINPET_E2E_SCREENSHOTS) await page.screenshot({ path: resolve(root, 'work', 'finpet-compact.png') })

  await page.locator('[title="打开行情面板"]').click()
  await page.waitForSelector('.dashboard-shell')
  await page.locator('[data-symbol="AAPL"]').click()
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Apple')

  const expanded = await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return { bounds: window.getBounds() }
  })
  assert.deepEqual([expanded.bounds.width, expanded.bounds.height], [960, 680])

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
    canvasCount: document.querySelectorAll('canvas').length
  }))
  assert.deepEqual([layout.scrollWidth, layout.scrollHeight], [layout.width, layout.height])
  assert.ok(layout.canvasCount > 0, 'financial chart canvas was not created')
  if (process.env.FINPET_E2E_SCREENSHOTS) await page.screenshot({ path: resolve(root, 'work', 'finpet-expanded.png') })

  await electronApp.evaluate(({ app }) => app.quit())
  await electronApp.close()
  electronApp = undefined

  const persisted = JSON.parse(await readFile(resolve(userData, 'settings.json'), 'utf8'))
  assert.equal(persisted.selectedSymbol, 'AAPL')
  assert.equal(persisted.panelOpen, true)
  console.log('Electron E2E passed: preload, native window, IPC, chart, and persistence.')
} finally {
  if (electronApp) await electronApp.close().catch(() => undefined)
  await rm(userData, { recursive: true, force: true })
}
