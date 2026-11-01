// Explicitly invoked real TTS samples. Uses isolated, hidden/muted desktop state; no LLM or devices.
import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
const root = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url)
const env = { ...process.env }
for (const [key, value] of Object.entries(parseEnv(await readFile(resolve(root, '.env'), 'utf8').catch(() => '')))) if (key.startsWith('DEBBY_QWEN_') && env[key] === undefined) env[key] = value
assert.ok(env.DEBBY_QWEN_API_KEY, 'Configure your own DEBBY_QWEN_API_KEY first')
const userData = await mkdtemp(resolve(tmpdir(), 'debby-tts-styles-')), output = resolve(root, 'work/tts-styles')
await mkdir(output, { recursive: true })
let app, stage = 'launch', safeError
const samples = []
try {
  app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env: { ...env, ELECTRON_RENDERER_URL: '', FINPET_E2E_BACKGROUND: '1', FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo' } })
  const page = await app.firstWindow()
  stage = 'avatar'
  await page.waitForSelector('[data-3d-ready=true]', { timeout: 30000 })
  await page.getByRole('button', { name: '快速对话', exact: true }).click()
  await app.evaluate(({ net }) => {
    const original = net.fetch.bind(net)
    net.fetch = async (url, init) => {
      const response = await original(url, init)
      if (String(url).includes('SpeechSynthesizer')) {
        globalThis.ttsStyleResponse = { status: response.status, type: response.headers.get('content-type') }
        if (response.headers.get('content-type')?.includes('json')) {
          const body = await response.clone().json().catch(() => ({}))
          if (typeof body.code === 'string' && /^[\w.-]{1,80}$/.test(body.code)) globalThis.ttsStyleResponse.code = body.code
        }
      }
      return response
    }
  })
  for (const style of ['natural', 'bright', 'gentle']) {
    stage = 'synthesis-' + style
    const sample = await page.evaluate(async style => {
      const started = performance.now(), config = (await window.finpet.getVoiceState()).config
      let bytes
      try { ({ bytes } = await window.finpet.previewSpeech({ requestId: 'sample-' + style, text: '嗨，我是 Debby！今天也陪你一起看行情。慢慢来，我们一步一步就好。', speech: { style }, cloudConsent: true })) }
      catch (error) { return { error: error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') } }
      const context = new AudioContext()
      try {
        const audio = await context.decodeAudioData(new Uint8Array(bytes).buffer), data = audio.getChannelData(0)
        return { style, model: config.ttsModel, voice: config.voice, elapsedMs: Math.round(performance.now() - started), duration: audio.duration, peak: data.reduce((p, x) => Math.max(p, Math.abs(x)), 0), bytes: Array.from(bytes) }
      } finally { bytes.fill(0); await context.close() }
    }, style)
    if (sample.error) { safeError = sample.error; throw Error('Provider unavailable') }
    stage = 'decode-' + style
    assert.ok(sample.duration > .5 && sample.peak > .001 && sample.bytes.length > 1000)
    const path = resolve(output, 'debby-' + style + '.mp3')
    await writeFile(path, new Uint8Array(sample.bytes))
    const { bytes, ...metrics } = sample
    samples.push({ ...metrics, bytes: bytes.length, path })
    console.log(JSON.stringify(samples.at(-1)))
  }
  await writeFile(resolve(output, 'validation.json'), JSON.stringify({ samples }, null, 2) + '\n')
} catch {
  const response = await app?.evaluate(() => globalThis.ttsStyleResponse).catch(() => undefined)
  console.error(JSON.stringify({ passed: false, stage, error: safeError ?? 'Verification could not complete at this stage.', response }))
  process.exitCode = 1
} finally { await app?.close(); await rm(userData, { recursive: true, force: true }) }
