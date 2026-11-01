/** Portable secondary motion. Host supplies the clock and already-filtered gaze; no timers/devices. */
export interface SkeletonBinding { version: 1; jointIds: string[]; poseParts: Record<string, string[]> }
export interface Affine2D { a: number; b: number; c: number; d: number; e: number; f: number }
const bounded = (value: number | undefined, limit = 1): number => Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value!)) : 0
export function createSkeletonMotion() {
  const hair = { value: 0, velocity: 0 }, tail = { value: 0, velocity: 0 }
  const spring = (state: typeof hair, target: number, dt: number, stiffness: number, damping: number): number => {
    const seconds = Number.isFinite(dt) ? Math.min(.1, Math.max(0, dt)) : 0
    const steps = Math.max(1, Math.ceil(seconds * 120)), step = seconds / steps
    for (let index = 0; index < steps; index++) {
      state.velocity = bounded(state.velocity + ((target - state.value) * stiffness - state.velocity * damping) * step, 20)
      state.value = bounded(state.value + state.velocity * step)
    }
    return state.value
  }
  return {
    update(params: Record<string, number>, dt: number, time: number, reducedMotion = false): Record<string, number> {
      if (reducedMotion) {
        hair.value = hair.velocity = tail.value = tail.velocity = 0
        return { DebbyBodySway: 0, DebbyNeckTilt: 0, DebbyHeadRoll: 0, DebbyHairLeft: 0, DebbyHairRight: 0, DebbyTail: 0 }
      }
      const t = Number.isFinite(time) ? time : 0
      const head = bounded(params.angleX) * .55 + bounded(params.angleZ) * .65
      const drift = spring(hair, -head * .85 + Math.sin(t * .8) * .13, dt, 34, 9)
      const fin = spring(tail, bounded(params.body) * .7 + Math.sin(t * .65 + .8) * .18, dt, 18, 7)
      return {
        DebbyBodySway: bounded(bounded(params.body) * 2 + Math.sin(t * .54) * .12),
        DebbyNeckTilt: bounded(bounded(params.angleZ) * .3 + Math.sin(t * .65 + .4) * .08),
        DebbyHeadRoll: bounded(head),
        DebbyHairLeft: bounded(drift + Math.sin(t * 1.05) * .07),
        DebbyHairRight: bounded(drift * .85 + Math.sin(t * 1.05 + .6) * .08),
        DebbyTail: fin
      }
    }
  }
}
