import { describe, expect, it } from 'vitest'
import { resolveSpeechStyle, validateSpeechStyle } from '../src/shared/speech-style'
import { validateVoiceConfig, VoiceConfigStore } from '../src/main/companion/config'
import { QwenGateway } from '../src/main/companion/qwen'
import { ReadAloudRuntime } from '../src/main/companion/read-aloud'
import { emptyVoiceState } from '../src/shared/voice'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const config = { ...emptyVoiceState().config, configured: true }
describe('speech delivery independent of text and visual expressions', () => {
  it('defaults old configurations to a gentle voice and bounds optional controls', () => {
    expect(resolveSpeechStyle()).toMatchObject({ style: 'gentle', rate: .96, pitch: 1 })
    expect(resolveSpeechStyle().instruction).toContain('动漫少女')
    expect(resolveSpeechStyle({ style: 'natural' })).toMatchObject({ instruction: '', rate: 1, pitch: 1 })
    for (const value of [null, [], { style: 'unknown' }, { rate: Infinity }, { rate: .49 }, { pitch: 2.1 }, { pitch: '1' }, { instruction: '长'.repeat(501) }]) expect(() => validateSpeechStyle(value)).toThrow()
    expect(validateSpeechStyle({ style: 'custom', instruction: '  温柔地说  ', rate: .95 })).toMatchObject({ instruction: '温柔地说', rate: .95 })
  })
  it('persists the chosen style and honors environment controls without requiring old saves to change', () => {
    const folder = mkdtempSync(join(tmpdir(), 'debby-speech-style-'))
    const cipher = { available: () => true, encrypt: (text: string) => Buffer.from(text), decrypt: (bytes: Buffer) => bytes.toString() }
    try {
      const path = join(folder, 'config.json'), store = new VoiceConfigStore(path, cipher, { DEBBY_QWEN_API_KEY: 'synthetic-style-key-123456', DEBBY_QWEN_TTS_STYLE: 'gentle', DEBBY_QWEN_TTS_RATE: '.92' })
      expect(store.publicConfig().speech).toMatchObject({ style: 'gentle', rate: .92 })
      store.configure({ ...config, speech: { style: 'shy', pitch: 1.04 } })
      expect(new VoiceConfigStore(path, cipher).publicConfig().speech).toMatchObject({ style: 'shy', pitch: 1.04 })
      expect(validateVoiceConfig(config).speech?.style).toBe('gentle')
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })
  it('sends identical instructions, rate and pitch through file and SSE synthesis without modifying spoken text', async () => {
    const inputs: any[] = []
    const gateway = new QwenGateway(async (_url, init) => {
      inputs.push(JSON.parse(init!.body as string).input)
      if (new Headers(init?.headers).get('X-DashScope-SSE') === 'enable') return new Response('data: {"output":{"audio":{"data":"AQIDBA=="},"finish_reason":"stop"}}\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
      return new Response(new Uint8Array([73, 68, 51, 1]), { headers: { 'Content-Type': 'audio/mpeg' } })
    }, { ...config, speech: { style: 'custom', instruction: '请轻快、可爱地说话。', rate: 1.08, pitch: 1.02 } }, () => 'synthetic-style-key-123456')
    const signal = new AbortController().signal
    await gateway.synthesize('今天也一起加油吧。', signal)
    for await (const _chunk of gateway.synthesizeStream('今天也一起加油吧。', signal)) { /* drain */ }
    expect(inputs).toHaveLength(2)
    for (const input of inputs) expect(input).toMatchObject({ text: '今天也一起加油吧。', instruction: '请轻快、可爱地说话。', rate: 1.08, pitch: 1.02 })
  })
  it('previews an unsaved style without changing credentials and rejects unsupported draft fields before any request', async () => {
    const drafts: any[] = [], saved = { ...config, speech: { style: 'natural' as const } }
    const runtime = new ReadAloudRuntime(() => saved, draft => { drafts.push(draft); return { synthesize: async () => new Uint8Array([1]) } })
    const input = { requestId: 'style-preview', text: '你好呀。', cloudConsent: true, speech: { style: 'shy' as const }, voice: 'longanhuan_v3.6' }
    await runtime.preview(input)
    expect(drafts[0].speech.style).toBe('shy')
    expect(saved.speech.style).toBe('natural')
    for (const invalid of [{ ...input, text: '长'.repeat(201) }, { ...input, baseUrl: 'https://other.test' }, { ...input, apiKey: 'unexpected' }, { ...input, speech: { rate: NaN } }]) await expect(runtime.preview(invalid)).rejects.toThrow()
    expect(drafts).toHaveLength(1)
  })
})
