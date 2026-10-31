import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const userData = await mkdtemp(resolve(tmpdir(), 'debby-read-aloud-'))
let application
try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.', '--mute-audio'], cwd: root,
    env: { ...process.env, DEBBY_QWEN_API_KEY: '', FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo' } })
  const page = await application.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForSelector('[data-3d-ready="true"]', { timeout: 30000 })
  await page.getByRole('button', { name: '快速对话', exact: true }).click()
  await page.locator('[title="文字对话"]').click()
  await page.evaluate(() => {
    window.readAloudMediaRequests = 0
    navigator.mediaDevices.getUserMedia = async () => { window.readAloudMediaRequests++; throw Error('No devices in speech-output test') }
  })
  const speaker = page.getByRole('button', { name: '阿里云自动朗读', exact: true })
  assert.equal(await speaker.getAttribute('aria-pressed'), 'false')
  await speaker.click()
  const config = page.getByRole('dialog', { name: '通义 BYOK', exact: true })
  await config.getByLabel('百炼 API Key', { exact: true }).fill('synthetic-tts-ui-key-123456789')
  await config.getByRole('button', { name: '保存通义配置' }).click()
  await config.waitFor({ state: 'detached' })
  await application.evaluate(({ net, ipcMain, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window.webContents.isOffscreen()) window.isVisible = () => true
    const state = { revision: 100, config: { configured: true, cloudConsent: true, storage: 'none', modelId: 'TTS 界面测试' }, busy: false, messages: [] }
    globalThis.readAloudUpdate = (id, text, done) => {
      state.busy = !done
      state.messages = [{ id: `user-${id}`, role: 'user', text: '你好', status: 'done', timestamp: Date.now() },
        { id, role: 'assistant', text, status: done ? 'done' : 'streaming', timestamp: Date.now() }]
      state.revision++; window.webContents.send('chat:changed', state)
    }
    for (const channel of ['chat:state', 'chat:cancel']) ipcMain.removeHandler(channel)
    ipcMain.handle('chat:state', () => state)
    ipcMain.handle('chat:cancel', () => {})
    window.webContents.send('chat:changed', state)
    globalThis.readAloudRequests = []
    globalThis.readAloudTexts = []
    globalThis.holdStream = true
    net.fetch = async (url, init) => {
      const parsed = new URL(String(url))
      if (parsed.origin === 'https://token-plan.cn-beijing.maas.aliyuncs.com' && parsed.pathname.endsWith('/SpeechSynthesizer')) {
        if (new Headers(init.headers).get('Authorization') !== 'Bearer synthetic-tts-ui-key-123456789') throw Error('Missing synthesis credentials')
        globalThis.readAloudRequests.push(JSON.parse(init.body).model)
        globalThis.readAloudTexts.push(JSON.parse(init.body).input.text)
        if (globalThis.holdTts) {
          globalThis.heldTtsSignal = init.signal
          await new Promise((resolve) => { globalThis.finishHeldTts = resolve })
        }
        if (!globalThis.fallbackTts) {
          if (new Headers(init.headers).get('X-DashScope-SSE') !== 'enable') throw Error('Expected streaming synthesis')
          const pcm = new Uint8Array(48000), pcmView = new DataView(pcm.buffer)
          for (let i = 0; i < 24000; i++) pcmView.setInt16(i * 2, Math.sin(i * Math.PI * 440 / 24000) * 5000, true)
          let binary = ''; for (const byte of pcm) binary += String.fromCharCode(byte)
          const frame = new TextEncoder().encode(`data: ${JSON.stringify({ output: { type: 'sentence-synthesis', audio: { data: btoa(binary) } } })}\n\n`)
          return new Response(new ReadableStream({ start(controller) {
            controller.enqueue(frame)
            const finish = () => { controller.enqueue(frame); controller.enqueue(new TextEncoder().encode('data: {"output":{"finish_reason":"stop"}}\n\n')); controller.close(); globalThis.streamFinished = true }
            if (globalThis.holdStream) { globalThis.finishStream = finish; globalThis.streamFinished = false }
            else finish()
          } }), { headers: { 'Content-Type': 'text/event-stream' } })
        }
        return Response.json({ output: { audio: { url: 'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/fixture.wav?signature=synthetic' } } })
      }
      if (parsed.origin !== 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com' || new Headers(init.headers).has('Authorization')) throw Error('Unsafe audio download')
      globalThis.readAloudRequests.push('HTTPS audio download')
      const bytes = new Uint8Array(44 + 24000 * 2 * 3), view = new DataView(bytes.buffer)
      for (const [at, tag] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) for (let i = 0; i < tag.length; i++) bytes[at + i] = tag.charCodeAt(i)
      view.setUint32(4, bytes.length - 8, true); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
      view.setUint32(24, 24000, true); view.setUint32(28, 48000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, bytes.length - 44, true)
      for (let i = 0; i < 72000; i++) view.setInt16(44 + i * 2, Math.sin(i * Math.PI * 440 / 24000) * 5000, true)
      return new Response(bytes, { headers: { 'Content-Type': 'audio/wav' } })
    }
  })
  const update = (id, text, done) => application.evaluate((_electron, args) => globalThis.readAloudUpdate(...args), [id, text, done])
  const mouthMoving = () => page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.mouth) > 0.05)
  const mouthStopped = () => page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.mouth) < 0.01)
  await speaker.click()
  assert.equal(await speaker.getAttribute('aria-pressed'), 'true')
  await update('first', '【模拟回复】完整的第一句', false)
  await page.waitForFunction(() => document.querySelector('.dialogue-text').textContent.includes('完整的第一句'))
  assert.deepEqual(await application.evaluate(() => globalThis.readAloudRequests), [], 'Streaming text must not trigger TTS')
  await update('first', '【模拟回复】完整的第一句话。第二句话还在生成', false)
  await mouthMoving()
  assert.equal((await page.evaluate(() => window.finpet.getChatState())).busy, true, 'Speech must start before the agent finishes its text')
  assert.equal(await application.evaluate(() => globalThis.streamFinished), false, 'Playback must start before the TTS response finishes')
  assert.deepEqual(await application.evaluate(() => globalThis.readAloudRequests), ['qwen-audio-3.0-tts-plus'])
  await update('first', '【模拟回复】完整的第一句话。第二句话还在生成，稍后会继续。', true)
  await application.evaluate(() => { globalThis.holdStream = false; globalThis.finishStream() })
  await page.waitForFunction(async () => !(await window.finpet.getChatState()).busy)
  await page.screenshot({ path: resolve(root, 'work', 'debby-read-aloud.png') })
  await page.locator('[title="停止回复"]').click()
  await mouthStopped()
  assert.equal((await page.evaluate(() => window.finpet.getChatState())).messages.at(-1).status, 'done')
  await application.evaluate(() => { globalThis.fallbackTts = true })
  await update('second', '【模拟回复】锁屏时停止朗读。', true)
  await mouthMoving()
  assert.equal(await application.evaluate(() => globalThis.readAloudRequests.includes('HTTPS audio download')), true)
  await application.evaluate(({ powerMonitor }) => powerMonitor.emit('lock-screen'))
  await mouthStopped()
  await page.waitForSelector('[title="发送消息"]')
  await application.evaluate(() => { globalThis.holdTts = true })
  await update('delayed', '【模拟回复】迟到音频应当丢弃。', true)
  await page.waitForFunction(() => document.querySelector('.dialogue-nameplate').textContent.includes('准备声音'))
  await page.locator('[title="停止回复"]').click()
  assert.equal(await application.evaluate(() => globalThis.heldTtsSignal.aborted), true)
  await application.evaluate(() => { globalThis.holdTts = false; globalThis.finishHeldTts() })
  await page.waitForSelector('[title="发送消息"]')
  await update('exit', '【模拟回复】切换页面结束朗读。', true)
  await mouthMoving()
  await page.getByRole('tab', { name: '行情', exact: true }).click()
  await mouthStopped()
  const count = await application.evaluate(() => globalThis.readAloudRequests.length)
  await page.getByRole('button', { name: '快速对话', exact: true }).click()
  assert.equal(await speaker.getAttribute('aria-pressed'), 'false', 'Leaving chat must reset automatic speech')
  assert.equal(await application.evaluate(() => globalThis.readAloudRequests.length), count, 'Reopening chat must not replay the last response')
  assert.equal(await page.evaluate(() => window.readAloudMediaRequests), 0)
  assert.equal((await page.evaluate(() => window.finpet.getVoiceState())).active, false)
  await application.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setResizable(true); window.setBounds({ width: 390, height: 740 }) })
  await page.waitForFunction(() => innerWidth <= 400)
  const toolbar = await page.locator('.dialogue-toolbar').boundingBox()
  assert.ok(toolbar.x >= 0 && toolbar.x + toolbar.width <= 390)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), true)
  await page.screenshot({ path: resolve(root, 'work', 'debby-read-aloud-narrow.png') })
  assert.deepEqual(errors, [])
  console.log('Read-aloud UI E2E passed: speech before text completion AND TTS completion, PCM streaming, sentence queue, BYOK reuse, opt-in, signed-URL fallback over HTTPS without credentials, mouth amplitude, stop, lock-screen, cancellation, page exit, no replay, narrow layout and no media/LLM requests. Fixture TTS only.')
} catch (error) {
  if (application) {
    const page = await application.firstWindow()
    console.log('Safe read-aloud diagnostics:', await page.evaluate(async () => ({ feedback: document.querySelector('.dialogue-feedback')?.textContent,
      nameplate: document.querySelector('.dialogue-nameplate')?.textContent, busy: (await window.finpet.getChatState()).busy })))
  }
  throw error
} finally {
  if (application) await application.close()
  await rm(userData, { recursive: true, force: true })
}
