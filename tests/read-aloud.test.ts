import { describe, expect, it, vi } from 'vitest'
import { ReadAloudRuntime } from '../src/main/companion/read-aloud'
import { emptyVoiceState, voiceLimits } from '../src/shared/voice'

const config = { ...emptyVoiceState().config, configured: true }
const input = { requestId: 'read-1', text: '你好，我是 Debby。', cloudConsent: true }

describe('independent speech output', () => {
  it('requires configured credentials, explicit consent and bounded text before calling TTS', async () => {
    const synthesize = vi.fn(async () => new Uint8Array([1]))
    const runtime = new ReadAloudRuntime(() => config, () => ({ synthesize }))
    for (const invalid of [{ ...input, cloudConsent: false }, { ...input, text: ' ' }, { ...input, text: '长'.repeat(1201) }, { ...input, requestId: '../bad' }]) {
      await expect(runtime.read(invalid)).rejects.toThrow(/授权/)
    }
    const unconfigured = new ReadAloudRuntime(() => ({ ...config, configured: false }), () => ({ synthesize }))
    await expect(unconfigured.read(input)).rejects.toThrow(/Key/)
    expect(synthesize).not.toHaveBeenCalled()
  })
  it('returns correlated bytes through the speech-only provider contract', async () => {
    const synthesize = vi.fn(async () => new Uint8Array([73, 68, 51, 1]))
    const runtime = new ReadAloudRuntime(() => config, () => ({ synthesize }))
    await expect(runtime.read(input)).resolves.toEqual({ requestId: input.requestId, bytes: new Uint8Array([73, 68, 51, 1]) })
    expect(synthesize).toHaveBeenCalledWith(input.text, expect.any(AbortSignal))
  })
  it('aborts superseded requests and erases late audio even when a provider ignores cancellation', async () => {
    let finish!: (bytes: Uint8Array) => void
    const signals: AbortSignal[] = []
    const runtime = new ReadAloudRuntime(() => config, () => ({ synthesize: (_text, signal) => {
      signals.push(signal)
      return new Promise((resolve) => { finish = resolve })
    } }))
    const first = runtime.read(input).catch((error) => error.message)
    const finishFirst = finish
    const second = runtime.read({ ...input, requestId: 'read-2' }).catch((error) => error.message)
    expect(signals[0].aborted).toBe(true)
    const late = new Uint8Array([1, 2, 3]); finishFirst(late)
    expect(await first).toMatch(/停止/)
    expect([...late]).toEqual([0, 0, 0])
    runtime.cancel()
    expect(signals[1].aborted).toBe(true)
    finish(new Uint8Array([4]))
    expect(await second).toMatch(/停止/)
  })
  it('bounds custom provider output and hides upstream errors', async () => {
    for (const bytes of [new Uint8Array(0), new Uint8Array(voiceLimits.responseBytes + 1).fill(1)]) {
      const runtime = new ReadAloudRuntime(() => config, () => ({ synthesize: async () => bytes }))
      await expect(runtime.read(input)).rejects.toThrow(/空响应|大小限制/)
      expect(bytes.every((byte) => byte === 0)).toBe(true)
    }
    const runtime = new ReadAloudRuntime(() => config, () => ({ synthesize: async () => { throw new Error('private upstream credential') } }))
    await expect(runtime.read(input)).rejects.toThrow(/文字回复会保留/)
    await expect(runtime.read(input)).rejects.not.toThrow(/private/)
  })
})
