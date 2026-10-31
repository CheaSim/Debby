import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'

const root = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url)
const userData = await mkdtemp(resolve(tmpdir(), 'debby-performance-'))
let app, page
const errors = []
try {
  app = await electron.launch({ executablePath: require('electron'), args: ['.', '--mute-audio'], cwd: root,
    env: { ...process.env, FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo' } })
  page = await app.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForSelector('[data-3d-ready=true]', { timeout: 30000 })
  const studio = async () => {
    await page.getByTitle('桌宠选项', { exact: true }).click()
    await page.getByTitle('学跳舞', { exact: true }).click()
    await page.waitForSelector('.dance-dialog[open]')
  }
  await studio()
  await page.getByLabel('舞台表情风格').selectOption('gentle')
  await page.getByRole('checkbox', { name: '循环', exact: true }).check()
  await page.getByTitle('播放 Debby 的小小律动', { exact: true }).click()
  await page.waitForSelector('[data-dance-id=welcome][data-emotion-source=dance]')
  assert.equal((await page.evaluate(() => window.finpet.getDanceState())).playback.expressionStyle, 'gentle')
  await page.getByRole('button', { name: '快速对话', exact: true }).click()
  await page.waitForSelector('.app-dialogue [data-dance-id=welcome]')
  assert.ok((await page.evaluate(() => window.finpet.getDanceState())).playback, 'Opening chat keeps the real dance playing')
  await page.getByTitle('文字对话', { exact: true }).click()
  await app.evaluate(({ ipcMain, BrowserWindow, net }) => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window.webContents.isOffscreen()) {
      // Exercise speech eligibility in isolation while the real OS window stays hidden and muted.
      globalThis.performanceNativeVisible = window.isVisible.bind(window)
      window.isVisible = () => true
    }
    const state = { revision: 100, config: { configured: true, cloudConsent: true, storage: 'none', modelId: '表情联动验证' }, busy: false, messages: [] }
    ipcMain.removeHandler('chat:state'); ipcMain.handle('chat:state', () => state)
    globalThis.performanceReply = ({ text, expressions, status = 'done', turn = 'one' }) => {
      state.busy = status === 'streaming'
      state.messages = text === undefined ? [] : [
        { id: `u-${turn}`, role: 'user', text: '今天有点累，陪我一下吧。', status: 'done', timestamp: 0 },
        { id: `a-${turn}`, role: 'assistant', text, expressions, status, timestamp: 1 }
      ]
      state.revision++; window.webContents.send('chat:changed', state)
    }
    globalThis.performanceTtsTexts = []
    globalThis.performanceHoldTts = true
    net.fetch = async (url, init) => {
      if (!String(url).endsWith('/SpeechSynthesizer')) throw Error('Unexpected network in isolated performance test')
      globalThis.performanceTtsTexts.push(JSON.parse(init.body).input.text)
      if (globalThis.performanceHoldTts) await new Promise(resolve => { globalThis.performanceReleaseTts = resolve })
      const bytes = Buffer.alloc(48000)
      for (let n = 0; n < 24000; n++) bytes.writeInt16LE(Math.round(Math.sin(n * Math.PI * 440 / 24000) * 5000), n * 2)
      return new Response(`data: ${JSON.stringify({ output: { type: 'sentence-synthesis', audio: { data: bytes.toString('base64') } } })}\n\ndata: {"output":{"finish_reason":"stop"}}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
    }
  })
  const emit = value => app.evaluate((_electron, value) => globalThis.performanceReply(value), value)
  await emit({ text: '辛苦啦，先休息一下。', expressions: [{ offset: 0, emotion: 'caring', intensity: .8, source: 'model' }], status: 'streaming' })
  await page.waitForSelector('[data-emotion=caring][data-emotion-source=conversation][data-dance-id=welcome]')
  const pose = await page.locator('.three-pet-host').getAttribute('data-dance-pose')
  await emit({ text: '辛苦啦，先休息一下。谢谢你喜欢我呀。', expressions: [
    { offset: 0, emotion: 'caring', intensity: .8, source: 'model' },
    { offset: '辛苦啦，先休息一下。'.length, emotion: 'shy', intensity: .8, source: 'model' }
  ] })
  await page.waitForSelector('[data-emotion=shy][data-emotion-source=conversation]')
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.blush) > .2)
  await page.waitForFunction(previous => document.querySelector('.three-pet-host').dataset.dancePose !== previous, pose)
  await page.screenshot({ path: resolve(root, 'work/performance-chat-dance.png') })
  await emit({ text: '已停止', status: 'cancelled', expressions: [] })
  await page.waitForSelector('[data-emotion-source=dance]')
  // Real AudioContext + real PCM playback. Synthetic speech provider; no cloud or devices.
  const speaker = page.getByRole('button', { name: '阿里云自动朗读', exact: true })
  await speaker.click()
  const config = page.getByRole('dialog', { name: '通义 BYOK', exact: true })
  await config.getByLabel('百炼 API Key', { exact: true }).fill('synthetic-performance-key-123456789')
  await config.getByRole('button', { name: '保存通义配置' }).click()
  await config.waitFor({ state: 'detached' })
  await emit({})
  await speaker.click()
  const first = '辛苦啦，先休息一下。', second = '谢谢你一直喜欢我呀。'
  await emit({ turn: 'spoken', text: first + second, expressions: [
    { offset: 0, emotion: 'caring', intensity: .8, source: 'model' },
    { offset: first.length, emotion: 'shy', intensity: .8, source: 'model' }
  ] })
  await page.waitForFunction(() => document.querySelector('.dialogue-text').textContent.includes('谢谢你一直'))
  await page.waitForFunction(() => document.querySelector('.three-pet-host').dataset.emotionSource === 'dance')
  await app.evaluate(async () => {
    const end = Date.now() + 5000
    while (!globalThis.performanceReleaseTts && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10))
    if (!globalThis.performanceReleaseTts) throw Error('No synthesis request')
    globalThis.performanceHoldTts = false; globalThis.performanceReleaseTts()
  })
  await page.waitForSelector('[data-emotion=caring][data-emotion-source=conversation]')
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.mouth) > .05)
  await page.waitForSelector('[data-emotion=shy][data-emotion-source=conversation]')
  assert.deepEqual(await app.evaluate(() => globalThis.performanceTtsTexts), [first, second])
  assert.equal(await page.locator('.dialogue-text').textContent().then(t => t.includes('[[emotion:')), false)
  await emit({ turn: 'interrupt', text: first + second, expressions: [
    { offset: 0, emotion: 'caring', intensity: .8, source: 'model' },
    { offset: first.length, emotion: 'shy', intensity: .8, source: 'model' }
  ] })
  await page.waitForSelector('[data-emotion=caring][data-emotion-source=conversation]')
  await speaker.click()
  await page.waitForSelector('[data-emotion-source=dance]')
  await page.waitForTimeout(1200)
  assert.equal(await page.locator('.three-pet-host').getAttribute('data-emotion-source'), 'dance', 'Stopping audio must not replay a queued future expression as text')
  await emit({})
  // Imported facial timeline shares the exact dance clock, including pause and seek.
  const motion = await page.evaluate(async () => (await window.finpet.getDanceAsset('welcome')).motion)
  motion.name = '有表情的小小律动'
  motion.expressions = [{ time: 0, duration: 2, emotion: 'shy', intensity: .8 }, { time: 4, duration: 4, emotion: 'proud', intensity: .8 }]
  await studio()
  await page.getByLabel('导入舞蹈动作', { exact: true }).setInputFiles({ name: 'performance.debbydance.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(motion)) })
  await page.getByTitle(`播放 ${motion.name}`, { exact: true }).waitFor()
  await page.getByLabel('舞台表情风格').selectOption('auto')
  await page.getByRole('checkbox', { name: '循环', exact: true }).check()
  await page.getByTitle(`播放 ${motion.name}`, { exact: true }).click()
  const imported = (await page.evaluate(() => window.finpet.getDanceState())).library.find(entry => entry.name === motion.name)
  await page.waitForSelector(`[data-dance-id="${imported.id}"]`)
  await page.getByTitle('暂停跳舞', { exact: true }).click()
  const seek = page.getByRole('slider', { name: '舞蹈播放进度' })
  await seek.fill('4.5'); await page.waitForSelector('[data-emotion=proud][data-emotion-source=dance]')
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.danceTime) === 4.5)
  await page.waitForTimeout(300) // Allow the existing 220 ms clip-entry blend to settle.
  const held = await page.locator('.three-pet-host').getAttribute('data-dance-pose')
  await page.waitForTimeout(350)
  assert.equal(await page.locator('.three-pet-host').getAttribute('data-dance-pose'), held)
  await seek.fill('0.5'); await page.waitForSelector('[data-emotion=shy][data-emotion-source=dance]')
  await seek.fill('3'); await page.waitForSelector('[data-emotion-source=""]')
  await page.getByTitle('停止跳舞', { exact: true }).click()
  await page.waitForSelector('[data-view=portrait]')
  assert.deepEqual(errors, [])
  if (process.env.FINPET_E2E_BACKGROUND === '1') assert.deepEqual(await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; return { visible: globalThis.performanceNativeVisible(), focused: window.isFocused(), muted: window.webContents.isAudioMuted() } }), { visible: false, focused: false, muted: true })
  console.log('Performance E2E passed: dialogue faces, blush, dancing through chat, real PCM sentence sync, cancellation, imported cue timeline, pause/seek, portrait restoration.')
} catch (error) {
  await page?.screenshot({ path: resolve(root, 'work/performance-failure.png') }).catch(() => {})
  throw error
} finally { await app?.close(); await rm(userData, { recursive: true, force: true }) }
