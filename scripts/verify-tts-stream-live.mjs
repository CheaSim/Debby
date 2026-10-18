// Opt-in real TTS check with a deterministic text source. No real LLM or capture devices.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const env = { ...process.env }
for (const [name, value] of Object.entries(parseEnv(await readFile(resolve(root, '.env'), 'utf8').catch(() => '')))) {
  if (name.startsWith('DEBBY_QWEN_') && env[name] === undefined) env[name] = value
}
assert.ok(env.DEBBY_QWEN_API_KEY, 'Configure your own local DEBBY_QWEN_API_KEY first')
const userData = await mkdtemp(resolve(tmpdir(), 'debby-stream-live-'))
let application, stage = 'launch', safeFailure
try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.', '--mute-audio'], cwd: root,
    env: { ...env, ELECTRON_RENDERER_URL: '', FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo' } })
  const page = await application.firstWindow()
  await page.waitForSelector('[data-3d-ready="true"]', { timeout: 30000 })
  await page.getByRole('button', { name: '快速对话', exact: true }).click()
  await page.locator('[title="文字对话"]').click()
  await application.evaluate(({ ipcMain, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    const state = { revision: 100, config: { configured: true, cloudConsent: true, storage: 'none', modelId: '真实 TTS · 模拟文字源' }, busy: false, messages: [] }
    globalThis.updateLiveText = (text, done) => {
      state.busy = !done; state.revision++
      state.messages = [{ id: 'live-user', role: 'user', text: '你好', status: 'done', timestamp: Date.now() },
        { id: 'live-reply', role: 'assistant', text, status: done ? 'done' : 'streaming', timestamp: Date.now() }]
      window.webContents.send('chat:changed', state)
    }
    ipcMain.removeHandler('chat:state'); ipcMain.handle('chat:state', () => state)
    window.webContents.send('chat:changed', state)
  })
  await page.getByRole('button', { name: '阿里云自动朗读', exact: true }).click()
  await page.evaluate(() => {
    window.streamMetrics = { started: performance.now(), chunks: 0, bytes: 0, formats: [], done: false }
    window.removeLiveSpeechListener = window.finpet.onReadAloudAudio((event) => {
      const stats = window.streamMetrics
      if (event.error) stats.error = event.error
      if (event.done) { stats.done = true; stats.synthesisDoneMs = performance.now() - stats.started; return }
      stats.firstAudioMs ??= performance.now() - stats.started
      stats.chunks++; stats.bytes += event.bytes.length
      if (!stats.formats.includes(event.format)) stats.formats.push(event.format)
    })
  })
  stage = 'first-playback'
  await application.evaluate(() => globalThis.updateLiveText('你好，我是 Debby。', false))
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.mouth) > 0.05 || window.streamMetrics.error, undefined, { timeout: 30000 })
  safeFailure = await page.evaluate(() => window.streamMetrics.error)
  if (safeFailure) throw Error('TTS unavailable')
  await page.evaluate(async () => {
    window.streamMetrics.firstPlaybackMs = performance.now() - window.streamMetrics.started
    window.streamMetrics.textStillGeneratingAtPlayback = (await window.finpet.getChatState()).busy
  })
  await application.evaluate(() => globalThis.updateLiveText('你好，我是 Debby。现在可以边生成语音边说话，我们慢慢聊。', true))
  stage = 'completion'
  await page.waitForFunction(() => window.streamMetrics.done, undefined, { timeout: 30000 })
  const stats = await page.evaluate(() => window.streamMetrics)
  safeFailure = stats.error
  assert.ok(!stats.error && stats.textStillGeneratingAtPlayback && stats.chunks > 1 && stats.bytes > 1000)
  assert.deepEqual(stats.formats, ['pcm16'])
  await page.waitForSelector('[title="发送消息"]', { timeout: 30000 })
  await mkdir(resolve(root, 'work'), { recursive: true })
  await page.screenshot({ path: resolve(root, 'work', 'debby-streaming-live.png') })
  await page.evaluate(() => window.removeLiveSpeechListener())
  console.log(JSON.stringify({ passed: true, textSource: 'deterministic fixture', tts: 'real Aliyun service', model: (await page.evaluate(() => window.finpet.getVoiceState())).config.ttsModel,
    firstAudioMs: stats.firstAudioMs, firstPlaybackMs: stats.firstPlaybackMs, synthesisDoneMs: stats.synthesisDoneMs,
    chunks: stats.chunks, bytes: stats.bytes, audioSeconds: stats.bytes / 48000, textStillGeneratingAtPlayback: stats.textStillGeneratingAtPlayback }))
} catch {
  console.error(JSON.stringify({ passed: false, stage, error: safeFailure ?? 'Streaming verification could not complete at this stage.' }))
  process.exitCode = 1
} finally { if (application) await application.close(); await rm(userData, { recursive: true, force: true }) }
