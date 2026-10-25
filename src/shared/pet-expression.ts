import type { PetBehavior } from './pet-behavior'
import type { PetMood } from './types'

export const faceChannels = ['happy', 'sad', 'relaxed', 'aa', 'oh', 'heart', 'star', 'wink', 'fun2', 'sorrow2', 'bright', 'smile', 'blush'] as const
export type FaceChannel = typeof faceChannels[number]
export type PetExpression = 'soft' | 'smile' | 'wink' | 'curious' | 'affectionate' | 'sparkle' | 'concerned' | 'surprised' | 'focused' | 'reassuring'
export interface PetFace {
  name: PetExpression
  weights: Record<FaceChannel, number>
  headTilt: number
  headPitch: number
}
const clamp = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
const pulse = (time: number, duration: number): number => Math.sin(Math.PI * clamp(time / duration)) ** 2
const hold = (time: number, duration: number): number => {
  const smooth = (value: number): number => { const x = clamp(value); return x * x * (3 - 2 * x) }
  return smooth(time / 0.28) * smooth((duration - time) / 0.55)
}

/** Presentation only. Index mood, user gestures and agent task ownership stay independent. */
export class PetExpressionController {
  restart(): void { this.behavior = 'idle' }
  private behavior: PetBehavior = 'idle'
  private started = 0
  private nextAccent = 8
  private accent?: { name: 'wink' | 'curious' | 'smile'; started: number }
  private accentIndex = 0

  update(mood: PetMood, behavior: PetBehavior, now: number, mouth: number, reducedMotion = false): PetFace {
    if (behavior !== this.behavior) {
      this.behavior = behavior; this.started = now; this.accent = undefined; this.nextAccent = now + 10
    }
    const speaking = clamp(mouth) > 0.025
    const weights: PetFace['weights'] = { happy: 0.14, sad: 0, relaxed: 0.06, aa: clamp(mouth), oh: 0, heart: 0, star: 0, wink: 0, fun2: 0, sorrow2: 0, bright: 0.08, smile: 0.18, blush: 0 }
    const face: PetFace = { name: 'soft', weights, headTilt: 0, headPitch: 0 }
    if (mood === 'bullish') { face.name = 'smile'; weights.happy = 0.28; weights.smile = 0.25 }
    else if (mood === 'bearish') { face.name = 'concerned'; weights.happy = 0.04; weights.sad = 0.22; weights.sorrow2 = 0.12; weights.smile = 0.02 }
    else if (mood === 'offline') { face.name = 'curious'; weights.happy = 0.1; weights.relaxed = 0.16; weights.smile = 0.08 }
    else if (mood === 'alert') { face.name = 'surprised'; weights.happy = 0.08; weights.oh = 0.15; weights.smile = 0 }
    if (reducedMotion) { weights.oh = 0; if (speaking) weights.smile = 0; return face }

    const time = now - this.started
    const reaction = pulse(time, behavior === 'pat' ? 2.1 : 2.4)
    if (behavior === 'heart') {
      face.name = 'affectionate'; weights.heart = hold(time, 3.2); weights.smile = 0.32; weights.blush = 0.22 * weights.heart; weights.sad = 0
    } else if (behavior === 'shy') {
      face.name = 'affectionate'; weights.blush = reaction * 0.4; weights.smile = 0.2; weights.relaxed = 0.2
      face.headTilt = reaction * 0.04
    } else if (behavior === 'clap') {
      face.name = 'sparkle'; weights.star = hold(time, 3); weights.smile = 0.3; weights.sad = 0
    } else if (behavior === 'think' || behavior === 'listening') {
      face.name = 'curious'; weights.smile = 0.1; face.headTilt = 0.025
    } else if (behavior === 'stretch' || behavior === 'bow' || behavior === 'nod') {
      face.name = 'smile'; weights.happy = 0.22; weights.smile = 0.28
    } else if (behavior === 'pat') {
      face.name = 'affectionate'; weights.happy = 0.05; weights.sad = 0; weights.sorrow2 = 0
      weights.heart = hold(time, 2.1); weights.smile = 0.28; weights.bright = 0.25; weights.blush = weights.heart * 0.18
      face.headTilt = -reaction * 0.06; face.headPitch = -reaction * 0.025
    } else if (behavior === 'greet') {
      face.name = 'wink'; weights.happy = 0.08; weights.wink = reaction * 0.95; weights.smile = 0.2; weights.bright = 0
      face.headTilt = reaction * 0.045
    } else if (behavior === 'celebrate') {
      face.name = 'sparkle'; weights.happy = 0.05; weights.star = hold(time, 2.6); weights.smile = 0.3; weights.bright = 0.3
      face.headPitch = -weights.star * 0.035
    } else if (behavior === 'comfort') {
      face.name = 'reassuring'; weights.happy = 0.1; weights.sad = 0.12; weights.relaxed = 0.12; weights.smile = 0.1
      face.headTilt = -pulse(time, 2.8) * 0.055
    } else if (behavior === 'lifted' || behavior === 'notify') {
      face.name = 'surprised'; weights.happy = 0.06; weights.oh = behavior === 'lifted' ? 0.22 : reaction * 0.24; weights.smile = 0; weights.bright = 0.2
    } else if (behavior === 'land') {
      face.name = 'smile'; weights.happy = 0.25; weights.smile = 0.25
    } else if (behavior === 'working') {
      face.name = 'focused'; weights.happy = 0.08; weights.relaxed = 0.06; weights.smile = 0.08
    } else if (behavior === 'waiting') {
      face.name = 'curious'; weights.happy = 0.12; face.headTilt = 0.035
    }

    const idleAccentAllowed = behavior === 'idle' && (mood === 'idle' || mood === 'bullish') && !speaking
    if (!idleAccentAllowed) { this.accent = undefined; this.nextAccent = now + 8 }
    else {
      if (now >= this.nextAccent) {
        const names = ['wink', 'curious', 'smile'] as const
        this.accent = { name: names[this.accentIndex++ % names.length], started: now }
        this.nextAccent = now + 11 + this.accentIndex % 3 * 2
      }
      if (this.accent) {
        const age = now - this.accent.started
        if (age >= 2.8) this.accent = undefined
        else {
          const amount = pulse(age, 2.8)
          face.name = this.accent.name
          if (face.name === 'wink') { weights.happy = 0.08; weights.wink = amount * 0.85; weights.bright = 0; face.headTilt = amount * 0.065 }
          else if (face.name === 'curious') { face.headTilt = amount * -0.11; face.headPitch = amount * -0.025 }
          else { weights.happy = Math.max(weights.happy, amount * 0.3); weights.smile = Math.max(weights.smile, amount * 0.4); weights.fun2 = amount * 0.1 }
        }
      }
    }
    // Mouth-carrying smile presets must not compete with real speech amplitude.
    if (speaking) { weights.oh = 0; weights.wink = 0; weights.fun2 = 0; weights.smile = 0; weights.happy *= 0.45 }
    return face
  }
}
