import type { PetMood } from './types'
import { avatarActionInfo, type AvatarAction } from './avatar'

export type PetBehavior = AvatarAction | 'idle' | 'pat' | 'lifted' | 'land' | 'working' | 'waiting' | 'listening' | 'talking'

export const behaviorDuration: Record<PetBehavior, number> = {
  idle: Infinity, greet: 2.4, pat: 2.1, lifted: Infinity,
  land: 0.9, celebrate: 2.6, comfort: 2.8, notify: 2.2, working: Infinity, waiting: Infinity,
  nod: avatarActionInfo.nod.duration, shake: avatarActionInfo.shake.duration, heart: avatarActionInfo.heart.duration,
  shy: avatarActionInfo.shy.duration, think: avatarActionInfo.think.duration, stretch: avatarActionInfo.stretch.duration,
  bow: avatarActionInfo.bow.duration, clap: avatarActionInfo.clap.duration, listening: Infinity, talking: Infinity
}

// User gestures own the body; market changes remain independent expression state.
export class PetBehaviorController {
  current: PetBehavior = 'idle'
  private until = 0
  private mood: PetMood = 'idle'
  private nextMarketGesture = 0
  private nextAmbient = 18
  private ambientIndex = 0

  interact(behavior: AvatarAction | 'pat' | 'lifted' | 'land', now: number): void {
    this.current = behavior
    this.until = now + behaviorDuration[behavior]
  }

  update(mood: PetMood, now: number, ambient = false): PetBehavior {
    if (now >= this.until && this.current !== 'lifted') this.current = 'idle'
    if (mood !== this.mood) {
      this.mood = mood
      if (this.current === 'idle' && now >= this.nextMarketGesture) {
        const gesture = mood === 'bullish' ? 'celebrate' : mood === 'bearish' ? 'comfort' : mood === 'alert' ? 'notify' : 'idle'
        if (gesture !== 'idle') {
          this.current = gesture
          this.until = now + behaviorDuration[gesture]
          this.nextMarketGesture = now + 8
        }
      }
    }
    if (ambient && this.current === 'idle' && (mood === 'idle' || mood === 'bullish') && now >= this.nextAmbient) {
      const actions = ['nod', 'think', 'stretch', 'shy'] as const
      this.interact(actions[this.ambientIndex++ % actions.length], now)
      this.nextAmbient = now + 22 + this.ambientIndex % 3 * 4
    }
    return this.current
  }
}
