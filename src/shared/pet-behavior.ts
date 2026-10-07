import type { PetMood } from './types'

export type PetBehavior = 'idle' | 'greet' | 'pat' | 'lifted' | 'land' | 'celebrate' | 'comfort' | 'notify'

export const behaviorDuration: Record<PetBehavior, number> = {
  idle: Infinity, greet: 2.4, pat: 2.1, lifted: Infinity,
  land: 0.9, celebrate: 2.6, comfort: 2.8, notify: 2.2
}

// User gestures own the body; market changes remain independent expression state.
export class PetBehaviorController {
  current: PetBehavior = 'idle'
  private until = 0
  private mood: PetMood = 'idle'
  private nextMarketGesture = 0

  interact(behavior: 'greet' | 'pat' | 'lifted' | 'land', now: number): void {
    this.current = behavior
    this.until = now + behaviorDuration[behavior]
  }

  update(mood: PetMood, now: number): PetBehavior {
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
    return this.current
  }
}
