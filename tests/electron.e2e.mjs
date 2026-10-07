import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { once } from 'node:events'
import { WebSocketServer } from 'ws'
import { _electron as electron } from 'playwright'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const packagedExecutable = process.env.FINPET_E2E_EXECUTABLE
const executablePath = packagedExecutable || require('electron')
const userData = await mkdtemp(resolve(tmpdir(), 'finpet-e2e-'))
let electronApp
let relay

try {
  electronApp = await electron.launch({
    executablePath,
    args: packagedExecutable ? [] : ['.'],
    cwd: root,
    env: { ...process.env, FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo' }
  })
  const page = await electronApp.firstWindow()
  const openPetOptions = async () => {
    if (!await page.locator('#pet-options').evaluate((element) => element.matches(':popover-open'))) {
      await page.locator('[title="桌宠选项"]').click()
      await page.waitForSelector('#pet-options:popover-open')
    }
  }
  const closePetOptions = async () => {
    await page.keyboard.press('Escape')
    await page.waitForSelector('#pet-options:popover-open', { state: 'hidden' })
  }
  const openPanelOptions = async () => {
    await page.locator('[title="面板选项"]').click()
    await page.waitForSelector('#panel-options:popover-open')
  }
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
  await page.waitForSelector('[data-3d-ready="true"]', { timeout: 30_000 })
  assert.equal(await page.title(), 'Debby')
  assert.equal(await page.locator('.dock-name strong').innerText(), 'Debby')
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.three-pet-canvas')
    return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0
  }, { timeout: 30_000 })

  const threeFrame = await page.evaluate(() => {
    const canvas = document.querySelector('.three-pet-canvas')
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('3D canvas was not created')
    const probe = document.createElement('canvas')
    probe.width = canvas.width
    probe.height = canvas.height
    const context = probe.getContext('2d')
    if (!context) throw new Error('Canvas 2D context is unavailable')
    context.drawImage(canvas, 0, 0)
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data
    let visiblePixels = 0
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 8) visiblePixels += 1
    }
    return { width: canvas.width, height: canvas.height, visiblePixels }
  })
  assert.ok(threeFrame.visiblePixels > 1_000, `3D canvas is blank: ${JSON.stringify(threeFrame)}`)

  const avatarFrame = await page.evaluate(() => {
    const canvas = document.querySelector('.three-pet-canvas')
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let coloredPixels = 0
    let transparentPixels = 0
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 8) transparentPixels += 1
      else if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) - Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) > 12) coloredPixels += 1
    }
    return { avatar: document.querySelector('.three-pet-host').dataset.avatar, coloredPixels, transparentPixels }
  })
  assert.equal(avatarFrame.avatar, 'zome', 'Expected the real Mate-Engine VRM case')
  assert.ok(avatarFrame.coloredPixels > 1_000, `Avatar textures are missing: ${JSON.stringify(avatarFrame)}`)
  assert.ok(avatarFrame.transparentPixels > 1_000, 'Avatar background is not transparent')
  assert.deepEqual(pageErrors, [], 'Renderer reported errors, including missing textures')

  await page.waitForSelector('[data-behavior="idle"]')
  const fullPet = await page.locator('.three-pet-host').boundingBox()
  await page.mouse.click(fullPet.x + fullPet.width / 2, fullPet.y + fullPet.height * 0.19)
  await page.waitForSelector('[data-behavior="pat"]')
  assert.match(await page.locator('.speech p').innerText(), /鼓励/, 'Head pat did not change the companion response')
  if (process.env.FINPET_E2E_SCREENSHOTS) await page.screenshot({ path: resolve(root, 'work', 'finpet-pat.png') })

  const beforeView = await page.locator('.three-pet-canvas').screenshot()
  await openPetOptions()
  await page.locator('[title="近景视图"]').click()
  await page.waitForSelector('[data-view="portrait"]')
  const portraitView = await page.locator('.three-pet-canvas').screenshot()
  assert.notDeepEqual(portraitView, beforeView, 'Portrait switch did not change the rendered character')
  if (process.env.FINPET_E2E_SCREENSHOTS) await page.screenshot({ path: resolve(root, 'work', 'finpet-portrait.png') })
  await page.locator('[title="全身视图"]').click()
  await page.waitForSelector('[data-view="full"]')
  await closePetOptions()

  const preloadApi = await page.evaluate(() => typeof window.finpet?.getSnapshot)
  assert.equal(preloadApi, 'function', 'contextBridge API was not injected')

  const snapshot = await page.evaluate(() => window.finpet.getSnapshot())
  assert.equal(snapshot.provider, 'demo')
  assert.equal(snapshot.providerStatus, 'demo')
  assert.equal(snapshot.quotes.length, 4)

  const windowState = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window.isVisible()) await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Pet window did not become visible')), 5_000)
      window.once('show', () => { clearTimeout(timer); resolve() })
    })
    return {
      bounds: window.getBounds(),
      visible: window.isVisible(),
      alwaysOnTop: window.isAlwaysOnTop()
    }
  })
  assert.deepEqual([windowState.bounds.width, windowState.bounds.height], [380, 540])
  assert.equal(windowState.alwaysOnTop, true)
  assert.equal(windowState.visible, true)

  const getBounds = () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setPosition(300, 180))
  const beforeDrag = await getBounds()
  const pet = await page.locator('.three-pet-host').boundingBox()
  const dragX = pet.x + pet.width / 2
  const dragY = pet.y + pet.height / 2
  await page.mouse.move(dragX, dragY)
  await page.mouse.down()
  await page.mouse.move(dragX - 40, dragY - 30)
  await page.waitForSelector('[data-behavior="lifted"]')
  await page.mouse.up()
  await page.waitForSelector('[data-behavior="land"]')
  await page.waitForFunction(() => window.screenX === 260 && window.screenY === 150)
  const afterDrag = await getBounds()
  assert.deepEqual([afterDrag.x - beforeDrag.x, afterDrag.y - beforeDrag.y], [-40, -30], 'Dragging the pet did not move the window')
  await new Promise((resolve) => setTimeout(resolve, 350))
  const savedPosition = (await page.evaluate(() => window.finpet.getSnapshot())).settings.windowPosition
  assert.deepEqual(savedPosition, { x: afterDrag.x, y: afterDrag.y }, 'Dragged window position was not saved')

  await openPetOptions()
  await page.locator('[title="旋转角色模式"]').click()
  await closePetOptions()
  await page.mouse.move(dragX, dragY)
  await page.mouse.down()
  await page.mouse.move(dragX + 50, dragY)
  await page.mouse.up()
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.yaw) > 0.15)
  assert.deepEqual(await getBounds(), afterDrag, 'Rotating the character moved the desktop window')
  await openPetOptions()
  await page.locator('[title="复位角色视角"]').click()
  await page.waitForFunction(() => Math.abs(Number(document.querySelector('.three-pet-host').dataset.yaw) + 0.12) < 0.02)
  await page.locator('[title="旋转角色模式"]').click()
  await closePetOptions()

  await assert.rejects(page.evaluate(() => window.finpet.startWindowDrag(NaN, 0)), /Invalid drag coordinates/)
  await assert.rejects(page.evaluate(() => window.finpet.setInteractiveRegions([{ x: 0, y: 0, width: Infinity, height: 10 }])), /Invalid interactive region/)
  await openPetOptions()
  await page.locator('[title="开启鼠标穿透"]').click()
  assert.equal(await page.locator('[title="关闭鼠标穿透"] input').isChecked(), true)
  assert.equal((await page.evaluate(() => window.finpet.getSnapshot())).settings.clickThrough, true)
  await closePetOptions()
  await openPetOptions()
  await page.locator('[title="关闭鼠标穿透"]').click()
  assert.equal(await page.locator('[title="开启鼠标穿透"] input').isChecked(), false)
  await closePetOptions()

  const compactTools = await page.locator('.pet-tools').boundingBox()
  assert.ok(compactTools.x >= 0 && compactTools.x + compactTools.width <= 380, 'Compact toolbar is clipped')
  assert.equal(await page.locator('.pet-tools button').count(), 2, 'Compact pet has too many permanent buttons')
  if (process.env.FINPET_E2E_SCREENSHOTS) await page.screenshot({ path: resolve(root, 'work', 'finpet-compact.png') })

  await page.locator('[title="打开行情面板"]').click()
  await page.waitForSelector('.dashboard-shell')
  const soundSetting = (await page.evaluate(() => window.finpet.getSnapshot())).settings.soundEnabled
  await openPanelOptions()
  await page.locator('[title="偏好设置"]').click()
  await page.waitForSelector('.preferences-dialog[open]')
  assert.equal(await page.locator('.preferences-brand span').innerText(), 'Daily Equity & Balance Buddy for You')
  await page.locator('[title="声音提醒"]').click()
  assert.equal((await page.evaluate(() => window.finpet.getSnapshot())).settings.soundEnabled, !soundSetting)
  await page.locator('[title="声音提醒"]').click()
  assert.equal((await page.evaluate(() => window.finpet.getSnapshot())).settings.soundEnabled, soundSetting)
  if (process.env.FINPET_E2E_SCREENSHOTS) await page.screenshot({ path: resolve(root, 'work', 'finpet-preferences.png') })
  await page.keyboard.press('Escape')
  await page.waitForSelector('.preferences-dialog', { state: 'detached' })
  const headerRegions = await page.locator('.header-actions').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).webkitAppRegion))
  assert.ok(headerRegions.every((region) => region === 'no-drag'), 'Header controls are inside a native draggable region')
  const expandedTools = await page.locator('.pet-tools').boundingBox()
  assert.ok(expandedTools.x >= 0 && expandedTools.x + expandedTools.width <= 208, 'Expanded toolbar overlaps the chart')
  await page.locator('.header-actions [title="收起行情面板"]').click()
  await page.waitForSelector('.dashboard-shell', { state: 'detached' })
  await page.locator('[title="打开行情面板"]').click()
  await page.waitForSelector('.dashboard-shell')
  await page.locator('[data-symbol="AAPL"]').click()
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Apple')

  const expanded = await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return { bounds: window.getBounds() }
  })
  assert.deepEqual([expanded.bounds.width, expanded.bounds.height], [880, 620])

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
    canvasCount: document.querySelectorAll('canvas').length
  }))
  assert.deepEqual([layout.scrollWidth, layout.scrollHeight], [layout.width, layout.height])
  assert.ok(layout.canvasCount > 0, 'financial chart canvas was not created')
  const sourceLayout = await page.evaluate(() => ({
    statusBottom: document.querySelector('.connection-status').getBoundingClientRect().bottom,
    speechTop: document.querySelector('.speech').getBoundingClientRect().top
  }))
  assert.ok(sourceLayout.statusBottom < sourceLayout.speechTop, 'Data-source status overlaps the character speech')
  if (process.env.FINPET_E2E_SCREENSHOTS) await page.screenshot({ path: resolve(root, 'work', 'finpet-expanded.png') })

  await page.getByRole('tab', { name: '提醒', exact: true }).click()
  await page.waitForSelector('#alerts-view:not([hidden])')
  assert.equal(await page.locator('#market-view').isVisible(), false)
  const originalAlerts = (await page.evaluate(() => window.finpet.getSnapshot())).settings.alerts
  await page.locator('[aria-label="目标价格"]').fill('999999')
  await page.locator('[title="添加提醒"]').click()
  await page.waitForFunction((count) => document.querySelectorAll('.alert-row').length === count + 1, originalAlerts.length)
  const addedAlert = page.locator('.alert-row').filter({ hasText: '999999.00' })
  assert.equal(await addedAlert.count(), 1)
  if (process.env.FINPET_E2E_SCREENSHOTS) await page.screenshot({ path: resolve(root, 'work', 'finpet-alerts.png') })
  await addedAlert.locator('[title="删除提醒"]').click()
  await page.waitForFunction((count) => document.querySelectorAll('.alert-row').length === count, originalAlerts.length)
  await page.locator('#tab-alerts').focus()
  await page.keyboard.press('ArrowLeft')
  assert.equal(await page.locator('#tab-market').getAttribute('aria-selected'), 'true')
  assert.equal(await page.locator('#tab-market').evaluate((element) => element === document.activeElement), true)
  await openPanelOptions()
  await page.mouse.click(250, 90)
  await page.waitForSelector('#panel-options:popover-open', { state: 'hidden' })

  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.setResizable(true)
    window.setBounds({ width: 390, height: 740 })
  })
  await page.waitForFunction(() => window.innerWidth <= 400)
  const narrowLayout = await page.evaluate(() => {
    const targets = ['.panel-navigation', '.panel-tabs', '.header-actions', '.quote-main', '.quote-meta', '.pet-tools']
    return targets.map((selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect()
      return { selector, left: rect.left, right: rect.right }
    })
  })
  assert.ok(narrowLayout.every(({ left, right }) => left >= 0 && right <= 390), `Narrow-screen controls overflow: ${JSON.stringify(narrowLayout)}`)
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.three-pet-canvas')
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let visible = 0
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 8) visible++
    return visible > 1_000
  })
  if (process.env.FINPET_E2E_SCREENSHOTS) await page.screenshot({ path: resolve(root, 'work', 'finpet-narrow.png') })
  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.setBounds({ width: 880, height: 620 })
    window.setResizable(false)
  })
  await page.waitForFunction(() => window.innerWidth === 880)

  const beforeShowcase = await page.evaluate(() => window.finpet.getSnapshot())
  await openPanelOptions()
  await page.locator('[title="打开演示"]').click()
  await page.waitForSelector('[data-showcase-scene="bullish"]')
  assert.match(await page.locator('.speech-kicker').innerText(), /演示数据/)
  await page.locator('[data-symbol="600519.SH"]').click()
  assert.equal((await page.evaluate(() => window.finpet.getSnapshot())).settings.selectedSymbol, beforeShowcase.settings.selectedSymbol, 'Showcase selection changed the real watchlist selection')
  await page.locator('[title="暂停演示"]').click()
  await page.locator('.header-actions [title="收起行情面板"]').click()
  await page.waitForSelector('.compact-showcase')
  const compactShowcase = await page.locator('.compact-showcase').boundingBox()
  assert.ok(compactShowcase.x >= 0 && compactShowcase.x + compactShowcase.width <= 380, 'Compact showcase controls are clipped')
  await openPetOptions()
  await page.locator('[title="近景视图"]').click()
  await page.waitForSelector('[data-view="portrait"]')
  if (process.env.FINPET_E2E_SCREENSHOTS) await page.screenshot({ path: resolve(root, 'work', 'finpet-showcase-compact.png') })
  await page.locator('[title="全身视图"]').click()
  await page.locator('[title="开启鼠标穿透"]').click()
  await closePetOptions()
  await page.locator('[aria-label="演示场景"]').selectOption('offline')
  await page.waitForSelector('.mascot-stage.mood-offline')
  await openPetOptions()
  await page.locator('[title="关闭鼠标穿透"]').click()
  await closePetOptions()
  await page.locator('[title="打开行情面板"]').click()
  await page.waitForSelector('.dashboard-shell')
  for (const [scene, expected] of [['bearish', 'bearish'], ['alert', 'alert'], ['offline', 'offline'], ['close', 'bullish']]) {
    await page.locator('[aria-label="演示场景"]').selectOption(scene)
    await page.waitForSelector(`.mascot-stage.mood-${expected}`)
  }
  await page.locator('[title="行情复盘"]').click()
  await page.waitForSelector('.recap-dialog[open]')
  assert.equal(await page.locator('#recap-title').innerText(), '收盘快照')
  assert.match(await page.locator('.recap-dialog').innerText(), /演示数据 · 非实盘/)
  assert.match(await page.locator('.recap-dialog footer').innerText(), /场景演示/)
  const recapImagePath = resolve(root, 'work', 'finpet-recap-export.png')
  await electronApp.evaluate(({ BrowserWindow }, path) => {
    globalThis.recapDownload = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Recap export timed out')), 10_000)
      BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, item) => {
        item.setSavePath(path)
        item.once('done', (_event, state) => { clearTimeout(timer); state === 'completed' ? resolve(item.getSavePath()) : reject(new Error(`Download ${state}`)) })
      })
    })
  }, recapImagePath)
  await page.locator('[title="导出复盘图片"]').click()
  assert.equal(await electronApp.evaluate(() => globalThis.recapDownload), recapImagePath)
  const exportedImage = await sharp(recapImagePath).metadata()
  assert.deepEqual([exportedImage.format, exportedImage.width, exportedImage.height], ['png', 1000, 728])
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.recapCopiedText = text } } })
  })
  await page.locator('[title="复制复盘文字"]').click()
  await page.waitForSelector('[title="复盘已复制"]')
  assert.match(await page.evaluate(() => window.recapCopiedText), /演示数据[\s\S]*场景演示[\s\S]*不构成投资建议/)
  assert.match(await page.evaluate(() => window.recapCopiedText), /^Debby /)
  if (process.env.FINPET_E2E_SCREENSHOTS) await page.screenshot({ path: resolve(root, 'work', 'finpet-recap.png') })
  await page.keyboard.press('Escape')
  await page.waitForSelector('.recap-dialog', { state: 'detached' })
  await page.locator('.showcase-controls [title="退出演示"]').click()
  await page.waitForSelector('.showcase-controls', { state: 'detached' })
  const afterShowcase = await page.evaluate(() => window.finpet.getSnapshot())
  assert.equal(afterShowcase.provider, beforeShowcase.provider, 'Showcase changed the real provider')
  for (const key of ['marketSource', 'marketDataUrl', 'selectedSymbol', 'watchlist', 'alerts']) {
    assert.deepEqual(afterShowcase.settings[key], beforeShowcase.settings[key], `Showcase changed real ${key}`)
  }
  assert.equal(afterShowcase.quotes[0].previousClose, beforeShowcase.quotes[0].previousClose, 'Showcase contaminated backend quotes')

  relay = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(relay, 'listening')
  const connection = once(relay, 'connection')
  await page.evaluate((url) => window.finpet.updateSettings({ marketDataUrl: url, marketSource: 'remote', alerts: [] }), `ws://127.0.0.1:${relay.address().port}`)
  const [client] = await connection
  const benchmark = snapshot.quotes.find((quote) => quote.symbol === '000001.SH')
  const stock = snapshot.quotes.find((quote) => quote.symbol === 'AAPL')
  for (const [changePct, expected] of [[0.8, 'bullish'], [-0.8, 'bearish'], [0.02, 'idle']]) {
    client.send(JSON.stringify([
      { ...benchmark, changePct, price: benchmark.previousClose * (1 + changePct / 100), timestamp: Date.now() },
      { ...stock, changePct: -changePct * 10, timestamp: Date.now() }
    ]))
    await page.waitForSelector(`.mascot-stage.mood-${expected}`)
    assert.match(await page.locator('.speech strong').innerText(), /上证指数/, 'Selected stock replaced the mood benchmark')
    assert.equal(await page.locator('.three-pet-host').getAttribute('data-mood'), expected)
  }
  client.close()
  await page.waitForSelector('.mascot-stage.mood-offline')
  assert.deepEqual(pageErrors, [], 'Renderer failed during view and mood changes')

  await electronApp.evaluate(({ app }) => app.quit())
  await electronApp.close()
  electronApp = undefined

  const persisted = JSON.parse(await readFile(resolve(userData, 'settings.json'), 'utf8'))
  assert.equal(persisted.selectedSymbol, 'AAPL')
  assert.equal(persisted.panelOpen, true)
  console.log('Electron E2E passed: avatar, textures, transparency, pat/lift/land, views, drag/persistence, rotation/reset, two-button dock, popover dismissal, click-through, preferences persistence, keyboard tabs, alerts, isolated showcase, closing recap, IPC validation, index moods, disconnect, window and chart.')
} finally {
  if (electronApp) await electronApp.close().catch(() => undefined)
  if (relay) {
    for (const client of relay.clients) client.terminate()
    await new Promise((resolve) => relay.close(resolve))
  }
  await rm(userData, { recursive: true, force: true })
}
