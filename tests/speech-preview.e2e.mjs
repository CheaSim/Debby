import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
const root = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url)
const userData = await mkdtemp(resolve(tmpdir(), 'debby-speech-preview-'))
let app
try {
  app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env: { ...process.env, FINPET_E2E_BACKGROUND: '1', FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo', DEBBY_QWEN_API_KEY: 'synthetic-speech-preview-key-123456' } })
  let page = await app.firstWindow(); const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.waitForSelector('[data-3d-ready=true]', { timeout: 30000 })
  await page.evaluate(async () => {
    const s = await window.finpet.getVoiceState()
    await window.finpet.configureVoice({ ...s.config, speech: { style: 'natural' } })
    navigator.mediaDevices.getUserMedia = async () => { throw Error('Preview must open no devices') }
  })
  await app.evaluate(({ net }) => {
    globalThis.previewRequests = []
    net.fetch = async (_url, init) => {
      const body = JSON.parse(init.body); globalThis.previewRequests.push(body)
      if (!String(_url).includes('SpeechSynthesizer')) throw Error('Unexpected network request')
      if (globalThis.holdPreview) {
        globalThis.previewSignal = init.signal
        await new Promise(resolve => { globalThis.finishPreview = resolve })
      }
      const bytes = new Uint8Array(44 + 72000), v = new DataView(bytes.buffer)
      for (const [at, tag] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) for (let i = 0; i < tag.length; i++) bytes[at + i] = tag.charCodeAt(i)
      v.setUint32(4, bytes.length - 8, true); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 24000, true); v.setUint32(28, 48000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); v.setUint32(40, bytes.length - 44, true)
      for (let i = 0; i < 36000; i++) v.setInt16(44 + i * 2, Math.sin(i * Math.PI * 440 / 24000) * 5000, true)
      return new Response(bytes, { headers: { 'Content-Type': 'audio/wav' } })
    }
  })
  await page.getByRole('button', { name: '快速对话', exact: true }).click()
  const open = async () => { await page.getByTitle('更多对话选项', { exact: true }).click(); await page.getByRole('button', { name: '声音试听', exact: true }).click() }
  await open()
  await page.getByLabel('声音语气', { exact: true }).selectOption('bright')
  await page.getByLabel('试听台词', { exact: true }).fill('你好呀，今天也一起加油吧。')
  await page.getByRole('button', { name: '试听这句话', exact: true }).click()
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.mouth) > .05)
  const request = await app.evaluate(() => globalThis.previewRequests[0])
  assert.match(request.input.instruction, /动漫少女/)
  assert.equal(request.input.text, '你好呀，今天也一起加油吧。')
  assert.equal(request.input.rate, 1.03); assert.equal(request.input.pitch, 1.02)
  assert.equal((await page.evaluate(() => window.finpet.getVoiceState())).config.speech.style, 'natural', 'Preview must not save the draft')
  await page.getByRole('button', { name: '停止试听', exact: true }).click()
  await page.getByLabel('声音语气', { exact: true }).selectOption('gentle')
  await page.getByText('语速、音调与自定义指令', { exact: true }).click()
  await page.getByLabel('声音语气指令', { exact: true }).fill('请用普通话，轻柔、可爱地说，停顿自然。')
  assert.equal(await page.getByLabel('声音语气', { exact: true }).inputValue(), 'custom')
  await page.getByLabel('试听语速', { exact: true }).fill('0.94')
  await page.getByRole('button', { name: '保存通义配置', exact: true }).click()
  await page.getByRole('dialog', { name: '通义 BYOK', exact: true }).waitFor({ state: 'detached' })
  await page.reload(); await page.waitForSelector('[data-3d-ready=true]', { timeout: 30000 }); await page.getByRole('button', { name: '快速对话', exact: true }).click(); await open()
  assert.equal(await page.getByLabel('声音语气', { exact: true }).inputValue(), 'custom')
  assert.equal((await page.evaluate(() => window.finpet.getVoiceState())).config.speech.rate, .94)
  await app.evaluate(() => { globalThis.holdPreview = true })
  await page.getByRole('button', { name: '试听这句话', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.speech-preview-actions').textContent.includes('生成中'))
  await app.evaluate(async () => {
    const deadline = Date.now() + 5000
    while (!globalThis.previewSignal && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    if (!globalThis.previewSignal) throw Error('Provider did not start')
  })
  await page.getByRole('button', { name: '停止试听', exact: true }).click()
  assert.equal(await app.evaluate(() => globalThis.previewSignal.aborted), true)
  await app.evaluate(() => { globalThis.holdPreview = false; globalThis.finishPreview() })
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.mouth) < .01)
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setResizable(true); w.setBounds({ width: 390, height: 740 }) })
  await page.waitForFunction(() => innerWidth <= 400)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), true)
  const bounds = await page.getByRole('dialog', { name: '通义 BYOK', exact: true }).boundingBox()
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390)
  await mkdir(resolve(root, 'work/speech-preview'), { recursive: true })
  await page.screenshot({ path: resolve(root, 'work/speech-preview/narrow.png') })
  assert.deepEqual(errors, [])
  assert.deepEqual(await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { visible: w.isVisible(), focused: w.isFocused(), muted: w.webContents.isAudioMuted() } }), { visible: false, focused: false, muted: true })
  assert.equal((await page.evaluate(() => window.finpet.getVoiceState())).active, false)
  console.log('Speech preview E2E passed: draft style, real audio decoding/playback/mouth, custom controls, save/reload, cancel/late audio, narrow layout; hidden/muted, fixture TTS only, no devices or LLM.')
} finally { await app?.close(); await rm(userData, { recursive: true, force: true }) }
