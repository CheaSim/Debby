import { describe, expect, it } from 'vitest'
import { layeredParameters, type LayeredFrameInput } from '../src/shared/layered-avatar'
import { Anime25DBackend } from '../src/renderer/src/avatar/layered-runtime'

const input: LayeredFrameInput = { time: 1, mood: 'idle', behavior: 'idle', mouth: 0, gaze: { x: 0, y: 0 } }
describe('portable layered avatar boundary', () => {
  it('uses real audio amplitude and independent index sentiment', () => {
    const happy = layeredParameters({ ...input, mood: 'bullish', mouth: .8 })
    const sad = layeredParameters({ ...input, mood: 'bearish', mouth: 0 })
    expect(happy.mouthOpen).toBe(.8); expect(sad.mouthOpen).toBe(0)
    expect(happy.mouthForm).toBeGreaterThan(sad.mouthForm)
    const bad = layeredParameters({ ...input, mouth: NaN, gaze: { x: Infinity, y: -20 } })
    expect(Object.values(bad).every(Number.isFinite)).toBe(true)
  })
  it('maps nod/shake to different axes and keeps lip sync with reduced motion', () => {
    const nod = layeredParameters({ ...input, behavior: 'nod' }), shake = layeredParameters({ ...input, behavior: 'shake' })
    expect(nod.angleY).not.toBe(shake.angleY); expect(nod.angleX).not.toBe(shake.angleX)
    const reduced = layeredParameters({ ...input, behavior: 'stretch', reducedMotion: true, mouth: .7 })
    expect(reduced.armY).toBe(0); expect(reduced.angleZ).toBe(0); expect(reduced.mouthOpen).toBe(.7)
  })
  it('rejects oversized, truncated, PSB and high bit-depth inputs before starting a worker', async () => {
    const backend = new Anime25DBackend(), signal = new AbortController().signal
    await expect(backend.parse({ size: 65 * 1024 * 1024 } as Blob, { signal })).rejects.toThrow('64 MB')
    await expect(backend.parse(new Blob(['bad']), { signal })).rejects.toThrow('不完整')
    const header = new ArrayBuffer(26), view = new DataView(header)
    view.setUint32(0, 0x38425053); view.setUint16(4, 2)
    await expect(backend.parse(new Blob([header]), { signal })).rejects.toThrow('PSB')
    view.setUint16(4, 1); view.setUint16(22, 16); view.setUint16(24, 3)
    await expect(backend.parse(new Blob([header]), { signal })).rejects.toThrow('8 bit')
    const abort = new AbortController(); abort.abort()
    await expect(backend.parse(new Blob(['valid-size']), { signal: abort.signal })).rejects.toHaveProperty('name', 'AbortError')
  })
})
