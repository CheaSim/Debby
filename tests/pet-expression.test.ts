import { describe, expect, it } from 'vitest'
import { PetExpressionController } from '../src/shared/pet-expression'

describe('avatar expression lifecycle', () => {
  it('gives gestures short heart/star reactions and clears them on return to idle', () => {
    const face = new PetExpressionController()
    face.update('idle', 'pat', 0, 0)
    const pat = face.update('idle', 'pat', 1, 0)
    expect(pat.name).toBe('affectionate'); expect(pat.weights.heart).toBeGreaterThan(0.9)
    face.update('bullish', 'celebrate', 3, 0)
    expect(face.update('bullish', 'celebrate', 4.3, 0).weights.star).toBeCloseTo(1)
    const idle = face.update('bullish', 'idle', 6, 0)
    expect(idle.name).toBe('smile'); expect(idle.weights.heart + idle.weights.star + idle.weights.wink).toBe(0)
  })
  it('keeps real speech in control of the mouth and bounds invalid amplitude', () => {
    const face = new PetExpressionController()
    face.update('alert', 'greet', 0, 0)
    const speaking = face.update('alert', 'greet', 1.2, 0.7)
    expect(speaking.weights.aa).toBe(0.7)
    expect(speaking.weights.oh + speaking.weights.wink + speaking.weights.fun2 + speaking.weights.smile).toBe(0)
    expect(face.update('idle', 'idle', 2, NaN).weights.aa).toBe(0)
    expect(face.update('idle', 'idle', 2.1, 3).weights.aa).toBe(1)
  })
  it('uses occasional idle accents without overriding an agent task or a worried market mood', () => {
    const face = new PetExpressionController()
    face.update('idle', 'idle', 8, 0)
    expect(face.update('idle', 'idle', 9.4, 0).weights.wink).toBeGreaterThan(0.8)
    const working = face.update('idle', 'working', 10, 0)
    expect(working.name).toBe('focused'); expect(working.weights.wink).toBe(0)
    const bearish = face.update('bearish', 'idle', 30, 0)
    expect(bearish.name).toBe('concerned'); expect(bearish.weights.wink + bearish.weights.heart + bearish.weights.star).toBe(0)
    expect(face.update('offline', 'idle', 60, 0).name).toBe('curious')
  })
  it('respects reduced motion while retaining a gentle mood and speech amplitude', () => {
    const face = new PetExpressionController()
    const still = face.update('idle', 'pat', 1, 0.5, true)
    expect(still.headTilt + still.headPitch + still.weights.wink + still.weights.heart).toBe(0)
    expect(still.weights.aa).toBe(0.5)
    expect(face.update('bearish', 'idle', 30, 0, true).name).toBe('concerned')
  })
})
