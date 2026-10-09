import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const userData = await mkdtemp(resolve(tmpdir(), 'debby-voice-ui-'))
let application
let diagnostics = ''
try {
  // NV12 fake capture crashes the Windows service on some GPUs; test with CPU I420.
  application = await electron.launch({ executablePath: require('electron'), args: ['.', '--use-fake-device-for-media-stream', '--mute-audio', '--disable-features=MediaFoundationD3D11VideoCapture'], cwd: root,
    env: { ...process.env, DEBBY_QWEN_API_KEY: '', FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo' } })
  application.process().stderr.on('data', (chunk) => { diagnostics = (diagnostics + chunk.toString()).slice(-12000) })
  const page = await application.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForSelector('[data-3d-ready="true"]', { timeout: 30000 })
  await page.evaluate(() => window.finpet.togglePanel())
  const denied = await page.evaluate(async () => {
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach((track) => track.stop()); return false } catch { return true }
  })
  assert.equal(denied, true, 'Media access must be denied outside an explicit session')
  await page.evaluate(async () => {
    const state = await window.finpet.getVoiceState()
    await window.finpet.configureVoice({ ...state.config, apiKey: 'synthetic-ui-test-key-123456789' })
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    window.testMediaTracks = []
    window.testTrackStops = []
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await original(...args)
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track)
        track.stop = () => { window.testTrackStops.push(new Error('track stopped').stack); stop() }
      }
      window.testMediaTracks.push(...stream.getTracks())
      return stream
    }
  })
  // Replace only network inference inside this isolated main process. No real credentials or cloud calls.
  await application.evaluate(({ net }) => {
    globalThis.testVoiceRequests = []
    net.fetch = async (url, init) => {
      if (!String(url).startsWith('https://token-plan.cn-beijing.maas.aliyuncs.com/')) throw Error('Unexpected external request blocked by test')
      const body = JSON.parse(init.body)
      globalThis.testVoiceRequests.push({ model: body.model, image: JSON.stringify(body).includes('image_url'), audio: Boolean(body.input?.messages?.[0]?.content?.[0]?.input_audio) })
      if (String(url).includes('/chat/completions')) return new Response(`data: ${JSON.stringify({ id: 'test', choices: [{ index: 0, delta: { role: 'assistant', content: '【模拟服务】我在呢。今天慢慢来，我们一起聊聊。' }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
      if (String(url).includes('SpeechSynthesizer')) {
        const bytes = new Uint8Array(44 + 24000 * 2 * 3), view = new DataView(bytes.buffer)
        const tag = (at, text) => { for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i) }
        tag(0, 'RIFF'); tag(8, 'WAVE'); tag(12, 'fmt '); tag(36, 'data')
        view.setUint32(4, bytes.length - 8, true); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
        view.setUint32(24, 24000, true); view.setUint32(28, 48000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, bytes.length - 44, true)
        for (let i = 0; i < 72000; i++) view.setInt16(44 + i * 2, Math.sin(i * Math.PI * 440 / 24000) * 5000, true)
        return new Response(bytes, { headers: { 'Content-Type': 'audio/wav' } })
      }
      return Response.json({ output: { text: '【模拟麦克风】今天有一点累。' } })
    }
  })
  await page.getByRole('tab', { name: '对话', exact: true }).click()
  await page.locator('[title="通义陪伴"]').click()
  await page.getByRole('button', { name: '开始陪伴', exact: true }).click()
  const consent = page.getByRole('dialog', { name: '陪你聊聊', exact: true })
  assert.equal(await consent.getByRole('checkbox').first().isChecked(), false)
  assert.equal(await consent.getByRole('checkbox').nth(1).isChecked(), false)
  assert.equal(await consent.getByRole('button', { name: '开始陪伴' }).isEnabled(), false)
  await consent.getByRole('checkbox').first().check()
  await consent.getByRole('checkbox').nth(1).check()
  await consent.getByRole('button', { name: '开始陪伴' }).click()
  await page.waitForSelector('.companion-camera video')
  await page.waitForFunction(() => document.querySelector('.companion-camera video')?.videoWidth > 0)
  console.log('Voice UI step: camera ready')
  assert.equal(await application.evaluate(() => globalThis.testVoiceRequests.length), 0, 'Session start must not generate a cloud request')
  await page.locator('[title="录音对话"]').click()
  await page.waitForSelector('[data-recording="on"]', { timeout: 15000 })
  console.log('Voice UI step: recorder ready')
  await page.waitForTimeout(700)
  await page.locator('[title="结束录音并发送"]').click()
  await page.waitForFunction(() => document.querySelector('.dialogue-text').textContent.includes('模拟服务'))
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.mouth) > 0.05)
  const requests = await application.evaluate(() => globalThis.testVoiceRequests)
  assert.deepEqual(requests.map((value) => value.model), ['qwen-audio-3.0-asr-flash', 'qwen3.8-flash', 'qwen-audio-3.0-tts-plus'])
  assert.equal(requests[0].audio, true)
  assert.equal(requests[1].image, true)
  assert.equal(await page.evaluate(() => window.testMediaTracks.filter((track) => track.kind === 'audio').every((track) => track.readyState === 'ended')), true)
  await page.screenshot({ path: resolve(root, 'work', 'debby-voice-desktop-test.png') })
  await page.locator('[title="停止回复"]').click()
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.mouth) < 0.01)
  await page.locator('.companion-camera [title="关闭摄像头"]').click()
  await page.waitForSelector('.companion-camera', { state: 'detached' })
  assert.equal(await page.evaluate(() => window.testMediaTracks.every((track) => track.readyState === 'ended')), true)
  await page.getByRole('textbox', { name: '对 Debby 说' }).fill('不开摄像头也能聊天')
  await page.locator('[title="发送消息"]').click()
  await page.waitForFunction(() => document.querySelector('.dialogue-question').textContent.includes('不开摄像头'))
  const lastChats = await application.evaluate(() => globalThis.testVoiceRequests.filter((value) => value.model === 'qwen3.8-flash'))
  assert.equal(lastChats.at(-1).image, false, 'Old camera frames must not be replayed')
  await page.locator('[title="停止回复"]').click()
  await application.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setResizable(true); window.setBounds({ width: 390, height: 740 }) })
  await page.waitForFunction(() => innerWidth <= 400)
  const input = await page.locator('.dialogue-input').boundingBox()
  assert.ok(input.x >= 0 && input.x + input.width <= 390)
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.three-pet-canvas')
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 32) count++
    return count > 1000
  })
  const pixels = await page.locator('.three-pet-canvas').evaluate((canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 32) count++
    return count
  })
  assert.ok(pixels > 1000, '3D canvas must remain nonblank at narrow width')
  await page.screenshot({ path: resolve(root, 'work', 'debby-voice-narrow-test.png') })
  await page.locator('[title="开启摄像头"]').click()
  await page.waitForSelector('.companion-camera')
  await page.getByRole('tab', { name: '行情', exact: true }).click()
  await page.waitForFunction(async () => !(await window.finpet.getVoiceState()).active)
  assert.equal(await page.evaluate(() => window.testMediaTracks.every((track) => track.readyState === 'ended')), true)
  assert.equal((await page.evaluate(() => window.finpet.getVoiceState())).chat.messages.length, 0)
  assert.deepEqual(errors, [])
  console.log('Voice UI E2E passed: permission gate, explicit consent, fake camera/microphone, WAV capture, pi chat, TTS playback, real amplitude lipsync, interruption, frame expiry, track cleanup, tab exit and desktop/narrow pixels. No real devices or cloud models used.')
} catch (error) {
  console.log('Electron diagnostics:', diagnostics)
  if (application) {
    const page = await application.firstWindow()
    console.log('Safe voice UI diagnostics:', await page.evaluate(async () => ({ active: (await window.finpet.getVoiceState()).active,
      phase: (await window.finpet.getVoiceState()).phase, feedback: document.querySelector('.dialogue-feedback')?.textContent, hidden: document.hidden,
      tracks: window.testMediaTracks?.map((track) => ({ kind: track.kind, state: track.readyState })), stops: window.testTrackStops })))
    await page.screenshot({ path: resolve(root, 'work', 'debby-voice-ui-failure.png') })
  }
  throw error
} finally {
  if (application) await application.close()
  await rm(userData, { recursive: true, force: true })
}
