import { describe, expect, it, vi } from 'vitest'
import { QwenGateway } from '../src/main/companion/qwen'
import { StreamingSpeech } from '../src/main/companion/streaming-speech'
import { SpeechTextBuffer } from '../src/shared/speech-text'
import { emptyVoiceState, type SpeechPacket, type VoiceAudio } from '../src/shared/voice'
import { CompanionRuntime } from '../src/main/companion/runtime'
import { ExternalReplyBackend } from '../examples/harness/external-reply'

const config = { ...emptyVoiceState().config, configured: true }
const frame = (body: object) => JSON.stringify(body, null, 2).split('\n').map((line) => `data: ${line}\r\n`).join('') + '\r\n'
const audioFrame = (bytes: number[]) => frame({ output: { type: 'sentence-synthesis', audio: { data: Buffer.from(bytes).toString('base64') } } })
const end = frame({ output: { finish_reason: 'stop' } })
const capture = () => {
  const packets: SpeechPacket[] = [], errors: string[] = []
  return { packets, errors, deliver: (packet: SpeechPacket) => packets.push({ ...packet, bytes: new Uint8Array(packet.bytes) }), fail: (error: string) => errors.push(error) }
}

describe('streamed speech framing and phrase boundaries', () => {
  it('keeps decimals intact, retains a partial suffix and flushes it once', () => {
    const text = new SpeechTextBuffer()
    expect(text.update('指数上涨 0.')).toEqual([])
    expect(text.update('指数上涨 0.84%，现在先保持观察。下一句')).toEqual(['指数上涨 0.84%，现在先保持观察。'])
    expect(text.update('指数上涨 0.84%，现在先保持观察。下一句', true)).toEqual(['下一句'])
    expect(text.update('指数上涨 0.84%，现在先保持观察。下一句', true)).toEqual([])
  })
  it('bounds phrases without breaking Unicode and rejects changed prefixes', () => {
    const text = new SpeechTextBuffer(), original = '好'.repeat(99) + '🙂' + '继续'.repeat(15)
    const parts = text.update(original, true)
    expect(parts.join('')).toBe(original)
    expect(parts.every((part) => !/[\uD800-\uDBFF]$/.test(part))).toBe(true)
    const long = new SpeechTextBuffer().update('好'.repeat(240) + '。', true)
    expect(long.map((part) => part.length)).toEqual([100, 100, 41])
    expect(() => text.update('不同的内容', true)).toThrow(/改写/)
  })
  it('yields PCM before HTTP completion and handles multiline SSE, CRLF and byte splits', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>
    const response = new Response(new ReadableStream({ start(controller) { stream = controller } }), { headers: { 'Content-Type': 'text/event-stream' } })
    const request = vi.fn(async (_url, init) => {
      expect(new Headers(init.headers).get('X-DashScope-SSE')).toBe('enable')
      expect(JSON.parse(init.body).input.format).toBe('pcm')
      return response
    })
    const gateway = new QwenGateway(request, config, () => 'synthetic-key')
    const iterator = gateway.synthesizeStream('你好，我是 Debby。', new AbortController().signal)
    const first = iterator.next()
    const encoded = new TextEncoder().encode(frame({ output: { type: 'sentence-begin', original_text: '你好' } }) + audioFrame([1, 2, 3]))
    for (let i = 0; i < encoded.length; i += 7) stream.enqueue(encoded.slice(i, i + 7))
    expect((await first).value).toEqual({ bytes: new Uint8Array([1, 2]), format: 'pcm16', sampleRate: 24000 })
    stream.enqueue(new TextEncoder().encode(audioFrame([4, 5, 6]) + end)); stream.close()
    expect((await iterator.next()).value?.bytes).toEqual(new Uint8Array([3, 4, 5, 6]))
    expect((await iterator.next()).done).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('rejects truncated/invalid SSE without retrying or duplicating already emitted audio', async () => {
    for (const data of [audioFrame([1, 2]), audioFrame([1]) + end, frame({ output: { audio: { data: 'not base64!' } } }) + end, 'data: ' + 'x'.repeat(1_000_001)]) {
      const request = vi.fn(async () => new Response(data, { headers: { 'Content-Type': 'text/event-stream' } }))
      const gateway = new QwenGateway(request, config, () => 'synthetic-key')
      await expect((async () => { for await (const _chunk of gateway.synthesizeStream('你好啊', new AbortController().signal)) { /* Drain. */ } })()).rejects.toThrow(/无效音频|大小限制/)
      expect(request).toHaveBeenCalledTimes(1)
    }
  })
})

describe('ordered cancellable speech queue', () => {
  it('synthesizes the first phrase before the text finishes, serializes later phrases and ends once', async () => {
    const calls: string[] = [], host = capture()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const speech = new StreamingSpeech({ synthesize: async () => { throw Error('Unexpected batch fallback') }, synthesizeStream: async function* (text) {
      calls.push(text); yield { bytes: new Uint8Array([1, 0]), format: 'pcm16', sampleRate: 24000 }
      if (calls.length === 1) await gate
    } }, new AbortController().signal, host.deliver, host.fail)
    speech.update('line', '你好，我是 Debby。后面的句子', false)
    await vi.waitFor(() => expect(host.packets).toHaveLength(1))
    expect(calls).toEqual(['你好，我是 Debby。'])
    speech.update('line', '你好，我是 Debby。后面的句子也会按顺序说。', true)
    release(); await speech.waitForIdle()
    expect(calls).toEqual(['你好，我是 Debby。', '后面的句子也会按顺序说。'])
    expect(host.packets.map((packet) => packet.sequence)).toEqual([0, 1, 2])
    expect(host.packets.at(-1)?.done).toBe(true)
    expect(host.errors).toEqual([])
  })
  it('clears late audio and does not speak a cancelled reply or its queued suffix', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve }), host = capture(), controller = new AbortController()
    const late = new Uint8Array([3, 4])
    const speech = new StreamingSpeech({ synthesize: async () => new Uint8Array(), synthesizeStream: async function* (_text, signal) {
      yield { bytes: new Uint8Array([1, 2]), format: 'pcm16', sampleRate: 24000 }
      await gate; expect(signal.aborted).toBe(true)
      yield { bytes: late, format: 'pcm16', sampleRate: 24000 }
    } }, controller.signal, host.deliver, host.fail)
    speech.update('one', '你好，我是 Debby。下一句也足够长。', true)
    await vi.waitFor(() => expect(host.packets).toHaveLength(1))
    controller.abort(); release(); await speech.waitForIdle()
    expect(host.packets).toHaveLength(1); expect([...late]).toEqual([0, 0]); expect(host.errors).toEqual([])
  })
  it('handles updates arriving as an empty worker ends and supports legacy speech providers', async () => {
    const host = capture(), calls: string[] = []
    const speech = new StreamingSpeech({ synthesize: async (text) => { calls.push(text); return new Uint8Array([73, 68, 51]) } }, new AbortController().signal, host.deliver, host.fail)
    speech.update('one', '等一下', false)
    speech.update('one', '等一下，现在可以说了。', true)
    await speech.waitForIdle()
    expect(calls).toEqual(['等一下，现在可以说了。'])
    expect(host.packets[0].format).toBe('encoded'); expect(host.packets.at(-1)?.done).toBe(true)
    speech.update('one', '等一下，现在可以说了。', true)
    expect(calls).toHaveLength(1)
  })
  it('stops on provider failure and keeps raw credentials out of events', async () => {
    const host = capture()
    const speech = new StreamingSpeech({ synthesize: async () => { throw Error('secret-upstream-content') } }, new AbortController().signal, host.deliver, host.fail)
    speech.update('one', '你好，我是 Debby。', true)
    await speech.waitForIdle()
    expect(host.errors).toHaveLength(1); expect(host.errors[0]).not.toContain('secret-upstream-content')
    expect(host.packets).toEqual([])
  })
  it('starts companion speech while an external agent is still producing text', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve }), audio: VoiceAudio[] = []
    const runtime = new CompanionRuntime({ credentials: { publicConfig: () => config, getKey: () => 'synthetic-key', configure: () => {} }, tools: [],
      createSpeechProvider: () => ({ transcribe: async () => '', synthesize: async () => new Uint8Array([1, 2]) }),
      createConversation: (host) => new ExternalReplyBackend(host, async () => (async function* () { yield '你好，我是 Debby。'; await gate; yield '后半句也会说出来。' })()),
      onAudio: (packet) => audio.push({ ...packet, bytes: new Uint8Array(packet.bytes) }) })
    const { sessionId } = await runtime.start({ cloudConsent: true, camera: false })
    await runtime.submit({ sessionId: sessionId!, text: '你好' })
    await vi.waitFor(() => expect(audio.filter((packet) => packet.bytes.length)).toHaveLength(1))
    expect(runtime.getState().chat.busy).toBe(true)
    release(); await runtime.waitForIdle()
    expect(audio.filter((packet) => packet.bytes.length)).toHaveLength(2)
    expect(audio.at(-1)?.done).toBe(true)
    runtime.stop()
  })
})
