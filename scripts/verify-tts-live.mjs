// Explicit, opt-in live check. Uses the application's main-process TTS path and local BYOK.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const local = parseEnv(await readFile(resolve(root, '.env'), 'utf8').catch(() => ''))
const env = { ...process.env }
for (const [name, value] of Object.entries(local)) if (name.startsWith('DEBBY_QWEN_') && env[name] === undefined) env[name] = value
assert.ok(env.DEBBY_QWEN_API_KEY, 'Set DEBBY_QWEN_API_KEY in your environment or ignored local .env first')
const userData = await mkdtemp(resolve(tmpdir(), 'debby-tts-live-'))
let application
let stage = 'launch', safeFailure
let responseInfo
try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.', '--mute-audio'], cwd: root,
    env: { ...env, ELECTRON_RENDERER_URL: '', FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo' } })
  const page = await application.firstWindow()
  stage = 'avatar'
  await page.waitForSelector('[data-3d-ready="true"]', { timeout: 30000 })
  await page.getByRole('button', { name: '快速对话', exact: true }).click()
  await application.evaluate(({ net }) => {
    const request = net.fetch.bind(net)
    net.fetch = async (url, init) => {
      const response = await request(url, init)
      if (String(url).includes('SpeechSynthesizer')) {
        const info = { status: response.status, type: response.headers.get('content-type') }
        if (info.type?.includes('json')) {
          const body = await response.clone().json()
          try { info.audioOrigin = new URL(body.output?.audio?.url).origin } catch {}
        }
        globalThis.ttsResponseInfo = info
      }
      return response
    }
  })
  stage = 'synthesis'
  const result = await page.evaluate(async () => {
    let bytes
    try { ({ bytes } = await window.finpet.readAloud({ requestId: 'live-tts-check', text: '你好，我是 Debby。很高兴见到你。', cloudConsent: true })) }
    catch (error) { return { error: error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') } }
    const context = new AudioContext()
    try {
      const audio = await context.decodeAudioData(new Uint8Array(bytes).buffer)
      const samples = audio.getChannelData(0)
      return { bytes: Array.from(bytes), duration: audio.duration, sampleRate: audio.sampleRate,
        peak: samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0) }
    } finally { bytes.fill(0); await context.close() }
  })
  responseInfo = await application.evaluate(() => globalThis.ttsResponseInfo)
  if (result.error) { safeFailure = result.error; throw new Error('Provider unavailable') }
  stage = 'decode-validation'
  assert.ok(result.bytes.length > 1000 && result.duration > 0.5 && result.duration < 120 && result.peak > 0.001, 'TTS must return decodable, non-silent audio')
  const work = resolve(root, 'work'); await mkdir(work, { recursive: true })
  const path = resolve(work, 'debby-tts-live.mp3')
  await writeFile(path, new Uint8Array(result.bytes))
  console.log(JSON.stringify({ passed: true, model: (await page.evaluate(() => window.finpet.getVoiceState())).config.ttsModel,
    bytes: result.bytes.length, durationSeconds: result.duration, sampleRate: result.sampleRate, peak: result.peak, responseInfo, path }))
} catch {
  // Never print a raw cloud response, credential or signed URL in diagnostics.
  console.error(JSON.stringify({ passed: false, stage, error: safeFailure ?? 'Live TTS check could not complete at this stage.', responseInfo }))
  process.exitCode = 1
} finally {
  if (application) await application.close()
  await rm(userData, { recursive: true, force: true })
}
