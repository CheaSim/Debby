import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VoiceConfigStore, loadLocalEnvironment, validateVoiceConfig } from '../src/main/companion/config'
import { CompanionRuntime, validateVoiceTurn } from '../src/main/companion/runtime'
import { QwenGateway, boundedBytes, voiceError } from '../src/main/companion/qwen'
import { emptyVoiceState, type VoiceAudio } from '../src/shared/voice'
import { pcm16Wav } from '../src/renderer/src/media/voice'
import { ExternalReplyBackend } from '../examples/harness/external-reply'

const key = 'synthetic-test-only-key-123456789'
const config = { ...emptyVoiceState().config, configured: true }
const cipher = { available: () => true, encrypt: (text: string) => Buffer.from([...Buffer.from(text)].map((byte) => byte ^ 193)), decrypt: (bytes: Buffer) => Buffer.from([...bytes].map((byte) => byte ^ 193)).toString() }
function fixture(reply = '我在呢，今天想聊些什么？') {
  const bodies: { url: string; body: any }[] = []
  const audio: VoiceAudio[] = []
  const gateway = new QwenGateway(async (url, init) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${key}`)
    bodies.push({ url: String(url), body: JSON.parse(init!.body as string) })
    if (String(url).includes('/chat/completions')) return new Response(`data: ${JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', content: reply }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
    if (String(url).includes('SpeechSynthesizer')) return new Response(new Uint8Array([73, 68, 51, 1]), { headers: { 'Content-Type': 'audio/mpeg' } })
    return Response.json({ output: { text: '今天有一点累。' } })
  }, config, () => key)
  const runtime = new CompanionRuntime({ credentials: { publicConfig: () => config, getKey: () => key, configure: () => {} }, createProvider: () => gateway, tools: [],
    onAudio: (next) => audio.push({ ...next, bytes: new Uint8Array(next.bytes) }) })
  return { runtime, gateway, bodies, audio }
}

describe('local voice configuration', () => {
  it('accepts only official HTTPS origins and strips unknown input fields', () => {
    const valid = validateVoiceConfig({ ...config, apiKey: key, extraSecret: key } as any)
    expect(valid.baseUrl).toBe(config.baseUrl)
    expect('extraSecret' in valid).toBe(false)
    for (const baseUrl of ['http://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', 'https://evil.test/compatible-mode/v1', 'https://token-plan.cn-beijing.maas.aliyuncs.com.evil.test/compatible-mode/v1', 'https://key@token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', `${config.baseUrl}?key=x`, 'https://127.0.0.1/compatible-mode/v1']) expect(() => validateVoiceConfig({ ...config, baseUrl })).toThrow()
    expect(() => validateVoiceConfig({ ...config, voice: 'unsafe\nvalue' })).toThrow()
  })
  it('reads .env with the standard parser, respects OS overrides and never exports arbitrary variables', () => {
    const folder = mkdtempSync(join(tmpdir(), 'debby-env-'))
    try {
      const path = join(folder, '.env')
      writeFileSync(path, `DEBBY_QWEN_API_KEY="${key}"\nDEBBY_QWEN_VOICE=longanhuan_v3.6\nDEBBY_QWEN_TEXT_MODEL=qwen3.8-flash\nUNRELATED_SECRET=not-exported\n`)
      const env = { DEBBY_QWEN_VOICE: 'OS-choice' }
      loadLocalEnvironment(path, env)
      expect(env).toEqual({ DEBBY_QWEN_API_KEY: key, DEBBY_QWEN_VOICE: 'OS-choice', DEBBY_QWEN_TEXT_MODEL: 'qwen3.8-flash' })
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })
  it('keeps local keys private and encrypts UI overrides without persisting consent', () => {
    const folder = mkdtempSync(join(tmpdir(), 'debby-voice-key-'))
    try {
      const path = join(folder, 'credentials.json')
      const store = new VoiceConfigStore(path, cipher, { DEBBY_QWEN_API_KEY: key })
      expect(store.publicConfig().storage).toBe('env')
      expect(JSON.stringify(store.publicConfig())).not.toContain(key)
      store.configure({ ...config, apiKey: key })
      expect(readFileSync(path, 'utf8')).not.toContain(key)
      const saved = new VoiceConfigStore(path, cipher)
      expect(saved.getKey()).toBe(key)
      expect(saved.publicConfig().storage).toBe('encrypted')
      expect('cloudConsent' in saved.publicConfig()).toBe(false)
      expect(() => new VoiceConfigStore(join(folder, 'locked'), { ...cipher, available: () => false }).configure({ ...config, apiKey: key })).toThrow(/加密/)
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })
})

describe('voice media bounds', () => {
  it('encodes clipped signed PCM with valid WAV headers', () => {
    const wav = pcm16Wav(new Float32Array([-2, -1, 0, 1, 2, NaN]))
    const view = new DataView(wav.buffer)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getInt16(44, true)).toBe(-32768)
    expect(view.getInt16(50, true)).toBe(32767)
    expect(view.getInt16(54, true)).toBe(0)
  })
  it('rejects oversized, spoofed and unauthorized inputs before any provider call', () => {
    const turn = { sessionId: 'test', audio: pcm16Wav(new Float32Array(1600)) }
    expect(() => validateVoiceTurn(turn, false)).not.toThrow()
    expect(() => validateVoiceTurn({ ...turn, text: 'two inputs' }, false)).toThrow()
    expect(() => validateVoiceTurn({ sessionId: 'test', audio: new Uint8Array(1_000_000) }, false)).toThrow()
    const invalid = new Uint8Array(turn.audio); invalid[24] = 1
    expect(() => validateVoiceTurn({ ...turn, audio: invalid }, false)).toThrow(/16kHz/)
    expect(() => validateVoiceTurn({ ...turn, image: '/9j/2Q==' }, false)).toThrow(/授权/)
    expect(() => validateVoiceTurn({ ...turn, image: 'not-an-image' }, true)).toThrow()
    expect(() => validateVoiceTurn({ ...turn, image: '/9j/2Q==' }, true)).not.toThrow()
  })
  it('bounds chunked responses even without Content-Length', async () => {
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8)); controller.enqueue(new Uint8Array(8)); controller.close() } }))
    await expect(boundedBytes(response, 10)).rejects.toThrow(/大小限制/)
  })
  it('redacts raw upstream failures and distinguishes quota from free text chat', () => {
    expect(voiceError(new Error(`401 ${key}`))).not.toContain(key)
    expect(voiceError(new Error(`anything ${key}`))).not.toContain(key)
    expect(voiceError(new Error('429'))).toContain('额度')
    expect(voiceError(new Error('429'))).not.toContain('免费')
  })
  it('downloads official signed TTS audio without forwarding credentials', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const gateway = new QwenGateway(async (url, init) => {
      calls.push({ url: String(url), init })
      return calls.length === 1 ? Response.json({ output: { audio: { url: 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.mp3?signature=synthetic' } } }) : new Response(new Uint8Array([73, 68, 51, 1]))
    }, config, () => key)
    expect(await gateway.synthesize('你好', new AbortController().signal)).toEqual(new Uint8Array([73, 68, 51, 1]))
    expect(new Headers(calls[1].init?.headers).has('Authorization')).toBe(false)
    expect(calls[1].init?.redirect).toBe('error')
  })
  it('decodes inline TTS and refuses untrusted audio URLs before any download', async () => {
    const inline = new QwenGateway(async () => Response.json({ output: { audio: { data: 'SUQzAQ==' } } }), config, () => key)
    expect(await inline.synthesize('你好', new AbortController().signal)).toEqual(new Uint8Array([73, 68, 51, 1]))
    for (const url of ['http://127.0.0.1/audio', 'https://evil.test/audio', 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com.evil.test/audio']) {
      let count = 0
      const gateway = new QwenGateway(async () => { count++; return Response.json({ output: { audio: { url } } }) }, config, () => key)
      await expect(gateway.synthesize('你好', new AbortController().signal)).rejects.toThrow(/音频地址/)
      expect(count).toBe(1)
    }
  })
})

describe('cascaded companion lifecycle', () => {
  it('uses an injected external conversation backend without pi or a text model call', async () => {
    const { gateway, bodies } = fixture()
    const runtime = new CompanionRuntime({ credentials: { publicConfig: () => config, getKey: () => key, configure: () => {} }, tools: [],
      createSpeechProvider: () => ({ transcribe: gateway.transcribe.bind(gateway), synthesize: gateway.synthesize.bind(gateway) }),
      createConversation: (host) => new ExternalReplyBackend(host, async () => '外部 Agent 的回复') })
    const { sessionId } = await runtime.start({ cloudConsent: true, camera: false })
    await runtime.submit({ sessionId: sessionId!, text: '你好' })
    await runtime.waitForIdle()
    expect(runtime.getState().chat.messages.at(-1)?.text).toBe('外部 Agent 的回复')
    expect(bodies.map(({ body }) => body.model)).toEqual([config.ttsModel])
    runtime.stop()
  })
  it('streams external harness replies and suppresses replies arriving after cancellation', async () => {
    const stream = new ExternalReplyBackend({ systemPrompt: '', onState: () => {} }, async () => (async function* () { yield '外部'; yield '台词' })())
    await stream.send('你好'); await stream.waitForIdle()
    expect(stream.getState().messages.at(-1)?.text).toBe('外部台词')
    let finish!: (text: string) => void
    const delayed = new ExternalReplyBackend({ systemPrompt: '', onState: () => {} }, async () => new Promise((resolve) => { finish = resolve }))
    await delayed.send('你好'); delayed.cancel(); finish('迟到回复'); await delayed.waitForIdle()
    expect(delayed.getState().messages.at(-1)?.text).toBe('')
    expect(delayed.getState().messages.at(-1)?.status).toBe('cancelled')
    await delayed.clear()
    expect(delayed.getState().messages).toHaveLength(0)
  })
  it('does not contact providers at construction, configuration or session start', async () => {
    const { runtime, bodies } = fixture()
    expect(runtime.getState().active).toBe(false)
    await expect(runtime.start({ cloudConsent: false, camera: false })).rejects.toThrow(/同意/)
    await runtime.start({ cloudConsent: true, camera: false })
    expect(bodies).toHaveLength(0)
    expect(runtime.getState().phase).toBe('ready')
    runtime.stop()
  })
  it('grants bounded media access only inside the explicit camera/audio session', async () => {
    const { runtime } = fixture()
    expect(runtime.permitsMedia(['audio'])).toBe(false)
    expect(runtime.checksMedia()).toBe(false)
    expect(() => runtime.authorizeMedia('audio')).toThrow()
    await runtime.start({ cloudConsent: true, camera: false })
    expect(() => runtime.authorizeMedia('video')).toThrow()
    runtime.authorizeMedia('audio')
    expect(runtime.checksMedia('audio')).toBe(true)
    expect(runtime.permitsMedia(['audio'], true)).toBe(true)
    expect(runtime.checksMedia()).toBe(true)
    expect(runtime.permitsMedia(['audio'])).toBe(true)
    expect(runtime.permitsMedia(['audio'], true)).toBe(true)
    runtime.releaseMedia('audio')
    expect(runtime.checksMedia()).toBe(false)
    expect(runtime.permitsMedia(['audio'])).toBe(false)
    runtime.stop()
    expect(runtime.permitsMedia(['audio'])).toBe(false)
  })
  it('runs ASR -> pi Agent -> binary TTS and keeps transcripts separate from raw audio', async () => {
    const { runtime, bodies, audio } = fixture()
    const session = await runtime.start({ cloudConsent: true, camera: false })
    const wav = pcm16Wav(new Float32Array(1600).fill(0.1))
    await runtime.submit({ sessionId: session.sessionId!, audio: wav })
    await runtime.waitForIdle()
    expect(bodies.map(({ body }) => body.model)).toEqual([config.asrModel, config.textModel, config.ttsModel])
    expect(bodies[0].body.input.messages[0].content[0].input_audio.data).toMatch(/^data:audio\/wav;base64,/)
    expect(bodies[1].body.enable_thinking).toBe(false)
    expect(bodies[1].body.max_tokens).toBe(512)
    expect(bodies[2].body.input.voice).toBe(config.voice)
    expect(audio).toHaveLength(1)
    expect(audio[0].bytes).toEqual(new Uint8Array([73, 68, 51, 1]))
    expect(runtime.getState().chat.messages[0].text).toBe('今天有一点累。')
    expect(wav.every((value) => value === 0)).toBe(true)
    expect(JSON.stringify(runtime.getState())).not.toContain('data:audio')
    runtime.stop()
    expect(runtime.getState().chat.messages).toHaveLength(0)
  })
  it('sends the selected camera frame only for its turn, never as later observations', async () => {
    const { runtime, bodies } = fixture()
    const { sessionId } = await runtime.start({ cloudConsent: true, camera: true })
    await runtime.submit({ sessionId: sessionId!, text: '看看我桌上有什么。', image: '/9j/2Q==' })
    await runtime.waitForIdle()
    await runtime.submit({ sessionId: sessionId!, text: '你还在吗？' })
    await runtime.waitForIdle()
    const chats = bodies.filter(({ url }) => url.includes('/chat/completions'))
    expect(JSON.stringify(chats[0].body)).toContain('image_url')
    expect(JSON.stringify(chats[1].body)).not.toContain('image_url')
    expect(JSON.stringify(runtime.getState())).not.toContain('/9j/2Q==')
    runtime.stop()
  })
  it('rejects a second in-flight turn, stale sessions, secrets and mid-session configuration', async () => {
    const { runtime } = fixture()
    const { sessionId } = await runtime.start({ cloudConsent: true, camera: false })
    await expect(runtime.submit({ sessionId: 'expired', text: '你好' })).rejects.toThrow(/已结束/)
    await expect(runtime.submit({ sessionId: sessionId!, text: key })).rejects.toThrow(/API Key/)
    expect(() => runtime.configure(config)).toThrow(/结束/)
    await runtime.submit({ sessionId: sessionId!, text: '你好' })
    await expect(runtime.submit({ sessionId: sessionId!, text: '抢占' })).rejects.toThrow(/停止/)
    await runtime.waitForIdle()
    runtime.stop()
  })
  it('cancels slow ASR and discards its late result without LLM or playback', async () => {
    const { gateway } = fixture()
    let resolve!: (text: string) => void
    let aborted = false
    gateway.transcribe = (_audio, signal) => new Promise((done) => { resolve = done; signal.addEventListener('abort', () => { aborted = true }) })
    const audio: VoiceAudio[] = []
    const runtime = new CompanionRuntime({ credentials: { publicConfig: () => config, getKey: () => key, configure: () => {} }, createProvider: () => gateway, tools: [], onAudio: (value) => audio.push(value) })
    const { sessionId } = await runtime.start({ cloudConsent: true, camera: false })
    await runtime.submit({ sessionId: sessionId!, audio: pcm16Wav(new Float32Array(1600)) })
    runtime.stop()
    resolve('late transcript')
    await runtime.waitForIdle()
    expect(aborted).toBe(true)
    expect(audio).toHaveLength(0)
    expect(runtime.getState().chat.messages).toHaveLength(0)
  })
  it('keeps the completed text when TTS is unavailable and sanitizes the error', async () => {
    const { runtime, gateway } = fixture()
    gateway.synthesize = async () => { throw new Error(`upstream failure ${key}`) }
    const { sessionId } = await runtime.start({ cloudConsent: true, camera: false })
    await runtime.submit({ sessionId: sessionId!, text: '你好' })
    await runtime.waitForIdle()
    expect(runtime.getState().chat.messages.at(-1)?.text).toContain('我在呢')
    expect(runtime.getState().error).not.toContain(key)
    runtime.stop()
  })
  it('ends a timed session and does not reconnect or retain its conversation', async () => {
    const { gateway } = fixture()
    const runtime = new CompanionRuntime({ credentials: { publicConfig: () => config, getKey: () => key, configure: () => {} }, createProvider: () => gateway, tools: [], sessionMs: 15 })
    await runtime.start({ cloudConsent: true, camera: false })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(runtime.getState().active).toBe(false)
    expect(runtime.getState().expiresAt).toBeUndefined()
    expect(runtime.getState().chat.messages).toHaveLength(0)
  })
})
