import { describe, expect, it, vi } from 'vitest'
import { createAvatarGaze, gazeFromCursor, type CursorPosition } from '../src/shared/avatar-gaze'
import { PetBehaviorController } from '../src/shared/pet-behavior'
import { layeredParameters } from '../src/shared/layered-avatar'

const bounds = { left: 100, top: 50, width: 300, height: 500 }
describe('portable desktop gaze', () => {
  it('keeps following outside the host, with continuous bounded angles and invalid-input recovery', () => {
    expect(gazeFromCursor({ x: 250, y: 200, source: 'desktop' }, bounds, .3)).toEqual({ x: 0, y: 0 })
    const left = gazeFromCursor({ x: -2000, y: -1000, source: 'desktop' }, bounds)
    const right = gazeFromCursor({ x: 2400, y: 1500, source: 'desktop' }, bounds)
    expect(left.x).toBeLessThan(-.9); expect(left.y).toBeLessThan(-.8)
    expect(right.x).toBeGreaterThan(.9); expect(right.x).toBeLessThan(1)
    expect(gazeFromCursor({ x: NaN, y: 0, source: 'browser' }, bounds)).toEqual({ x: 0, y: 0 })
    expect(gazeFromCursor(null, { ...bounds, width: 0 })).toEqual({ x: 0, y: 0 })
  })
  it('does not overwrite a new event with the late initial sample, and unsubscribes', async () => {
    let receive!: (point: CursorPosition) => void, initial!: (point: CursorPosition) => void
    const unsubscribe = vi.fn()
    const tracker = createAvatarGaze({ getCursorPosition: () => new Promise(resolve => { initial = resolve }), onCursorPosition: listener => { receive = listener; return unsubscribe } })
    receive({ x: 1800, y: 200, source: 'desktop' }); initial({ x: -1800, y: 200, source: 'desktop' })
    await Promise.resolve()
    expect(tracker.read(bounds).x).toBeGreaterThan(.8)
    expect(tracker.read({ ...bounds, left: 1600 }).x).toBeLessThan(.2)
    tracker.dispose(); expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
describe('automatic body ownership', () => {
  it('yields an in-flight idle gesture to conversation and agents, while preserving touch', () => {
    const controller = new PetBehaviorController()
    expect(controller.update('idle', 18, true)).toBe('nod')
    expect(controller.update('idle', 18.1, false, false)).toBe('idle')
    controller.interact('pat', 19)
    expect(controller.update('bullish', 19.1, false, false)).toBe('pat')
    expect(controller.update('bullish', 22, false, false)).toBe('idle')
    expect(controller.update('bearish', 23, false, false)).toBe('idle')
  })
  it('adds speaking posture without replacing real mouth amplitude; reduced motion holds the body', () => {
    const input = { time: .6, mood: 'idle' as const, mouth: .7, gaze: { x: .4, y: -.2 } }
    const speaking = layeredParameters({ ...input, behavior: 'talking' })
    expect(speaking.mouthOpen).toBe(.7)
    expect(speaking.armY).toBeGreaterThan(0)
    const still = layeredParameters({ ...input, behavior: 'talking', reducedMotion: true })
    expect(still.angleZ).toBe(0); expect(still.armY).toBe(0); expect(still.mouthOpen).toBe(.7)
  })
})
