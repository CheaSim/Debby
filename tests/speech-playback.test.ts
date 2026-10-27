import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserSpeechPlayback } from '../src/renderer/src/media/speech-playback'

function fixture() {
  const sources: any[] = [], buffers: any[] = []
  const buffer = (samples: number, rate: number) => {
    const data = new Float32Array(samples)
    const next = { numberOfChannels: 1, duration: samples / rate, getChannelData: (_channel = 0) => data }
    buffers.push(next); return next
  }
  const context = { state: 'running', currentTime: 4, destination: {},
    resume: vi.fn(async () => {}), close: vi.fn(async () => { context.state = 'closed' }),
    decodeAudioData: vi.fn(async () => buffer(2400, 24000)),
    createBuffer: (_channels: number, samples: number, rate: number) => buffer(samples, rate),
    createAnalyser: () => ({ fftSize: 256, connect: () => {}, disconnect: () => {}, getFloatTimeDomainData: () => {} }),
    createBufferSource: () => { const source = { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: undefined }; sources.push(source); return source }
  }
  vi.stubGlobal('AudioContext', class { constructor() { return context } })
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const levels = vi.fn(), playing = vi.fn(), marks = vi.fn()
  return { player: new BrowserSpeechPlayback(levels, playing, marks), context, sources, buffers, levels, playing, marks, buffer }
}
afterEach(() => vi.unstubAllGlobals())

describe('continuous audio playback queue', () => {
  it('emits sentence cursors at the audio clock, not packet arrival, and drops cancelled queued cues', async () => {
    const { player, context, marks } = fixture()
    let frame!: FrameRequestCallback
    vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { frame = callback; return 1 }))
    const first = { lineId: 'a', textOffset: 0, textLength: 6 }, second = { lineId: 'a', textOffset: 6, textLength: 8 }
    await player.enqueue({ bytes: new Uint8Array(4800), format: 'pcm16', sampleRate: 24000, mark: first })
    await player.enqueue({ bytes: new Uint8Array(4800), format: 'pcm16', sampleRate: 24000, mark: second })
    expect(marks).not.toHaveBeenCalled()
    context.currentTime = 4.05; frame(50)
    expect(marks.mock.calls).toEqual([[first]])
    context.currentTime = 4.15; frame(100)
    expect(marks.mock.calls).toEqual([[first], [second]])
    await player.enqueue({ bytes: new Uint8Array(4800), format: 'pcm16', sampleRate: 24000, mark: { ...second, lineId: 'cancelled' } })
    player.stop(); context.currentTime = 10; frame(200)
    expect(marks.mock.calls).toEqual([[first], [second], [undefined]])
  })
  it('schedules adjacent PCM chunks without overlap or restarting the previous sound', async () => {
    const { player, sources, buffers, playing } = fixture()
    const first = new Uint8Array(4800).fill(1), second = new Uint8Array(4800).fill(2)
    await player.enqueue({ bytes: first, format: 'pcm16', sampleRate: 24000 })
    await player.enqueue({ bytes: second, format: 'pcm16', sampleRate: 24000 })
    expect(sources[0].start).toHaveBeenCalledWith(4.045)
    expect(sources[1].start.mock.calls[0][0]).toBeCloseTo(4.145)
    expect(sources[0].stop).not.toHaveBeenCalled()
    expect(first.every((value) => value === 0) && second.every((value) => value === 0)).toBe(true)
    expect(buffers[0].getChannelData(0)[0]).not.toBe(0)
    player.stop()
    expect(sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true)
    expect(buffers.every((next) => next.getChannelData(0).every((value: number) => value === 0))).toBe(true)
    expect(playing).toHaveBeenLastCalledWith(false)
  })
  it('drops an encoded decode arriving after stop and erases retained media', async () => {
    const { player, context, sources, buffer } = fixture()
    let finish!: (value: any) => void
    context.decodeAudioData.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const bytes = new Uint8Array([73, 68, 51])
    const job = player.enqueue({ bytes, format: 'encoded' })
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalled())
    player.stop(); const decoded = buffer(2400, 24000); decoded.getChannelData(0).fill(.1); finish(decoded)
    await job
    expect(sources).toHaveLength(0)
    expect([...bytes]).toEqual([0, 0, 0])
    expect(decoded.getChannelData(0).every((value: number) => value === 0)).toBe(true)
  })
  it('refuses malformed PCM before scheduling and releases a closed audio engine', async () => {
    const { player, sources, context } = fixture()
    const bytes = new Uint8Array([1, 2, 3])
    await expect(player.enqueue({ bytes, format: 'pcm16', sampleRate: 24000 })).rejects.toThrow(/PCM/)
    expect(sources).toHaveLength(0); expect([...bytes]).toEqual([0, 0, 0])
    player.close(); expect(context.close).toHaveBeenCalledOnce()
  })
})
